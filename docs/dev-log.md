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
