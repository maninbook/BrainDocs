# BrainDocs — 개발 시작 가이드

## 빠른 시작 (Docker Compose)

```bash
# 1. 환경 변수 설정
cp backend/.env.example backend/.env
# backend/.env 에서 OPENAI_API_KEY 등 설정

# 2. 전체 서비스 실행
docker-compose up -d

# 3. 브라우저 접속
# 프론트엔드: http://localhost:5173
# API 문서:   http://localhost:8000/docs
# Neo4j:      http://localhost:7474
```

## 로컬 개발

### 백엔드
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # API 키 설정

# DB 마이그레이션 (Alembic)
alembic upgrade head

# 개발 서버
uvicorn app.main:socket_app --reload --port 8000

# Celery 워커 (별도 터미널)
celery -A app.workers.celery_app worker --loglevel=info
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

## 핵심 파일 구조

```
braindocs/
├── frontend/src/
│   ├── components/
│   │   ├── GraphView/        ← Sigma.js 그래프 (WebGL)
│   │   ├── Sidebar/          ← 논문 목록 + 검색
│   │   ├── UploadZone/       ← PDF 업로드 (드래그&드롭)
│   │   ├── PropositionExplorer/ ← 명제 탐색 UI
│   │   └── DetailPanel/      ← 논문 상세 정보
│   ├── stores/               ← Zustand 전역 상태
│   ├── api/                  ← Axios API 클라이언트
│   └── hooks/useWebSocket.ts ← 실시간 Socket.io
│
└── backend/app/
    ├── main.py               ← FastAPI + Socket.io 앱 진입점
    ├── core/                 ← 설정, DB 연결
    ├── models/paper.py       ← SQLAlchemy ORM 모델
    ├── api/routes/           ← REST API 라우터
    ├── services/
    │   ├── ingestion.py      ← PDF 파싱 파이프라인
    │   ├── embedding.py      ← 임베딩 + Qdrant 저장
    │   └── rag_service.py    ← Graph RAG + LLM 탐색
    ├── repositories/
    │   └── neo4j_repo.py     ← Neo4j Cypher 쿼리
    └── workers/
        ├── celery_app.py     ← Celery 설정 + Beat 스케줄
        └── tasks.py          ← 비동기 작업 (PDF 처리, 감쇠)
```

## 다음 구현 단계 (Phase 2)

- [ ] Alembic 마이그레이션 파일 작성
- [ ] JWT 인증 미들웨어 완성
- [ ] DOI/arXiv 자동 메타데이터 임포트 (CrossRef API)
- [ ] 논문 간 유사도 엣지 벡터 기반으로 교체
- [ ] ForceAtlas2 레이아웃 좌표 Neo4j에 저장
- [ ] PDF 뷰어 (PDF.js) 하이라이트 연동
- [ ] 클러스터 감지 (Leiden 알고리즘)
- [ ] 시냅스 강도 실시간 시각화 애니메이션
