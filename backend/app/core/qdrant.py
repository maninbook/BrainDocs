import asyncio
import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams
from app.core.config import settings

log = structlog.get_logger()
# 이벤트 루프별 클라이언트 (Celery에서 asyncio.run이 매번 새 루프를 만들기 때문)
_clients: dict[int, AsyncQdrantClient] = {}

def get_qdrant_client() -> AsyncQdrantClient:
    loop = asyncio.get_event_loop()
    loop_id = id(loop)
    if loop_id not in _clients:
        _clients[loop_id] = AsyncQdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
    return _clients[loop_id]

async def ensure_collection():
    """컬렉션이 없으면 생성. 차원이 다르면 재생성."""
    client = get_qdrant_client()
    name = settings.QDRANT_COLLECTION
    desired_dim = settings.EMBEDDING_DIM

    collections = await client.get_collections()
    names = [c.name for c in collections.collections]

    if name in names:
        info = await client.get_collection(name)
        current_dim = info.config.params.vectors.size
        if current_dim != desired_dim:
            log.warning(
                "Qdrant collection dim mismatch — recreating",
                current=current_dim, desired=desired_dim,
            )
            await client.delete_collection(name)
        else:
            return

    await client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(
            size=desired_dim,
            distance=Distance.COSINE,
        ),
    )
    log.info("Qdrant collection ready", name=name, dim=desired_dim)
