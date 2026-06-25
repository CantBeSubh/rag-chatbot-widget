# CAN-38: Celery Crawl Ingestion Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the background Celery task (`ingest_url_task`) that orchestrates crawl → chunk → dedup → embed → upsert for a URL source, keeping the Supabase `sources` row's status in sync throughout.

**Architecture:** A new `app/core/dedup.py` module hashes chunks and tracks them in a new `chunk_hashes` Supabase table (keyed on `hash, tenant_id`) so re-crawling the same site doesn't re-index unchanged content. `app/worker/tasks.py` gets a new `ingest_url_task` that wires the already-built crawler (CAN-37), chunker, dedup helper, embedder, and vector store (CAN-28/29) together, with Celery's `autoretry_for` handling transient failures.

**Tech Stack:** FastAPI/Celery backend (`backend/app`), Supabase (`testing` schema) via `supabase-py`, Zilliz via `pymilvus` (`MilvusClient`), `crawl4ai` (already wrapped by `crawl_site_sync`).

## Global Constraints

- Internal modules use relative imports (`from .config import settings`, `from ..core.x import y`), never absolute (`from core.x import y`) — `backend/` is on `sys.path` with `app` as the package root.
- All Supabase table access must go through `supabase.schema(settings.SUPABASE_SCHEMA)` — calling `.table(...)` directly on the unscoped client silently targets `public`, not `testing`.
- Add Python deps with `uv add <package>` from `backend/` (none expected for this plan — no new dependencies).
- Don't run `uv run pytest` / `make test` on your own initiative — ask the user first. `ruff check` / `ruff format --check` are fine to run freely after each task.
- This project tests against live infrastructure (real Supabase `testing` schema, real Zilliz cluster, real crawl4ai crawl) — no mocking. Follow that pattern in every test below.
- Out of scope: the `POST /ingest/url` endpoint and status-polling endpoints are a separate ticket (CAN-39) — this plan only builds the Celery task itself, dispatched directly via `.delay()` in tests, matching CAN-38's own manual verification section.

## Deviations from the Linear ticket's sample code (verified against the real codebase)

