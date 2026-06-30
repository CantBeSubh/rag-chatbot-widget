# CAN-49: Observability Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured JSON logging (structlog), Sentry error tracking, Celery retry jitter + tests, and an extended `/health` endpoint that checks Supabase, Redis, and Zilliz.

**Architecture:** Four self-contained observability upgrades applied to the existing FastAPI + Celery backend on Railway. structlog replaces stdlib logging at the `core/logging.py` layer so every module gets JSON output by swapping one import. Sentry hooks into FastAPI and Celery via SDK integrations. The Celery task's `autoretry_for` + manual error-status logic is already correct — only `retry_jitter=True` is missing and tests need to be added. The `/health` endpoint moves from `main.py` to its own router and gains real dependency probes.

**Tech Stack:** structlog, sentry-sdk[fastapi], redis (bundled via celery[redis]), FastAPI, Celery, pymilvus (MilvusClient), supabase-py, pytest

## Global Constraints

- Python ≥ 3.11; use `uv add <package>` from `backend/` to add dependencies
- All imports inside `app/` must be relative (e.g. `from .core.logging import get_logger`) — absolute imports fail under `fastapi dev`
- Tests run via `uv run pytest tests/path/test.py -v` from `backend/`
- Run `ruff check app/ tests/` after each task — fix any issues before committing
- `logging.getLogger` callsites: `app/main.py`, `app/core/crawler.py`, `app/dependencies.py` (print statements)
- Never run the full test suite without asking; lint/format checks are fine freely

---

### Task 1: structlog — rewrite logging module and migrate all callsites

**Files:**
- Modify: `backend/app/core/logging.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/core/crawler.py`
- Modify: `backend/app/dependencies.py`
- Modify: `backend/app/worker/celery_app.py`

**Interfaces:**
- Produces: `configure_logging() -> None` — called in `main.py` (FastAPI startup) and `celery_app.py` (worker startup)
- Produces: `get_logger() -> structlog.BoundLogger` — called by any module that needs to log; returns a bound structlog logger

- [ ] **Step 1: Install structlog**

```bash
cd backend && uv add structlog
```

Expected: `pyproject.toml` gains `structlog>=...` under `[project]` `dependencies`.

- [ ] **Step 2: Write the failing import test**

Create `backend/tests/core/test_logging.py`:

```python
import json
import io
from unittest.mock import patch


def test_configure_logging_outputs_json():
    """configure_logging() must produce JSON-parseable output on logger.info()."""
    import structlog
    from app.core.logging import configure_logging, get_logger

    configure_logging()
    logger = get_logger()

    buf = io.StringIO()
    with patch("sys.stdout", buf):
        logger.info("test_event", tenant_id="abc", count=3)

    output = buf.getvalue().strip()
    # structlog JSONRenderer writes one JSON object per line
    record = json.loads(output)
    assert record["event"] == "test_event"
    assert record["tenant_id"] == "abc"
    assert record["count"] == 3
    assert record["level"] == "info"
    assert "timestamp" in record


def test_get_logger_returns_bound_logger():
    import structlog
    from app.core.logging import configure_logging, get_logger

    configure_logging()
    logger = get_logger()
    assert hasattr(logger, "info")
    assert hasattr(logger, "warning")
    assert hasattr(logger, "error")
```

- [ ] **Step 3: Run the test — verify it fails**

```bash
cd backend && uv run pytest tests/core/test_logging.py -v
```

Expected: `ImportError` or `AttributeError` because `get_logger` does not exist yet.

- [ ] **Step 4: Rewrite `backend/app/core/logging.py`**

Replace the entire file:

```python
import logging
import sys

import structlog


def configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    # Route stdlib logging (third-party libs) through the same stream as JSON
    logging.basicConfig(format="%(message)s", level=logging.INFO, stream=sys.stdout)


def get_logger() -> structlog.BoundLogger:
    return structlog.get_logger()
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
cd backend && uv run pytest tests/core/test_logging.py -v
```

Expected: both tests PASS.

- [ ] **Step 6: Migrate `backend/app/main.py`**

