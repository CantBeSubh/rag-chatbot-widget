## Getting started

After cloning the repo:

```bash
uv sync
source .venv/bin/activate
make dev
```

## Linting & formatting

This project uses [Ruff](https://docs.astral.sh/ruff/) for linting and formatting.

```bash
uv run ruff check .          # lint
uv run ruff format --check . # check formatting
uv run ruff check --fix .    # auto-fix lint issues
uv run ruff format .         # auto-format
```

## Makefile shortcuts

```bash
make dev           # uv run fastapi dev
make lint          # uv run ruff check .
make format-check  # uv run ruff format --check .
make fix           # uv run ruff check --fix .
make format        # uv run ruff format .
```
