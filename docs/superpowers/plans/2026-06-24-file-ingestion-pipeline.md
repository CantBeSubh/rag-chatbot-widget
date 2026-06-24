# File Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CAN-29 pipeline: `POST /ingest/file` accepts a PDF or TXT/MD upload, extracts text, splits it into overlapping chunks, embeds the chunks, and upserts the vectors into the tenant's Zilliz collection, tracking status in Supabase's `sources` table.

**Architecture:** Three new pure-function modules under `app/core/` (`extractors.py`, `chunker.py`) compose with the existing `embedder.py`/`vector_store.py` inside a single FastAPI router (`app/routers/ingest.py`). Tenant identity comes from a new `get_current_tenant_id` dependency that resolves a Supabase `tenants.api_key` to a `tenants.id`. Before any of that, the FastAPI-tutorial scaffolding this project was bootstrapped from (fake-token auth, example routers) is removed so it doesn't shadow real auth.

**Tech Stack:** FastAPI, `pypdf` (PDF text extraction), `langchain-text-splitters` (chunking), existing `app/core/embedder.py` + `app/core/vector_store.py` (Zilliz), Supabase (`testing.tenants`, `testing.sources`), pytest against live Supabase/Zilliz (this project's established convention — no mocks).

## Global Constraints

- Python 3.11+, ruff line-length 88, ruff rules `E,W,F,I,B,C4,UP,ARG,SIM,RUF` (`backend/pyproject.toml`) — run `make lint` / `make format-check` freely.
- All internal imports inside `backend/app/` must be relative (`from .core.config import settings`), never absolute (`from core.config import settings`) — absolute imports only fail at runtime under `fastapi dev`, not at edit time.
- Verify imports the way `fastapi dev` loads them: `cd backend && uv run python -c "import app.main"`. Never manually prepend `app/` to `sys.path`.
- **Do not run `uv run pytest` / `make test` (the whole suite) without asking first.** Running the *specific* new test(s) you just wrote as part of a TDD red/green step (e.g. `uv run pytest tests/core/test_extractors.py -v`) is expected and required by this plan — that is not "the test suite," it's the test-driven cycle. Just don't do a blanket full-suite sweep on your own initiative.
- Tests hit live services — the real Supabase `testing` schema and the real Zilliz cluster credentials already in `backend/.env`. No mocks. Every fixture that inserts a row or creates a Zilliz collection must clean it up (`yield` + teardown), matching the existing pattern in `tests/core/test_vector_store.py`.
- Add Python deps with `uv add <package>` from `backend/` (updates `pyproject.toml` + `uv.lock` together). `python-multipart` and `httpx` are already present transitively via `fastapi[standard]` — do not re-add them.
- `testing.tenants` columns: `id (uuid pk)`, `api_key (uuid, default gen_random_uuid())`, `encrypted_claude_key (text, nullable)`, `plan (text, default 'starter')`, `created_at`. `testing.sources` columns: `id (uuid pk)`, `tenant_id (uuid fk)`, `type (text)`, `url (text, nullable)`, `filename (text)`, `status (text, default 'queued')`, `chunk_count (integer, default 0)`, `error_message (text, nullable)`, `ingested_at`. Confirmed live via the project's PostgREST OpenAPI spec — `42501`/`PGRST106` schema-permission errors from earlier sessions are resolved; SELECT/INSERT/UPDATE/DELETE all verified working against `testing.tenants`/`testing.sources`.
- **DOCX support is explicitly out of scope** (user decision, deviates from the CAN-29 ticket text) — `extract_text` supports only `.pdf`, `.txt`, `.md`. Anything else, including `.docx`, raises `ValueError`.
- PDF test fixture is a real committed file: `backend/tests/assets/vectorshift_resume.pdf` (1 page, ~3454 chars of extractable text, already added by the user — currently untracked in git).
- No `conftest.py` in this project — fixtures are defined locally per test file (existing convention).

---

### Task 1: Remove FastAPI tutorial scaffolding

This project was bootstrapped from the `uv-fastapi-example` "Bigger Applications" tutorial. It left behind a global fake-token dependency on the whole app (`Depends(get_query_token)`, requires `?token=jessica` on every request) and example routers (`users`, `items`, `admin`) that are unrelated to this product and would otherwise gate the new `/ingest/file` endpoint behind a fake token. None of this is referenced by any existing test.

**Files:**
- Delete: `backend/app/routers/users.py`
- Delete: `backend/app/routers/items.py`
- Delete: `backend/app/internal/admin.py`
- Delete: `backend/app/internal/__init__.py`
- Delete: `backend/app/dependencies.py` (recreated for real in Task 4)
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: `app.main.app` (FastAPI instance with no dependencies, no routers mounted yet, startup `verify_db` hook unchanged) — Task 5 mounts the real router onto it.

- [ ] **Step 1: Delete the tutorial files**

```bash
cd backend
git rm app/routers/users.py app/routers/items.py app/internal/admin.py app/internal/__init__.py app/dependencies.py
rmdir app/internal 2>/dev/null || true
```

- [ ] **Step 2: Rewrite `app/main.py` to drop the fake auth and example routers**

Replace the full contents of `backend/app/main.py` with:

```python
import logging

from fastapi import FastAPI

from .core.config import settings
from .core.database import supabase
from .core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()


@app.on_event("startup")
async def verify_db():
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("id")
        .limit(1)
        .execute()
    )
    logger.info(f"Supabase connected to {settings.SUPABASE_SCHEMA} schema: {result}")


@app.get("/")
async def root():
    return {"message": "RAG Chatbot Widget API"}
```

- [ ] **Step 3: Verify the app still imports cleanly**

Run: `uv run python -c "import app.main"`
Expected: no output, exit code 0 (no `ModuleNotFoundError`, no leftover reference to `dependencies`/`routers.users`/`routers.items`/`internal.admin`).

- [ ] **Step 4: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`
Expected: both clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add app/main.py
git commit -m "chore: remove FastAPI tutorial scaffolding (fake auth, example routers)"
```

---

### Task 2: File text extraction (`extractors.py`)

**Files:**
- Create: `backend/app/core/extractors.py`
- Test: `backend/tests/core/test_extractors.py`
- Track (untracked → committed): `backend/tests/assets/vectorshift_resume.pdf`

**Interfaces:**
- Produces: `extract_text(file_path: str, filename: str) -> str` — raises `ValueError` for unsupported extensions. Consumed by `routers/ingest.py` in Task 5.

- [ ] **Step 1: Add the `pypdf` dependency**

```bash
cd backend
uv add pypdf
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/core/test_extractors.py`:

```python
from pathlib import Path

import pytest

from app.core.extractors import extract_text

ASSETS_DIR = Path(__file__).parent.parent / "assets"


def test_extract_text_from_pdf_returns_nonempty_text():
    text = extract_text(
        str(ASSETS_DIR / "vectorshift_resume.pdf"), "vectorshift_resume.pdf"
    )

    assert len(text.strip()) > 1000


def test_extract_text_from_txt_returns_file_contents(tmp_path):
    file_path = tmp_path / "notes.txt"
    file_path.write_text("Hello world\n\nSecond paragraph.", encoding="utf-8")

    text = extract_text(str(file_path), "notes.txt")

    assert text == "Hello world\n\nSecond paragraph."


def test_extract_text_from_md_returns_file_contents(tmp_path):
    file_path = tmp_path / "notes.md"
    file_path.write_text("# Heading\n\nBody text.", encoding="utf-8")

    text = extract_text(str(file_path), "notes.md")

    assert text == "# Heading\n\nBody text."


def test_extract_text_raises_for_unsupported_extension(tmp_path):
    file_path = tmp_path / "sheet.xlsx"
    file_path.write_bytes(b"")

    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_text(str(file_path), "sheet.xlsx")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run pytest tests/core/test_extractors.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.extractors'`.

- [ ] **Step 4: Write the minimal implementation**

Create `backend/app/core/extractors.py`:

```python
from pathlib import Path

import pypdf


def extract_text(file_path: str, filename: str) -> str:
    """Extract plain text from a PDF, TXT, or MD file."""
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        reader = pypdf.PdfReader(file_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)

    if suffix in (".txt", ".md"):
        with open(file_path, encoding="utf-8") as f:
            return f.read()

    raise ValueError(f"Unsupported file type: {suffix}")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/core/test_extractors.py -v`
Expected: 4 passed.

- [ ] **Step 6: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add app/core/extractors.py tests/core/test_extractors.py tests/assets/vectorshift_resume.pdf pyproject.toml uv.lock
git commit -m "feat: add PDF/TXT/MD text extraction"
```

---

### Task 3: Text chunking (`chunker.py`)

**Files:**
- Create: `backend/app/core/chunker.py`
- Test: `backend/tests/core/test_chunker.py`

**Interfaces:**
- Produces: `chunk_text(text: str) -> list[str]` — 512-char chunks, 50-char overlap. Consumed by `routers/ingest.py` in Task 5.

- [ ] **Step 1: Add the `langchain-text-splitters` dependency**

```bash
cd backend
uv add langchain-text-splitters
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/core/test_chunker.py`:

```python
from app.core.chunker import chunk_text

_LONG_TEXT = " ".join(
    f"This is sentence number {i} in a long document about testing chunking behavior."
    for i in range(40)
)


def test_chunk_text_returns_empty_list_for_empty_string():
    assert chunk_text("") == []


def test_chunk_text_returns_single_chunk_for_short_text():
    text = "Hello world, this is short."

    assert chunk_text(text) == [text]


def test_chunk_text_splits_long_text_into_chunks_within_size_limit():
    chunks = chunk_text(_LONG_TEXT)

    assert len(chunks) > 1
    assert all(len(chunk) <= 512 for chunk in chunks)


def test_chunk_text_overlaps_consecutive_chunks():
    chunks = chunk_text(_LONG_TEXT)

    assert chunks[0][-30:] in chunks[1]
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run pytest tests/core/test_chunker.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.chunker'`.

- [ ] **Step 4: Write the minimal implementation**

Create `backend/app/core/chunker.py`:

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=50,
    length_function=len,
)


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    return _splitter.split_text(text)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/core/test_chunker.py -v`
Expected: 4 passed.

- [ ] **Step 6: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add app/core/chunker.py tests/core/test_chunker.py pyproject.toml uv.lock
git commit -m "feat: add text chunking with overlap"
```

