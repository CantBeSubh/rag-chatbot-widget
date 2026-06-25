import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import supabase
from app.core.embedder import embed
from app.core.vector_store import (
    client as milvus_client,
)
from app.core.vector_store import (
    create_collection_if_not_exists,
    upsert,
    vector_search,
)
from app.main import app

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)
test_client = TestClient(app)


@pytest.fixture
def test_tenant():
    tenant = _SCHEMA.table("tenants").insert({}).execute().data[0]
    yield tenant
    _SCHEMA.table("chunk_hashes").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    collection_name = f"tenant_{tenant['id'].replace('-', '')}"
    if milvus_client.has_collection(collection_name):
        milvus_client.drop_collection(collection_name)
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


@pytest.fixture
def other_tenant():
    tenant = _SCHEMA.table("tenants").insert({}).execute().data[0]
    yield tenant
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def _make_source(tenant_id: str, url: str = "https://example.com") -> dict:
    return (
        _SCHEMA.table("sources")
        .insert({"tenant_id": tenant_id, "type": "url", "url": url, "status": "queued"})
        .execute()
        .data[0]
    )


# ── GET /sources ──────────────────────────────────────────────────────────────


def test_list_sources_returns_empty_list_when_tenant_has_none(test_tenant):
    response = test_client.get(
        "/sources",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_list_sources_returns_only_own_tenant_sources(test_tenant, other_tenant):
    _make_source(test_tenant["id"], "https://mine.com")
    _make_source(other_tenant["id"], "https://theirs.com")

    response = test_client.get(
        "/sources",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 200
    sources = response.json()
    assert len(sources) == 1
    assert sources[0]["url"] == "https://mine.com"


def test_list_sources_ordered_by_ingested_at_descending(test_tenant):
    _make_source(test_tenant["id"], "https://first.com")
    _make_source(test_tenant["id"], "https://second.com")

    response = test_client.get(
        "/sources",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 200
    sources = response.json()
    assert len(sources) == 2
    assert sources[0]["url"] == "https://second.com"
    assert sources[1]["url"] == "https://first.com"


def test_list_sources_rejects_invalid_api_key():
    response = test_client.get(
        "/sources",
        headers={"Authorization": f"Bearer {uuid.uuid4()}"},
    )
    assert response.status_code == 401


# ── GET /sources/{source_id} ──────────────────────────────────────────────────


def test_get_source_returns_source_for_valid_owner(test_tenant):
    source = _make_source(test_tenant["id"])

    response = test_client.get(
        f"/sources/{source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == source["id"]
    assert body["status"] == "queued"


def test_get_source_returns_404_for_unknown_id(test_tenant):
    response = test_client.get(
        f"/sources/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )
    assert response.status_code == 404


def test_get_source_returns_404_when_source_belongs_to_other_tenant(
    test_tenant, other_tenant
):
    other_source = _make_source(other_tenant["id"])

    response = test_client.get(
        f"/sources/{other_source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )
    assert response.status_code == 404


# ── DELETE /sources/{source_id} ───────────────────────────────────────────────


def test_delete_source_removes_supabase_row(test_tenant):
    source = _make_source(test_tenant["id"])

    response = test_client.delete(
        f"/sources/{source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": source["id"]}

    remaining = _SCHEMA.table("sources").select("id").eq("id", source["id"]).execute()
    assert remaining.data == []


def test_delete_source_removes_vectors_from_zilliz(test_tenant):
    source = _make_source(test_tenant["id"])
    collection_name = f"tenant_{test_tenant['id'].replace('-', '')}"
    create_collection_if_not_exists(collection_name)
    vec = embed(["hello world"])
    upsert(
        collection_name,
        vec,
        [
            {
                "text": "hello world",
                "source_id": source["id"],
                "url": "https://example.com",
                "chunk_index": 0,
            }
        ],
    )

    test_client.delete(
        f"/sources/{source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    results = vector_search(collection_name, vec[0], top_k=10)
    matching = [r for r in results if r["entity"].get("source_id") == source["id"]]
    assert matching == []


def test_delete_source_returns_404_for_unknown_id(test_tenant):
    response = test_client.delete(
        f"/sources/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )
    assert response.status_code == 404


def test_delete_source_returns_404_when_source_belongs_to_other_tenant(
    test_tenant, other_tenant
):
    other_source = _make_source(other_tenant["id"])

    response = test_client.delete(
        f"/sources/{other_source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 404
    # Verify it still exists (was not deleted)
    still_there = (
        _SCHEMA.table("sources").select("id").eq("id", other_source["id"]).execute()
    )
    assert still_there.data != []
