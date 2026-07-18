from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import redis.asyncio as aioredis
import asyncio
import json

from app.core.config import settings
from app.core.database import engine
from app.core.qdrant import ensure_collection
from app.core.neo4j import close_neo4j
from app.api.routes import papers, graph, explore, chat
from app.repositories.neo4j_repo import Neo4jRepository


# ─── WebSocket (Socket.io) ─────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
)

@sio.event
async def connect(sid, environ, auth):
    workspace_id = environ.get("QUERY_STRING", "")
    for part in workspace_id.split("&"):
        if part.startswith("workspace_id="):
            wid = part.split("=")[1]
            await sio.enter_room(sid, f"workspace:{wid}")
            break
    await sio.emit("connected", {"message": "Connected to BrainDocs"}, to=sid)

@sio.event
async def disconnect(sid):
    pass

@sio.event
async def paper_viewed(sid, data):
    """논문 조회 시 관련 논문 간 시냅스 강화"""
    paper_id_a = data.get("paperId")
    paper_id_b = data.get("relatedPaperId")
    workspace_id = data.get("workspaceId")
    if not (paper_id_a and paper_id_b and workspace_id):
        return
    try:
        neo4j_repo = Neo4jRepository()
        new_strength = await neo4j_repo.reinforce_edge(paper_id_a, paper_id_b, 0.05)
        await sio.emit(
            "synapse_updated",
            {"edgeId": f"{paper_id_a}-{paper_id_b}", "newStrength": new_strength},
            room=f"workspace:{workspace_id}",
        )
    except Exception:
        pass

# Redis → Socket.io 브리지
async def redis_listener(redis_url: str):
    """Redis PubSub 메시지를 Socket.io로 포워딩"""
    client = aioredis.from_url(redis_url)
    pubsub = client.pubsub()
    await pubsub.psubscribe("workspace:*")
    async for message in pubsub.listen():
        if message["type"] == "pmessage":
            channel = message["channel"]
            data = json.loads(message["data"])
            await sio.emit(data["type"], data["data"], room=channel)


async def requeue_stuck_papers():
    """미완료 상태로 남은 논문 재큐잉 — Celery 큐가 유실돼도(재부팅 등) 처리가 재개되도록"""
    from app.core.database import AsyncSessionLocal
    from app.models.paper import Paper
    from app.workers.tasks import process_paper_task
    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Paper).where(Paper.status.notin_(["completed", "failed"]))
            )
            stuck = result.scalars().all()
        for p in stuck:
            process_paper_task.delay(str(p.id), str(p.workspace_id))
        if stuck:
            print(f"[startup] Re-enqueued {len(stuck)} unfinished papers")
    except Exception as e:
        print(f"[startup] Requeue check failed: {e}")


# ─── 앱 생명주기 ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 — DB 테이블 자동 생성
    from app.core.database import Base
    from app.models import paper as _  # noqa: F401 — 모델 등록
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await ensure_collection()
    await requeue_stuck_papers()
    redis_task = asyncio.create_task(redis_listener(settings.REDIS_URL))
    yield
    # 종료
    redis_task.cancel()
    await close_neo4j()
    await engine.dispose()


# ─── FastAPI 앱 ──────────────────────────────────────────
app = FastAPI(
    title="BrainDocs API",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(papers.router, prefix="/v1")
app.include_router(graph.router, prefix="/v1")
app.include_router(explore.router, prefix="/v1")
app.include_router(chat.router, prefix="/v1")

# 워크스페이스 라우터 (간단)
from fastapi import APIRouter
from app.core.database import get_db
from app.models.paper import Workspace, Paper
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import Depends
import uuid as _uuid

ws_router = APIRouter(prefix="/v1/workspaces", tags=["workspaces"])

@ws_router.get("")
async def list_workspaces(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workspace))
    workspaces = result.scalars().all()

    ws_ids = [w.id for w in workspaces]
    counts: dict[_uuid.UUID, int] = {}
    if ws_ids:
        cnt_result = await db.execute(
            select(Paper.workspace_id, func.count(Paper.id))
            .where(Paper.workspace_id.in_(ws_ids))
            .group_by(Paper.workspace_id)
        )
        counts = {row[0]: row[1] for row in cnt_result.all()}

    return {"success": True, "data": [
        {
            "id": str(w.id),
            "name": w.name,
            "description": w.description,
            "thumbnailColor": w.thumbnail_color,
            "paperCount": counts.get(w.id, 0),
            "createdAt": w.created_at.isoformat(),
        }
        for w in workspaces
    ]}

@ws_router.post("", status_code=201)
async def create_workspace(payload: dict, db: AsyncSession = Depends(get_db)):
    color = payload.get("thumbnailColor", "#4A7FA5")
    ws = Workspace(
        id=_uuid.uuid4(),
        name=payload.get("name", "새 워크스페이스"),
        description=payload.get("description"),
        thumbnail_color=color,
    )
    db.add(ws)
    await db.commit()
    return {"success": True, "data": {"id": str(ws.id), "name": ws.name}}

app.include_router(ws_router)

# Socket.io ASGI 마운트
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}
