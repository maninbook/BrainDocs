from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services.tension_service import TensionService, CONFLICT_TYPES
from app.services.embedding import EmbeddingService

router = APIRouter(prefix="/workspaces/{workspace_id}/tensions", tags=["tensions"])


class TensionRequest(BaseModel):
    topic: Optional[str] = None
    maxTensions: int = 6


@router.post("")
async def find_tensions(workspace_id: str, req: TensionRequest):
    """쟁점 재조정 분석 — 대립하는 주장 쌍과 그 원인을 반환"""
    svc = TensionService(EmbeddingService())
    result = await svc.find_tensions(
        workspace_id=workspace_id,
        topic=req.topic,
        max_tensions=req.maxTensions,
    )
    return {"success": True, "data": result}


@router.get("/conflict-types")
async def get_conflict_types():
    """충돌 원인 분류 체계 (UI 레전드용)"""
    return {"success": True, "data": CONFLICT_TYPES}
