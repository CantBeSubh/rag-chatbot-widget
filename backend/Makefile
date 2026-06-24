.PHONY: dev test lint format format-check fix

dev:
	uv run fastapi dev

test:
	uv run pytest -v

lint:
	uv run ruff check .

format-check:
	uv run ruff format --check .

fix:
	uv run ruff check --fix .

format:
	uv run ruff format .
