from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request

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


def get_widget_config(
    raw_request: Request,
    tenant_id: Annotated[str, Depends(get_current_tenant_id)],
) -> dict[str, Any]:
    # TODO: Remove logs
    print(raw_request.headers)
    config = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("widget_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )

    if not config.data:
        raise HTTPException(status_code=409, detail="Widget not configured")

    widget_config = config.data or {}

    # TODO: Remove logs
    print(
        widget_config,
    )
    allowed_domains = widget_config.get("allowed_domains", [])
    if allowed_domains:
        origin = raw_request.headers.get("origin", "")

        origin_host = (
            origin.replace("https://", "").replace("http://", "").split(":")[0].lower()
        )

        # TODO: Remove logs
        print(origin_host, origin)
        allowed_domains = [domain.lower() for domain in allowed_domains]

        if origin_host not in allowed_domains:
            raise HTTPException(
                status_code=403,
                detail=f"Domain '{origin_host}' is not allowed.",
            )

    widget_config["tenant_id"] = tenant_id

    return widget_config
