from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # 앱
    APP_NAME: str = "BrainDocs"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # 데이터베이스
    DATABASE_URL: str = "postgresql+asyncpg://braindocs:braindocs@localhost:5432/braindocs"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "braindocs123"

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "braindocs_chunks"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # LLM
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    EMBEDDING_PROVIDER: str = "openai"  # "openai" | "gemini" | "local"
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIM: int = 1536  # openai: 1536, gemini: 768
    LLM_MODEL: str = "gpt-4o"

    # 인증
    JWT_SECRET: str = "dev-secret-please-change"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 파일
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    # 시냅스 설정
    SYNAPSE_DECAY_LAMBDA: float = 0.02  # 일별 감쇠 계수
    SYNAPSE_MIN_STRENGTH: float = 0.01

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
