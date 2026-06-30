from fastapi import APIRouter, Depends, HTTPException, Request

from ..core.config import settings
from ..core.database import supabase
from ..core.limiter import limiter
from ..core.vector_store import delete_by_source
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
@limiter.limit("120/minute")
async def list_sources(
    request: Request,  # noqa: ARG001
    tenant_id: str = Depends(get_current_tenant_id),
) -> list[dict]:
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("sources")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("ingested_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{source_id}")
@limiter.limit("120/minute")
async def get_source(
    request: Request,  # noqa: ARG001
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
) -> dict:
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("sources")
        .select("*")
        .eq("id", source_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Source not found")
    return result.data[0]


@router.delete("/{source_id}")
@limiter.limit("120/minute")
async def delete_source(
    request: Request,  # noqa: ARG001
    source_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
) -> dict:
    schema = supabase.schema(settings.SUPABASE_SCHEMA)

    existing = (
        schema.table("sources")
        .select("id")
        .eq("id", source_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Source not found")

    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    delete_by_source(collection_name, source_id)

    schema.table("chunk_hashes").delete().eq("source_id", source_id).execute()
    schema.table("sources").delete().eq("id", source_id).execute()

    return {"deleted": source_id}
