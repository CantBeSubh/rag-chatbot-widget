# Celery + Redis Async Task Worker Design (CAN-36)

## Context

CAN-36 (M2-D1, parent: CAN-23 "M2: URL Crawl Ingestion") asks for the async
task infrastructure that will let crawl jobs (CAN-37+) run in a background
worker process instead of blocking an HTTP request — crawling 50 pages,
chunking, and embedding can take 2-10 minutes, far past what a client/browser
will wait on. Celery is the worker framework; Redis is both the message
broker (queue) and result backend (status/result store). This ticket proves
the wiring end-to-end with a dummy `add(x, y)` task — the real crawl task
arrives in a later ticket.

The ticket's sample code assumes Poetry and a top-level `backend/worker/`
package using absolute imports (`from core.config import settings`). This
repo uses `uv`, not Poetry, and `CLAUDE.md` requires relative imports because
the app runs as the `app` package with `backend/` on `sys.path` — an
absolute `from core.config import settings` would only fail at runtime, not
at edit time. The decisions below adapt the ticket's intent to both
conventions.

## Decisions

- **Worker lives inside the `app` package**: `app/worker/`, not a top-level
  `backend/worker/`. Same relative-import style as `app/core/` and
  `app/routers/` (`from ..core.config import settings`), one Python package,
  no `sys.path` surprises.
- **Dependency: `celery[redis]`**, not separate `celery` + `redis` packages —
  the `[redis]` extra pins a `redis` client version Celery is tested against,
  installed via `uv add "celery[redis]"` from `backend/`.
- **`REDIS_URL` already exists** in `app/core/config.py` and `.env.example`
  (added speculatively in earlier work, unused until now) — no config changes
  needed, just actually consuming it.
- **docker-compose scope: `redis` + `worker` + `redis-commander` only**, not
  `api`. No `docker-compose.yml` exists anywhere in this repo today — Railway
  deploys (CAN-35) were configured directly via dashboard. The FastAPI `api`
  keeps running locally via `make dev` / `uv run fastapi dev` per `CLAUDE.md`;
  it only needs Redis reachable on `localhost:6379`, which the compose file's
  port mapping provides without containerizing `api` itself.
- **`backend/docker-compose.yml`** (not repo-root) — keeps the build context
  as `.`, reusing the existing `backend/Dockerfile` with no path adjustments,
  since this infra is backend-only (the widget has no use for it).
- **Redis Commander added** as a third compose service — a web UI for
  inspecting queues/keys during local dev, at `localhost:8081`. Local-dev-only,
  not part of the Railway deploy.
- **Testing: two real tests, no mocking**, consistent with this repo's
  established pattern of testing against live external infra (Supabase,
  Zilliz) rather than mocks:
  1. An eager-mode test (`task_always_eager=True`) — runs the task
     synchronously in-process, no live Redis required.
  2. A non-eager test — calls `add.delay()` against the real broker at
     `settings.REDIS_URL` and blocks on `result.get(timeout=10)` for an
     actual Celery worker to process it. **Requires `docker compose up`
     (redis + worker) already running before `pytest` starts**; the 10s
     timeout turns "no worker running" into a clear test failure instead of
     an indefinite hang.
- **Makefile gets a `worker` target**, alongside the existing
  `dev`/`test`/`lint`/`format`/`fix` targets, for `uv run celery -A
  app.worker.celery_app worker --loglevel=info`.

## File layout

```
backend/
├── docker-compose.yml        # redis, worker, redis-commander
├── Makefile                  # + worker target
├── app/
│   └── worker/
│       ├── __init__.py
│       ├── celery_app.py     # Celery() instance
│       └── tasks.py          # dummy add(x, y) task
└── tests/
    └── worker/
        └── test_tasks.py      # eager + non-eager tests
```

## Components

**`app/worker/celery_app.py`**
```python
from celery import Celery

from ..core.config import settings

celery_app = Celery(
    "rag_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)
```

**`app/worker/tasks.py`**
```python
import time

from .celery_app import celery_app


@celery_app.task(bind=True)
def add(self, x: int, y: int) -> int:
    time.sleep(2)
    return x + y
```

**`backend/docker-compose.yml`**
```yaml
services:
  worker:
    build: .
    volumes: ["./app:/app/app"]
    env_file: .env
    command: uv run celery -A app.worker.celery_app worker --loglevel=info
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      - REDIS_HOSTS=local:redis:6379
    ports: ["8081:8081"]
    depends_on: [redis]
```

**`Makefile`** — add:
```makefile
worker:
	uv run celery -A app.worker.celery_app worker --loglevel=info
```

## Data flow

1. `worker` container (or `make worker` locally) starts, connects to Redis at
   `settings.REDIS_URL` as both broker and result backend, registers
   `app.worker.tasks.add` via the `include` list.
2. A caller imports `add` and calls `add.delay(2, 3)` — this serializes the
   call to JSON and publishes it to the Redis queue. `.delay()` returns
   immediately with an `AsyncResult` (status `PENDING`).
3. The worker process picks the message off the queue, runs `add(2, 3)`
   (sleeping 2s to simulate real work), and writes the result (`5`) back to
   Redis under the task's ID.
4. The caller's `AsyncResult.get()` polls/blocks until the result backend has
   a value, then returns `5`.

This is the full pattern the real crawl task (later ticket) will reuse: API
enqueues, responds immediately with a job ID, worker processes in the
background, client polls status separately.

## Error handling

Out of scope for this ticket — `add` has no failure modes worth handling
(it's a dummy task). Retry policy, task failure states, and dead-letter
handling are deferred to when the real crawl task is built, where failures
(unreachable URL, parse errors) are actually meaningful.

## Testing & verification

**`tests/worker/test_tasks.py`**
```python
from app.core.config import settings
from app.worker.celery_app import celery_app
from app.worker.tasks import add


def test_add_runs_synchronously_in_eager_mode():
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    result = add.delay(2, 3)
    assert result.get() == 5


# Requires `docker compose up` (redis + worker) running before pytest starts —
# this hits the real broker, not eager mode, and will time out otherwise.
def test_add_round_trips_through_real_broker_when_not_eager():
    celery_app.conf.update(task_always_eager=False)
    result = add.delay(2, 3)
    assert result.get(timeout=10) == 5
```

**Manual verification checklist:**
- `cd backend && docker compose up` starts `worker`, `redis`, and
  `redis-commander` with no errors.
- `redis-commander` UI at `localhost:8081` shows the Redis instance connected.
- `uv run pytest tests/worker/` passes with the compose stack running.
- Worker container logs show the task received, started, and succeeded for
  both manual and test-triggered runs.
- `ruff check` / `ruff format --check` clean.

## Out of scope (deferred to later tickets)

- The real crawl task (fetch/chunk/embed) — a later M2 ticket.
- Job status API endpoint for clients to poll task progress — a later ticket.
- Railway worker service deployment — explicitly deferred to M2-D4 per the
  ticket text.
- Retry/failure handling, dead-letter queues, task time limits.
