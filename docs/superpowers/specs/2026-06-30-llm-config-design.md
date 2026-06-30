# LLM Config per Tenant

**Date:** 2026-06-30
**Status:** Approved

## Overview

Add a `llm_config` JSONB column to the `widget_config` table so each tenant can configure the LLM behavior (system prompt instructions, temperature, max tokens) through the admin UI. The backend reads these values at request time and applies them without re-initializing the LLM.

## Database

Add one column to `widget_config`:

```sql
ALTER TABLE widget_config
ADD COLUMN llm_config JSONB NOT NULL DEFAULT '{
  "system_prompt": "You are a helpful assistant. Answer the user''s question using ONLY the context provided below. If the answer is not in the context, say \"I don''t have information about that in my knowledge base.\"\n\nDo not make up information. Always be concise and direct.",
  "temperature": 0.1,
  "max_tokens": 1024
}'::jsonb;
```

Existing rows that already have `bot_name` etc. but no `llm_config` receive the column default automatically.

## Backend

### `routers/config.py`

Add a `LLMConfig` Pydantic model and nest it in `WidgetConfig`:

```python
class LLMConfig(BaseModel):
    system_prompt: str
    temperature: float   # 0.0 – 2.0
    max_tokens: int      # 64 – 8192

class WidgetConfig(BaseModel):
    ...existing fields...
    llm_config: LLMConfig
```

The GET endpoint returns the full row (including `llm_config`). When no row exists the fallback dict gains the same default. The PUT endpoint already does `**config.model_dump()` so `llm_config` is serialised as JSON automatically by Supabase's Python client.

### `core/rag.py`

`answer()` and `answer_stream()` gain an optional `llm_config: dict | None = None` parameter.

**Prompt construction** — instructions-only approach: the stored `system_prompt` is just the persona/behavior text. The backend always appends the context block:

```
{instructions}

Context:
{context}

Question: {question}
Answer:
```

**LLM binding** — a helper builds a per-call `RunnableBinding` without touching the global `llm`:

```python
def _bound_llm(temperature: float, max_tokens: int):
    if settings.ENVIRONMENT == "development":
        return llm.bind(temperature=temperature, num_predict=max_tokens)
    return llm.bind(temperature=temperature, max_new_tokens=max_tokens)
```

Called as `_bound_llm(...).invoke(prompt)` / `.astream(prompt)`. The global `llm` object is never mutated, so concurrent requests are safe — each gets its own ephemeral `RunnableBinding`.

Fallback defaults (used when `llm_config` is `None` or a key is missing):
- `system_prompt`: the existing `SYSTEM_PROMPT` constant (stripped of the `Context:` block)
- `temperature`: `0.1`
- `max_tokens`: `1024`

### `routers/chat.py`

Extract `llm_config` from the already-fetched `widget_config` dict and pass it down:

```python
llm_config = widget_config.get("llm_config")
result = answer(body.question, collection_name, llm_config=llm_config)
```

Same for `answer_stream`.

## Admin UI

### Type layer (`server/config.ts`)

```ts
export type LLMConfig = {
  system_prompt: string
  temperature: number
  max_tokens: number
}

export type WidgetConfig = {
  ...existing fields...
  llm_config: LLMConfig
}
```

### Validation (`views/dashboard/config/interface.ts`)

```ts
const llmConfigSchema = z.object({
  system_prompt: z.string().min(1, "System prompt is required"),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().int().min(64).max(8192),
})

export const schema = z.object({
  ...existing fields...
  llm_config: llmConfigSchema,
})
```

### Hook (`views/dashboard/config/logic.ts`)

Add default values:

```ts
defaultValues: {
  ...existing fields...
  llm_config: {
    system_prompt: "You are a helpful assistant...",
    temperature: 0.1,
    max_tokens: 1024,
  },
}
```

### View (`views/dashboard/config/view.tsx`)

New **LLM Settings** card between Security and the Save button, using the `Bot` (or `Cpu`) lucide icon:

| Field | Component | Constraints | Description text |
|---|---|---|---|
| System Prompt | `<Textarea>` rows=5 | min 1 char | "Persona and behavior instructions. The knowledge-base context is always appended automatically." |
| Temperature | `<Input type="number">` | 0–2, step 0.01 | "Controls randomness — 0 is deterministic, higher values are more creative." |
| Max Tokens | `<Input type="number">` | 64–8192, step 1 | "Maximum number of tokens the LLM may generate per response." |

Fields are registered with nested paths (`llm_config.system_prompt` etc.) using `form.register`. Number inputs (`temperature`, `max_tokens`) must use `form.register("llm_config.temperature", { valueAsNumber: true })` so react-hook-form coerces the DOM string to a number before Zod validation runs.

## Error handling

- If the Supabase row has no `llm_config` key (pre-migration rows before the column default applies), the GET endpoint returns the fallback object.
- Validation in the admin form prevents out-of-range values reaching the backend.
- `_bound_llm` falls back to module-level defaults if `llm_config` is `None`.

## Out of scope

- Streaming preview of prompt changes in the admin UI.
- Per-collection LLM config (one config per tenant is sufficient).
- Validating that the stored `system_prompt` doesn't contain adversarial instructions.
