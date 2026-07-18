from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "braindocs",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.process_paper_task": {"queue": "ingestion"},
        "app.workers.tasks.apply_decay_task": {"queue": "rag"},
    },
    beat_schedule={
        # 매일 자정 시냅스 감쇠 실행
        "synapse-decay": {
            "task": "app.workers.tasks.apply_decay_task",
            "schedule": crontab(hour=0, minute=0),
        },
    },
)
