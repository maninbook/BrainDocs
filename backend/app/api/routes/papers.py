import uuid, os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import settings
from app.models.paper import Paper, Workspace
from app.workers.tasks import process_paper_task
from app.repositories.neo4j_repo import Neo4jRepository

def get_neo4j() -> Neo4jRepository:
    return Neo4jRepository()

router = APIRouter(prefix="/workspaces/{workspace_id}/papers", tags=["papers"])

@router.get("")
async def list_papers(
    workspace_id: str,
    search: str | None = None,
    is_key_paper: bool | None = None,
    page: int = 1,
    per_page: int = 20,
    db: AsyncSession = Depends(get_db),
    neo4j: Neo4jRepository = Depends(get_neo4j),
):
    query = select(Paper).where(Paper.workspace_id == uuid.UUID(workspace_id))
    if search:
        query = query.where(Paper.title.ilike(f"%{search}%"))
    if is_key_paper is not None:
        query = query.where(Paper.is_key_paper == is_key_paper)
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    papers = result.scalars().all()

    paper_ids = [str(p.id) for p in papers]
    conn_counts = await neo4j.get_connection_counts(workspace_id, paper_ids)

    return {
        "success": True,
        "data": [_paper_to_dict(p, conn_counts.get(str(p.id), 0)) for p in papers],
        "meta": {"page": page, "per_page": per_page, "total": len(papers)},
    }

@router.post("", status_code=202)
async def upload_paper(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    doi: str | None = Form(None),
    arxiv_id: str | None = Form(None),
    is_key_paper: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    if not file and not doi and not arxiv_id:
        raise HTTPException(400, "file, doi, arxiv_id 중 하나는 필수입니다")

    # 파일 저장
    file_path = None
    if file:
        if file.content_type != "application/pdf":
            raise HTTPException(400, "PDF 파일만 업로드 가능합니다")
        paper_id = uuid.uuid4()
        upload_dir = Path(settings.UPLOAD_DIR) / workspace_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = str(upload_dir / f"{paper_id}.pdf")
        with open(file_path, "wb") as f:
            content = await file.read()
            if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                raise HTTPException(400, f"파일 크기가 {settings.MAX_FILE_SIZE_MB}MB를 초과합니다")
            f.write(content)
    else:
        paper_id = uuid.uuid4()

    paper = Paper(
        id=paper_id,
        workspace_id=uuid.UUID(workspace_id),
        doi=doi,
        arxiv_id=arxiv_id,
        is_key_paper=is_key_paper,
        status="pending",
        file_path=file_path,
    )
    db.add(paper)
    await db.commit()

    # 백그라운드 처리 작업 큐
    process_paper_task.delay(str(paper_id), workspace_id)

    return {
        "success": True,
        "data": {"paperId": str(paper_id), "taskId": f"task-{paper_id}", "status": "pending"},
    }

@router.get("/{paper_id}")
async def get_paper(
    workspace_id: str,
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    neo4j: Neo4jRepository = Depends(get_neo4j),
):
    paper = await _get_paper_or_404(db, workspace_id, paper_id)
    conn_counts = await neo4j.get_connection_counts(workspace_id, [paper_id])
    return {"success": True, "data": _paper_to_dict(paper, conn_counts.get(paper_id, 0))}

@router.patch("/{paper_id}")
async def update_paper(
    workspace_id: str, paper_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    paper = await _get_paper_or_404(db, workspace_id, paper_id)
    for key, val in payload.items():
        if hasattr(paper, key):
            setattr(paper, key, val)
    await db.commit()
    return {"success": True, "data": _paper_to_dict(paper)}

@router.delete("/{paper_id}", status_code=204)
async def delete_paper(workspace_id: str, paper_id: str, db: AsyncSession = Depends(get_db)):
    paper = await _get_paper_or_404(db, workspace_id, paper_id)
    await db.delete(paper)
    await db.commit()

@router.get("/{paper_id}/status")
async def get_paper_status(workspace_id: str, paper_id: str, db: AsyncSession = Depends(get_db)):
    paper = await _get_paper_or_404(db, workspace_id, paper_id)
    return {"success": True, "data": {
        "paperId": paper_id, "status": paper.status,
        "stage": paper.status, "progress": _status_to_progress(paper.status),
    }}

# ─── helpers ────────────────────────────────────────────
async def _get_paper_or_404(db, workspace_id, paper_id):
    result = await db.execute(
        select(Paper).where(
            Paper.id == uuid.UUID(paper_id),
            Paper.workspace_id == uuid.UUID(workspace_id),
        )
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(404, "논문을 찾을 수 없습니다")
    return paper

def _paper_to_dict(p: Paper, connection_count: int = 0) -> dict:
    return {
        "id": str(p.id),
        "title": p.title,
        "authors": p.authors or [],
        "year": p.year,
        "journal": p.journal,
        "doi": p.doi,
        "arxivId": p.arxiv_id,
        "abstract": p.abstract,
        "keywords": p.keywords or [],
        "isKeyPaper": p.is_key_paper,
        "status": p.status,
        "connectionCount": connection_count,
        "avgStrength": 0.0,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    }

def _status_to_progress(status: str) -> int:
    return {"pending": 0, "parsing": 15, "embedding": 40,
            "extracting": 65, "indexing": 85, "completed": 100, "failed": 0}.get(status, 0)
