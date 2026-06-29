import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .core.config import settings
from .core.database import supabase
from .core.limiter import limiter
from .core.logging import configure_logging, get_logger
from .routers import chat, config, health, ingest, logs, sources, tenant

configure_logging()
logger = get_logger()

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            CeleryIntegration(),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment=settings.ENVIRONMENT,
    )

app = FastAPI()

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(config.router)
app.include_router(ingest.router)
app.include_router(chat.router)
app.include_router(sources.router)
app.include_router(logs.router)
app.include_router(tenant.router)
app.include_router(health.router)


@app.on_event("startup")
async def verify_db():
    supabase.schema(settings.SUPABASE_SCHEMA).table("tenants").select("id").limit(1).execute()
    logger.info("db_connected", schema=settings.SUPABASE_SCHEMA)


@app.get("/")
async def root():
    return {"message": "RAG Chatbot Widget API"}
