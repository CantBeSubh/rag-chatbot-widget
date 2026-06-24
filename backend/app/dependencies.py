from typing import Annotated

from fastapi import Header, HTTPException

from .core.config import settings
from .core.database import supabase


def get_current_tenant_id(authorization: Annotated[str, Header()]) -> str:
    api_key = authorization.removeprefix("Bearer ")
    result = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("tenants")
        .select("id")
        .eq("api_key", api_key)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return result.data[0]["id"]