---

### Task 4: Tenant authentication dependency (`dependencies.py`)

Resolves the `Authorization: Bearer <api_key>` header to a `tenants.id` by querying the live `testing.tenants` table. Synchronous (not `async def`) since the project has no async-test plugin installed and the underlying `supabase-py` client is itself synchronous — a plain `def` lets the tests call it directly without `pytest-asyncio`/`anyio`, and FastAPI runs sync dependencies correctly either way.

**Files:**
- Create: `backend/app/dependencies.py`
- Test: `backend/tests/test_dependencies.py`

**Interfaces:**
- Consumes: `app.core.config.settings.SUPABASE_SCHEMA`, `app.core.database.supabase`.
- Produces: `get_current_tenant_id(authorization: str) -> str` — raises `fastapi.HTTPException(401)` for an unknown API key. Consumed via `Depends()` in `routers/ingest.py` in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_dependencies.py`:

```python
import uuid

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.database import supabase
from app.dependencies import get_current_tenant_id

_SCHEMA = supabase.schema(settings.SUPABASE_SCHEMA)


@pytest.fixture
def test_tenant():
    result = _SCHEMA.table("tenants").insert({}).execute()
    tenant = result.data[0]
    yield tenant
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_get_current_tenant_id_returns_id_for_valid_api_key(test_tenant):
    tenant_id = get_current_tenant_id(f"Bearer {test_tenant['api_key']}")

    assert tenant_id == test_tenant["id"]


