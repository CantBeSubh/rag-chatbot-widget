
FROM python:3.11-slim-bullseye

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy the application into the container.
COPY . /app

# Install the application dependencies.
WORKDIR /app
RUN uv sync --locked --no-cache

# Run the worker.
CMD ["/app/.venv/bin/celery", "-A", "app.worker.celery_app", "worker", "--loglevel=info"]
