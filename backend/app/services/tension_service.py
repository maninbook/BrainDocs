"""쟁점 재조정(Tension Reconciliation) 엔진.

기존 논문 도구들과의 차별점:
    NotebookLM/SciSpace  → 요약만 함 (충돌을 드러내지 않음)
    Connected Papers     → 인용 위상만 (주장 내용은 모름)
    Scite                → 인용문 감성 분류 (방법론 차이는 모름)

이 엔진은 단위를 '논문'이 아니라 '주장(claim)'으로 내리고,
각 주장에 방법론 지문(대상·표본·측정도구·설계·효과방향)을 붙인다.
그러면 두 주장이 충돌할 때 "왜" 충돌하는지 분류할 수 있다.

문헌 리뷰에서 가장 시간이 많이 드는 작업이 바로 이 재조정이다.
"""

import uuid
import json
import structlog
from app.core.config import settings
from app.services.embedding import EmbeddingService

log = structlog.get_logger()


# 충돌 원인 분류 체계 — 심리학/사회과학 방법론 기준
CONFLICT_TYPES = {
    "measurement": "측정 불일치",      # 같은 구성개념을 다른 도구로 측정 (jingle-jangle)
    "population": "표본 차이",         # 대상 집단이 다름 (연령·임상/비임상·문화권)
    "design": "설계 차이",             # 실험 vs 상관, within vs between
    "analysis": "분석 차이",           # 통제변인·분석기법·기준치가 다름
    "scale": "규모/조건 차이",         # 데이터 규모·태스크 난이도·세팅이 다름
    "genuine": "실질적 상충",          # 방법이 유사한데 결과가 반대 — 진짜 쟁점
}


