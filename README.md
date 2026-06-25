# rag-chatbot-widget

## Structure

- `backend/` — FastAPI backend, managed with [uv](https://docs.astral.sh/uv/). See `backend/README.md` for backend-specific docs (linting, formatting, Makefile shortcuts).
  - `backend/app/worker/` — Celery worker (`celery_app.py`, `tasks.py`) for async jobs, backed by Redis. Built/run via `backend/worker.dockerfile`.
- `widget/` — embeddable chat widget (TypeScript, managed with [bun](https://bun.sh/)). See `widget/README.md` for widget-specific docs.

## Setup

```bash
bun install   # installs root dev tooling (husky) and activates git hooks
cd backend
uv sync       # installs backend dependencies
```

## Git hooks

This repo uses [Husky](https://typicode.github.io/husky/) for git hooks. After `bun install`, a `pre-commit` hook runs Ruff lint and format checks against `backend/` before every commit (see `.husky/pre-commit`).
