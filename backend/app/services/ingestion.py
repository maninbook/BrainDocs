import uuid, os
from pathlib import Path
from typing import Optional
import structlog
from app.core.config import settings
from app.models.paper import Paper, Chunk
from app.services.embedding import EmbeddingService
from app.repositories.neo4j_repo import Neo4jRepository

log = structlog.get_logger()

class IngestionService:
    """PDF 파싱 → 청킹 → 임베딩 → 그래프 인덱싱 파이프라인"""

    SECTION_KEYWORDS = {
        "abstract": ["abstract", "요약"],
        "intro": ["introduction", "서론", "1."],
        "method": ["method", "methodology", "approach", "방법론"],
        "result": ["result", "experiment", "결과", "실험"],
        "discussion": ["discussion", "conclusion", "결론", "고찰"],
        "reference": ["reference", "bibliography", "참고문헌"],
    }

    def __init__(self, embedding_svc: EmbeddingService, neo4j_repo: Neo4jRepository):
        self.embedding_svc = embedding_svc
        self.neo4j_repo = neo4j_repo

    async def process_pdf(self, paper: Paper, progress_cb=None) -> None:
        """메인 파이프라인"""
        try:
            # 1. PDF 파싱
            await self._update_status(paper, "parsing", 5, "PDF 파싱 중...", progress_cb)
            sections = await self._parse_pdf(paper.file_path)
            log.info("PDF parsed", paper_id=str(paper.id), sections=len(sections))

            # 1-1. 메타데이터 추출 (제목/저자/초록/키워드)
            await self._update_status(paper, "parsing", 15, "메타데이터 추출 중...", progress_cb)
            await self._extract_metadata(paper, sections)

            # 2. 청킹
            await self._update_status(paper, "embedding", 25, "청크 생성 및 임베딩 중...", progress_cb)
            chunks = self._create_chunks(sections)

            # 3. 임베딩 + Qdrant 저장
            embedded_chunks = await self.embedding_svc.embed_and_store(
                chunks=chunks,
                paper_id=str(paper.id),
                workspace_id=str(paper.workspace_id),
            )

            # 4. DB에 청크 저장
            await self._update_status(paper, "extracting", 60, "엔티티 및 관계 추출 중...", progress_cb)
            db_chunks = [
                Chunk(
                    id=uuid.uuid4(),
                    paper_id=paper.id,
                    section=c["section"],
                    page_num=c["page_num"],
                    content=c["content"],
                    token_count=len(c["content"].split()),
                    qdrant_id=c["qdrant_id"],
                )
                for c in embedded_chunks
            ]

            # 5. Neo4j 노드 생성 + 유사도 엣지
            await self._update_status(paper, "indexing", 80, "지식 그래프 인덱싱 중...", progress_cb)
            await self.neo4j_repo.create_paper_node(paper)
            await self.neo4j_repo.compute_and_store_edges(paper)

            await self._update_status(paper, "completed", 100, "완료!", progress_cb)
            return db_chunks

        except Exception as e:
            log.error("Ingestion failed", paper_id=str(paper.id), error=str(e))
            await self._update_status(paper, "failed", 0, str(e), progress_cb)
            raise

    async def _extract_metadata(self, paper: Paper, sections: list[dict]) -> None:
        """첫 페이지(들)에서 LLM으로 제목/저자/초록/키워드 추출"""
        if not sections:
            paper.title = paper.title or Path(paper.file_path or "untitled.pdf").stem
            return

        # 첫 2페이지 텍스트 (3000자 제한)
        head_text = "\n".join(s["content"] for s in sections[:2])[:3000]

        prompt = f"""다음은 학술 논문의 첫 부분입니다. JSON으로 메타데이터를 추출하세요.

텍스트:
{head_text}

다음 JSON 형식으로만 응답하세요 (마크다운 없이):
{{
  "title": "논문 제목",
  "authors": ["저자1", "저자2"],
  "year": 2024,
  "journal": "저널/학회명 (없으면 null)",
  "abstract": "초록 전문",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}}

규칙:
- year는 정수 또는 null
- 정보가 없으면 빈 배열/null 사용
- 키워드는 5-10개 추출 (논문에 명시된 게 없으면 본문에서 핵심 개념 추출)
"""

        meta = None
        try:
            if settings.GEMINI_API_KEY:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    "gemini-2.5-flash",
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1,
                        response_mime_type="application/json",
                    ),
                )
                response = await model.generate_content_async(prompt)
                import json
                meta = json.loads(response.text)
            elif settings.OPENAI_API_KEY:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                response = await client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": "논문 메타데이터 추출기. JSON만 반환."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                import json
                meta = json.loads(response.choices[0].message.content)
        except Exception as e:
            log.warning("Metadata LLM extraction failed, falling back to heuristics", error=str(e))

        if meta:
            s = self._sanitise
            paper.title = s(meta.get("title") or "") or paper.title
            paper.authors = [s(a) for a in (meta.get("authors") or []) if a]
            paper.year = meta.get("year") if isinstance(meta.get("year"), int) else None
            paper.journal = s(meta.get("journal") or "") or None
            paper.abstract = s(meta.get("abstract") or "")
            paper.keywords = [s(k) for k in (meta.get("keywords") or []) if k]
        else:
            # LLM 실패 시 휴리스틱 폴백
            paper.title = paper.title or self._heuristic_title(sections)
            paper.abstract = self._heuristic_abstract(sections)
            paper.authors = paper.authors or []
            paper.keywords = paper.keywords or []

        log.info(
            "Metadata extracted",
            paper_id=str(paper.id),
            title=paper.title,
            authors_count=len(paper.authors or []),
        )

    def _heuristic_title(self, sections: list[dict]) -> str:
        """첫 페이지 첫 줄을 제목으로 추정"""
        if not sections:
            return "제목 없음"
        first = sections[0]["content"].strip().split("\n")
        for line in first[:5]:
            line = line.strip()
            if 10 < len(line) < 200:
                return line
        return "제목 없음"

    def _heuristic_abstract(self, sections: list[dict]) -> str:
        for s in sections[:3]:
            if s.get("section") == "abstract":
                return s["content"][:1500]
        # 첫 페이지의 본문
        return sections[0]["content"][:1500] if sections else ""

    async def _parse_pdf(self, file_path: str) -> list[dict]:
        """PDF → 섹션별 텍스트 추출 (PyMuPDF)"""
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            sections = []
            current_section = "body"

            for page_num, page in enumerate(doc):
                text = self._sanitise(page.get_text("text"))
                detected_section = self._detect_section(text)
                if detected_section:
                    current_section = detected_section
                sections.append({
                    "section": current_section,
                    "page_num": page_num + 1,
                    "content": text.strip(),
                })
            doc.close()
            return [s for s in sections if len(s["content"]) > 50]
        except Exception as e:
            log.warning("PyMuPDF failed, using fallback", error=str(e))
            return [{"section": "body", "page_num": 1, "content": "PDF 파싱 실패"}]

    @staticmethod
    def _sanitise(text: str) -> str:
        """PDF 추출 텍스트 정리.

        일부 PDF(특히 수식이 많은 논문)는 NUL 바이트나 서로게이트를 뱉는데,
        PostgreSQL text 컬럼은 0x00을 저장할 수 없어 인제스천이 실패한다.
        (asyncpg: invalid byte sequence for encoding "UTF8": 0x00)
        """
        if not text:
            return ""
        # NUL 및 잔여 제어문자 제거 (탭·개행은 보존)
        text = text.replace("\x00", "")
        text = "".join(
            ch for ch in text
            if ch in "\t\n\r" or ord(ch) >= 32
        )
        # 짝 없는 서로게이트 제거 (UTF-8 인코딩 불가)
        return text.encode("utf-8", "ignore").decode("utf-8", "ignore")

    def _detect_section(self, text: str) -> Optional[str]:
        text_lower = text[:200].lower()
        for section, keywords in self.SECTION_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                return section
        return None

    def _create_chunks(self, sections: list[dict], max_tokens: int = 512, overlap: int = 50) -> list[dict]:
        """섹션 기반 청킹 (섹션이 너무 길면 슬라이딩 윈도우)"""
        chunks = []
        for section_data in sections:
            content = section_data["content"]
            words = content.split()
            if len(words) <= max_tokens:
                chunks.append({**section_data, "content": content})
            else:
                for i in range(0, len(words), max_tokens - overlap):
                    chunk_words = words[i:i + max_tokens]
                    chunks.append({
                        "section": section_data["section"],
                        "page_num": section_data["page_num"],
                        "content": " ".join(chunk_words),
                    })
        return chunks

    async def _update_status(self, paper, status, progress, message, callback):
        paper.status = status
        if callback:
            await callback(paper_id=str(paper.id), stage=status, progress=progress, message=message)
