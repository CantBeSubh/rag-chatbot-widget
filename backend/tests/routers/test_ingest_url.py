import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import supabase
from app.main import app

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)
test_client = TestClient(app)


@pytest.fixture
def test_tenant():
    result = _SCHEMA.table("tenants").insert({}).execute()
    tenant = result.data[0]
    yield tenant
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_ingest_url_returns_queued_status(test_tenant):
    with patch("app.routers.ingest.ingest_url_task") as mock_task:
        mock_task.delay.return_value = None
        response = test_client.post(
            "/ingest/url",
            headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
            json={"url": "https://example.com", "max_pages": 3},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert "source_id" in body
    # Non-blocking proof: task was dispatched via .delay() (not called synchronously)
    mock_task.delay.assert_called_once()


def test_ingest_url_creates_source_record_in_supabase(test_tenant):
    with patch("app.routers.ingest.ingest_url_task") as mock_task:
        mock_task.delay.return_value = None
        response = test_client.post(
            "/ingest/url",
            headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
            json={"url": "https://example.com", "max_pages": 5},
        )

    source_id = response.json()["source_id"]
    source = _SCHEMA.table("sources").select("*").eq("id", source_id).execute()

    assert source.data[0]["status"] == "queued"
    assert source.data[0]["type"] == "url"
    assert source.data[0]["url"] == "https://example.com"
    assert source.data[0]["tenant_id"] == test_tenant["id"]


def test_ingest_url_dispatches_celery_task_with_correct_args(test_tenant):
    with patch("app.routers.ingest.ingest_url_task") as mock_task:
        mock_task.delay.return_value = None
        response = test_client.post(
            "/ingest/url",
            headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
            json={"url": "https://example.com", "max_pages": 7},
        )

    source_id = response.json()["source_id"]
    mock_task.delay.assert_called_once_with(
        source_id=source_id,
        tenant_id=test_tenant["id"],
        url="https://example.com",
        max_pages=7,
    )


def test_ingest_url_rejects_invalid_api_key():
    response = test_client.post(
        "/ingest/url",
        headers={"Authorization": f"Bearer {uuid.uuid4()}"},
        json={"url": "https://example.com"},
    )

    assert response.status_code == 401
