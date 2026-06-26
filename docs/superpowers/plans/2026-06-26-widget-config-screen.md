# Widget Config Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/dashboard/config` page where clients customize their chatbot's appearance and behavior with a live preview that updates in real time.

**Architecture:** 
- Backend: Fix existing config router (add missing imports, register in main.py)
- Frontend: Create two-column layout (form + live preview) using react-hook-form + zod for validation
- Server actions handle getConfig/updateConfig via existing backend endpoints
- Form watches values in real-time to drive preview updates; color picker and hex input stay bidirectionally synced
- AllowedDomainsInput sub-component manages domain chips with inline validation

**Tech Stack:** 
- Backend: FastAPI (existing), Supabase (widget_config table exists)
- Frontend: React 18, Next.js 16, react-hook-form, @hookform/resolvers, zod, TailwindCSS (existing), shadcn/ui (existing)

## Global Constraints

- Backend uses relative imports (`from .config import settings`), not absolute
- New Supabase keys format: `sb_secret_...`/`sb_publishable_...` (not legacy JWTs)
- Use bun for all Node.js/npm tasks (per project instructions)
- `WidgetConfig` type must match backend Pydantic model exactly
- Zod schema field names must match backend field names: `bot_name`, `color`, `placeholder`, `allowed_domains`
- Color input must support bidirectional sync between picker and hex text field via `form.setValue()`
- Domain validation regex: `/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`
- Fallback color when empty/invalid: `#6366f1`

---

## File Structure

**Backend (2 files modified):**
- `backend/app/routers/config.py` — Fix import + endpoint definitions (already exist, just need import fix)
- `backend/app/main.py` — Register config router

**Frontend (7 files created, 1 file modified):**
- `admin/package.json` — Add dependencies
- `admin/src/server/config.ts` — Server actions (getConfig, updateConfig)
- `admin/src/components/widget-preview.tsx` — Reusable live preview mockup
- `admin/src/views/dashboard/config/logic.ts` — useConfigPage hook
- `admin/src/views/dashboard/config/view.tsx` — ConfigView two-column layout
- `admin/src/views/dashboard/config/_components/allowed-domains-input/interface.ts` — Type definitions
- `admin/src/views/dashboard/config/_components/allowed-domains-input/view.tsx` — AllowedDomainsInput controlled component
- `admin/src/app/dashboard/config/page.tsx` — Page wrapper

---

## Task 1: Fix Backend Config Router

**Files:**
- Modify: `backend/app/routers/config.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: GET `/config` endpoint, PUT `/config` endpoint (both already exist in code, just need registration)

- [ ] **Step 1: Add missing import to config.py**

Open `backend/app/routers/config.py`. Add this line at the top (after other imports):

```python
from pydantic import BaseModel
```

The complete import section should look like:
```python
from fastapi import APIRouter
from pydantic import BaseModel
# ... rest of imports
```

- [ ] **Step 2: Register config router in main.py**

Open `backend/app/main.py`. Find the section where other routers are included (look for `app.include_router` calls). Add this line:

```python
from app.routers import config

# ... in the app initialization section:
app.include_router(config.router)
```

If there's an existing imports block for routers, add the import there. If not, add it with the other router imports.

- [ ] **Step 3: Verify backend can start**

Run from `backend/` directory:
```bash
cd backend && uv run python -c "import app.main"
```

Expected: No errors. If you see import errors, fix them before proceeding.

- [ ] **Step 4: Commit backend changes**

```bash
git add backend/app/routers/config.py backend/app/main.py
git commit -m "fix: add BaseModel import and register config router in FastAPI app"
```

---

## Task 2: Add Frontend Dependencies

**Files:**
- Modify: `admin/package.json`

**Interfaces:**
- Produces: Dependencies installed and available for import

- [ ] **Step 1: Add new dependencies**

From the `admin/` directory, run:
```bash
bun add react-hook-form @hookform/resolvers zod
```

This updates `package.json` and `bun.lock` in-place.

- [ ] **Step 2: Verify dependencies installed**

Run:
```bash
bun list | grep -E "react-hook-form|@hookform/resolvers|zod"
```

Expected: All three packages appear in output.

- [ ] **Step 3: Commit dependency changes**

```bash
git add admin/package.json admin/bun.lock
git commit -m "feat: add react-hook-form, @hookform/resolvers, zod for config form"
```

---

## Task 3: Create Server Actions for Config

**Files:**
- Create: `admin/src/server/config.ts`

**Interfaces:**
- Produces:
  - Type: `WidgetConfig` with fields: `bot_name`, `color`, `placeholder`, `allowed_domains`
  - Function: `getConfig(): Promise<WidgetConfig>`
  - Function: `updateConfig(config: WidgetConfig): Promise<{ saved: boolean }>`

- [ ] **Step 1: Create config.ts with server actions**

Create file `admin/src/server/config.ts` with this content:

```typescript
"use server"