class TensionService:
    """워크스페이스 논문들에서 쟁점(대립하는 주장 쌍)을 찾아 원인을 분류"""

    def __init__(self, embedding_svc: EmbeddingService):
        self.embedding_svc = embedding_svc

    async def find_tensions(
        self,
        workspace_id: str,
        topic: str | None = None,
        max_tensions: int = 6,
    ) -> dict:
        """
        1. (topic이 있으면) 해당 주제 청크 검색, 없으면 워크스페이스 전반 샘플링
        2. LLM으로 주장 + 방법론 지문 추출
        3. 대립 쌍 탐지 후 충돌 원인 분류
        """
        chunks = await self._collect_chunks(workspace_id, topic)
        if not chunks:
            return self._empty(topic)

        paper_ids = list(dict.fromkeys(c["paper_id"] for c in chunks))
        paper_meta = await self._load_paper_meta(paper_ids)

        result = await self._analyse(chunks, paper_meta, topic, max_tensions)
        if result is None:
            return self._empty(topic)

        # 논문 제목을 DB 값으로 보정 (LLM 환각 방지)
        for t in result.get("tensions", []):
            for side in ("claimA", "claimB"):
                claim = t.get(side) or {}
                meta = paper_meta.get(claim.get("paperId"))
                if meta and meta["title"]:
                    claim["paperTitle"] = meta["title"]
                    claim["year"] = meta["year"]
                    claim["authors"] = meta["authors"][:2]

        return {
            "topic": topic or "워크스페이스 전반",
            "summary": result.get("summary", ""),
            "tensions": result.get("tensions", [])[:max_tensions],
            "consensus": result.get("consensus", []),
            "gaps": result.get("gaps", []),
            "analysisId": str(uuid.uuid4()),
        }

    async def _collect_chunks(self, workspace_id: str, topic: str | None) -> list[dict]:
        """주제가 있으면 벡터 검색, 없으면 논문별로 고르게 샘플링"""
        if topic:
            try:
                vec = await self.embedding_svc.embed_query(topic)
                return await self.embedding_svc.search_similar(
                    query_vector=vec, workspace_id=workspace_id,
                    top_k=24, score_threshold=0.25)
            except Exception as e:
                log.error("Tension retrieval failed", error=str(e))
                return []

        # 주제 미지정 — 논문마다 대표 청크를 모아 폭넓게 훑는다
        from app.core.qdrant import get_qdrant_client
        try:
            client = get_qdrant_client()
            points, _ = await client.scroll(
                collection_name=settings.QDRANT_COLLECTION,
                scroll_filter={"must": [{"key": "workspace_id",
                                         "match": {"value": workspace_id}}]},
                limit=200, with_payload=True)
        except Exception as e:
            log.error("Tension scroll failed", error=str(e))
            return []

        by_paper: dict[str, list[dict]] = {}
        for p in points:
            pid = p.payload.get("paper_id")
            if not pid:
                continue
            by_paper.setdefault(pid, []).append({
                "paper_id": pid,
                "section": p.payload.get("section", "body"),
                "text": p.payload.get("text", ""),
            })
        # 논문당 최대 3청크
        chunks: list[dict] = []
        for pid, items in by_paper.items():
            chunks.extend(items[:3])
        return chunks[:30]

    async def _load_paper_meta(self, paper_ids: list[str]) -> dict:
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
                res = await db.execute(select(Paper).where(Paper.id.in_(ids)))
                papers = res.scalars().all()
            return {str(p.id): {"title": p.title or "", "year": p.year,
                                "authors": list(p.authors or [])}
                    for p in papers}
        except Exception as e:
            log.warning("Paper meta load failed", error=str(e))
            return {}

    async def _analyse(self, chunks, paper_meta, topic, max_tensions) -> dict | None:
        context = "\n\n".join(
            f"[논문ID: {c['paper_id']}] [{paper_meta.get(c['paper_id'], {}).get('title', '')[:70]}]"
            f" [섹션: {c.get('section', 'body')}]\n{c['text'][:900]}"
            for c in chunks[:20]
        )

        conflict_menu = "\n".join(f'  - "{k}": {v}' for k, v in CONFLICT_TYPES.items())

        prompt = f"""당신은 체계적 문헌고찰(systematic review)을 수행하는 방법론 전문가입니다.
아래 논문 발췌문들에서 **서로 대립하거나 긴장 관계에 있는 주장 쌍**을 찾아내고,
가장 중요한 일: **왜 그 둘이 어긋나는지** 방법론적으로 규명하세요.

{f'분석 주제: {topic}' if topic else '분석 주제: 자유 — 발췌문에서 가장 쟁점이 되는 축을 스스로 찾으세요.'}

논문 발췌문:
{context}

각 주장에 대해 발췌문에서 확인 가능한 **방법론 지문**을 추출하세요.
발췌문에 없는 정보는 반드시 null 로 두세요 (절대 추측하지 말 것).

충돌 원인은 다음 중에서 고르세요:
{conflict_menu}

다음 JSON 형식으로만 응답:
{{
  "summary": "이 코퍼스의 쟁점 지형을 2-3문장으로",
  "tensions": [
    {{
      "id": "t1",
      "issue": "쟁점을 한 문장 질문으로 (예: 'X는 Y를 향상시키는가?')",
      "claimA": {{
        "paperId": "논문ID",
        "statement": "이 논문의 주장 (한 문장)",
        "quote": "발췌문에서 그대로 가져온 근거 문장",
        "method": {{
          "population": "대상/데이터셋 (없으면 null)",
          "sampleSize": "표본 크기 문자열 (없으면 null)",
          "measure": "측정 도구/평가 지표 (없으면 null)",
          "design": "연구 설계 (없으면 null)",
          "direction": "positive | negative | null"
        }}
      }},
      "claimB": {{ 같은 구조 — A와 대립하는 주장 }},
      "conflictType": "위 목록의 키 중 하나",
      "reconciliation": "왜 어긋나는지, 그리고 둘 다 참일 수 있는 조건을 2-3문장으로. 이게 이 분석의 핵심이니 구체적으로.",
      "confidence": 0.0~1.0,
      "resolvable": true/false
    }}
  ],
  "consensus": ["여러 논문이 일치하는 지점 (문장 배열, 최대 3개)"],
  "gaps": ["아무 논문도 다루지 않아 비어있는 지점 (문장 배열, 최대 3개)"]
}}

규칙:
- 최대 {max_tensions}개 쟁점. 억지로 만들지 말고, 진짜 긴장이 있는 것만.
- quote 는 반드시 발췌문에 실제로 있는 문장.
- 방법이 서로 유사한데 결과가 반대면 conflictType 을 "genuine" 으로 하고 resolvable=false.
- 발췌문이 방법론 정보를 거의 안 담고 있으면 method 필드를 null 로 채우되, 쟁점 자체는 보고하세요.
"""

        try:
            if settings.GEMINI_API_KEY:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    "gemini-2.5-flash",
                    system_instruction=("문헌고찰 방법론 전문가. 반드시 JSON만 반환. "
                                        "근거 없는 추측 금지 — 모르면 null."),
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.2, response_mime_type="application/json"))
                resp = await model.generate_content_async(prompt)
                return json.loads(resp.text)

            elif settings.OPENAI_API_KEY:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                resp = await client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"}, temperature=0.2)
                return json.loads(resp.choices[0].message.content)

            log.warning("No LLM key — tension analysis unavailable")
            return None
        except Exception as e:
            log.error("Tension analysis failed", error=str(e))
            return None

    def _empty(self, topic) -> dict:
        return {
            "topic": topic or "워크스페이스 전반",
            "summary": "분석할 논문 내용을 찾지 못했습니다. 논문을 업로드했는지 확인해주세요.",
            "tensions": [], "consensus": [], "gaps": [],
            "analysisId": str(uuid.uuid4()),
        }
