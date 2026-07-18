import uuid
from typing import Any
import structlog
from app.core.config import settings
from app.core.qdrant import get_qdrant_client
from qdrant_client.models import PointStruct

log = structlog.get_logger()

class EmbeddingService:
    """임베딩 생성 + Qdrant 저장"""

    def __init__(self):
        self.provider = settings.EMBEDDING_PROVIDER
        self._openai_client = None
        self._local_model = None

    def _get_openai_client(self):
        if self._openai_client is None:
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai_client

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """텍스트 배치 임베딩"""
        if self.provider == "openai" and settings.OPENAI_API_KEY:
            client = self._get_openai_client()
            response = await client.embeddings.create(
                input=texts,
                model=settings.EMBEDDING_MODEL,
            )
            return [item.embedding for item in response.data]

        elif self.provider == "gemini" and settings.GEMINI_API_KEY:
            # SDK 대신 REST API 직접 호출 — outputDimensionality 지원 위해
            import httpx
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={settings.GEMINI_API_KEY}"
            results = []
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for text in texts:
                        res = await client.post(url, json={
                            "content": {"parts": [{"text": text}]},
                            "outputDimensionality": settings.EMBEDDING_DIM,
                            "taskType": "RETRIEVAL_DOCUMENT",
                        })
                        res.raise_for_status()
                        data = res.json()
                        results.append(data["embedding"]["values"])
                return results
            except Exception as e:
                log.error("Gemini embedding failed, falling back to mock", error=str(e))
                # 폴백 — mock embedding
                import random, math
                dim = settings.EMBEDDING_DIM
                result = []
                for text in texts:
                    rng = random.Random(hash(text) % (2**32))
                    vec = [rng.gauss(0, 1) for _ in range(dim)]
                    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
                    result.append([v / norm for v in vec])
                return result

        else:
            # API 키 없음 → 개발용 랜덤 임베딩 (구조 테스트용)
            import random, math
            log.warning("No embedding API key — using random mock embeddings (dev only)")
            dim = settings.EMBEDDING_DIM
            result = []
            for text in texts:
                rng = random.Random(hash(text) % (2**32))
                vec = [rng.gauss(0, 1) for _ in range(dim)]
                norm = math.sqrt(sum(v * v for v in vec)) or 1.0
                result.append([v / norm for v in vec])
            return result

    async def embed_and_store(
        self,
        chunks: list[dict],
        paper_id: str,
        workspace_id: str,
    ) -> list[dict]:
        """청크 임베딩 후 Qdrant 저장, qdrant_id 반환"""
        if not chunks:
            return []

        texts = [c["content"] for c in chunks]
        # 배치 처리 (최대 100개)
        all_embeddings = []
        for i in range(0, len(texts), 100):
            batch = texts[i:i+100]
            embeddings = await self.embed_texts(batch)
            all_embeddings.extend(embeddings)

        client = get_qdrant_client()
        points = []
        result_chunks = []

        for chunk, embedding in zip(chunks, all_embeddings):
            point_id = str(uuid.uuid4())
            points.append(PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "paper_id": paper_id,
                    "workspace_id": workspace_id,
                    "section": chunk.get("section", "body"),
                    "page_num": chunk.get("page_num", 1),
                    "text": chunk["content"][:1000],  # payload는 요약만
                }
            ))
            result_chunks.append({**chunk, "qdrant_id": point_id})

        await client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=points,
        )
        log.info("Chunks embedded and stored", count=len(points), paper_id=paper_id)
        return result_chunks

    async def embed_query(self, query: str) -> list[float]:
        """단일 쿼리 임베딩"""
        embeddings = await self.embed_texts([query])
        return embeddings[0]

    async def search_similar(
        self,
        query_vector: list[float],
        workspace_id: str,
        top_k: int = 20,
        score_threshold: float = 0.5,
    ) -> list[dict]:
        """벡터 유사도 검색"""
        client = get_qdrant_client()
        results = await client.search(
            collection_name=settings.QDRANT_COLLECTION,
            query_vector=query_vector,
            query_filter={
                "must": [{"key": "workspace_id", "match": {"value": workspace_id}}]
            },
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
        )
        return [
            {
                "qdrant_id": str(r.id),
                "paper_id": r.payload["paper_id"],
                "section": r.payload.get("section"),
                "text": r.payload.get("text", ""),
                "score": r.score,
            }
            for r in results
        ]
