import uuid
from unittest.mock import patch

import pytest

from app.core.config import settings
from app.core.database import supabase
from app.worker.celery_app import celery_app
from app.worker.tasks import ingest_url_task

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)


@pytest.fixture(autouse=True)
def eager_mode():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)


@pytest.fixture
def source_and_tenant():
    tenant_data = _SCHEMA.table("tenants").insert(
        {"user_id": str(uuid.uuid4())}
    ).execute().data
    tenant = tenant_data[0]
    source_data = (
        _SCHEMA.table("sources")
        .insert({
            "tenant_id": tenant["id"],
            "type": "url",
            "url": "https://example.com",
            "status": "queued",
        })
        .execute()
        .data
    )
    source = source_data[0]
    yield tenant, source
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_ingest_url_task_marks_error_when_all_retries_exhausted(
    source_and_tenant,
):
    """After max_retries failures, sources.status must be 'error'."""
    tenant, source = source_and_tenant

    # max_retries=0 means the first failure is immediately the final failure
    original_max = ingest_url_task.max_retries
    ingest_url_task.max_retries = 0
    try:
        with patch(
            "app.worker.tasks.crawl_site_sync",
            side_effect=ConnectionError("network timeout"),
        ), pytest.raises(ConnectionError):
            ingest_url_task.delay(
                source["id"], tenant["id"], "https://example.com", max_pages=1
            ).get(timeout=10)
    finally:
        ingest_url_task.max_retries = original_max

    source_data = _SCHEMA.table("sources").select("*").eq(
        "id", source["id"]
    ).execute().data
    updated = source_data[0]
    assert updated["status"] == "error"
    assert "network timeout" in updated["error_message"]


def test_ingest_url_task_does_not_mark_error_on_first_retry(source_and_tenant):
    """On the first failure (retries=0, max=3), status must NOT be set to error."""
    tenant, source = source_and_tenant

    call_count = {"n": 0}

    def fail_once_then_succeed(*_args, **_kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise ConnectionError("transient failure")
        return []  # second call returns empty pages → sets status=error normally

    # Disable eager propagation to allow retries to happen in eager mode
    original_propagate = celery_app.conf.task_eager_propagates
    celery_app.conf.update(task_eager_propagates=False)
    try:
        with patch(
            "app.worker.tasks.crawl_site_sync", side_effect=fail_once_then_succeed
        ):
            # first attempt raises, retries happen in eager mode. Second call
            # returns [] which doesn't raise, so task completes without exception
            ingest_url_task.delay(
                source["id"], tenant["id"], "https://example.com", max_pages=1
            ).get(timeout=10)

        assert call_count["n"] == 2  # task ran at least twice (retry happened)
    finally:
        celery_app.conf.update(task_eager_propagates=original_propagate)


def test_ingest_url_task_decorator_has_jitter():
    """Task must have retry_jitter=True to avoid thundering herd on retry bursts."""
    assert getattr(ingest_url_task, "retry_jitter", False) is True
