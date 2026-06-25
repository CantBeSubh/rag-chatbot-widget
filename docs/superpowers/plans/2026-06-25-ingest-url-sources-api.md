# CAN-39: POST /ingest/url + Sources CRUD API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a REST API for URL ingestion (`POST /ingest/url`) plus status/list/delete endpoints (`GET|DELETE /sources`) that the admin panel will consume in M3.

**Architecture:** The ingest endpoint creates a Supabase source record then fires a non-blocking Celery task — the response returns immediately with `status: queued`. A new `sources` router handles read and delete operations; delete cascades through Zilliz vectors → chunk_hashes → source row. All endpoints enforce tenant scoping via the existing `get_current_tenant_id` dependency.

**Tech Stack:** FastAPI, Supabase (supabase-py `supabase.schema().table()`), PyMilvus (`MilvusClient`), Celery (eager mode in tests), pytest integration tests against live infra.

## Global Constraints

- Python ≥ 3.11; relative imports within `app/` package (`from ..core.xxx import ...`)
- Supabase access always via `supabase.schema(settings.SUPABASE_SCHEMA).table(...)` — never bare `.table()`
- `get_current_tenant_id` dependency resolves Bearer token to `tenant_id` — reuse it, don't re-implement auth
- Tests hit real Supabase (testing schema) and real Zilliz — no mocks for infra, but mock Celery `.delay()` calls in router tests to stay fast
- Ruff lint: no unused imports, no unused arguments; run `make lint` before committing
- Collection naming: `f"tenant_{tenant_id.replace('-', '')}"` — match exactly what the worker uses

---

### Task 1: Add `delete_by_source` to `vector_store.py`

**Files:**
- Modify: `backend/app/core/vector_store.py`
- Test: `backend/tests/core/test_vector_store.py`

**Interfaces:**
- Produces: `delete_by_source(collection_name: str, source_id: str) -> None`
  - Silently no-ops if the collection doesn't exist (source may have been queued but never reached vector upsert)
  - Deletes all vectors where the `source_id` field equals the given value using Milvus filter expression

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/core/test_vector_store.py`:

```python
import uuid

import pytest

from app.core.embedder import embed
from app.core.vector_store import (
    client,
    create_collection_if_not_exists,
    delete_by_source,
    upsert,
    vector_search,
)


# (existing fixture and tests stay unchanged)


@pytest.fixture
def temp_collection():
    name = f"test_delete_{uuid.uuid4().hex[:8]}"
    create_collection_if_not_exists(name)
    yield name
    if client.has_collection(name):
        client.drop_collection(name)


def test_delete_by_source_removes_only_matching_vectors(temp_collection):
    source_a = str(uuid.uuid4())
    source_b = str(uuid.uuid4())

    vecs = embed(["chunk for A", "chunk for B"])
    upsert(
        temp_collection,
        vecs,
        [
            {"text": "chunk for A", "source_id": source_a, "url": "http://a.com", "chunk_index": 0},
            {"text": "chunk for B", "source_id": source_b, "url": "http://b.com", "chunk_index": 0},
        ],
    )

    delete_by_source(temp_collection, source_a)

    results = vector_search(temp_collection, vecs[0], top_k=10)
    source_ids_remaining = [r["entity"]["source_id"] for r in results]
    assert source_a not in source_ids_remaining
    assert source_b in source_ids_remaining


