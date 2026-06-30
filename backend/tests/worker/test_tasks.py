import uuid

import pytest

from app.core.config import settings
from app.core.database import supabase
from app.core.vector_store import client as milvus_client
from app.worker.celery_app import celery_app
from app.worker.tasks import add, ingest_url_task


def test_add_runs_synchronously_in_eager_mode():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    result = add.delay(2, 3)
    assert result.get() == 5


def test_add_round_trips_through_real_broker_when_not_eager():
    celery_app.conf.update(task_always_eager=False)
    result = add.delay(2, 3)
    assert result.get(timeout=10) == 5


_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)

CRAWL_URL = "https://fastapi.tiangolo.com"
UNREACHABLE_URL = "https://this-does-not-exist-xyz.invalid"


@pytest.fixture
def test_tenant():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    tenant = _SCHEMA.table("tenants").insert({"user_id": str(uuid.uuid4())}).execute().data[0]  # noqa: E501
    yield tenant
    _SCHEMA.table("chunk_hashes").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    collection_name = f"tenant_{tenant['id'].replace('-', '')}"
    if milvus_client.has_collection(collection_name):
        milvus_client.drop_collection(collection_name)
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def _create_source(tenant_id: str, url: str) -> dict:
    return (
        _SCHEMA.table("sources")
        .insert({"tenant_id": tenant_id, "type": "url", "url": url, "status": "queued"})
        .execute()
        .data[0]
    )


def test_ingest_url_task_crawls_chunks_embeds_and_marks_source_done(test_tenant):
    source = _create_source(test_tenant["id"], CRAWL_URL)

    ingest_url_task.delay(source["id"], test_tenant["id"], CRAWL_URL, max_pages=2).get(
        timeout=120
    )

    updated = (
        _SCHEMA.table("sources").select("*").eq("id", source["id"]).execute().data[0]
    )
    assert updated["status"] == "done"
    assert updated["chunk_count"] > 0

    collection_name = f"tenant_{test_tenant['id'].replace('-', '')}"
    assert milvus_client.has_collection(collection_name)


def test_ingest_url_task_dedups_on_recrawl(test_tenant):
    first_source = _create_source(test_tenant["id"], CRAWL_URL)
    ingest_url_task.delay(
        first_source["id"], test_tenant["id"], CRAWL_URL, max_pages=2
    ).get(timeout=120)

    second_source = _create_source(test_tenant["id"], CRAWL_URL)
    ingest_url_task.delay(
        second_source["id"], test_tenant["id"], CRAWL_URL, max_pages=2
    ).get(timeout=120)

    updated = (
        _SCHEMA.table("sources")
        .select("*")
        .eq("id", second_source["id"])
        .execute()
        .data[0]
    )
    assert updated["status"] == "done"
    assert updated["chunk_count"] == 0


def test_ingest_url_task_marks_source_error_when_crawl_returns_no_pages(test_tenant):
    source = _create_source(test_tenant["id"], UNREACHABLE_URL)

    ingest_url_task.delay(source["id"], test_tenant["id"], UNREACHABLE_URL).get(
        timeout=60
    )

    updated = (
        _SCHEMA.table("sources").select("*").eq("id", source["id"]).execute().data[0]
    )
    assert updated["status"] == "error"
    assert "no pages" in updated["error_message"].lower()
