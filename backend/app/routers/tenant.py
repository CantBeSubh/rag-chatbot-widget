from fastapi import APIRouter, Depends, HTTPException

from app.core.vector_store import delete_collection

from ..core.config import settings
from ..core.database import supabase
from ..dependencies import get_current_tenant_id

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("")
async def get_tenant(tenant_id: str = Depends(get_current_tenant_id)) -> dict:

    tenant = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("*")
        .eq("id", tenant_id)
        .single()
        .execute()
    )

    if not tenant.data:
        raise HTTPException(status_code=404, detail="tenant not found")

    return tenant.data


@router.delete("")
async def delete_tenant(tenant_id: str = Depends(get_current_tenant_id)) -> None:
    tenant = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("*")
        .eq("id", tenant_id)
        .single()
        .execute()
    )

    if not tenant.data:
        raise HTTPException(status_code=404, detail="tenant not found")

    collection_name = f"tenant_{tenant_id.replace('-', '')}"

    delete_collection(collection_name=collection_name)
    (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .delete()
        .eq("id", tenant_id)
        .execute()
    )
    return None
