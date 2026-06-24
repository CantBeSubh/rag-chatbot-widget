# CLAUDE.md

## Dev log
- Keep `docs/dev-log.md` updated with notable observations, bugs, and decisions as work happens — don't wait to be asked.

## Backend (FastAPI, in `backend/`)
- Run `make dev` (or `uv run fastapi dev`) from `backend/`. This imports the app as the `app` package with `backend/` on `sys.path` — internal modules must use relative imports (`from .config import settings`), not absolute (`from core.config import settings`), or they'll fail at runtime only.
- To catch import errors the way `fastapi dev` would hit them: `cd backend && uv run python -c "import app.main"`. Don't manually prepend `app/` to `sys.path` for testing — it hides real import bugs.
- uvicorn/`fastapi dev` does not configure the root logger — only its own `uvicorn`/`uvicorn.error`/`uvicorn.access` loggers (`propagate=False`). Use `app/core/logging.py`'s `setup_logging()` so app-level `logger.info()` calls are actually visible.
- This project's Supabase keys use the new `sb_secret_...`/`sb_publishable_...` format, not legacy long JWTs — don't treat these as malformed.
- Querying a non-`public` Postgres schema via Supabase needs two separate steps: expose it in Project Settings → Data API → Exposed schemas, AND `GRANT USAGE`/`GRANT ALL` (+ `ALTER DEFAULT PRIVILEGES`) to `anon`/`authenticated`/`service_role`. Exposing alone isn't sufficient (yields `42501 permission denied`).
- The connected Supabase MCP integration doesn't have access to this project (`mhgmepexsspwwtndrvso`) — `list_projects` only shows unrelated projects. Do schema/SQL changes for this project manually via the dashboard/SQL editor.
- Add Python deps with `uv add <package>` from `backend/` (updates `pyproject.toml` + `uv.lock` together).
- Don't run the test suite (`uv run pytest` / `make test`) on your own initiative — ask first. Lint/format checks (`ruff check`, `ruff format --check`) are fine to run freely.
