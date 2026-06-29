import time

import redis
from fastapi import APIRouter

from ..core.config import settings
from ..core.database import supabase
from ..core.vector_store import client as zilliz_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    checks: dict[str, str] = {}
    overall = "ok"

    # Supabase
    try:
        supabase.schema(settings.SUPABASE_SCHEMA).table("tenants").select("id").limit(1).execute()
        checks["supabase"] = "ok"
    except Exception as e:
        checks["supabase"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    # Redis
    try:
        with redis.from_url(settings.REDIS_URL) as r:
            r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    # Zilliz (pymilvus MilvusClient)
    try:
        zilliz_client.list_collections()
        checks["zilliz"] = "ok"
    except Exception as e:
        checks["zilliz"] = f"error: {str(e)[:100]}"
        overall = "degraded"

    return {"status": overall, "checks": checks, "ts": int(time.time())}
