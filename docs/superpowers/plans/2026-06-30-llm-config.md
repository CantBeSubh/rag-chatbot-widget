# LLM Config per Tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store LLM settings (system prompt, temperature, max tokens) in a per-tenant `llm_config` JSONB column and surface them in the admin config page.

**Architecture:** The `widget_config` table gains a `llm_config` JSONB column. The backend config router exposes it via existing GET/PUT endpoints. `core/rag.py` reads the values at call time using `llm.bind()` — no LLM re-initialisation, safe for concurrent requests. The admin config page gains a new "LLM Settings" card.

**Tech Stack:** FastAPI + Pydantic, Supabase (JSONB), LangChain (`llm.bind()`), Next.js + React Hook Form + Zod + shadcn/ui

## Global Constraints

- Python imports in backend must be relative (e.g., `from .config import settings`)
- Add Python deps with `uv add` from `backend/` — never `pip install`
- `bun` for all JS package management
- `"use client"` only on `view.tsx`; `logic.ts` and `interface.ts` are never client-marked
- No barrel `index.ts` files in `_components/`
- Number inputs must use `{ valueAsNumber: true }` in `form.register` so Zod receives a number, not a string

---

### Task 1: Database — add `llm_config` column

**Files:**
- No code file; SQL run manually in Supabase SQL editor

**Interfaces:**
- Produces: `widget_config.llm_config` JSONB column, NOT NULL, default applied to all existing rows

- [ ] **Step 1: Run this SQL in the Supabase SQL editor for your project**

```sql
ALTER TABLE widget_config
ADD COLUMN IF NOT EXISTS llm_config JSONB NOT NULL DEFAULT '{
  "system_prompt": "You are a helpful assistant. Answer the user''s question using ONLY the context provided below. If the answer is not in the context, say \"I don''t have information about that in my knowledge base.\"\n\nDo not make up information. Always be concise and direct.",
  "temperature": 0.1,
  "max_tokens": 1024
}'::jsonb;
```

> Note: `''` is the SQL escape for a single quote inside a single-quoted string literal.

- [ ] **Step 2: Verify**

Run in the SQL editor:
```sql
SELECT llm_config FROM widget_config LIMIT 1;
```
Expected: a row with the JSON object above. If the table is empty, the column existing is sufficient.

---

### Task 2: Backend — `LLMConfig` Pydantic model in `config.py`

**Files:**
- Modify: `backend/app/routers/config.py`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `LLMConfig(system_prompt: str, temperature: float, max_tokens: int)`
  - `WidgetConfig.llm_config: LLMConfig`
  - `_DEFAULT_LLM_CONFIG: LLMConfig` (fallback for rows with no stored value)

- [ ] **Step 1: Replace the contents of `backend/app/routers/config.py`**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import supabase
from ..dependencies import get_current_tenant_id

