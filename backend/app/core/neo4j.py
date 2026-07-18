import asyncio
from neo4j import AsyncGraphDatabase
from app.core.config import settings

# 이벤트 루프별 드라이버 (Celery 호환)
_drivers: dict[int, "AsyncGraphDatabase.driver"] = {}

def get_neo4j_driver():
    loop = asyncio.get_event_loop()
    loop_id = id(loop)
    if loop_id not in _drivers:
        _drivers[loop_id] = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
    return _drivers[loop_id]

async def close_neo4j():
    loop = asyncio.get_event_loop()
    loop_id = id(loop)
    drv = _drivers.pop(loop_id, None)
    if drv:
        await drv.close()