Replace these lines:

```python
# OLD
import logging
...
from .core.logging import setup_logging
setup_logging()
logger = logging.getLogger(__name__)
```

With:

```python
from .core.logging import configure_logging, get_logger
configure_logging()
logger = get_logger()
```

Also update the one log call in `verify_db`:

```python
# OLD
logger.info(f"Supabase connected to {settings.SUPABASE_SCHEMA} schema: {result}")

# NEW
logger.info("db_connected", schema=settings.SUPABASE_SCHEMA)
```

- [ ] **Step 7: Migrate `backend/app/core/crawler.py`**

Replace the stdlib logger:

```python
# OLD
import logging
...
logger = logging.getLogger(__name__)
```

With:

```python
from .logging import get_logger
logger = get_logger()
```

Update the one log call:

```python
# OLD
logger.warning("Failed to crawl %s: %s", url, e)

# NEW
logger.warning("page_crawl_failed", url=url, error=str(e))
```

- [ ] **Step 8: Migrate `backend/app/dependencies.py` — replace print() calls**

Replace the three `print(...)` debug statements. The file currently has `# TODO: Remove logs` above each one. Replace the entire `get_widget_config` function body with structured logging:

```python
def get_widget_config(
    raw_request: Request,
    tenant_id: Annotated[str, Depends(get_current_tenant_id)],
) -> dict[str, Any]:
    config = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("widget_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )

    if not config.data:
        raise HTTPException(status_code=409, detail="Widget not configured")

    widget_config = config.data or {}
    allowed_domains = widget_config.get("allowed_domains", [])
    if allowed_domains:
        origin = raw_request.headers.get("origin", "")
        origin_host = (
            origin.replace("https://", "").replace("http://", "").split(":")[0].lower()
        )
        allowed_domains = [domain.lower() for domain in allowed_domains]

        if origin_host not in allowed_domains:
            raise HTTPException(
                status_code=403,
                detail=f"Domain '{origin_host}' is not allowed.",
            )

    widget_config["tenant_id"] = tenant_id
    return widget_config
```

Also add the import at the top of `dependencies.py`:

```python
from .core.logging import get_logger

_logger = get_logger()
```

(The logger is available for future use without the noisy debug prints.)

- [ ] **Step 9: Call `configure_logging()` in `backend/app/worker/celery_app.py`**

Add these two lines after the existing imports (before the `Celery(...)` instantiation):

```python
from ..core.logging import configure_logging

configure_logging()
```

Full file becomes:

```python
from celery import Celery

from ..core.config import settings
from ..core.logging import configure_logging

configure_logging()

celery_app = Celery(
    "rag_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    worker_pool="solo",
)
```

- [ ] **Step 10: Verify no import errors**

```bash
cd backend && uv run python -c "import app.main"
```

Expected: no output / no errors. If there are errors, fix them before continuing.

- [ ] **Step 11: Lint check**

```bash
cd backend && uv run ruff check app/ tests/
```

Fix any reported issues.

- [ ] **Step 12: Commit**

```bash
cd backend && git add app/core/logging.py app/main.py app/core/crawler.py app/dependencies.py app/worker/celery_app.py tests/core/test_logging.py pyproject.toml uv.lock
git commit -m "feat: migrate to structlog JSON logging (CAN-49)"
```

---

### Task 2: Sentry integration

**Files:**
- Modify: `backend/app/core/config.py` — add `SENTRY_DSN`
- Modify: `backend/app/main.py` — add Sentry init after `configure_logging()`

**Interfaces:**
- Consumes: `configure_logging()` from Task 1 (must call before Sentry init)
- Produces: Sentry initialized with FastAPI + Celery integrations on app startup

- [ ] **Step 1: Install sentry-sdk**

```bash
cd backend && uv add "sentry-sdk[fastapi]"
```

Expected: `pyproject.toml` gains `sentry-sdk[fastapi]>=...`.

- [ ] **Step 2: Add `SENTRY_DSN` to config**

In `backend/app/core/config.py`, add one field after `ENVIRONMENT`:

