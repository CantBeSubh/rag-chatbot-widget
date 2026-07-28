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

worker:
	uv run celery -A app.worker.celery_app worker --loglevel=info --pool=solo

redis:
	docker run --name my-redis -d -p 6379:6379 redis \
		redis-server --user admin on ">admin" "~*" "&*" +@all