- **Schema-scoped Supabase calls**: the ticket's sample uses `supabase.table("sources")...` directly. Every existing module (`ingest.py`, `dependencies.py`, `chat.py`) wraps this as `supabase.schema(settings.SUPABASE_SCHEMA).table(...)` — used verbatim here too.
- **Dedup metadata-realignment bug**: the ticket rebuilds metadata for kept chunks via `chunk_metadata[all_chunks.index(c)]`. `list.index()` returns the *first* matching index by value — if the same chunk text repeats across pages (e.g. a nav/footer block on every page of a docs site, which is common), every repeated occurrence would get silently mis-attributed to the first page's metadata. `filter_new_chunks` is designed below to return *indices* instead of chunk values, so the caller filters `chunks` and `metadata` by position, not by value-equality.
- **Same-batch hash collisions**: if that same repeated chunk hashes identically twice within one crawl, inserting both rows into `chunk_hashes` would violate the `(hash, tenant_id)` primary key. `filter_new_chunks` dedupes the *insert* (not the returned indices) by hash within the batch to avoid this crash.
- **`vector_search`'s `output_fields`** is currently `["text", "source_id", "filename", "chunk_index"]` — no `"url"`. `app/core/rag.py`'s `build_context` already falls back to `chunk["entity"].get("url", "unknown")` when there's no `filename`, anticipating URL-sourced chunks, but that fallback can never fire today because `vector_search` never asks Zilliz for the `url` field. Task 2 below closes that gap.
- **Field naming**: store `url` directly (not the ticket's intermediate `page_url` that got renamed to `url` before upserting) — avoids a pointless rename step and matches what `build_context` already reads.
- **Retry-exhaustion path is not unit-tested**: the ticket's `try/except` + `autoretry_for=(Exception,)` + `self.request.retries >= self.max_retries` pattern is sound (verified by reading Celery's autoretry semantics), but proving the exhausted-retries branch deterministically would require either mocking a collaborator (against this project's no-mocking convention) or tolerating real sleep-based backoff (60s/120s/240s). Task 3 instead automates the *other* error path the ticket asks for — "crawler returned no pages" — which is deterministic and fast, and leaves retry-exhaustion to the ticket's own manual verification step (already written into CAN-38).

---

## Prerequisite: Create the `chunk_hashes` table (manual — not code)

The Supabase MCP integration has no access to this project (`mhgmepexsspwwtndrvso`) — per `CLAUDE.md`, schema changes for this project go through the SQL editor directly, not tooling.

- [ ] **Step 1: Run this in the Supabase SQL editor**, against the `testing` schema:

```sql
CREATE TABLE testing.chunk_hashes (
  hash TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES testing.tenants(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES testing.sources(id) ON DELETE CASCADE,
  PRIMARY KEY (hash, tenant_id)
);
CREATE INDEX idx_chunk_hashes_tenant ON testing.chunk_hashes(tenant_id);
```

- [ ] **Step 2: Verify the new table is actually reachable** (the `testing` schema's existing `ALTER DEFAULT PRIVILEGES` may or may not auto-cover a brand-new table, depending on which role created it):

```bash
cd backend && uv run python -c "
from app.core.config import settings
from app.core.database import supabase
schema = supabase.schema(settings.SUPABASE_SCHEMA)
tenant = schema.table('tenants').insert({}).execute().data[0]
source = schema.table('sources').insert({'tenant_id': tenant['id'], 'type': 'url', 'url': 'https://example.com'}).execute().data[0]
schema.table('chunk_hashes').insert({'hash': 'deadbeef', 'tenant_id': tenant['id'], 'source_id': source['id']}).execute()
print(schema.table('chunk_hashes').select('*').eq('tenant_id', tenant['id']).execute().data)
schema.table('chunk_hashes').delete().eq('tenant_id', tenant['id']).execute()
schema.table('sources').delete().eq('id', source['id']).execute()
schema.table('tenants').delete().eq('id', tenant['id']).execute()
print('OK')
"
```

Expected: prints the inserted row, then `OK`. If it raises `42501 permission denied for table chunk_hashes`, run this fallback in the SQL editor, then re-run the verification command:

```sql
GRANT ALL ON testing.chunk_hashes TO anon, authenticated, service_role;
```

---

### Task 1: Dedup helper (`app/core/dedup.py`)

**Files:**
- Create: `backend/app/core/dedup.py`
- Test: `backend/tests/core/test_dedup.py`

**Interfaces:**
- Produces: `compute_hash(text: str) -> str`; `filter_new_chunks(chunks: list[str], tenant_id: str, source_id: str) -> list[int]` — returns the indices into `chunks` that are not yet recorded for this tenant, and records their hashes as a side effect.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/core/test_dedup.py`:

```python
import pytest

from app.core.config import settings
from app.core.database import supabase
from app.core.dedup import compute_hash, filter_new_chunks

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)


@pytest.fixture
def tenant_and_source():
    tenant = _SCHEMA.table("tenants").insert({}).execute().data[0]
    source = (
        _SCHEMA.table("sources")
        .insert({"tenant_id": tenant["id"], "type": "url", "url": "https://example.com"})
        .execute()
        .data[0]
    )
    yield tenant["id"], source["id"]
    _SCHEMA.table("chunk_hashes").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("sources").delete().eq("id", source["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_compute_hash_is_deterministic_and_distinguishes_text():
    assert compute_hash("hello") == compute_hash("hello")
    assert compute_hash("hello") != compute_hash("world")


def test_filter_new_chunks_empty_input_returns_empty_list(tenant_and_source):
    tenant_id, source_id = tenant_and_source

    assert filter_new_chunks([], tenant_id, source_id) == []


def test_filter_new_chunks_returns_all_indices_when_none_exist(tenant_and_source):
    tenant_id, source_id = tenant_and_source

    new_indices = filter_new_chunks(["alpha chunk", "beta chunk"], tenant_id, source_id)

    assert new_indices == [0, 1]


def test_filter_new_chunks_excludes_hashes_seen_in_a_previous_call(tenant_and_source):
    tenant_id, source_id = tenant_and_source
    chunks = ["alpha chunk", "beta chunk"]
    filter_new_chunks(chunks, tenant_id, source_id)

    new_indices = filter_new_chunks(chunks, tenant_id, source_id)

    assert new_indices == []


def test_filter_new_chunks_keeps_only_unseen_chunks_on_partial_overlap(tenant_and_source):
    tenant_id, source_id = tenant_and_source
    filter_new_chunks(["alpha chunk"], tenant_id, source_id)

    new_indices = filter_new_chunks(["alpha chunk", "gamma chunk"], tenant_id, source_id)

    assert new_indices == [1]


def test_filter_new_chunks_handles_duplicate_text_within_same_batch(tenant_and_source):
    tenant_id, source_id = tenant_and_source
    chunks = ["repeated nav chunk", "unique body text", "repeated nav chunk"]

    new_indices = filter_new_chunks(chunks, tenant_id, source_id)

    assert new_indices == [0, 1, 2]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_dedup.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.dedup'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/core/dedup.py`:

```python
import hashlib

from .config import settings
from .database import supabase


def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def filter_new_chunks(chunks: list[str], tenant_id: str, source_id: str) -> list[int]:
    """
    Returns indices into `chunks` not already indexed for this tenant, and
    records their hashes in chunk_hashes so a later call (e.g. a re-crawl
    of the same site) treats them as seen.
    """
    if not chunks:
        return []

    schema = supabase.schema(settings.SUPABASE_SCHEMA)
    hashes = [compute_hash(c) for c in chunks]

    existing = (
        schema.table("chunk_hashes")
        .select("hash")
        .eq("tenant_id", tenant_id)
        .in_("hash", hashes)
        .execute()
    )
    existing_hashes = {row["hash"] for row in existing.data}

    new_indices = [i for i, h in enumerate(hashes) if h not in existing_hashes]

    # The same hash can appear more than once in one batch (e.g. a repeated
    # nav/footer chunk across pages) — insert each new hash only once to
    # avoid violating the (hash, tenant_id) primary key.
    seen: set[str] = set()
    rows = []
    for i in new_indices:
        h = hashes[i]
        if h in seen:
            continue
        seen.add(h)
        rows.append({"hash": h, "tenant_id": tenant_id, "source_id": source_id})

    if rows:
        schema.table("chunk_hashes").insert(rows).execute()

    return new_indices
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_dedup.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Lint and format**

Run: `cd backend && uv run ruff check app/core/dedup.py tests/core/test_dedup.py && uv run ruff format --check app/core/dedup.py tests/core/test_dedup.py`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/dedup.py backend/tests/core/test_dedup.py
git commit -m "feat(CAN-38): add chunk dedup helper"
```

---

### Task 2: Surface `url` from `vector_search` (`app/core/vector_store.py`)

**Files:**
- Modify: `backend/app/core/vector_store.py:29-38` (`vector_search`'s `output_fields`)
- Test: `backend/tests/test_round_trip.py`

**Interfaces:**
- Consumes: existing `create_collection_if_not_exists`, `upsert`, `vector_search`, `embed` — no signature changes, only the `output_fields` list inside `vector_search` changes.
- Produces: `vector_search(...)` results now include an `"url"` key in `entity` when the upserted document had one — `app/core/rag.py`'s `build_context`/`build_sources` already read `.get("url")`, no changes needed there.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_round_trip.py`:

```python
def test_search_returns_url_field_for_url_sourced_chunks(collection_name):
    sentences = ["Source URL field check."]
    vectors = embed(sentences)
    metadata = [
        {
            "text": sentences[0],
            "source_id": "test",
            "url": "https://example.com/page",
            "page_title": "Example Page",
            "chunk_index": 0,
        }
    ]

    create_collection_if_not_exists(collection_name)
    upsert(collection_name, vectors, metadata)

    query_vector = embed(["Source URL field check."])[0]
    results = vector_search(collection_name, query_vector, top_k=1)

    assert results[0]["entity"]["url"] == "https://example.com/page"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_round_trip.py::test_search_returns_url_field_for_url_sourced_chunks -v`
Expected: FAIL with `KeyError: 'url'`

- [ ] **Step 3: Update `output_fields`**

In `backend/app/core/vector_store.py`, change:

```python
        output_fields=["text", "source_id", "filename", "chunk_index"],
```

to:

```python
        output_fields=["text", "source_id", "filename", "url", "chunk_index"],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_round_trip.py -v`
Expected: PASS (both tests in the file)

- [ ] **Step 5: Lint and format**

Run: `cd backend && uv run ruff check app/core/vector_store.py tests/test_round_trip.py && uv run ruff format --check app/core/vector_store.py tests/test_round_trip.py`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/vector_store.py backend/tests/test_round_trip.py
git commit -m "fix(CAN-38): surface url field from vector search for crawled chunks"
```

---

### Task 3: `ingest_url_task` (`app/worker/tasks.py`)

**Files:**
- Modify: `backend/app/worker/tasks.py` (add `ingest_url_task`, keep existing `add` task as-is)
- Test: `backend/tests/worker/test_tasks.py` (extend; keep existing two `add` tests as-is)

**Interfaces:**
- Consumes: `crawl_site_sync(start_url: str, max_pages: int) -> list[dict]` (keys `url`, `title`, `text`) from `app/core/crawler.py`; `chunk_text(text: str) -> list[str]` from `app/core/chunker.py`; `filter_new_chunks(chunks, tenant_id, source_id) -> list[int]` from Task 1; `embed(texts: list[str]) -> list[list[float]]`; `create_collection_if_not_exists(collection_name)` / `upsert(collection_name, vectors, metadata)` from `app/core/vector_store.py`.
- Produces: `ingest_url_task(self, source_id: str, tenant_id: str, url: str, max_pages: int = 50) -> None`, a bound Celery task. Drives the `sources` row's `status` through `crawling` → `processing` → `done` (or `error`), and sets `chunk_count` on success.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/worker/test_tasks.py` (keep the two existing `add` tests above this):

```python
import pytest

from app.core.config import settings
from app.core.database import supabase
from app.core.vector_store import client as milvus_client
from app.worker.tasks import ingest_url_task

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)

CRAWL_URL = "https://fastapi.tiangolo.com"
UNREACHABLE_URL = "https://this-does-not-exist-xyz.invalid"


@pytest.fixture
def test_tenant():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    tenant = _SCHEMA.table("tenants").insert({}).execute().data[0]
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

    updated = _SCHEMA.table("sources").select("*").eq("id", source["id"]).execute().data[0]
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
        _SCHEMA.table("sources").select("*").eq("id", second_source["id"]).execute().data[0]
    )
    assert updated["status"] == "done"
    assert updated["chunk_count"] == 0


def test_ingest_url_task_marks_source_error_when_crawl_returns_no_pages(test_tenant):
    source = _create_source(test_tenant["id"], UNREACHABLE_URL)

    ingest_url_task.delay(source["id"], test_tenant["id"], UNREACHABLE_URL).get(timeout=60)

    updated = _SCHEMA.table("sources").select("*").eq("id", source["id"]).execute().data[0]
    assert updated["status"] == "error"
    assert "no pages" in updated["error_message"].lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/worker/test_tasks.py -v`
Expected: FAIL with `ImportError: cannot import name 'ingest_url_task' from 'app.worker.tasks'`

- [ ] **Step 3: Write the implementation**

Replace `backend/app/worker/tasks.py` with:

```python
import time

from ..core.chunker import chunk_text
from ..core.config import settings
from ..core.crawler import crawl_site_sync
from ..core.database import supabase
from ..core.dedup import filter_new_chunks
from ..core.embedder import embed
from ..core.vector_store import create_collection_if_not_exists, upsert
from .celery_app import celery_app


@celery_app.task(bind=True)
def add(self, x: int, y: int) -> int:
    time.sleep(2)
    return x + y


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # Wait 60s before retrying on transient failures
    autoretry_for=(Exception,),
    retry_backoff=True,  # Exponential backoff: 60s, 120s, 240s
)
def ingest_url_task(
    self, source_id: str, tenant_id: str, url: str, max_pages: int = 50
) -> None:
    """Background task: crawl a URL, chunk, dedup, embed, upsert to Zilliz."""
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    try:
        schema.table("sources").update({"status": "crawling"}).eq(
            "id", source_id
        ).execute()

        pages = crawl_site_sync(url, max_pages=max_pages)
        if not pages:
            schema.table("sources").update(
                {
                    "status": "error",
                    "error_message": "Crawler returned no pages. Check that the URL is accessible.",
                }
            ).eq("id", source_id).execute()
            return

        schema.table("sources").update({"status": "processing"}).eq(
            "id", source_id
        ).execute()

        all_chunks: list[str] = []
        chunk_metadata: list[dict] = []
        for page in pages:
            for i, chunk in enumerate(chunk_text(page["text"])):
                all_chunks.append(chunk)
                chunk_metadata.append(
                    {"url": page["url"], "page_title": page["title"], "chunk_index": i}
                )

        new_indices = filter_new_chunks(all_chunks, tenant_id, source_id)
        if not new_indices:
            schema.table("sources").update(
                {"status": "done", "chunk_count": 0}
            ).eq("id", source_id).execute()
            return  # All chunks already indexed (re-crawl of unchanged content)

        new_chunks = [all_chunks[i] for i in new_indices]
        new_metadata = [chunk_metadata[i] for i in new_indices]

        vectors = embed(new_chunks)

        collection_name = f"tenant_{tenant_id.replace('-', '')}"
        create_collection_if_not_exists(collection_name)

        zilliz_metadata = [
            {
                "text": chunk,
                "source_id": source_id,
                "url": meta["url"],
                "page_title": meta["page_title"],
                "chunk_index": meta["chunk_index"],
            }
            for chunk, meta in zip(new_chunks, new_metadata, strict=True)
        ]
        upsert(collection_name, vectors, zilliz_metadata)

        schema.table("sources").update(
            {"status": "done", "chunk_count": len(new_chunks)}
        ).eq("id", source_id).execute()

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            schema.table("sources").update(
                {"status": "error", "error_message": str(exc)[:500]}
            ).eq("id", source_id).execute()
        raise exc
```

Also add this import to the top of `backend/tests/worker/test_tasks.py` (alongside the existing `from app.worker.celery_app import celery_app` import that the new fixture relies on — confirm it's already there from the existing tests; it is).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/worker/test_tasks.py -v`
Expected: PASS (5 tests: 2 existing `add` tests + 3 new `ingest_url_task` tests)

- [ ] **Step 5: Lint and format**

Run: `cd backend && uv run ruff check app/worker/tasks.py tests/worker/test_tasks.py && uv run ruff format --check app/worker/tasks.py tests/worker/test_tasks.py`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add backend/app/worker/tasks.py backend/tests/worker/test_tasks.py
git commit -m "feat(CAN-38): add ingest_url_task Celery orchestration"
```

---

### Task 4: Manual end-to-end pass + dev log

**Files:**
- Modify: `docs/dev-log.md` (append a CAN-38 entry, following the existing per-ticket entry format)

- [ ] **Step 1: Run the ticket's own manual verification** (with `docker compose up` / `make worker` running): dispatch `ingest_url_task` against a real site via a Python shell as CAN-38 describes, confirm the `sources` row status progression end-to-end, and ask a question via `/chat` to confirm grounded answers cite the crawled content.
- [ ] **Step 2: Append a dev-log entry** to `docs/dev-log.md` summarizing what was built, the three deviations from the ticket's sample code (dedup index-vs-value bug, schema-scoped Supabase calls, the `vector_search` `url` field gap), and the retry-exhaustion-path testing decision — matching the style of the existing CAN-36/CAN-37 entries.
- [ ] **Step 3: Commit**

```bash
git add docs/dev-log.md
git commit -m "docs(CAN-38): log ingestion task implementation notes"
```

---

## Self-Review

- **Spec coverage**: dedup helper (Task 1) ✓, Celery task crawling/chunking/embedding/upserting (Task 3) ✓, status progression through `crawling`/`processing`/`done`/`error` (Task 3) ✓, re-crawl dedup producing `chunk_count=0` (Task 3 test) ✓, failure → `error` status with readable message (Task 3, no-pages path tested; retry-exhaustion path implemented but deliberately not unit-tested, documented above) ✓, manual end-to-end + `/chat` grounding check (Task 4) ✓.
- **Placeholder scan**: no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency**: `filter_new_chunks` returns `list[int]` in both its Task 1 definition and Task 3's usage; `crawl_site_sync`/`chunk_text`/`embed`/`upsert`/`create_collection_if_not_exists` signatures in Task 3 match their actual current definitions in `app/core/crawler.py`, `chunker.py`, `embedder.py`, `vector_store.py` (verified by reading those files directly, not assumed from the ticket).