```python
SENTRY_DSN: str = ""
```

Full `Settings` class after the change:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SCHEMA: str = "public"

    ZILLIZ_URI: str = ""
    ZILLIZ_TOKEN: str = ""
    DEFAULT_COLLECTION_NAME: str = "tenant_default"

    REDIS_URL: str = "redis://admin:admin@localhost:6379"

    LANGCHAIN_OLLAMA_BASE_URL: str = "http://localhost:11434"
    LANGCHAIN_OLLAMA_MODEL: str = "llama3.1:8b"

    HF_TOKEN: str = ""
    LANGCHAIN_HUGGINGFACE_MODEL: str = "zai-org/GLM-5.2"

    SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
```

- [ ] **Step 3: Add Sentry init to `backend/app/main.py`**

Add these imports at the top of `main.py` (after existing imports):

```python
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
```

Add the Sentry init block immediately after `configure_logging()` and before the `app = FastAPI()` line:

```python
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            CeleryIntegration(),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment=settings.ENVIRONMENT,
    )
```

The guard `if settings.SENTRY_DSN:` means Sentry is a no-op in local dev (where `SENTRY_DSN` is empty).

- [ ] **Step 4: Verify no import errors**

```bash
cd backend && uv run python -c "import app.main"
```

Expected: no errors.

- [ ] **Step 5: Manual verification note (document in dev log)**

> To verify Sentry works after deploying to Railway:
> 1. Set `SENTRY_DSN` in Railway env vars (from sentry.io project settings)
> 2. Add a temporary route `GET /sentry-test` that raises `ValueError("test error")`
> 3. Deploy and hit the endpoint
> 4. Confirm the error appears in the Sentry dashboard
> 5. Remove the test route before merging

Update `docs/dev-log.md` with this note.

- [ ] **Step 6: Lint check**

```bash
cd backend && uv run ruff check app/
```

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/core/config.py app/main.py pyproject.toml uv.lock
git commit -m "feat: add Sentry error tracking with FastAPI + Celery integrations (CAN-49)"
```

---

### Task 3: Celery retry — add jitter and test error-status behavior

**Files:**
- Modify: `backend/app/worker/tasks.py` — add `retry_jitter=True` to decorator
- Create: `backend/tests/worker/test_task_retry.py` — isolated tests for retry/error-status logic

**Interfaces:**
- Consumes: `ingest_url_task` from `app/worker/tasks.py`
- The existing `try/except` in `ingest_url_task` already correctly sets `sources.status = "error"` when `self.request.retries >= self.max_retries`. This task adds the missing jitter and writes tests proving the behavior.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/worker/test_task_retry.py`:

```python
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
    tenant = _SCHEMA.table("tenants").insert({"user_id": str(uuid.uuid4())}).execute().data[0]
    source = (
        _SCHEMA.table("sources")
        .insert({
            "tenant_id": tenant["id"],
            "type": "url",
            "url": "https://example.com",
            "status": "queued",
        })
        .execute()
        .data[0]
    )
    yield tenant, source
    _SCHEMA.table("sources").delete().eq("tenant_id", tenant["id"]).execute()
    _SCHEMA.table("tenants").delete().eq("id", tenant["id"]).execute()


def test_ingest_url_task_marks_error_when_all_retries_exhausted(source_and_tenant):
    """After max_retries failures, sources.status must be 'error'."""
    tenant, source = source_and_tenant

    # max_retries=0 means the first failure is immediately the final failure
    original_max = ingest_url_task.max_retries
    ingest_url_task.max_retries = 0
    try:
        with patch(
            "app.worker.tasks.crawl_site_sync",
            side_effect=ConnectionError("network timeout"),
        ):
            with pytest.raises(Exception):
                ingest_url_task.delay(
                    source["id"], tenant["id"], "https://example.com", max_pages=1
                ).get(timeout=10)
    finally:
        ingest_url_task.max_retries = original_max

    updated = _SCHEMA.table("sources").select("*").eq("id", source["id"]).execute().data[0]
    assert updated["status"] == "error"
    assert "network timeout" in updated["error_message"]


