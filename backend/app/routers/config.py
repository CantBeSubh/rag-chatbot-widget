from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import supabase
from ..dependencies import get_current_tenant_id


class WidgetConfig(BaseModel):
    bot_name: str
    color: str  # Hex color e.g. "#6366f1"
    placeholder: str
    allowed_domains: list[str]


router = APIRouter(prefix="/config", tags=["widget-config"])


@router.get("")
async def get_widget_config(tenant_id: str = Depends(get_current_tenant_id)) -> dict:

    config = (
        supabase.schema(settings.SUPABASE_SCHEMA)
        .table("widget_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )

    if not config.data:
        return {
            "bot_name": "Assistant",
            "color": "#6366f1",
            "placeholder": "Ask me anything...",
            "allowed_domains": [],
        }

    return config.data


@router.put("")
async def update_widget_config(
    config: WidgetConfig, tenant_id: str = Depends(get_current_tenant_id)
) -> dict:

    supabase.schema(settings.SUPABASE_SCHEMA).table("widget_config").upsert(
        {
            "tenant_id": tenant_id,
            **config.model_dump(),
        }
    ).execute()

    return {"saved": True}
