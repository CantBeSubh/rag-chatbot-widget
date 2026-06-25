from celery import Celery

from ..core.config import settings

celery_app = Celery(
    "rag_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    # Playwright/Chromium (used by crawl4ai) crashes in forked processes (SIGSEGV).
    # solo pool runs tasks in the main process without fork().
    worker_pool="solo",
)
