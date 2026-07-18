from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal
from app.services.rag_service import RAGService
from app.services.embedding import EmbeddingService
from app.repositories.neo4j_repo import Neo4jRepository

router = APIRouter(prefix="/workspaces/{workspace_id}/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("")
async def chat(workspace_id: str, req: ChatRequest):
    embedding_svc = EmbeddingService()
    neo4j_repo = Neo4jRepository()
    rag_svc = RAGService(embedding_svc, neo4j_repo)

    result = await rag_svc.chat(
        messages=[m.model_dump() for m in req.messages],
        workspace_id=workspace_id,
    )
    return {"success": True, "data": result}
