import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..core.config import settings
from ..core.database import supabase
from ..core.limiter import limiter
from ..core.rag import answer, answer_stream
from ..dependencies import get_widget_config

router = APIRouter(prefix="/chat", tags=["chat"])


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


@router.post("")
@limiter.limit("60/minute")
async def chat(
    request: Request,  # noqa: ARG001
    body: ChatRequest,
    widget_config: Annotated[dict, Depends(get_widget_config)],
):
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(
            status_code=422,
            detail="messages must be non-empty and end with a user message",
        )

    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    llm_config = widget_config.get("llm_config")
    messages = [m.model_dump() for m in body.messages]
    result = answer(messages, collection_name, llm_config=llm_config)
    supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
        {
            "tenant_id": tenant_id,
            "question": messages[-1]["content"],
            "answer": result["answer"],
            "sources_cited": result["sources"],
            "latency_ms": result["latency_ms"],
        }
    ).execute()

    return result


@router.post("/stream")
@limiter.limit("60/minute")
async def chat_stream(
    request: Request,  # noqa: ARG001
    body: ChatRequest,
    widget_config: Annotated[dict, Depends(get_widget_config)],
):
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(
            status_code=422,
            detail="messages must be non-empty and end with a user message",
        )

    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    llm_config = widget_config.get("llm_config")
    messages = [m.model_dump() for m in body.messages]

    async def event_generator():
        answer_text = ""
        sources: list[dict] = []
        latency_ms = 0

        async for event in answer_stream(
            messages, collection_name, llm_config=llm_config
        ):
            payload = json.loads(event["data"])
            if payload["type"] == "done":
                answer_text = payload["answer"]
                sources = payload["sources"]
                latency_ms = payload["latency_ms"]
            yield event

        supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
            {
                "tenant_id": tenant_id,
                "question": messages[-1]["content"],
                "answer": answer_text,
                "sources_cited": sources,
                "latency_ms": latency_ms,
            }
        ).execute()

    return EventSourceResponse(event_generator())
