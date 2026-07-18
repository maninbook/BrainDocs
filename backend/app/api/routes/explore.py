from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from app.services.rag_service import RAGService
from app.services.embedding import EmbeddingService
from app.repositories.neo4j_repo import Neo4jRepository

router = APIRouter(prefix="/workspaces/{workspace_id}/explore", tags=["explore"])

class ExploreRequest(BaseModel):
    proposition: str
    mode: Literal["focused", "balanced", "exploratory"] = "balanced"
    maxBranches: int = 5
    maxDepth: int = 3
    includeContradictions: bool = True

@router.post("")
async def explore(workspace_id: str, req: ExploreRequest):
    embedding_svc = EmbeddingService()
    neo4j_repo = Neo4jRepository()
    rag_svc = RAGService(embedding_svc, neo4j_repo)

    result = await rag_svc.explore_proposition(
        proposition=req.proposition,
        workspace_id=workspace_id,
        mode=req.mode,
        max_branches=req.maxBranches,
        max_depth=req.maxDepth,
        include_contradictions=req.includeContradictions,
    )
    return {"success": True, "data": result}

@router.get("/history")
async def get_history(workspace_id: str, page: int = 1):
    # TODO: DB에서 탐색 히스토리 조회
    return {"success": True, "data": [], "meta": {"page": page, "total": 0}}
