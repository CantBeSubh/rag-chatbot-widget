import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import supabase
from .core.logging import setup_logging
from .routers import chat, ingest

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(ingest.router)
app.include_router(chat.router)


@app.on_event("startup")
async def verify_db():
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("id")
        .limit(1)
        .execute()
    )
    logger.info(f"Supabase connected to {settings.SUPABASE_SCHEMA} schema: {result}")


@app.get("/")
async def root():
    return {"message": "RAG Chatbot Widget API"}
