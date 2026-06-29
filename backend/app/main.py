from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .core.config import settings
from .core.database import supabase
from .core.limiter import limiter
from .core.logging import configure_logging, get_logger
from .routers import chat, config, ingest, logs, sources, tenant

configure_logging()
logger = get_logger()

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


@app.on_event("startup")
async def verify_db():
    supabase.schema(settings.SUPABASE_SCHEMA).table("tenants").select("id").limit(1).execute()
    logger.info("db_connected", schema=settings.SUPABASE_SCHEMA)


@app.get("/")
async def root():
    return {"message": "RAG Chatbot Widget API"}


@app.get("/health")
@limiter.exempt
async def health():
    return {"status": "ok"}
