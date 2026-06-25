from app.worker.celery_app import celery_app
from app.worker.tasks import add


def test_add_runs_synchronously_in_eager_mode():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    result = add.delay(2, 3)
    assert result.get() == 5


def test_add_round_trips_through_real_broker_when_not_eager():
    celery_app.conf.update(task_always_eager=False)
    result = add.delay(2, 3)
    assert result.get(timeout=10) == 5
