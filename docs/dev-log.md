# Dev Log

## 2026-06-24 — Backend config/database wiring + Supabase schema setup

### Context

`backend/app/core/config.py` was empty and `backend/app/core/database.py` called
`create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)` with no `settings`
object to back it. Goal: make the two work together and get the app actually
connecting to Supabase.

### Observations

- **Credential mismatch caught early**: the values first given for "URL" and "KEY"
  were a raw Postgres connection string
  (`postgresql://postgres:[YOUR-PASSWORD]@db....supabase.co:5432/postgres`) and a
  16-char string that looked like a DB password — not the REST API URL
  (`https://<ref>.supabase.co`) and API key that `supabase-py`'s `create_client()`
  needs. Confirmed and got the real key, which turned out to be Supabase's newer
  `sb_secret_...` key format (replaces the old long JWT `anon`/`service_role` keys,
  functionally equivalent to `service_role`).

- **`pydantic-settings` wasn't a dependency** — added via `uv add pydantic-settings`.
  `config.py` now defines a `Settings(BaseSettings)` reading from `.env`
  (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SCHEMA`, `ZILLIZ_URI`, `ZILLIZ_TOKEN`,
  `REDIS_URL`, `SECRET_KEY`, `ENVIRONMENT`).

- **Import bug — `core.config` vs `app.core.config`**: `database.py` originally did
  `from core.config import settings` (absolute import, assuming `app/` itself is on
  `sys.path`). `main.py` uses relative imports (`from .dependencies import ...`),
  which only works if `app/` is treated as a package and `backend/` is on
  `sys.path` instead. These two assumptions conflict. Confirmed by actually running
  `import app.main` (the way `fastapi dev`/`fastapi run` imports the app) —
  it raised `ModuleNotFoundError: No module named 'core'`. Fixed by changing
  `database.py` to `from .config import settings` (relative, consistent with the
  rest of the package).

- **`main.py` referenced `supabase` without importing it** — a `startup` event
  handler (`verify_db`) called `supabase.table(...)` but never imported `supabase`
  from `core.database`. Added `from .core.database import supabase`.

- **Logging**: replaced a stray `print(...)` in the startup handler with proper
  `logging`. Learned that `logger.info(...)` silently does nothing under
  `fastapi dev` unless something configures the root logger — uvicorn only
  configures its own loggers (`uvicorn`, `uvicorn.error`, `uvicorn.access`), each
  with `propagate=False`, so they never touch the root logger and don't help our
  own app loggers.
  - Extracted a reusable `app/core/logging.py` with `setup_logging()`, called once
    from `main.py`. It reuses `uvicorn.logging.DefaultFormatter` so our own log
    lines match uvicorn's colorized style instead of plain
    `logging.basicConfig()` output.
  - Iterated on the format: added filename (`%(filename)s`, padded to a fixed
    width so the message column lines up regardless of name length — mirroring
    how uvicorn pads its own `levelprefix`), then a timestamp (`%(asctime)s`).
  - Noted (and left as-is, by request) that uvicorn's/WatchFiles' own log lines
    never get the filename field, since their loggers short-circuit propagation
    before reaching our root-logger handler.

- **Schema selection added**: `SUPABASE_SCHEMA` setting (default `"public"`,
  set to `"testing"` in `.env`), wired into the startup check via
  `supabase.schema(settings.SUPABASE_SCHEMA).table("tenants")...`.

- **Supabase schema troubleshooting (querying `testing.tenants`)** — two distinct
  errors, in order:
  1. `PGRST106 Invalid schema: testing` — the `testing` schema wasn't in
     **Project Settings → Data API → Exposed schemas** yet. PostgREST only
     routes to schemas explicitly listed there (default: `public`,
     `graphql_public`).
  2. After exposing the schema: `42501 permission denied for schema testing` —
     exposing a schema via the dashboard only tells PostgREST it's allowed to
     route there; Postgres itself still enforces its own grants, and only
     `public` gets automatic grants when a project is created. Custom schemas
     need explicit `GRANT USAGE`/`GRANT ALL` (tables, routines, sequences) plus
     `ALTER DEFAULT PRIVILEGES` for `anon`/`authenticated`/`service_role`.
  - Confirmed via Table Editor that `testing.tenants` (plus `chat_logs`,
    `sources`, `widget_config`) already existed, all RLS-disabled
    (`UNRESTRICTED`).
  - Couldn't run the grants via the Supabase MCP tools — `list_projects` only
    surfaced unrelated projects (`subhranshu.com`, `todo`, `capstone-staging`),
    not `mhgmepexsspwwtndrvso`. Left the `GRANT`/`ALTER DEFAULT PRIVILEGES` SQL
    for the user to run directly in the SQL Editor.

### State at end of session

- `config.py`, `database.py`, `main.py`, `core/logging.py` updated and verified
  importable end-to-end (`import app.main` succeeds).
- `.env` / `.env.example` updated with `SUPABASE_SCHEMA`.
- Outstanding: user to run the schema `GRANT` statements in Supabase SQL Editor
  to clear the `42501 permission denied for schema testing` error.

## 2026-06-24 — CAN-28: Zilliz vector store + embedding model (TDD)

### Context

Linear ticket CAN-28 specified `backend/core/vector_store.py` and
`backend/core/embedder.py` with sample code using Poetry and absolute imports
(`from core.config import settings`) — both wrong for this repo (`uv`, and
package root is `app/`, so it must be `from .config import settings`). User
asked for pytest tests written test-first instead of the ticket's standalone
verification script.

### Observations

- **Ticket's embedding-dimension claim was wrong.** The ticket stated
  `BAAI/bge-small-en-v1.5` produces 768-dim vectors. The first real test run
  (`test_embed_returns_768_dimensional_vectors`) failed with `384 == 768` —
  `bge-small-en-v1.5` actually outputs 384 dims; `bge-base-en-v1.5` is the
  768-dim variant. This is exactly what TDD is supposed to catch: the test
  failed for a real reason, not a typo. User chose to switch the model to
  `bge-base-en-v1.5` and keep `VECTOR_DIM = 768`.
- **No Zilliz cluster existed yet** — `.env` had empty `ZILLIZ_URI`/`ZILLIZ_TOKEN`.
  User chose to create a real free-tier Serverless cluster (rather than mock
  `MilvusClient`) and pasted real credentials into `backend/.env` (not echoed
  back in chat, per security hygiene).
- **Milvus eventual consistency**: `MilvusClient.search()` defaults to
  `consistency_level="Bounded"`, which could in theory make a search miss a
  vector that was just inserted — a real concern for "ingest then immediately
  query" in this app. After discussion, user chose to keep `search()` at the
  ticket's defaults (no override) and scope the `vector_store.py` unit tests
  down to **connectivity only** (collection creation against the live
  cluster), rather than asserting exact search-ranking behavior there. The
  separate end-to-end round-trip test (real embedder + real vector store)
  happened to pass on the first try with default consistency — no retry/poll
  needed in practice on this cluster.
- Added `pytest` as a dev dependency (`uv add --dev pytest`), `[tool.pytest.ini_options]`
  with `testpaths = ["tests"]` in `pyproject.toml`, and a `test:` target to the
  `Makefile`.

### State at end of session

- `app/core/embedder.py`: loads `BAAI/bge-base-en-v1.5` once at module level,
  `embed(texts) -> list[list[float]]`, normalized embeddings (768-dim).
- `app/core/vector_store.py`: `MilvusClient` against the real Zilliz cluster,
  `create_collection_if_not_exists`, `upsert`, `vector_search` (COSINE, dim=768,
  `auto_id=True`), relative imports.
- Tests (7 total, all passing against the live Zilliz cluster):
  `tests/core/test_embedder.py` (4), `tests/core/test_vector_store.py` (2,
  connectivity), `tests/test_round_trip.py` (1, full ingest→search round trip
  matching the ticket's "Done when" criterion — searching "vector database"
  returns the Zilliz sentence as top hit).
- `uv run ruff check .` / `ruff format --check .` clean.
- No standalone `backend/scripts/test_vector.py` was created — pytest covers
  the ticket's verification step instead, per user's request.
- `DEFAULT_COLLECTION_NAME` moved from a module-level constant in
  `vector_store.py` into `Settings` (`config.py`), since it's configuration,
  not a vector-store implementation detail. It was unused elsewhere at the
  time of the move.
- User renamed `vector_store.search` → `vector_store.vector_search` directly
  (not via Claude) — the function does pure vector similarity search, and the
  more specific name leaves room for a future hybrid (vector + keyword) search
  function named `search` or `hybrid_search` without ambiguity. Updated the
  one caller (`tests/test_round_trip.py`) and re-ran lint/tests to confirm
  nothing else referenced the old name.

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

## 2026-06-24/25 — CAN-32: Widget scaffold (TypeScript + bun + Shadow DOM)

### Context

Linear ticket CAN-32 specified esbuild + npm for the widget's build pipeline;
deviated to `bun build` (native bundler) + bun as the package manager instead,
per this repo's standing preference for bun over npm/esbuild for JS tooling.
`widget/` is a fully standalone bun package — its own `package.json`/
`bun.lock`, independent of the repo root and `backend/`.

### Observations

- Split the ticket's single `widget.ts` sample into three modules:
  `auth.ts` (`getApiKey()`), `ui.ts` (`buildWidget()` — Shadow DOM host,
  bubble, panel), `widget.ts` (bundle entry point, composes the other two on
  `DOMContentLoaded`, exposes `window.__ragWidget`). All three get inlined
  into one `dist/widget.js` by `bun build`'s bundler — confirmed by grepping
  the built output for `rag-widget-host`.
- No test framework / unit tests for this scaffold — there's no testable
  logic yet (pure DOM construction + a `DOMContentLoaded` listener). Gate per
  task was `bun run typecheck && bun run lint && bun run format:check`
  (+ `bun run build` where relevant); full behavioral verification (bubble
  renders, click toggles, Shadow DOM actually isolates styles) is a single
  manual browser pass at the end against `test.html`, not automated.
- `test.html` intentionally ships a hostile host-page rule
  (`button { background: red !important; }`) in `<head>` — the point isn't
  just that a shadow root exists, but that the bubble's purple
  (`#6366f1`/`#4f46e5` hover) survives a page-level rule that would otherwise
  win on specificity.
- Shadow DOM mode is `'closed'` (not `'open'`) — deliberate: the host page's
  own JS shouldn't be able to reach widget internals via `element.shadowRoot`.
- Extended `.husky/pre-commit` to also run `widget`'s
  `typecheck && lint && format:check` (previously backend-only), so the
  widget's checks are enforced the same way as the backend's.

### State at end of session

- `widget/src/auth.ts`, `ui.ts`, `widget.ts` implemented; `bun run build`
  produces `dist/widget.js` (1.89 KB minified) with no TypeScript errors.
- `widget/test.html` added as the manual verification page; all done-criteria
  from CAN-32 (bubble renders, click toggles panel, closed shadow root visible
  in DevTools nested under `#rag-widget-host`, purple not overridden by the
  page's `red !important` rule) confirmed manually in-browser by the user.
- `typecheck`/`lint`/`format:check`/`build` all clean; `dist/` and
  `node_modules/` gitignored (build artifact, never committed).
- Added `widget/README.md` covering structure, build/lint scripts, embedding
  the script tag, and the manual verification checklist.
- CAN-32 fully done per its six-task implementation plan
  (`docs/superpowers/plans/2026-06-24-widget-scaffold.md`), including the
  pre-commit hook task.

## 2026-06-25 — CAN-36: M2-D1: Celery + Redis async task worker setup

### Context

CAN-36 (M2: URL Crawl Ingestion, parent CAN-23) asks for the Celery + Redis
background-task infrastructure that later crawl tasks will run on, proven
here with a dummy `add(x, y)` task. Design brainstormed and written to
`docs/superpowers/specs/2026-06-25-celery-redis-worker-design.md` before
implementation.

### Observations

- **Deviated from the ticket's sample code** in the same places earlier
  tickets have: Poetry → `uv add "celery[redis]"`; a top-level
  `backend/worker/` package with absolute imports (`from core.config import
  settings`) → `app/worker/` inside the existing `app` package with relative
  imports (`from ..core.config import settings`), per `CLAUDE.md`'s
  relative-import rule. `celery[redis]` (one dependency, version-pinned
  `redis` client) instead of separate `celery` + `redis` packages.
- **`REDIS_URL` already existed** in `config.py`/`.env.example` from earlier
  speculative work — no config changes needed, just consumed for the first
  time.
- **Missing `__init__.py` broke pytest's import resolution**: both
  `app/worker/` and `tests/worker/` were created without `__init__.py`
  (unlike `app/core/`, `tests/core/`, `tests/routers/`, which all have one).
  Without it, pytest's default "prepend" import mode stops walking up at
  `tests/worker/` itself instead of reaching `backend/`, so `backend/` never
  lands on `sys.path` and `from app.core.config import settings` fails with
  `ModuleNotFoundError: No module named 'app'`. Fixed by adding empty
  `__init__.py` to both directories, matching existing convention.
- **Two tests, deliberately different infra requirements**: an eager-mode
  test (`task_always_eager=True`) that runs the task in-process with no live
  Redis needed, and a non-eager test that calls the real broker via
  `settings.REDIS_URL` and blocks on `result.get(timeout=10)` for an actual
  worker to process it — requires `docker compose up`/`make worker` already
  running before `pytest` starts, with the timeout turning "no worker
  running" into a fast failure instead of a hang. Consistent with this repo's
  existing pattern of testing against live infra (Supabase, Zilliz) rather
  than mocking.
- **`worker.dockerfile` added as a separate Dockerfile** (not reusing the
  existing `Dockerfile`), with `CMD` swapped from running `fastapi` to
  `celery -A app.worker.celery_app worker --loglevel=info`, using the same
  direct-venv-binary exec form as the original.
- **No `docker-compose.yml`/`compose.yaml` existed anywhere in this repo
  before this ticket** — Railway/Vercel deploys (CAN-35) were configured
  directly via dashboard. Scope here is deliberately just `redis` +
  `redis-commander` (+ a `worker` block, currently commented out) — the
  FastAPI `api` keeps running locally via `make dev` per `CLAUDE.md`, it just
  needs Redis reachable on `localhost:6379`. `worker` is run locally via the
  new `make worker` Makefile target for now rather than containerized;
  the `worker.dockerfile`-based compose service exists but is commented out
  by choice, ready for when it's needed (e.g. M2-D4's Railway deploy).
- Added `redis-commander` (web UI at `localhost:8081`) as a third compose
  service for inspecting queue/keys during local dev — not part of any
  deploy, dev-only convenience.

### State at end of session

- `app/worker/celery_app.py`, `tasks.py`, `__init__.py`: Celery app wired to
  `settings.REDIS_URL` as broker+backend, dummy `add` task.
- `tests/worker/test_tasks.py` (+ `__init__.py`): eager-mode test passing
  standalone; non-eager real-broker test passing with `redis` (+ a worker)
  running.
- `compose.yaml`: `redis`, `redis-commander` active; `worker` service block
  present but commented out.
- `worker.dockerfile`: standalone Dockerfile for the worker container, CMD
  runs the Celery worker.
- `Makefile`: new `worker` target (`uv run celery -A app.worker.celery_app
  worker --loglevel=info`).
- `pyproject.toml`/`uv.lock`: `celery[redis]>=5.6.3` added.
- Design spec: `docs/superpowers/specs/2026-06-25-celery-redis-worker-design.md`.
- `ruff check`/`format --check` clean on the new worker code.
