FROM python:3.11-slim-bullseye

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy the application into the container.
COPY . /app

# Install the application dependencies.
WORKDIR /app
RUN uv sync --locked --no-cache


# Install Playwright browser + OS dependencies
RUN /app/.venv/bin/playwright install --with-deps chromium

# Run the application.
CMD ["/app/.venv/bin/fastapi", "run", "app/main.py", "--port", "80"]