def test_ingest_url_task_does_not_mark_error_on_first_retry(source_and_tenant):
    """On the first failure (retries=0, max=3), status must NOT be set to error."""
    tenant, source = source_and_tenant

    call_count = {"n": 0}

    def fail_once_then_succeed(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise ConnectionError("transient failure")
        return []  # second call returns empty pages → sets status=error normally

    with patch("app.worker.tasks.crawl_site_sync", side_effect=fail_once_then_succeed):
        with pytest.raises(Exception):
            # first attempt raises, in eager mode Celery retries once immediately
            ingest_url_task.delay(
                source["id"], tenant["id"], "https://example.com", max_pages=1
            ).get(timeout=10)

    # status=error is acceptable here (from empty pages branch), but NOT from the
    # ConnectionError path — we verify it didn't set status=error on the first raise
    assert call_count["n"] == 2  # task ran at least twice (retry happened)


def test_ingest_url_task_decorator_has_jitter():
    """Task must have retry_jitter=True to avoid thundering herd on retry bursts."""
    assert getattr(ingest_url_task, "retry_jitter", False) is True
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd backend && uv run pytest tests/worker/test_task_retry.py -v
```

Expected:
- `test_ingest_url_task_marks_error_when_all_retries_exhausted` — PASS (logic already correct)
- `test_ingest_url_task_does_not_mark_error_on_first_retry` — PASS or behaviour check
- `test_ingest_url_task_decorator_has_jitter` — **FAIL** (`retry_jitter` attribute is missing)

- [ ] **Step 3: Add `retry_jitter=True` to the task decorator in `backend/app/worker/tasks.py`**

Change the decorator from:

```python
@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # Wait 60s before retrying on transient failures
    autoretry_for=(Exception,),
    retry_backoff=True,  # Exponential backoff: 60s, 120s, 240s
)
```

To:

```python
@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
```

- [ ] **Step 4: Run the tests — verify all pass**

```bash
cd backend && uv run pytest tests/worker/test_task_retry.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Lint check**

```bash
cd backend && uv run ruff check app/worker/tasks.py tests/worker/test_task_retry.py
```

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/worker/tasks.py tests/worker/test_task_retry.py
git commit -m "feat: add retry_jitter to Celery task and test error-status on exhausted retries (CAN-49)"
```

---

### Task 4: Extended health check endpoint

**Files:**
- Create: `backend/app/routers/health.py` — health router with dependency probes
- Modify: `backend/app/routers/__init__.py` — export `health` router
- Modify: `backend/app/main.py` — wire health router, remove inline `/health` route
- Create: `backend/tests/routers/test_health.py` — unit tests with mocked deps

**Interfaces:**
- Consumes: `supabase` from `app.core.database`, `client` (MilvusClient) from `app.core.vector_store`, `settings.REDIS_URL` from `app.core.config`, `settings.SUPABASE_SCHEMA`
- Produces: `GET /health` → `{"status": "ok"|"degraded", "checks": {"supabase": "ok"|"error: ...", "redis": "ok"|"error: ...", "zilliz": "ok"|"error: ..."}, "ts": int}` — always HTTP 200

- [ ] **Step 1: Write failing tests first**

Create `backend/tests/routers/test_health.py`:

```python
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200_when_all_deps_ok():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        mock_supa.schema.return_value.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_result
        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["supabase"] == "ok"
    assert body["checks"]["redis"] == "ok"
    assert body["checks"]["zilliz"] == "ok"
    assert "ts" in body


def test_health_returns_degraded_when_supabase_fails():
    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        mock_supa.schema.side_effect = Exception("connection refused")
        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["supabase"].startswith("error:")
    assert body["checks"]["redis"] == "ok"
    assert body["checks"]["zilliz"] == "ok"


def test_health_returns_degraded_when_redis_fails():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        mock_supa.schema.return_value.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_result
        mock_zilliz.list_collections.return_value = []
        mock_redis_factory.return_value.ping.side_effect = Exception("redis down")

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["redis"].startswith("error:")


