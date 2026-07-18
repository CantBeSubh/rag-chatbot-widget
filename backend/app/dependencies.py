from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request

from .core.config import settings
from .core.database import supabase
from .core.logging import get_logger

_logger = get_logger()


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
    allowed_domains = widget_config.get("allowed_domains", [])
    if allowed_domains:
        # The widget runs inside a cross-origin iframe, so the browser's
        # `Origin` header reflects the iframe's own origin, not the origin
        # of the page that embeds it. The embed script (which does run in
        # the parent page) forwards the real parent origin via this header
        # instead; fall back to `Origin` for non-iframe callers.
        origin = raw_request.headers.get(
            "x-widget-parent-origin"
        ) or raw_request.headers.get("origin", "")
        origin_host = (
            origin.replace("https://", "").replace("http://", "").split(":")[0].lower()
        )
        allowed_domains = [domain.lower() for domain in allowed_domains]

        if "*" not in allowed_domains and origin_host not in allowed_domains:
            raise HTTPException(
                status_code=403,
                detail=f"Domain '{origin_host}' is not allowed.",
            )

    widget_config["tenant_id"] = tenant_id
    return widget_config
