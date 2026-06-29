import uuid
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import supabase
from app.core.vector_store import client as milvus_client
from app.main import app

ASSETS_DIR = Path(__file__).parent.parent / "assets"
_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)

test_client = TestClient(app)


@pytest.fixture
def test_tenant():
    result = _SCHEMA.table("tenants").insert({"user_id": str(uuid.uuid4())}).execute()
    tenant = result.data[0]
    yield tenant
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    collection_name = f"tenant_{tenant['id'].replace('-', '')}"
    if milvus_client.has_collection(collection_name):
        milvus_client.drop_collection(collection_name)
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_ingest_file_processes_pdf_and_marks_source_done(test_tenant):
    pdf_path = ASSETS_DIR / "vectorshift_resume.pdf"

    with pdf_path.open("rb") as f:
        response = test_client.post(
            "/ingest/file",
            headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
            files={"file": ("vectorshift_resume.pdf", f, "application/pdf")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["chunks_ingested"] > 0

    source = _SCHEMA.table("sources").select("*").eq("id", body["source_id"]).execute()
    assert source.data[0]["status"] == "done"
    assert source.data[0]["chunk_count"] == body["chunks_ingested"]


def test_ingest_file_rejects_invalid_api_key():
    response = test_client.post(
        "/ingest/file",
        headers={"Authorization": f"Bearer {uuid.uuid4()}"},
        files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")},
    )

    assert response.status_code == 401


def test_ingest_file_marks_source_error_for_unsupported_type(test_tenant):
    response = test_client.post(
        "/ingest/file",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
        files={
            "file": (
                "sheet.xlsx",
                BytesIO(b"fake content"),
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 500

    source = (
        _SCHEMA.table("sources")
        .select("*")
        .eq("tenant_id", test_tenant["id"])
        .eq("filename", "sheet.xlsx")
        .execute()
    )
    assert source.data[0]["status"] == "error"
    assert "Unsupported file type" in source.data[0]["error_message"]
