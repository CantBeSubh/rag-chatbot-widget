# rag-chatbot-widget

## Structure

- `backend/` — FastAPI backend, managed with [uv](https://docs.astral.sh/uv/). See `backend/README.md` for backend-specific docs (linting, formatting, Makefile shortcuts).

## Setup

```bash
bun install   # installs root dev tooling (husky) and activates git hooks
cd backend
uv sync       # installs backend dependencies
```

## Git hooks

This repo uses [Husky](https://typicode.github.io/husky/) for git hooks. After `bun install`, a `pre-commit` hook runs Ruff lint and format checks against `backend/` before every commit (see `.husky/pre-commit`).