def test_get_current_tenant_id_raises_401_for_unknown_api_key():
    with pytest.raises(HTTPException) as exc_info:
        get_current_tenant_id(f"Bearer {uuid.uuid4()}")

    assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_dependencies.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.dependencies'`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/dependencies.py`:

```python
from typing import Annotated

from fastapi import Header, HTTPException

from .core.config import settings
from .core.database import supabase


def get_current_tenant_id(authorization: Annotated[str, Header()]) -> str:
    api_key = authorization.removeprefix("Bearer ")
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("id")
        .eq("api_key", api_key)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return result.data[0]["id"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_dependencies.py -v`
Expected: 2 passed.

- [ ] **Step 5: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add app/dependencies.py tests/test_dependencies.py
git commit -m "feat: add tenant authentication dependency"
```

---

### Task 5: File ingestion endpoint (`routers/ingest.py`)

Wires extraction → chunking → embedding → vector upsert behind `POST /ingest/file`, tracking the `sources` row's `status`/`chunk_count`/`error_message` through the lifecycle. Note: the CAN-29 ticket's sample code calls `upsert()` without first calling `create_collection_if_not_exists()` — that's a gap in the ticket (a brand-new tenant's collection doesn't exist yet), so this task calls it explicitly, matching how `tests/test_round_trip.py` already does it.

**Files:**
- Create: `backend/app/routers/ingest.py`
- Test: `backend/tests/routers/test_ingest.py`
- Create: `backend/tests/routers/__init__.py` (empty, mirrors `tests/core/__init__.py`)
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `extract_text` (Task 2), `chunk_text` (Task 3), `get_current_tenant_id` (Task 4), `app.core.embedder.embed(texts: list[str]) -> list[list[float]]`, `app.core.vector_store.create_collection_if_not_exists(collection_name: str) -> None`, `app.core.vector_store.upsert(collection_name: str, vectors: list[list[float]], metadata: list[dict]) -> None`.
- Produces: `router` (FastAPI `APIRouter`, prefix `/ingest`) mounted onto `app.main.app`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/routers/__init__.py` (empty file).

