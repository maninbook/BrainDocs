import uuid
import structlog
from app.core.config import settings
from app.services.embedding import EmbeddingService
from app.repositories.neo4j_repo import Neo4jRepository

log = structlog.get_logger()

class RAGService:

    def __init__(self, embedding_svc: EmbeddingService, neo4j_repo: Neo4jRepository):
        self.embedding_svc = embedding_svc
        self.neo4j_repo = neo4j_repo

    async def explore_proposition(
        self,
        proposition: str,
        workspace_id: str,
        mode: str = "balanced",
        max_branches: int = 5,
        max_depth: int = 3,
        include_contradictions: bool = True,
    ) -> dict:
        """
        Graph RAG 기반 명제 탐색
        1. 명제 임베딩 → 벡터 검색
        2. 검색 결과 기반 그래프 순회
        3. LLM으로 분기 트리 생성
        """
        # 1. 쿼리 임베딩
        try:
            query_vector = await self.embedding_svc.embed_query(proposition)
        except Exception as e:
            log.error("Embedding failed", error=str(e))
            return self._empty_result(proposition)

        # 2. 벡터 검색
        similar_chunks = await self.embedding_svc.search_similar(
            query_vector=query_vector,
            workspace_id=workspace_id,
            top_k=20,
        )

        if not similar_chunks:
            return self._empty_result(proposition)

        # 3. 유니크 논문 ID 추출
        paper_ids = list(dict.fromkeys(c["paper_id"] for c in similar_chunks))[:10]

        # 3.5. 논문 메타데이터 로드 (LLM 컨텍스트 + 결과 보강용)
        paper_meta = await self._load_paper_meta(paper_ids)

        # 4. 각 청크의 텍스트 수집
        context_chunks = similar_chunks[:15]

        # 5. LLM으로 분기 트리 생성
        tree = await self._generate_branch_tree(
            proposition=proposition,
            chunks=context_chunks,
            paper_ids=paper_ids,
            max_branches=max_branches,
            max_depth=max_depth,
            include_contradictions=include_contradictions,
            paper_meta=paper_meta,
        )

        # 6. evidence의 제목/저자/연도를 DB 메타데이터로 보강 (LLM 환각 방지)
        self._enrich_tree(tree.get("root", {}), paper_meta)

        return {
            "proposition": proposition,
            "summary": tree.get("summary", "관련 논문을 바탕으로 탐색한 결과입니다."),
            "confidence": tree.get("confidence", 0.7),
            "tree": tree["root"],
            "relatedPapers": self._dedup_related(paper_ids, paper_meta)[:5],
            "exploreId": str(uuid.uuid4()),
            "synapseUpdates": [],
        }

    async def _load_paper_meta(self, paper_ids: list[str]) -> dict:
        """Postgres에서 논문 제목/저자/연도 조회"""
        from app.core.database import AsyncSessionLocal
        from app.models.paper import Paper
        from sqlalchemy import select

        ids = []
        for pid in paper_ids:
            try:
                ids.append(uuid.UUID(pid))
            except (ValueError, AttributeError):
                continue
        if not ids:
            return {}

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Paper).where(Paper.id.in_(ids)))
                papers = result.scalars().all()
            return {
                str(p.id): {
                    "title": p.title or "",
                    "authors": list(p.authors or []),
                    "year": p.year,
                }
                for p in papers
            }
        except Exception as e:
            log.warning("Paper metadata load failed", error=str(e))
            return {}

    def _dedup_related(self, paper_ids: list[str], paper_meta: dict) -> list[dict]:
        """같은 논문이 중복 업로드된 경우 제목 기준으로 하나만 노출"""
        seen_titles = set()
        related = []
        for pid in paper_ids:
            title = paper_meta.get(pid, {}).get("title", "")
            key = title.strip().lower() or pid
            if key in seen_titles:
                continue
            seen_titles.add(key)
            related.append({"paperId": pid, "title": title, "relevance": 0.8})
        return related

    def _enrich_tree(self, node: dict, paper_meta: dict) -> None:
        """트리의 evidence를 DB 메타데이터로 덮어쓰기"""
        if not node:
            return
        for ev in node.get("evidence", []):
            meta = paper_meta.get(ev.get("paperId"))
            if meta and meta["title"]:
                ev["title"] = meta["title"]
                ev["authors"] = meta["authors"]
                ev["year"] = meta["year"]
        for child in node.get("children", []):
            self._enrich_tree(child, paper_meta)

    async def _generate_branch_tree(
        self,
        proposition: str,
        chunks: list[dict],
        paper_ids: list[str],
        max_branches: int,
        max_depth: int,
        include_contradictions: bool,
        paper_meta: dict | None = None,
    ) -> dict:
        """LLM 호출로 분기 트리 생성"""
        paper_meta = paper_meta or {}

        def _meta_label(pid: str) -> str:
            m = paper_meta.get(pid)
            if not m or not m["title"]:
                return ""
            year = f" ({m['year']})" if m.get("year") else ""
            return f" [제목: {m['title']}{year}]"

        context = "\n\n".join([
            f"[논문 ID: {c['paper_id']}]{_meta_label(c['paper_id'])} [섹션: {c.get('section', 'body')}]\n{c['text']}"
            for c in chunks[:10]
        ])

        prompt = f"""
다음 논문 발췌문들을 바탕으로 명제를 탐색하세요.

명제: "{proposition}"

논문 발췌문:
{context}

다음 JSON 형식으로 탐색 결과를 반환하세요:
{{
    "summary": "전체 요약 (2-3문장)",
    "confidence": 0.0~1.0,
    "root": {{
        "id": "root",
        "concept": "핵심 개념",
        "type": "supporting",
        "summary": "요약",
        "evidence": [
            {{
                "paperId": "논문ID",
                "title": "논문제목",
                "authors": ["저자"],
                "year": 2024,
                "quote": "인용 문장",
                "page": 1,
                "relevance": 0.9
            }}
        ],
        "children": [
            {{
                "id": "branch-1",
                "concept": "세부 개념",
                "type": "supporting|contradicting|extending|methodological",
                "summary": "요약",
                "evidence": [],
                "children": []
            }}
        ]
    }}
}}

규칙:
- 1단계 분기(root의 children)는 최대 {max_branches}개.
- 트리는 반드시 깊이 {max_depth}까지 뻗어야 합니다 (root=깊이 0). 각 분기는 발췌문에서 근거를 찾을 수 있는 한 2~3개의 하위 분기(children)로 세분화하세요.
- 하위 분기는 상위 개념을 더 구체적인 하위 개념·메커니즘·조건·사례로 분해한 것이어야 합니다.
- 마인드맵처럼 개념이 계속 가지를 치며 확장되는 구조를 만드세요. 얕은 트리(children이 비어있는 1단계 분기만 있는 형태)는 피하세요.
- include_contradictions={include_contradictions} — True면 명제와 대립하는 반론(contradicting) 분기도 반드시 1개 이상 포함.
- 모든 evidence의 quote는 발췌문에서 실제로 가져온 문장이어야 하며, paperId는 해당 발췌문의 논문 ID를 정확히 사용하세요.
"""

        import json

        def _extract_json(raw: str) -> dict:
            """마크다운 코드블록 제거 후 JSON 파싱"""
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw.strip())

        try:
            if settings.GEMINI_API_KEY:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    "gemini-2.5-flash",
                    system_instruction="논문 기반 지식 탐색 AI. 반드시 JSON만 반환. 마크다운 없이 JSON 객체만 출력.",
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.3,
                        response_mime_type="application/json",
                    ),
                )
                response = await model.generate_content_async(prompt)
                return _extract_json(response.text)

            elif settings.OPENAI_API_KEY:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                response = await client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": "논문 기반 지식 탐색 AI. 반드시 JSON만 반환."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                )
                return json.loads(response.choices[0].message.content)

            elif settings.ANTHROPIC_API_KEY:
                import anthropic
                client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=4096,
                    system="논문 기반 지식 탐색 AI. 반드시 JSON만 반환. 다른 텍스트 없이 JSON 객체만 출력.",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                )
                return _extract_json(response.content[0].text)

            else:
                return self._mock_tree(proposition, chunks)

        except Exception as e:
            log.error("LLM call failed", error=str(e))
            return self._mock_tree(proposition, chunks)

    async def chat(
        self,
        messages: list[dict],
        workspace_id: str,
        top_k: int = 12,
    ) -> dict:
        """워크스페이스 논문 기반 RAG 채팅 — 답변 + 출처 반환"""
        # 마지막 사용자 질문 추출
        question = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        if not question.strip():
            return {"answer": "질문을 입력해주세요.", "sources": []}

        # 벡터 검색
        try:
            query_vector = await self.embedding_svc.embed_query(question)
            similar_chunks = await self.embedding_svc.search_similar(
                query_vector=query_vector,
                workspace_id=workspace_id,
                top_k=top_k,
                score_threshold=0.3,
            )
        except Exception as e:
            log.error("Chat retrieval failed", error=str(e))
            similar_chunks = []

        if not similar_chunks:
            return {
                "answer": "관련 내용을 논문에서 찾지 못했습니다. 논문을 먼저 업로드하거나 질문을 바꿔보세요.",
                "sources": [],
            }

        paper_ids = list(dict.fromkeys(c["paper_id"] for c in similar_chunks))
        paper_meta = await self._load_paper_meta(paper_ids)

        # 출처 목록 (논문 단위 dedup, 제목 기준)
        sources = []
        seen_titles = set()
        for c in similar_chunks:
            meta = paper_meta.get(c["paper_id"], {})
            title = meta.get("title", "") or "제목 미상"
            key = title.strip().lower()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            sources.append({
                "paperId": c["paper_id"],
                "title": title,
                "authors": meta.get("authors", []),
                "year": meta.get("year"),
                "snippet": c["text"][:200],
            })
        sources = sources[:5]

        # 컨텍스트 구성 — 출처 번호를 붙여 인용 유도
        numbered = {s["paperId"]: i + 1 for i, s in enumerate(sources)}
        context = "\n\n".join(
            f"[{numbered.get(c['paper_id'], '?')}] {paper_meta.get(c['paper_id'], {}).get('title', '')} — {c.get('section', 'body')}\n{c['text']}"
            for c in similar_chunks[:10]
        )

        # 최근 대화 이력 (마지막 6개)
        history = "\n".join(
            f"{'사용자' if m['role'] == 'user' else 'AI'}: {m['content']}"
            for m in messages[-7:-1]
        )

        prompt = f"""당신은 업로드된 논문들을 바탕으로 답하는 연구 어시스턴트입니다.

논문 발췌문 (번호는 출처 번호):
{context}

{f'이전 대화:{chr(10)}{history}{chr(10)}' if history else ''}
질문: {question}

규칙:
- 반드시 위 발췌문에 근거해서 한국어로 답하세요. 발췌문에 없는 내용은 "논문에서 확인되지 않는다"고 명시하세요.
- 주장 뒤에 근거 출처 번호를 [1], [2] 형식으로 붙이세요.
- 간결하되 핵심을 담아 답하세요 (3~6문장).
"""

        try:
            if settings.GEMINI_API_KEY:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    "gemini-2.5-flash",
                    generation_config=genai.types.GenerationConfig(temperature=0.3),
                )
                response = await model.generate_content_async(prompt)
                answer = response.text.strip()
            elif settings.OPENAI_API_KEY:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                response = await client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                )
                answer = response.choices[0].message.content.strip()
            else:
                answer = f'"{question}"에 대해 {len(similar_chunks)}개 관련 청크를 찾았습니다. (LLM API 키가 없어 답변 생성은 생략됩니다)'
        except Exception as e:
            log.error("Chat LLM call failed", error=str(e))
            return {"answer": "답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", "sources": sources}

        return {"answer": answer, "sources": sources}

    def _mock_tree(self, proposition: str, chunks: list[dict]) -> dict:
        """LLM 없을 때 목 응답"""
        paper_id = chunks[0]["paper_id"] if chunks else "unknown"
        return {
            "summary": f'"{proposition}"에 대해 {len(chunks)}개 청크에서 관련 내용을 찾았습니다.',
            "confidence": 0.65,
            "root": {
                "id": "root",
                "concept": proposition,
                "type": "supporting",
                "summary": "업로드된 논문들에서 관련 내용이 발견되었습니다.",
                "evidence": [
                    {
                        "paperId": paper_id,
                        "title": "관련 논문",
                        "authors": [],
                        "year": 2024,
                        "quote": chunks[0]["text"][:200] if chunks else "",
                        "page": chunks[0].get("page_num", 1) if chunks else 1,
                        "relevance": 0.8,
                    }
                ] if chunks else [],
                "children": [],
            },
        }

    def _empty_result(self, proposition: str) -> dict:
        return {
            "proposition": proposition,
            "summary": "관련 논문을 찾지 못했습니다. 논문을 먼저 업로드해주세요.",
            "confidence": 0.0,
            "tree": {"id": "root", "concept": proposition, "type": "supporting",
                     "summary": "", "evidence": [], "children": []},
            "relatedPapers": [],
            "exploreId": str(uuid.uuid4()),
            "synapseUpdates": [],
        }