_DEFAULT_INSTRUCTIONS = (
    "You are a helpful assistant. Answer the user's question using ONLY the context "
    'provided below. If the answer is not in the context, say "I don\'t have information '
    'about that in my knowledge base."\n\n'
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
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.routers.config import LLMConfig, WidgetConfig; print('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/config.py
git commit -m "feat: add LLMConfig pydantic model to config router"
```

---

### Task 3: Backend — update `rag.py` to use per-request LLM config

**Files:**
- Modify: `backend/app/core/rag.py`
- Create: `backend/tests/core/test_rag.py`

**Interfaces:**
- Consumes: `llm_config: dict | None` — keys `system_prompt`, `temperature`, `max_tokens`
- Produces:
  - `_build_prompt(instructions: str, context: str, question: str) -> str`
  - `_bound_llm(temperature: float, max_tokens: int)` → `RunnableBinding`
  - `answer(question, collection_name, top_k=5, llm_config=None) -> dict`
  - `answer_stream(question, collection_name, top_k=5, llm_config=None) -> AsyncIterator[dict]`

- [ ] **Step 1: Write the tests**

Create `backend/tests/core/test_rag.py`:

```python
from app.core.rag import _build_prompt, _DEFAULT_INSTRUCTIONS


def test_build_prompt_starts_with_instructions():
    prompt = _build_prompt("Be concise.", "Some context.", "What is X?")
    assert prompt.startswith("Be concise.")


def test_build_prompt_contains_context_block():
    prompt = _build_prompt("Instructions.", "My source text.", "Question?")
    assert "Context:\nMy source text." in prompt


def test_build_prompt_contains_question():
    prompt = _build_prompt("Instructions.", "Context.", "My question?")
    assert "Question: My question?" in prompt


def test_build_prompt_ends_with_answer_label():
    prompt = _build_prompt("Instructions.", "Context.", "Question?")
    assert prompt.strip().endswith("Answer:")


def test_default_instructions_has_no_context_placeholder():
    # instructions-only: the {context} block is appended by _build_prompt, not stored
    assert "{context}" not in _DEFAULT_INSTRUCTIONS


def test_default_instructions_mentions_context():
    assert "context" in _DEFAULT_INSTRUCTIONS.lower()
```

- [ ] **Step 2: Replace the contents of `backend/app/core/rag.py`**

```python
import json
import time
from collections.abc import AsyncIterator

from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_ollama import OllamaLLM

from .config import settings
from .embedder import embed
from .vector_store import vector_search

if settings.ENVIRONMENT == "development":
    llm = OllamaLLM(
        model=settings.LANGCHAIN_OLLAMA_MODEL,
        temperature=0.1,
        base_url=settings.LANGCHAIN_OLLAMA_BASE_URL,
        num_ctx=8192,
    )
else:
    llm = ChatHuggingFace(
        llm=HuggingFaceEndpoint(
            repo_id=settings.LANGCHAIN_HUGGINGFACE_MODEL,
            task="text-generation",
            provider="auto",
            huggingfacehub_api_token=settings.HF_TOKEN,
            max_new_tokens=1024,
        )
    )

_DEFAULT_INSTRUCTIONS = (
    "You are a helpful assistant. Answer the user's question using ONLY the context "
    'provided below. If the answer is not in the context, say "I don\'t have information '
    'about that in my knowledge base."\n\n'
    "Do not make up information. Always be concise and direct."
)
_DEFAULT_TEMPERATURE = 0.1
_DEFAULT_MAX_TOKENS = 1024


def _text(chunk) -> str:
    """Normalize LLM output: OllamaLLM yields plain strings, ChatHuggingFace yields message objects."""
    return chunk.content if hasattr(chunk, "content") else chunk


def _bound_llm(temperature: float, max_tokens: int):
    """Return a per-call RunnableBinding without mutating the global llm."""
    if settings.ENVIRONMENT == "development":
        return llm.bind(temperature=temperature, num_predict=max_tokens)
    return llm.bind(temperature=temperature, max_new_tokens=max_tokens)


def _build_prompt(instructions: str, context: str, question: str) -> str:
    return f"{instructions}\n\nContext:\n{context}\n\nQuestion: {question}\nAnswer:"


def build_context(retrieved_chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        source = chunk["entity"].get("filename") or chunk["entity"].get("url", "unknown")
        text = chunk["entity"]["text"]
        parts.append(f"[Source {i}: {source}]\n{text}")
    return "\n\n---\n\n".join(parts)


def build_sources(retrieved: list[dict]) -> list[dict]:
    return [
        {
            "source_id": r["entity"].get("source_id"),
            "filename": r["entity"].get("filename"),
            "url": r["entity"].get("url"),
            "chunk_index": r["entity"].get("chunk_index"),
            "text": r["entity"].get("text"),
            "score": round(r["distance"], 3),
        }
        for r in retrieved
    ]


def answer(
    question: str,
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> dict:
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question)
    response = _text(_bound_llm(temperature, max_tokens).invoke(prompt))
    latency_ms = int((time.time() - start) * 1000)

    return {
        "answer": response,
        "sources": build_sources(retrieved),
        "latency_ms": latency_ms,
    }


async def answer_stream(
    question: str,
    collection_name: str,
    top_k: int = 5,
    llm_config: dict | None = None,
) -> AsyncIterator[dict]:
    """Yield SSE events: one per token, then a final "done" event."""
    cfg = llm_config or {}
    instructions = cfg.get("system_prompt", _DEFAULT_INSTRUCTIONS)
    temperature = cfg.get("temperature", _DEFAULT_TEMPERATURE)
    max_tokens = cfg.get("max_tokens", _DEFAULT_MAX_TOKENS)

    start = time.time()
    query_vector = embed([question])[0]
    retrieved = vector_search(collection_name, query_vector, top_k=top_k)
    context = build_context(retrieved)
    prompt = _build_prompt(instructions, context, question)

    full_answer = ""
    async for chunk in _bound_llm(temperature, max_tokens).astream(prompt):
        token = _text(chunk)
        full_answer += token
        yield {"data": json.dumps({"type": "token", "content": token})}

    latency_ms = int((time.time() - start) * 1000)
    yield {
        "data": json.dumps(
            {
                "type": "done",
                "answer": full_answer,
                "sources": build_sources(retrieved),
                "latency_ms": latency_ms,
            }
        )
    }
```

- [ ] **Step 3: Verify import**

```bash
cd backend && uv run python -c "from app.core.rag import _build_prompt, answer, answer_stream; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Run rag tests (ask user first per CLAUDE.md)**

```bash
cd backend && uv run pytest tests/core/test_rag.py -v
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/rag.py backend/tests/core/test_rag.py
git commit -m "feat: update rag.py to accept per-request llm_config"
```

---

### Task 4: Backend — pass `llm_config` through `chat.py`

**Files:**
- Modify: `backend/app/routers/chat.py`

**Interfaces:**
- Consumes: `answer(question, collection_name, llm_config=...)` and `answer_stream(...)` from Task 3
- Produces: nothing new — just threads `widget_config["llm_config"]` through

- [ ] **Step 1: Update `backend/app/routers/chat.py`**

```python
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..core.config import settings
from ..core.database import supabase
from ..core.limiter import limiter
from ..core.rag import answer, answer_stream
from ..dependencies import get_widget_config

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str


@router.post("")
@limiter.limit("60/minute")
async def chat(
    request: Request,  # noqa: ARG001
    body: ChatRequest,
    widget_config: Annotated[dict, Depends(get_widget_config)],
):
    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    llm_config = widget_config.get("llm_config")
    result = answer(body.question, collection_name, llm_config=llm_config)
    supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
        {
            "tenant_id": tenant_id,
            "question": body.question,
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
    tenant_id = widget_config.get("tenant_id", "")
    collection_name = f"tenant_{tenant_id.replace('-', '')}"
    llm_config = widget_config.get("llm_config")

    async def event_generator():
        answer_text = ""
        sources: list[dict] = []
        latency_ms = 0

        async for event in answer_stream(body.question, collection_name, llm_config=llm_config):
            payload = json.loads(event["data"])
            if payload["type"] == "done":
                answer_text = payload["answer"]
                sources = payload["sources"]
                latency_ms = payload["latency_ms"]
            yield event

        supabase.schema(settings.SUPABASE_SCHEMA).table("chat_logs").insert(
            {
                "tenant_id": tenant_id,
                "question": body.question,
                "answer": answer_text,
                "sources_cited": sources,
                "latency_ms": latency_ms,
            }
        ).execute()

    return EventSourceResponse(event_generator())
```

- [ ] **Step 2: Verify import**

```bash
cd backend && uv run python -c "from app.routers.chat import router; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/chat.py
git commit -m "feat: thread llm_config from widget_config through chat endpoints"
```

---

### Task 5: Admin — update type layer and server action

**Files:**
- Modify: `admin/src/server/config.ts`

**Interfaces:**
- Produces:
  - `LLMConfig` TypeScript type
  - `WidgetConfig.llm_config: LLMConfig`
  - `getConfig()` fallback includes `llm_config`

- [ ] **Step 1: Replace `admin/src/server/config.ts`**

```ts
"use server"

import { apiFetch } from "./base"

export type LLMConfig = {
  system_prompt: string
  temperature: number
  max_tokens: number
}

export type WidgetConfig = {
  bot_name: string
  color: string
  background_color: string
  placeholder: string
  allowed_domains: string[]
  llm_config: LLMConfig
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  system_prompt:
    "You are a helpful assistant. Answer the user's question using ONLY the context " +
    'provided below. If the answer is not in the context, say "I don\'t have information ' +
    'about that in my knowledge base."\n\nDo not make up information. Always be concise and direct.',
  temperature: 0.1,
  max_tokens: 1024,
}

export async function getConfig(): Promise<WidgetConfig> {
  try {
    const res = await apiFetch("/config")
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`)
    return res.json()
  } catch (error) {
    console.log(error)
    return {
      bot_name: "Your Bot",
      color: "#6366f1",
      background_color: "#ffffff",
      placeholder: "Ask me anything...",
      allowed_domains: [],
      llm_config: DEFAULT_LLM_CONFIG,
    }
  }
}