export type WidgetConfig = {
  bot_name: string
  color: string
  placeholder: string
  allowed_domains: string[]
}

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function getConfig(): Promise<WidgetConfig> {
  try {
    return await apiFetch<WidgetConfig>("/config")
  } catch (error) {
    // Return defaults if 404 or empty
    return {
      bot_name: "Your Bot",
      color: "#6366f1",
      placeholder: "Ask me anything...",
      allowed_domains: [],
    }
  }
}

export async function updateConfig(config: WidgetConfig): Promise<{ saved: boolean }> {
  const result = await apiFetch<{ saved: boolean }>("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  })
  return result
}
```

- [ ] **Step 2: Verify file syntax**

Check the file opens without errors:
```bash
bun exec node -c admin/src/server/config.ts
```

Or just verify TypeScript compilation:
```bash
cd admin && bun run build --dry-run 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/server/config.ts
git commit -m "feat: add server actions for getConfig and updateConfig"
```

---

## Task 4: Create Widget Preview Component

**Files:**
- Create: `admin/src/components/widget-preview.tsx`

**Interfaces:**
- Consumes: `WidgetConfig` type (from Task 3)
- Produces: React component `WidgetPreview` with props `{ config: Partial<WidgetConfig> }`

- [ ] **Step 1: Create widget-preview.tsx**

Create file `admin/src/components/widget-preview.tsx`:

```typescript
import { WidgetConfig } from "@/server/config"

interface WidgetPreviewProps {
  config: Partial<WidgetConfig>
}

export function WidgetPreview({ config }: WidgetPreviewProps) {
  const botName = config.bot_name || "Your Bot"
  const color = config.color || "#6366f1"
  const placeholder = config.placeholder || "Ask me anything..."

  return (
    <div
      className="flex flex-col rounded-lg border border-gray-200 overflow-hidden shadow-sm"
      style={{ width: "280px" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 text-white font-semibold"
        style={{ backgroundColor: color }}
      >
        {botName}
      </div>

      {/* Chat area */}
      <div className="flex-1 p-4 bg-white flex flex-col gap-3 min-h-[200px]">
        <div className="flex justify-start">
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 max-w-[80%]">
            Hi! I'm {botName}. How can I help you today?
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-3 bg-white flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ "--tw-ring-color": color } as any}
          disabled
        />
        <button
          className="p-2 rounded text-white flex-shrink-0"
          style={{ backgroundColor: color }}
          disabled
        >
          💬
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify component structure**

Check that the component:
- Accepts `config: Partial<WidgetConfig>`
- Has default values (fallback color `#6366f1`)
- Renders header with bot_name and color
- Renders sample message
- Renders input with placeholder
- Uses inline styles for color from config

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/widget-preview.tsx
git commit -m "feat: create WidgetPreview component for live preview mockup"
```

---

## Task 5: Create AllowedDomainsInput Sub-Component

**Files:**
- Create: `admin/src/views/dashboard/config/_components/allowed-domains-input/interface.ts`
- Create: `admin/src/views/dashboard/config/_components/allowed-domains-input/view.tsx`

**Interfaces:**
- Consumes: None (standalone controlled component)
- Produces:
  - Type: `AllowedDomainsInputProps` with `value: string[]` and `onChange: (domains: string[]) => void`
  - Component: `AllowedDomainsInput`

- [ ] **Step 1: Create interface.ts**

Create file `admin/src/views/dashboard/config/_components/allowed-domains-input/interface.ts`:

```typescript
export interface AllowedDomainsInputProps {
  value: string[]
  onChange: (domains: string[]) => void
}
```

- [ ] **Step 2: Create view.tsx**

Create file `admin/src/views/dashboard/config/_components/allowed-domains-input/view.tsx`:

```typescript
"use client"

import { useState } from "react"
import { AllowedDomainsInputProps } from "./interface"

const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function AllowedDomainsInput({ value, onChange }: AllowedDomainsInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState("")

  const addDomain = () => {
    if (!inputValue.trim()) {
      setError("Domain cannot be empty")
      return
    }

    if (!DOMAIN_REGEX.test(inputValue)) {
      setError("Invalid domain format (e.g., example.com)")
      return
    }

    if (value.includes(inputValue)) {
      setError("Domain already added")
      return
    }

    onChange([...value, inputValue])
    setInputValue("")
    setError("")
  }

  const removeDomain = (domain: string) => {
    onChange(value.filter((d) => d !== domain))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addDomain()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setError("")
          }}
          onKeyDown={handleKeyDown}
          placeholder="example.com"
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={addDomain}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {value.map((domain) => (
          <div
            key={domain}
            className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm"
          >
            <span>{domain}</span>
            <button
              onClick={() => removeDomain(domain)}
              className="text-gray-600 hover:text-gray-900 font-bold text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify component**

Check that:
- Component is "use client" (needed for useState)
- Regex matches spec: `/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`
- Validates on Add button click and Enter key
- Shows inline error messages
- Renders domains as chips with remove button
- Calls onChange with updated array

- [ ] **Step 4: Commit**

```bash
git add admin/src/views/dashboard/config/_components/allowed-domains-input/
git commit -m "feat: create AllowedDomainsInput sub-component with validation"
```

---

## Task 6: Create Config Page Logic Hook

**Files:**
- Create: `admin/src/views/dashboard/config/logic.ts`

**Interfaces:**
- Consumes: `getConfig`, `updateConfig` (from Task 3); `WidgetConfig` type
- Produces:
  - Hook: `useConfigPage()` returning `{ form, preview, onSubmit, saving, isLoading }`
  - Where `form` is react-hook-form's `UseFormReturn<WidgetConfig>`
  - `preview` is the watched form values (Partial<WidgetConfig>)
  - `saving` is boolean
  - `isLoading` is boolean

- [ ] **Step 1: Create logic.ts**

Create file `admin/src/views/dashboard/config/logic.ts`:

```typescript
"use client"

import { useState, useEffect } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { getConfig, updateConfig, WidgetConfig } from "@/server/config"

const schema = z.object({
  bot_name: z.string().min(1, "Bot name is required").max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  placeholder: z.string().min(1, "Placeholder is required").max(100),
  allowed_domains: z.array(z.string()),
})

export type ConfigFormData = z.infer<typeof schema>

interface UseConfigPageReturn {
  form: UseFormReturn<ConfigFormData>
  preview: Partial<WidgetConfig>
  onSubmit: (data: ConfigFormData) => Promise<void>
  saving: boolean
  isLoading: boolean
}

export function useConfigPage(): UseConfigPageReturn {
  const [saving, setSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bot_name: "",
      color: "#6366f1",
      placeholder: "",
      allowed_domains: [],
    },
  })

  // Load initial config on mount
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

  // Watch form values for live preview
  const watchedValues = form.watch()
  const preview: Partial<WidgetConfig> = {
    bot_name: watchedValues.bot_name,
    color: watchedValues.color,
    placeholder: watchedValues.placeholder,
    allowed_domains: watchedValues.allowed_domains,
  }

  const onSubmit = async (data: ConfigFormData) => {
    setSaving(true)
    try {
      await updateConfig(data)
      // Optionally show success toast here
    } catch (error) {
      console.error("Failed to save config:", error)
      // Optionally show error toast here
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

- [ ] **Step 2: Verify hook structure**

Check that:
- Zod schema matches spec exactly (field names, validation rules)
- Hook returns object with `{ form, preview, onSubmit, saving, isLoading }`
- useEffect loads config on mount via getConfig
- form.reset() initializes with loaded data
- form.watch() provides live preview values
- updateConfig is called in onSubmit

- [ ] **Step 3: Commit**

```bash
git add admin/src/views/dashboard/config/logic.ts
git commit -m "feat: create useConfigPage hook with form state and server integration"
```

---

## Task 7: Create Config Page View

**Files:**
- Create: `admin/src/views/dashboard/config/view.tsx`

**Interfaces:**
- Consumes: `useConfigPage` (from Task 6), `WidgetPreview` (from Task 4), `AllowedDomainsInput` (from Task 5)
- Produces: Component `ConfigView` (no props)

- [ ] **Step 1: Create view.tsx**

Create file `admin/src/views/dashboard/config/view.tsx`:

```typescript
"use client"

import { useConfigPage } from "./logic"
import { WidgetPreview } from "@/components/widget-preview"
import { AllowedDomainsInput } from "./_components/allowed-domains-input/view"
import { Input } from "@/components/ui/input"

export function ConfigView() {
  const { form, preview, onSubmit, saving, isLoading } = useConfigPage()

  if (isLoading) {
    return <div className="p-8">Loading configuration...</div>
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-8 p-8">
      {/* Left column: Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bot Name
          </label>
          <Input
            {...form.register("bot_name")}
            placeholder="Your Bot"
            className="w-full"
          />
          {form.formState.errors.bot_name && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.bot_name.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Primary Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              {...form.register("color")}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <Input
              {...form.register("color")}
              placeholder="#6366f1"
              className="flex-1"
              onChange={(e) => {
                const value = e.target.value
                if (value.match(/^#[0-9a-fA-F]{6}$/)) {
                  form.setValue("color", value)
                }
              }}
            />
          </div>
          {form.formState.errors.color && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.color.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Placeholder Text
          </label>
          <Input
            {...form.register("placeholder")}
            placeholder="Ask me anything..."
            className="w-full"
          />
          {form.formState.errors.placeholder && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.placeholder.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Allowed Domains
          </label>
          <AllowedDomainsInput
            value={form.watch("allowed_domains")}
            onChange={(domains) => form.setValue("allowed_domains", domains)}
          />
          {form.formState.errors.allowed_domains && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.allowed_domains.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {saving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Save Changes
        </button>
      </form>

      {/* Right column: Live preview */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Live Preview</h3>
        <WidgetPreview config={preview} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify component structure**

Check that:
- Uses `useConfigPage()` hook
- Two-column layout: `grid grid-cols-[1fr_auto] gap-8`
- Left column has all form fields in correct order: Bot Name, Color (picker + input), Placeholder, Allowed Domains, Save button
- Color picker and hex input are bound to same field with bidirectional sync
- AllowedDomainsInput receives `form.watch("allowed_domains")` for value
- Save button is disabled while `saving` is true
- Loading state shows while `isLoading` is true
- Errors display below each field
- Right column shows `<WidgetPreview config={preview} />`

- [ ] **Step 3: Commit**

```bash
git add admin/src/views/dashboard/config/view.tsx
git commit -m "feat: create ConfigView two-column layout with form and live preview"
```

---

## Task 8: Create Config Page Wrapper

**Files:**
- Create: `admin/src/app/dashboard/config/page.tsx`

**Interfaces:**
- Consumes: `ConfigView` (from Task 7)
- Produces: Next.js page component at `/dashboard/config` route

- [ ] **Step 1: Create page.tsx**

Create file `admin/src/app/dashboard/config/page.tsx`:

```typescript
import { ConfigView } from "@/views/dashboard/config/view"

export default function ConfigPage() {
  return <ConfigView />
}
```

- [ ] **Step 2: Verify file**

Check that:
- File is in correct location for Next.js routing: `app/dashboard/config/page.tsx`
- Default export is a function
- Returns `<ConfigView />`

- [ ] **Step 3: Commit**

```bash
git add admin/src/app/dashboard/config/page.tsx
git commit -m "feat: create config page at /dashboard/config route"
```

---

## Task 9: Manual Testing & Verification

**Interfaces:**
- Consumes: All previous tasks
- Verifies: Feature completeness against spec requirements

- [ ] **Step 1: Start the application**

From `admin/` directory:
```bash
bun dev
```

Wait for dev server to start (usually http://localhost:3000 or similar).

- [ ] **Step 2: Test config form loads**

Navigate to `http://localhost:3000/dashboard/config` in browser. Verify:
- Page loads without errors
- Form fields appear: Bot Name, Primary Color (picker + hex), Placeholder Text, Allowed Domains
- Save button is visible and enabled
- Right panel shows live preview

- [ ] **Step 3: Test live preview updates**

In the form, change each field and verify the preview updates in real-time:
- Change Bot Name → preview header updates
- Change color via picker → preview header background changes
- Change color via hex input (e.g., `#ff0000`) → both picker and preview update
- Change Placeholder Text → preview input placeholder updates
- Type a valid domain (e.g., `example.com`) and click Add → it appears as a chip (don't save yet, just verify form works)

- [ ] **Step 4: Test color bidirectional sync**

- [ ] Change color via picker, verify hex input updates
- [ ] Change hex input to valid color (e.g., `#00ff00`), verify picker updates
- [ ] Try invalid hex (e.g., `#gggggg`), verify validation error shows

- [ ] **Step 5: Test allowed domains**

- [ ] Type `example.com` and click Add → chip appears
- [ ] Type `invalid` (missing TLD) and click Add → error shows "Invalid domain format"
- [ ] Try adding same domain twice → error shows "Domain already added"
- [ ] Click × on a chip → it removes
- [ ] Press Enter instead of clicking Add → domain is added

- [ ] **Step 6: Test save**

Fill form with valid data:
- Bot Name: "Test Bot"
- Color: `#ff6b6b`
- Placeholder: "How can I help?"
- Allowed Domains: `example.com`, `test.org`

Click Save Changes. Verify:
- Button shows spinner while saving
- After save completes, button returns to normal state
- No errors appear

- [ ] **Step 7: Test load on refresh**

Refresh the page (`Cmd+R` or `Ctrl+R`). Verify:
- Form loads with previously saved values
- Preview shows saved configuration

- [ ] **Step 8: Verify backend is called**

Open browser DevTools (F12) → Network tab. Fill form and click Save. Verify:
- PUT request goes to `/config` endpoint
- Response status is 200 or 201
- Response includes `{ "saved": true }`

- [ ] **Step 9: Final commit message review**

Verify all commits are in the log:
```bash
git log --oneline | head -10
```

Expected commits:
1. fix: add BaseModel import and register config router in FastAPI app
2. feat: add react-hook-form, @hookform/resolvers, zod for config form
3. feat: add server actions for getConfig and updateConfig
4. feat: create WidgetPreview component for live preview mockup
5. feat: create AllowedDomainsInput sub-component with validation
6. feat: create useConfigPage hook with form state and server integration
7. feat: create ConfigView two-column layout with form and live preview
8. feat: create config page at /dashboard/config route

---

## Spec Coverage Checklist

- [x] Backend: Config router fix (add BaseModel import) — Task 1
- [x] Backend: Config router registration in main.py — Task 1
- [x] Frontend: Add react-hook-form, @hookform/resolvers, zod — Task 2
- [x] Server actions: getConfig, updateConfig, WidgetConfig type — Task 3
- [x] Widget preview component — Task 4
- [x] AllowedDomainsInput with domain validation — Task 5
- [x] useConfigPage hook with form state and live preview — Task 6
- [x] ConfigView two-column layout (form + preview) — Task 7
- [x] Color picker and hex input bidirectional sync — Task 7
- [x] Page wrapper at /dashboard/config — Task 8
- [x] Manual testing and verification — Task 9

All spec requirements addressed.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-26-widget-config-screen.md`.**

## Execution Options

You have two execution paths for this plan:

**1. Subagent-Driven (Recommended)** — I dispatch a fresh subagent per task with review between tasks. Fast iteration, clean separation of concerns.

**2. Inline Execution** — Execute all tasks sequentially in this session with checkpoints for review.

**Which approach would you like?**