Create `backend/tests/routers/test_ingest.py`:

```python
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
    result = _SCHEMA.table("tenants").insert({}).execute()
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

    source = (
        _SCHEMA.table("sources").select("*").eq("id", body["source_id"]).execute()
    )
    assert source.data[0]["status"] == "done"
    assert source.data[0]["chunk_count"] == body["chunks_ingested"]


def test_ingest_file_rejects_invalid_api_key():
    response = test_client.post(
        "/ingest/file",
        headers={"Authorization": "Bearer not-a-real-key"},
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/routers/test_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routers.ingest'` (or a 404, once `app.main` imports cleanly but no router is mounted).

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/routers/ingest.py`:

```python
import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..core.chunker import chunk_text
from ..core.config import settings
from ..core.database import supabase
from ..core.embedder import embed
from ..core.extractors import extract_text
from ..core.vector_store import create_collection_if_not_exists, upsert
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/ingest", tags=["ingestion"])


@router.post("/file")
async def ingest_file(
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_current_tenant_id),
):
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    source = (
        schema.table("sources")
        .insert(
            {
                "tenant_id": tenant_id,
                "type": "file",
                "filename": file.filename,
                "status": "processing",
            }
        )
        .execute()
    )
    source_id = source.data[0]["id"]

    try:
        file_bytes = await file.read()
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            text = extract_text(tmp_path, file.filename)
        finally:
            os.unlink(tmp_path)

        chunks = chunk_text(text)
        vectors = embed(chunks)

        collection_name = f"tenant_{tenant_id.replace('-', '')}"
        metadata = [
            {
                "text": chunk,
                "source_id": source_id,
                "filename": file.filename,
                "chunk_index": i,
            }
            for i, chunk in enumerate(chunks)
        ]

        create_collection_if_not_exists(collection_name)
        upsert(collection_name, vectors, metadata)

        schema.table("sources").update(
            {"status": "done", "chunk_count": len(chunks)}
        ).eq("id", source_id).execute()

        return {"source_id": source_id, "chunks_ingested": len(chunks)}

    except Exception as e:
        schema.table("sources").update(
            {"status": "error", "error_message": str(e)}
        ).eq("id", source_id).execute()
        raise HTTPException(status_code=500, detail=str(e)) from e