export async function updateConfig(config: WidgetConfig): Promise<{ saved: boolean }> {
  const result = await apiFetch("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  })
  return result.json()
}
```

- [ ] **Step 2: Check for TS errors**

```bash
cd admin && bun run tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to `config.ts`.

- [ ] **Step 3: Commit**

```bash
git add admin/src/server/config.ts
git commit -m "feat: add LLMConfig type and llm_config field to admin config server action"
```

---

### Task 6: Admin — update Zod schema and form hook

**Files:**
- Modify: `admin/src/views/dashboard/config/interface.ts`
- Modify: `admin/src/views/dashboard/config/logic.ts`

**Interfaces:**
- Consumes: `LLMConfig` from `@/server/config` (Task 5)
- Produces:
  - `schema` with `llm_config: llmConfigSchema`
  - `ConfigFormData` with `llm_config: { system_prompt, temperature, max_tokens }`
  - `useConfigPage` form defaults include `llm_config`

- [ ] **Step 1: Replace `admin/src/views/dashboard/config/interface.ts`**

```ts
import { UseFormReturn } from "react-hook-form"

import { z } from "zod"

import { WidgetConfig } from "@/server/config"

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")

const llmConfigSchema = z.object({
  system_prompt: z.string().min(1, "System prompt is required"),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().int().min(64).max(8192),
})

export const schema = z.object({
  bot_name: z.string().min(1, "Bot name is required").max(50),
  color: hexColor,
  background_color: hexColor,
  placeholder: z.string().min(1, "Placeholder is required").max(100),
  allowed_domains: z.array(z.string()),
  llm_config: llmConfigSchema,
})

export type ConfigFormData = z.infer<typeof schema>

export interface UseConfigPageReturn {
  form: UseFormReturn<ConfigFormData>
  preview: Partial<WidgetConfig>
  onSubmit: (data: ConfigFormData) => Promise<void>
  saving: boolean
  isLoading: boolean
}
```

- [ ] **Step 2: Replace `admin/src/views/dashboard/config/logic.ts`**

```ts
"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

import { zodResolver } from "@hookform/resolvers/zod"

import { getConfig, updateConfig, WidgetConfig } from "@/server/config"

import { ConfigFormData, schema, UseConfigPageReturn } from "./interface"

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant. Answer the user's question using ONLY the context " +
  'provided below. If the answer is not in the context, say "I don\'t have information ' +
  'about that in my knowledge base."\n\nDo not make up information. Always be concise and direct.'

export function useConfigPage(): UseConfigPageReturn {
  const [saving, setSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bot_name: "",
      color: "#6366f1",
      background_color: "#ffffff",
      placeholder: "",
      allowed_domains: [],
      llm_config: {
        system_prompt: DEFAULT_SYSTEM_PROMPT,
        temperature: 0.1,
        max_tokens: 1024,
      },
    },
  })

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true)
      try {
        const config = await getConfig()
        form.reset(config)
      } catch (error) {
        console.error("Failed to load config:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [form])

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedValues = form.watch()

  const [debouncedBotName, setDebouncedBotName] = useState(watchedValues.bot_name)
  const [debouncedPlaceholder, setDebouncedPlaceholder] = useState(watchedValues.placeholder)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBotName(watchedValues.bot_name), 400)
    return () => clearTimeout(t)
  }, [watchedValues.bot_name])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPlaceholder(watchedValues.placeholder), 400)
    return () => clearTimeout(t)
  }, [watchedValues.placeholder])

  const preview: Partial<WidgetConfig> = {
    bot_name: debouncedBotName,
    color: watchedValues.color,
    background_color: watchedValues.background_color,
    placeholder: debouncedPlaceholder,
    allowed_domains: watchedValues.allowed_domains,
  }

  const onSubmit = async (data: ConfigFormData) => {
    setSaving(true)
    try {
      await updateConfig(data)
    } catch (error) {
      console.error("Failed to save config:", error)
    } finally {
      setSaving(false)
    }
  }

  return {
    form,
    preview,
    onSubmit,
    saving,
    isLoading,
  }
}
```

- [ ] **Step 3: Check for TS errors**

```bash
cd admin && bun run tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/views/dashboard/config/interface.ts admin/src/views/dashboard/config/logic.ts
git commit -m "feat: add llm_config to config form schema and hook"
```

---

### Task 7: Admin — add LLM Settings card to config view

**Files:**
- Modify: `admin/src/views/dashboard/config/view.tsx`

**Interfaces:**
- Consumes: `form.register("llm_config.system_prompt")`, `form.register("llm_config.temperature", { valueAsNumber: true })`, `form.register("llm_config.max_tokens", { valueAsNumber: true })` — all available after Task 6
- Produces: rendered LLM Settings card between Security and Save button

- [ ] **Step 1: Add `Bot` to the lucide-react import and `Textarea` to the ui imports in `view.tsx`**

Find the existing lucide import line:
```ts
import { Loader2, Monitor, Palette, Settings2, ShieldCheck } from "lucide-react"
```
Replace with:
```ts
import { Bot, Loader2, Monitor, Palette, Settings2, ShieldCheck } from "lucide-react"
```

Find the existing shadcn Input import line (or wherever `Input` is imported):
```ts
import { Input } from "@/components/ui/input"
```
Replace with:
```ts
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
```

- [ ] **Step 2: Add the LLM Settings card to the form in `view.tsx`**

Find the Security card closing tag followed by the save button div:
```tsx
          </Card>

          <div className="pt-2">
```
Replace with:
```tsx
          </Card>

          {/* LLM Settings */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={Bot}
                title="LLM Settings"
                description="Control the model's behavior when generating answers"
              />
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!errors.llm_config?.system_prompt}>
                  <FieldLabel htmlFor="system_prompt">System Prompt</FieldLabel>
                  <Textarea
                    id="system_prompt"
                    {...form.register("llm_config.system_prompt")}
                    rows={5}
                    placeholder="You are a helpful assistant..."
                    className="resize-y"
                  />
                  <FieldDescription>
                    Persona and behavior instructions. The knowledge-base context is always appended automatically.
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.system_prompt]} />
                </Field>

                <Field data-invalid={!!errors.llm_config?.temperature}>
                  <FieldLabel htmlFor="temperature">Temperature</FieldLabel>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    {...form.register("llm_config.temperature", { valueAsNumber: true })}
                  />
                  <FieldDescription>
                    Controls randomness — 0 is deterministic, higher values are more creative (max 2).
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.temperature]} />
                </Field>

                <Field data-invalid={!!errors.llm_config?.max_tokens}>
                  <FieldLabel htmlFor="max_tokens">Max Tokens</FieldLabel>
                  <Input
                    id="max_tokens"
                    type="number"
                    min={64}
                    max={8192}
                    step={1}
                    {...form.register("llm_config.max_tokens", { valueAsNumber: true })}
                  />
                  <FieldDescription>
                    Maximum number of tokens the model may generate per response (64–8192).
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.max_tokens]} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className="pt-2">
```

- [ ] **Step 3: Check for TS errors**

```bash
cd admin && bun run tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 4: Run the linter**

```bash
cd admin && bun run lint 2>&1 | tail -20
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add admin/src/views/dashboard/config/view.tsx
git commit -m "feat: add LLM Settings card to config page"
```

---

## Self-Review Checklist

- [x] Database column default matches `_DEFAULT_LLM_CONFIG` in config.py and `DEFAULT_LLM_CONFIG` in config.ts
- [x] GET endpoint guards against `llm_config: null` (pre-migration rows)
- [x] `_bound_llm` uses env-specific param names (`num_predict` for Ollama, `max_new_tokens` for HF)
- [x] `valueAsNumber: true` on number inputs — number inputs return strings from DOM
- [x] `form.register("llm_config.system_prompt")` — RHF supports dot-path notation for nested objects
- [x] No barrel files introduced
- [x] `"use client"` not added to `interface.ts` or `logic.ts`
- [x] SYSTEM_PROMPT constant removed from rag.py; `_DEFAULT_INSTRUCTIONS` replaces it
- [x] `answer_stream` gets the same `llm_config` param as `answer`