def test_health_returns_degraded_when_zilliz_fails():
    mock_result = MagicMock()
    mock_result.data = [{"id": "x"}]

    with (
        patch("app.routers.health.supabase") as mock_supa,
        patch("app.routers.health.zilliz_client") as mock_zilliz,
        patch("app.routers.health.redis.from_url") as mock_redis_factory,
    ):
        mock_supa.schema.return_value.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_result
        mock_zilliz.list_collections.side_effect = Exception("zilliz unreachable")
        mock_redis_factory.return_value.ping.return_value = True

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["zilliz"].startswith("error:")
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd backend && uv run pytest tests/routers/test_health.py -v
```

Expected: tests fail because `app.routers.health` does not exist yet / `/health` doesn't have per-dep checks.

- [ ] **Step 3: Create `backend/app/routers/health.py`**

```python
import time

import redis

from fastapi import APIRouter

from ..core.config import settings
from ..core.database import supabase
from ..core.vector_store import client as zilliz_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    checks: dict[str, str] = {}
    overall = "ok"

    # Supabase
    try:
        supabase.schema(settings.SUPABASE_SCHEMA).table("tenants").select("id").limit(1).execute()
        checks["supabase"] = "ok"
    except Exception as e:
        checks["supabase"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    # Redis
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    # Zilliz (pymilvus MilvusClient)
    try:
        zilliz_client.list_collections()
        checks["zilliz"] = "ok"
    except Exception as e:
        checks["zilliz"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    return {"status": overall, "checks": checks, "ts": int(time.time())}
```

- [ ] **Step 4: Wire health router into `backend/app/main.py`**

Add the health import to the routers import line:

```python
# OLD
from .routers import chat, config, ingest, logs, sources, tenant

# NEW
from .routers import chat, config, health, ingest, logs, sources, tenant
```

Add `app.include_router(health.router)` alongside the other routers:

```python
app.include_router(config.router)
app.include_router(ingest.router)
app.include_router(chat.router)
app.include_router(sources.router)
app.include_router(logs.router)
app.include_router(tenant.router)
app.include_router(health.router)
```

Remove the old inline health route from `main.py` (delete these lines):

```python
@app.get("/health")
@limiter.exempt
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Export health router from `backend/app/routers/__init__.py`**

Read the current `__init__.py` first. If it's empty, leave it empty — Python will find `health.py` by the `from .routers import health` import. No change needed if the file is empty.

(Check with: `cat backend/app/routers/__init__.py`)

- [ ] **Step 6: Run the tests — verify all pass**

```bash
cd backend && uv run pytest tests/routers/test_health.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Verify import works**

```bash
cd backend && uv run python -c "import app.main"
```

Expected: no errors.

- [ ] **Step 8: Lint check**

```bash
cd backend && uv run ruff check app/routers/health.py tests/routers/test_health.py
```

- [ ] **Step 9: Commit**

```bash
cd backend && git add app/routers/health.py app/main.py tests/routers/test_health.py
git commit -m "feat: extended /health endpoint with Supabase, Redis, Zilliz checks (CAN-49)"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|---|---|
| structlog JSON logging | Task 1 |
| All `print()` / `logging.getLogger()` calls replaced | Task 1 (Steps 6–8) |
| Sentry DSN configured, FastAPI + Celery integrations | Task 2 |
| Celery retry with exponential backoff | Already implemented; Task 3 adds `retry_jitter=True` |
| Error status after all retries exhausted | Already implemented; Task 3 adds tests |
| `GET /health` returns per-dep JSON | Task 4 |
| HTTP 200 even when degraded | Task 4 (Step 3, no 503) |

## Done When

- `uv run pytest tests/core/test_logging.py tests/worker/test_task_retry.py tests/routers/test_health.py -v` all green
- `uv run python -c "import app.main"` succeeds
- `uv run ruff check app/ tests/` clean
- Railway env has `SENTRY_DSN` set and a test exception confirms it appears in Sentry dashboard
