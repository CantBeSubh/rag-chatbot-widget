# Widget Config Screen Design

**Ticket:** CAN-44 — M3-D4: Widget config screen — live preview + form  
**Date:** 2026-06-26  
**Status:** Approved

## Summary

A `/dashboard/config` page where clients customize their chatbot's appearance and behavior. The left column holds the form; the right column shows a live preview that updates in real time as the user types. Save commits to the backend.

---

## Backend

### What already exists

- `backend/app/routers/config.py` — GET and PUT `/config` endpoints exist but have two bugs:
  1. Missing `from pydantic import BaseModel` import (causes startup crash)
  2. Not registered in `main.py` (router is never mounted)
- `widget_config` Supabase table already exists with `tenant_id`, `bot_name`, `color`, `placeholder`, `allowed_domains` columns

### Changes needed

1. Add `from pydantic import BaseModel` to `config.py`
2. Import `config` router and call `app.include_router(config.router)` in `main.py`

No schema migrations required.

---

## Frontend

### New dependencies

```
react-hook-form
@hookform/resolvers
zod
```

### File structure

```
src/
  server/config.ts                              # server actions
  components/widget-preview.tsx                 # shared live preview component
  views/dashboard/config/
    logic.ts                                    # useConfigPage hook
    view.tsx                                    # two-column layout
    _components/
      allowed-domains-input/
        interface.ts                            # AllowedDomainsInputProps type
        view.tsx                                # tag chip input component
  app/dashboard/config/page.tsx                 # thin wrapper (renders ConfigView)
```

### `src/server/config.ts`

Server actions (`"use server"`) following the same `apiFetch` pattern as `sources.ts`:

- `getConfig(): Promise<WidgetConfig>` — GET `/config`, returns defaults if 404/empty
- `updateConfig(config: WidgetConfig): Promise<{ saved: boolean }>` — PUT `/config`

Exports `WidgetConfig` type matching the backend model.

### Zod schema

```ts
const schema = z.object({
  bot_name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  placeholder: z.string().min(1).max(100),
  allowed_domains: z.array(z.string()),
})
```

### `views/dashboard/config/logic.ts` — `useConfigPage`

- `useQuery(["config"], getConfig)` to load current settings
- `useForm({ resolver: zodResolver(schema) })` initialized; `form.reset(data)` on query success
- `form.watch()` to get live values for the preview pane
- `useMutation` wrapping `updateConfig`; sets `saving` state
- Returns: `{ form, preview, onSubmit, saving, isLoading }`

### `views/dashboard/config/view.tsx` — `ConfigView`

Two-column layout (`grid grid-cols-[1fr_auto] gap-8`):

**Left — form fields:**
1. **Bot Name** — plain `<Input>` via `register("bot_name")`
2. **Primary Color** — `<input type="color">` + text `<Input>` side by side, both bound to the same field; color picker updates the text box and vice versa via `setValue`
3. **Placeholder Text** — plain `<Input>` via `register("placeholder")`
4. **Allowed Domains** — `<AllowedDomainsInput>` receiving `value={form.watch("allowed_domains")}` and `onChange={(domains) => form.setValue("allowed_domains", domains)}`
5. **Save Changes** button — disabled while saving, shows spinner

**Right — live preview:**
- `<WidgetPreview config={preview} />` where `preview = form.watch()`

### `components/widget-preview.tsx` — `WidgetPreview`

Static mockup (not an iframe). Accepts `config: Partial<WidgetConfig>` with fallbacks:

```
┌─────────────────────────┐
│ [bot_name]              │  ← colored header
├─────────────────────────┤
│ Hi! I'm [bot_name]...   │  ← sample message bubble
│                         │
│                         │
├─────────────────────────┤
│ [placeholder]           │  ← input area
└─────────────────────────┘ 💬  ← colored bubble button
```

All color applied via inline `style={{ background: config.color }}`. Fallback: `#6366f1` if color is empty/invalid.

### `_components/allowed-domains-input/view.tsx` — `AllowedDomainsInput`

Controlled component — no logic hook (simple enough to inline):

- Props: `value: string[]`, `onChange: (domains: string[]) => void`
- Local state: `inputValue` for the text field being typed
- On Enter / clicking Add: validate hostname format (`/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`), append to `value`, call `onChange`
- Each domain renders as a chip with an `×` button to remove it
- Shows validation error inline if format is wrong

### `app/dashboard/config/page.tsx`

```tsx
import { ConfigView } from "@/views/dashboard/config/view"
export default function ConfigPage() {
  return <ConfigView />
}
```

---

## Done when

- Config form loads current settings on mount
- Changing any field updates the preview immediately (no save required)
- Color picker and hex input stay in sync
- Adding/removing a domain chip updates the `allowed_domains` field
- Save button commits to backend; refresh persists settings
- Zod validation shows inline errors on bad input
