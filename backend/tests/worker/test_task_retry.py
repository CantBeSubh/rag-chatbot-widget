import uuid
from unittest.mock import patch

import pytest
from celery.exceptions import Retry

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


def test_ingest_url_task_does_not_mark_error_on_first_retry(
    source_and_tenant,
):
    """On the first failure (retries=0, max=3), status must NOT be set to error."""
    tenant, source = source_and_tenant

    # Keep max_retries at default (3), so first failure should NOT set status=error
    with patch(
        "app.worker.tasks.crawl_site_sync",
        side_effect=ConnectionError("transient failure"),
    ), pytest.raises((ConnectionError, Retry)):
        # first attempt raises with retries available (max=3)
        ingest_url_task.delay(
            source["id"], tenant["id"], "https://example.com", max_pages=1
        ).get(timeout=10)

    # With retries available (max=3, current=0), status must NOT be set to error
    # even though the exception was raised
    source_data = _SCHEMA.table("sources").select("*").eq(
        "id", source["id"]
    ).execute().data
    updated = source_data[0]
    # Status should still be 'crawling' (set at task start), not 'error'
    # (the except block checks: if self.request.retries >= self.max_retries,
    # and since retries=0 < max_retries=3, status is NOT set to error)
    assert updated["status"] == "crawling"
    assert updated["error_message"] is None


def test_ingest_url_task_decorator_has_jitter():
    """Task must have retry_jitter=True to avoid thundering herd on retry bursts."""
    assert getattr(ingest_url_task, "retry_jitter", False) is True