def test_delete_by_source_is_noop_when_collection_missing():
    delete_by_source("nonexistent_collection_xyz", str(uuid.uuid4()))
    # No exception raised
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/core/test_vector_store.py::test_delete_by_source_removes_only_matching_vectors -v
```

Expected: `ImportError: cannot import name 'delete_by_source'`

- [ ] **Step 3: Implement `delete_by_source` in `vector_store.py`**

Add to `backend/app/core/vector_store.py` (after the `vector_search` function):

```python
def delete_by_source(collection_name: str, source_id: str) -> None:
    if not client.has_collection(collection_name):
        return
    client.delete(
        collection_name=collection_name,
        filter=f'source_id == "{source_id}"',
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/core/test_vector_store.py -v
```

Expected: All 4 tests PASS (2 existing + 2 new).

- [ ] **Step 5: Lint check**

```bash
cd backend && make lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/vector_store.py backend/tests/core/test_vector_store.py
git commit -m "feat: add delete_by_source to vector_store"
```

---

### Task 2: Add `POST /ingest/url` endpoint to `ingest.py`

**Files:**
- Modify: `backend/app/routers/ingest.py`
- Create: `backend/tests/routers/test_ingest_url.py`

**Interfaces:**
- Consumes: `ingest_url_task` from `app.worker.tasks` (`.delay()` call); `get_current_tenant_id` from `app.dependencies`; `supabase` + `settings` from core
- Produces: `POST /ingest/url` → `{"source_id": str, "status": "queued", "message": str}`
  - Creates source row with `status: "queued"` before dispatching task
  - Returns in < 200ms; the Celery worker does all the heavy lifting

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/routers/test_ingest_url.py`:

```python
import time
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


def test_ingest_url_returns_queued_immediately(test_tenant):
    with patch("app.routers.ingest.ingest_url_task") as mock_task:
        mock_task.delay.return_value = None

        start = time.monotonic()
        response = test_client.post(
            "/ingest/url",
            headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
            json={"url": "https://example.com", "max_pages": 3},
        )
        elapsed = time.monotonic() - start

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert "source_id" in body
    assert elapsed < 0.5  # well under 200ms; 500ms tolerance for test runner overhead


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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/routers/test_ingest_url.py -v
```

Expected: `404 Not Found` (endpoint doesn't exist yet).

- [ ] **Step 3: Add `IngestURLRequest` model and `POST /ingest/url` endpoint to `ingest.py`**

Add these imports to the top of `backend/app/routers/ingest.py` (after existing imports):

```python
from pydantic import BaseModel

from ..worker.tasks import ingest_url_task
```

Add the model and endpoint at the bottom of `backend/app/routers/ingest.py`:

```python
class IngestURLRequest(BaseModel):
    url: str
    max_pages: int = 50


@router.post("/url")
async def ingest_url(
    request: IngestURLRequest,
    tenant_id: str = Depends(get_current_tenant_id),
):
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    source = (
        schema.table("sources")
        .insert(
            {
                "tenant_id": tenant_id,
                "type": "url",
                "url": request.url,
                "status": "queued",
            }
        )
        .execute()
    )
    source_id = source.data[0]["id"]

    ingest_url_task.delay(
        source_id=source_id,
        tenant_id=tenant_id,
        url=request.url,
        max_pages=request.max_pages,
    )

    return {
        "source_id": source_id,
        "status": "queued",
        "message": f"Crawl queued. Poll GET /sources/{source_id} for status.",
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/routers/test_ingest_url.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Lint check**

```bash
cd backend && make lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/ingest.py backend/tests/routers/test_ingest_url.py
git commit -m "feat: add POST /ingest/url endpoint"
```

---

### Task 3: Create `sources.py` router + register in `main.py`

**Files:**
- Create: `backend/app/routers/sources.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/routers/test_sources.py`

**Interfaces:**
- Consumes: `get_current_tenant_id` from `app.dependencies`; `delete_by_source` from `app.core.vector_store`; `supabase` + `settings` from core
- Produces:
  - `GET /sources` → `list[dict]` ordered by `ingested_at` DESC
  - `GET /sources/{source_id}` → `dict` (404 if not found or wrong tenant)
  - `DELETE /sources/{source_id}` → `{"deleted": source_id}` (404 if not found or wrong tenant)
  - Tenant isolation: all queries filter by `tenant_id`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/routers/test_sources.py`:

```python
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import supabase
from app.core.embedder import embed
from app.core.vector_store import (
    client as milvus_client,
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


def test_get_source_returns_404_when_source_belongs_to_other_tenant(test_tenant, other_tenant):
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
        [{"text": "hello world", "source_id": source["id"], "url": "https://example.com", "chunk_index": 0}],
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


def test_delete_source_returns_404_when_source_belongs_to_other_tenant(test_tenant, other_tenant):
    other_source = _make_source(other_tenant["id"])

    response = test_client.delete(
        f"/sources/{other_source['id']}",
        headers={"Authorization": f"Bearer {test_tenant['api_key']}"},
    )

    assert response.status_code == 404
    # Verify it still exists (was not deleted)
    still_there = _SCHEMA.table("sources").select("id").eq("id", other_source["id"]).execute()
    assert still_there.data != []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/routers/test_sources.py -v
```

Expected: all fail with `404 Not Found` (routes don't exist yet).

- [ ] **Step 3: Create `backend/app/routers/sources.py`**

```python
from fastapi import APIRouter, Depends, HTTPException

from ..core.config import settings
from ..core.database import supabase
from ..core.vector_store import delete_by_source
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
async def list_sources(tenant_id: str = Depends(get_current_tenant_id)) -> list[dict]:
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("sources")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("ingested_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{source_id}")
async def get_source(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
) -> dict:
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("sources")
        .select("*")
        .eq("id", source_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Source not found")
    return result.data[0]


@router.delete("/{source_id}")
async def delete_source(
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
) -> dict:
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    existing = (
        schema.table("sources")
        .select("id")
        .eq("id", source_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Source not found")

    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    delete_by_source(collection_name, source_id)

    schema.table("chunk_hashes").delete().eq("source_id", source_id).execute()
    schema.table("sources").delete().eq("id", source_id).execute()

    return {"deleted": source_id}
```

- [ ] **Step 4: Register the sources router in `main.py`**

Modify `backend/app/main.py` — change:

```python
from .routers import chat, ingest
```

to:

```python
from .routers import chat, ingest, sources
```

And add after `app.include_router(chat.router)`:

```python
app.include_router(sources.router)
```

- [ ] **Step 5: Run all tests to verify they pass**

```bash
cd backend && uv run pytest tests/routers/test_sources.py -v
```

Expected: All 10 tests PASS.

- [ ] **Step 6: Run the full test suite to catch regressions**

```bash
cd backend && uv run pytest -v --ignore=tests/worker/test_tasks.py
```

Expected: All tests PASS. (Skipping worker integration tests to avoid slow crawl; those are covered by CAN-38.)

- [ ] **Step 7: Lint check**

```bash
cd backend && make lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/sources.py backend/app/main.py backend/tests/routers/test_sources.py
git commit -m "feat: add GET/DELETE /sources endpoints and register sources router"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered by |
|---|---|
| `POST /ingest/url` returns < 200ms with source_id + status:queued | Task 2 test `test_ingest_url_returns_queued_immediately` |
| `GET /sources/{id}` reflects live status | Task 3 `get_source` reads directly from Supabase; worker updates the same row |
| `GET /sources` lists all sources descending | Task 3 test `test_list_sources_ordered_by_ingested_at_descending` |
| `DELETE /sources/{id}` removes Zilliz vectors | Task 3 test `test_delete_source_removes_vectors_from_zilliz` |
| `DELETE /sources/{id}` removes chunk_hashes | Task 3 implementation (line `schema.table("chunk_hashes").delete()...`) |
| `DELETE /sources/{id}` removes source row | Task 3 test `test_delete_source_removes_supabase_row` |
| Tenant cannot access another tenant's sources | Task 3 tests `*_belongs_to_other_tenant` for both GET and DELETE |
| Invalid API key → 401 | Task 2 + Task 3 both have invalid-key tests |

**Placeholder scan:** No TBDs, no "implement later", no "similar to" references. All code blocks are complete.

**Type consistency:** `delete_by_source(collection_name: str, source_id: str) -> None` defined in Task 1, imported in Task 3 as `from ..core.vector_store import delete_by_source` ✓. `ingest_url_task` defined in `app.worker.tasks`, imported in Task 2 as `from ..worker.tasks import ingest_url_task` ✓.
