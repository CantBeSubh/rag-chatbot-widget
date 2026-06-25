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

## 2026-06-25 — CAN-51: Redis auth support (local admin/admin, Railway native)

### Context

Production Redis is hosted on Railway and requires auth (`REDISUSER=default` +
a generated password, embedded directly in Railway's `REDIS_URL`). Running
the ad-hoc connectivity check (`redis.Redis.from_url(settings.REDIS_URL).ping()`)
against that setup raised `redis.exceptions.AuthenticationError`, tracked as
CAN-51 (sub-issue of CAN-36). Local Redis (`compose.yaml`) had no auth
configured at all, so this path was never exercised locally before deploying.

### Observations

- **No app code changes needed for auth itself** — both Celery and `redis-py`
  parse `user:pass@host:port` straight out of the connection URL natively.
  The actual gap was that local Redis didn't require auth, so a misconfigured
  or hardcoded bare URL would only surface as an error against Railway,
  not locally.
- **Local Redis now requires auth via ACL**, not just `requirepass`: plain
  `requirepass` only sets a password for the implicit `default` user and
  ignores any username supplied in the URL (`AUTH admin admin` would fail
  with `WRONGPASS` — there's no ACL user named `admin`). Added an explicit
  `--user admin on >admin ~* &* +@all` ACL rule alongside `--requirepass
  admin` in `compose.yaml`'s `redis` service so `redis://admin:admin@...`
  actually works, not just `redis://default:admin@...`. Passed as a YAML
  list (exec form) so Docker execs the args directly — no shell to mangle
  the `>`/`~`/`&`/`*` characters.
  Verified directly: anonymous `PING` → `NOAUTH`; both
  `redis://admin:admin@...` and `redis://default:admin@...` → `PONG`.
- **`redis-commander` needed the password too** — its `REDIS_HOSTS` format is
  `label:host:port:dbIndex:password`; without the trailing `:admin` it would
  fail to connect to the now-authenticated Redis. Confirmed via its logs
  after the change (`Redis Connection redis:6379 using Redis DB #0`, no
  auth errors).
- **Default `REDIS_URL` updated to embed creds** in three places that all
  needed to move together: `app/core/config.py`'s fallback default,
  `.env.example`, and the actual local `.env` (gitignored, not committed) —
  all now `redis://admin:admin@localhost:6379`. Production is unaffected:
  Railway's own `REDIS_URL` env var (with its real generated password)
  overrides this default at deploy time, same mechanism already used for
  `SUPABASE_URL`/`SUPABASE_KEY`.

### State at end of session

- `compose.yaml`: `redis` now enforces auth (`admin`/`admin` via ACL, plus
  `default`/`admin`); `redis-commander` passes the password through.
- `app/core/config.py`, `.env.example`, `.env`: `REDIS_URL` default updated
  to `redis://admin:admin@localhost:6379`.
- Verified end-to-end: `docker compose up -d redis redis-commander`, manual
  `redis-cli` AUTH checks, a local `make worker`-equivalent Celery worker
  connecting over the authenticated URL, and `uv run pytest tests/worker/`
  (both eager and non-eager tests) all passing against the new setup.
- CAN-51 fix implemented; not yet marked Done in Linear pending user
  confirmation against the actual Railway-deployed worker.

## 2026-06-25 — CAN-37: M2-D2: crawl4ai integration — async web crawler

### Context

CAN-37 (M2-D2, parent CAN-23) asks for `crawl_site`/`crawl_site_sync` in
`app/core/crawler.py`: BFS-crawl same-domain pages from a starting URL via
crawl4ai's headless browser, returning `{url, title, text}` dicts ready for
chunking. Scope deliberately excludes the Celery task (CAN-38), the
`/ingest/url` endpoint (CAN-39), and a broader real-site testing pass
(CAN-40) — all separate backlog tickets. Design brainstormed and written to
`docs/superpowers/specs/2026-06-25-crawl4ai-crawler-design.md` before
implementation.

### Observations

- **Ticket's sample code reads a nonexistent attribute**: `result.markdown_v2
  .fit_markdown` — `markdown_v2` doesn't exist in the current crawl4ai API.
  Confirmed via crawl4ai's docs that `result.markdown` is itself a
  `MarkdownGenerationResult` with `.raw_markdown`/`.fit_markdown`; fixed to
  `result.markdown.fit_markdown if result.markdown else ""`. Same class of
  issue as CAN-28's wrong embedding dimension and CAN-29's wrong import
  style — ticket sample code in this project has consistently needed
  verification against the real library, not trusted as-is.
- **`wait_until="networkidle"` (also from the ticket) doesn't work at all
  against the ticket's own canonical test site**, `fastapi.tiangolo.com`.
  First test run failed: `crawl_site_sync(..., max_pages=5)` returned `[]`
  after a 30s `Page.goto` timeout. The log showed `[ANTIBOT]`/`Proxy direct
  failed`, which looked like bot-blocking but turned out to be a red
  herring — read the installed crawl4ai source
  (`async_webcrawler.py:399-544`) and confirmed `ANTIBOT` is just crawl4ai's
  generic tag for *any* exception during a fetch attempt, logged then
  re-raised since no proxy list/retries were configured. The actual
  exception underneath was the Playwright navigation timeout.
  Verified directly with a throwaway script: `wait_until="networkidle"`
  against `fastapi.tiangolo.com` **still times out completely at 60s**
  (not just slow at 30s) — the page has continuous background network
  activity that never quiets down, so `networkidle` can never fire,
  matching Playwright's own documented warning about that wait condition.
  `wait_until="domcontentloaded"` succeeded in ~2s with 170KB of real HTML.
  Fixed by switching `crawl_site`'s `CrawlerRunConfig` to
  `wait_until="domcontentloaded"`.
- **Two tests initially passed vacuously**: `test_crawl_site_stays_on_same_
  domain` and `test_crawl_site_respects_max_pages` looped/compared over
  `pages` without asserting it was non-empty, so they'd have passed even
  with the `networkidle` bug returning `[]` every time (a `for` loop over
  `[]` and `0 <= 2` are both trivially true). Caught only because a third,
  stricter test (`returns_pages_with_text`, asserting `len(pages) == 5`)
  happened to fail first. Added `assert len(pages) > 0` (and folded into
  `assert 0 < len(pages) <= 2` for the max-pages test) so both tests
  actually validate the crawler did something.
- **Real install command is `crawl4ai-setup`** (runs Playwright's Chromium
  install internally), not directly `playwright install chromium` as the
  ticket's step 1 implies — confirmed via crawl4ai's docs; the latter is
  only a documented fallback if `crawl4ai-setup` fails.

### State at end of session

- `app/core/crawler.py`: `crawl_site` (async, sequential BFS, same-domain via
  explicit `urlparse` netloc check), `crawl_site_sync` (`asyncio.run` wrapper
  for the future Celery task in CAN-38). `MAX_PAGES = 50` module constant.
- `pyproject.toml`/`uv.lock`: `crawl4ai>=0.9.0` added.
- `tests/core/test_crawler.py` (4 tests, all passing against the live
  `fastapi.tiangolo.com` site, ~26s total): returns 5 non-empty pages,
  stays on the same domain, respects `max_pages`, unreachable URL returns
  `[]` without raising.
- Design spec: `docs/superpowers/specs/2026-06-25-crawl4ai-crawler-design.md`.
- Not yet run: `ruff check`/`ruff format --check` on the new crawler code.

## 2026-06-25 — CAN-38: M2-D3: Celery crawl ingestion task (crawl → chunk → dedup → embed → upsert)

### Context

CAN-38 (M2-D3, parent CAN-23) is the orchestrator that wires together every
component built across CAN-28/29/36/37: a Celery task that crawls a URL,
chunks every page, deduplicates chunks against prior crawls, embeds, upserts
to Zilliz, and keeps the Supabase `sources` row's status in sync throughout.
Deliberately excludes the `/ingest/url` API endpoint and status-polling
endpoints (CAN-39) — this ticket only builds the task itself, dispatched
directly via `.delay()` in tests, matching the ticket's own manual
verification approach. Plan written to
`docs/superpowers/plans/2026-06-25-celery-crawl-ingestion-task.md` and
executed via subagent-driven development (fresh implementer + reviewer
subagent per task) before any implementation.

### Observations

- **Ticket's dedup sample code had a real metadata-misattribution bug.**
  The ticket's sample `filter_new_chunks` returned the *kept chunk values*,
  then the caller re-found each one's metadata via
  `chunk_metadata[all_chunks.index(c)]`. `list.index()` returns the first
  matching index by value — if the same chunk text repeats across pages
  (very plausible for a docs site's nav/footer block, which every page
  shares), every repeated occurrence would silently get attributed to the
  *first* page's metadata. Redesigned `filter_new_chunks` to return
  **indices** into the input list instead of values, so the caller
  (`ingest_url_task`) filters both `all_chunks` and `chunk_metadata` by the
  same index list — no value re-matching anywhere. Same general class of
  issue as CAN-28/29/37's sample-code bugs: ticket code in this project has
  consistently needed independent verification, not trust.
- **Task review caught a second, subtler bug the plan itself didn't
  anticipate**: a TOCTOU race in `filter_new_chunks` — it selected existing
  hashes, then plain-`insert`ed new ones, with no transaction or conflict
  guard between the two. Two concurrent calls for the same tenant (e.g.
  overlapping crawls) could both see a hash as new and the second `insert`
  would raise an uncaught primary-key violation on `(hash, tenant_id)`.
  Fixed by switching to `.upsert(rows, on_conflict="hash,tenant_id",
  ignore_duplicates=True)`, verified against the installed `postgrest`
  client's actual `upsert()` signature rather than assumed.
- **`vector_search` couldn't surface `url` even though `rag.py` already
  expected it to.** `app/core/rag.py`'s `build_context` already had
  `chunk["entity"].get("url", "unknown")` as a fallback for chunks without a
  `filename` — written in anticipation of URL-sourced content — but
  `vector_search`'s `output_fields` list never requested `"url"` from
  Zilliz, so that fallback could never fire. One-line fix:
  `output_fields=["text", "source_id", "filename", "url", "chunk_index"]`.
- **Schema-scoped Supabase calls, again.** The ticket's sample code calls
  `supabase.table("sources")...` directly, same gap as every prior ticket's
  sample code in this repo — every Supabase call in `dedup.py` and
  `tasks.py` goes through `supabase.schema(settings.SUPABASE_SCHEMA)`
  instead, matching `ingest.py`/`dependencies.py`/`chat.py` convention.
- **Deliberate scope decision: retry-exhaustion path is not unit-tested.**
  The Celery task's `try/except Exception` + `autoretry_for=(Exception,)` +
  `self.request.retries >= self.max_retries` pattern (verified correct by
  tracing Celery's actual retry semantics attempt-by-attempt: the check is
  `True` on exactly the final attempt, not off-by-one) is real and in
  production code, but deterministically exercising the exhausted-retries
  branch in a test would require either mocking a collaborator (against
  this project's no-mocking convention) or tolerating real sleep-based
  backoff (60s/120s/240s per `retry_backoff=True`). Only the "crawler
  returned no pages" failure branch — deterministic, fast, no retry
  involved — got an automated test. The retry-exhaustion path is exercised
  by the ticket's own manual end-to-end verification step instead.
- **Per-page `chunk_index` is relative to the page**, not a running counter
  across the whole crawl (`for page in pages: for i, chunk in
  enumerate(chunk_text(page["text"]))`) — matches the existing convention
  from file ingestion, where `chunk_index` is relative to the one file.

### State at end of session

- `app/core/dedup.py`: `compute_hash(text) -> str`,
  `filter_new_chunks(chunks, tenant_id, source_id) -> list[int]` (returns
  indices of chunks not yet recorded for the tenant; records new hashes via
  upsert-with-ignore-duplicates to survive concurrent calls).
- `app/core/vector_store.py`: `vector_search`'s `output_fields` now includes
  `"url"`.
- `app/worker/tasks.py`: `ingest_url_task(self, source_id, tenant_id, url,
  max_pages=50)` — bound Celery task, `max_retries=3`,
  `default_retry_delay=60`, `autoretry_for=(Exception,)`,
  `retry_backoff=True`. Drives `sources.status` through
  `crawling`/`processing`/`done`/`error`. Existing trivial `add` task (from
  CAN-36) left untouched.
- New `chunk_hashes` table in Supabase's `testing` schema (`hash TEXT,
  tenant_id UUID, source_id UUID`, `PRIMARY KEY (hash, tenant_id)`) — created
  manually via the SQL editor, since the Supabase MCP integration still has
  no access to this project; verified reachable via a throwaway
  insert/select round trip before any test code ran, same pattern as
  CAN-29's schema-permission verification.
- Tests (all passing against live Supabase `testing` schema + live Zilliz +
  live crawl4ai against `https://fastapi.tiangolo.com`, no mocking):
  `tests/core/test_dedup.py` (6), `tests/test_round_trip.py` (+1, now 2
  total), `tests/worker/test_tasks.py` (+3 `ingest_url_task` tests, now 5
  total with the existing `add` tests).
- `ruff check`/`ruff format --check` clean on all changed files.
- Commits: `5696f9f` (dedup helper), `51275bb` (dedup race fix),
  `dce87e3` (vector_search url field), `a1475d3` (ingest_url_task).
- Each task went through one implementer subagent + one task-reviewer
  subagent; only Task 1 needed a fix round (the TOCTOU race above) — Tasks
  2 and 3 reviewed clean on the first pass.
- Outstanding: the ticket's own manual end-to-end verification (dispatch
  `ingest_url_task` via a Python shell against a running `docker compose
  up`/worker, confirm `sources` status progression, ask a question via
  `/chat` to confirm grounded answers cite crawled content) is unrun —
  needs a live worker process, left for the user to run directly rather
  than a subagent.
