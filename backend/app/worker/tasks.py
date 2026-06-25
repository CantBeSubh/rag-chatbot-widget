import time

from .celery_app import celery_app


@celery_app.task(bind=True)
def add(self, x: int, y: int) -> int:
    time.sleep(2)
    return x + y
