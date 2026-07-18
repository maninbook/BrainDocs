import asyncio
import uuid
from app.workers.celery_app import celery_app

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_paper_task(self, paper_id: str, workspace_id: str):
    """논문 처리 비동기 작업"""
    try:
        asyncio.run(_process_paper_async(paper_id, workspace_id))
    except Exception as exc:
        raise self.retry(exc=exc)

async def _process_paper_async(paper_id: str, workspace_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.paper import Paper
    from app.services.ingestion import IngestionService
    from app.services.embedding import EmbeddingService
    from app.repositories.neo4j_repo import Neo4jRepository
    from app.core.qdrant import ensure_collection
    from sqlalchemy import select
    import redis.asyncio as aioredis
    from app.core.config import settings
    import json

    # Qdrant 컬렉션 초기화
    await ensure_collection()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Paper).where(Paper.id == uuid.UUID(paper_id)))
        paper = result.scalar_one_or_none()
        if not paper:
            return

        # Redis PubSub으로 진행 상황 브로드캐스트
        redis_client = aioredis.from_url(settings.REDIS_URL)

        async def progress_cb(paper_id, stage, progress, message):
            await redis_client.publish(
                f"workspace:{workspace_id}",
                json.dumps({
                    "type": "ingestion_progress",
                    "data": {"paperId": paper_id, "stage": stage, "progress": progress, "message": message},
                }),
            )

        embedding_svc = EmbeddingService()
        neo4j_repo = Neo4jRepository()
        ingestion_svc = IngestionService(embedding_svc, neo4j_repo)

        chunks = await ingestion_svc.process_pdf(paper, progress_cb=progress_cb)

        if chunks:
            for chunk in chunks:
                db.add(chunk)

        await db.commit()

        # 그래프 업데이트 이벤트 전송
        await redis_client.publish(
            f"workspace:{workspace_id}",
            json.dumps({"type": "graph_updated", "data": {"newNodes": [], "newEdges": []}}),
        )
        await redis_client.aclose()

@celery_app.task
def apply_decay_task():
    """시냅스 감쇠 (매일 자정 실행)"""
    asyncio.run(_apply_decay_async())

async def _apply_decay_async():
    from app.repositories.neo4j_repo import Neo4jRepository
    from app.core.database import AsyncSessionLocal
    from app.models.paper import Workspace
    from sqlalchemy import select

    neo4j_repo = Neo4jRepository()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace))
        workspaces = result.scalars().all()
        for ws in workspaces:
            count = await neo4j_repo.apply_decay(str(ws.id))
            print(f"Decay applied: workspace={ws.id}, updated={count}")