```

Modify `backend/app/main.py` — add the import and mount the router:

```python
import logging

from fastapi import FastAPI

from .core.config import settings
from .core.database import supabase
from .core.logging import setup_logging
from .routers import ingest

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()

app.include_router(ingest.router)


@app.on_event("startup")
async def verify_db():
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("id")
        .limit(1)
        .execute()
    )
    logger.info(f"Supabase connected to {settings.SUPABASE_SCHEMA} schema: {result}")


@app.get("/")
async def root():
    return {"message": "RAG Chatbot Widget API"}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/routers/test_ingest.py -v`
Expected: 3 passed.

- [ ] **Step 5: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`
Expected: both clean.

- [ ] **Step 6: Manual smoke test (matches the ticket's "Done when" criteria)**

```bash
make dev
```

In another terminal, create a test tenant and hit the endpoint for real:

```bash
cd backend
uv run python -c "
from app.core.config import settings
from app.core.database import supabase
r = supabase.schema(settings.SUPABASE_SCHEMA).table('tenants').insert({}).execute()
print(r.data[0]['api_key'])
"
```

```bash
curl -X POST http://localhost:8000/ingest/file \
  -H "Authorization: Bearer <paste-api-key-from-above>" \
  -F "file=@tests/assets/vectorshift_resume.pdf"
```

Expected: `{"source_id": "...", "chunks_ingested": N}` with `N > 0`. Delete the manually-created tenant row afterward via the same `supabase.table("tenants").delete().eq("id", ...)` pattern, or via the Supabase dashboard.

- [ ] **Step 7: Commit**

```bash
git add app/routers/ingest.py app/main.py tests/routers/
git commit -m "feat: add file ingestion endpoint (CAN-29)"
```

---

### Task 6: Dev log entry

Per `CLAUDE.md`, record the notable decisions and discoveries from this work.

**Files:**
- Modify: `docs/dev-log.md`

- [ ] **Step 1: Append a new dated section**

Add to the end of `docs/dev-log.md`:

```markdown

## 2026-06-24 — CAN-29: File ingestion pipeline (TDD)

### Context
Linear ticket CAN-29 specified `backend/core/extractors.py`/`chunker.py`/`routers/ingest.py`
with sample code using Poetry, absolute imports, and a `tenant.single().execute()` auth
lookup — all adjusted for this repo's `uv` + relative-import + app-package conventions,
same pattern as CAN-28.

### Observations

- **Removed leftover FastAPI tutorial scaffolding.** `main.py` had a global
  `Depends(get_query_token)` requiring a hardcoded `?token=jessica` query param on every
  request, plus example `users`/`items`/`admin` routers from the `uv-fastapi-example`
  bootstrap — all unrelated to this product and would have gated the new ingest endpoint
  behind a fake token. Deleted `app/routers/users.py`, `app/routers/items.py`,
  `app/internal/`, and the fake-token functions in `app/dependencies.py`; `main.py` no
  longer has any app-level `dependencies=[...]`.
- **DOCX support dropped from scope** — user decision; ticket asked for PDF/DOCX/TXT but
  `extract_text` only handles `.pdf`, `.txt`, `.md`. `.docx` (and anything else) raises
  `ValueError: Unsupported file type`.
- **Confirmed live `testing` schema permissions are fully resolved** (the `42501`/
  `PGRST106` errors from the earlier config/database session are gone) — verified
  SELECT/INSERT/UPDATE/DELETE all work against `testing.tenants`/`testing.sources` via a
  throwaway row round-trip before writing any test code.
- **Got exact column names via the PostgREST OpenAPI spec** (`GET {SUPABASE_URL}/rest/v1/`
  with `Accept-Profile: testing`) rather than guessing from the ticket's sample code:
  `tenants.api_key` is `uuid` (not text), defaulting to `gen_random_uuid()`; `sources` has
  `type`, `url`, `filename`, `status` (default `"queued"`), `chunk_count` (default `0`),
  `error_message`.
- **Ticket's sample ingest code never calls `create_collection_if_not_exists()`** before
  `upsert()` — a real gap, since a brand-new tenant's Zilliz collection doesn't exist yet
  on first upload. Added the call explicitly, matching how `tests/test_round_trip.py`
  already does it.
- **`get_current_tenant_id` is a plain sync function, not `async def`** — no
  `pytest-asyncio`/`anyio` plugin is installed, and `supabase-py`'s client is itself
  synchronous, so making it async would only add complexity (and silently no-op in tests
  without a plugin to actually await it). FastAPI runs sync dependencies fine either way.
- **PDF test fixture is a real file**, not a hand-rolled minimal PDF byte string — a
  first attempt at constructing a minimal valid PDF inline (to avoid committing a binary)
  hit `PdfReadError: startxref not found` on the first try; the user opted to just commit
  a real PDF (`tests/assets/vectorshift_resume.pdf`) instead of debugging PDF internals
  further.

### State at end of session
- `app/core/extractors.py`: `extract_text(file_path, filename) -> str`, PDF/TXT/MD only.
- `app/core/chunker.py`: `chunk_text(text) -> list[str]`, 512-char chunks / 50-char overlap
  via `RecursiveCharacterTextSplitter`.
- `app/dependencies.py`: `get_current_tenant_id(authorization) -> str`, 401s on unknown
  API key.
- `app/routers/ingest.py`: `POST /ingest/file`, mounted in `main.py` with no global auth
  dependency.
- Tests (all passing against live Supabase `testing` schema + live Zilliz cluster):
  `tests/core/test_extractors.py` (4), `tests/core/test_chunker.py` (4),
  `tests/test_dependencies.py` (2), `tests/routers/test_ingest.py` (3).
- `uv run ruff check .` / `ruff format --check .` clean.
```

- [ ] **Step 2: Commit**

```bash
cd backend
git add ../docs/dev-log.md
git commit -m "docs: log CAN-29 file ingestion pipeline decisions"
```

---

## Self-Review Notes

- **Spec coverage:** PDF upload → done/chunk_count ✅ (Task 5 test 1); TXT/MD extraction ✅ (Task 2 tests 2-3, exercised end-to-end implicitly since the router is format-agnostic); unsupported type → status=error ✅ (Task 5 test 3); chunks visible in Zilliz ✅ (`create_collection_if_not_exists` + `upsert` called for every successful ingest, same call path proven by `tests/test_round_trip.py`). DOCX explicitly dropped per user decision (documented in Task 6).
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and were validated against either a live experiment (PDF extraction char count, chunker overlap behavior, Supabase schema/permissions) or existing project code.
- **Type/signature consistency:** `extract_text(file_path: str, filename: str) -> str` (Task 2) matches its only call site in Task 5. `chunk_text(text: str) -> list[str]` (Task 3) matches its call site in Task 5. `get_current_tenant_id(authorization: str) -> str` (Task 4) matches its `Depends()` usage in Task 5. `embed`/`create_collection_if_not_exists`/`upsert` signatures in Task 5 match the existing `app/core/embedder.py`/`app/core/vector_store.py` exactly (verified by reading those files, not assumed).
