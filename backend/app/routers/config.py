from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import supabase
from ..dependencies import get_current_tenant_id

_DEFAULT_INSTRUCTIONS = (
    "You are a helpful assistant. Answer the user's question using ONLY the context "
    "provided below. If the answer is not in the context, say "
    '"I don\'t have information about that in my knowledge base."\n\n'
    "Do not make up information. Always be concise and direct."
)


class LLMConfig(BaseModel):
    system_prompt: str
    temperature: float
    max_tokens: int


_DEFAULT_LLM_CONFIG = LLMConfig(
    system_prompt=_DEFAULT_INSTRUCTIONS,
    temperature=0.1,
    max_tokens=1024,
)


class WidgetConfig(BaseModel):
    bot_name: str
    color: str
    background_color: str = "#ffffff"
    placeholder: str
    allowed_domains: list[str]
    llm_config: LLMConfig


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
            "background_color": "#ffffff",
            "placeholder": "Ask me anything...",
            "allowed_domains": [],
            "llm_config": _DEFAULT_LLM_CONFIG.model_dump(),
        }

    data = dict(config.data)
    if not data.get("llm_config"):
        data["llm_config"] = _DEFAULT_LLM_CONFIG.model_dump()
    return data


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
