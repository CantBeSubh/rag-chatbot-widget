# Widget Chat UX (CAN-33) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full chat UI inside the widget panel scaffolded in CAN-32: message history, token-by-token streaming, an input row, a send button, and citation chips under each bot answer — making the widget functionally a complete chat client.

**Architecture:** Extend `ui.ts` with `buildPanel()` (header/messages/input-row markup + styles, replacing the CAN-32 placeholder). Add a new pure module `sse.ts` that parses raw SSE byte chunks into discrete events, decoupled from the DOM so it's unit-testable with `bun:test`. Add a new `chat.ts` that owns the fetch/stream/DOM-update loop (`sendMessage`) and input wiring (`wireInput`), built on top of `sse.ts`. `widget.ts` composes all three after `buildWidget()`.

**Tech Stack:** Same as CAN-32 — bun (build/test runner), TypeScript 5.x strict, ESLint 9 flat config, Prettier (no semicolons, single quotes, 100-char width — per the widget's actual current `.prettierrc`, which already deviated from the CAN-32 plan's draft). New: `bun:test` (built into the bun runtime, zero extra runtime dependency) for `sse.ts`'s unit tests; `@types/bun` and `@types/node`-free local ambient typing as dev-only additions.

## Global Constraints

- The backend's streaming endpoint is **`POST /chat/stream`**, not `POST /chat` as the ticket's sample code shows. `POST /chat` (`backend/app/routers/chat.py:19`) is the older non-streaming JSON endpoint from CAN-30; `POST /chat/stream` (`backend/app/routers/chat.py:36`) is the SSE one this ticket needs. Verified by reading `backend/app/routers/chat.py` directly.
- The backend has **no CORS middleware**. The widget is fetched from a different origin than the FastAPI backend in every real deployment (and in local testing via `bunx serve`, e.g. `:3000` → `:8000`), so without `CORSMiddleware` the browser blocks the request entirely before the widget code ever runs. `allow_origins=["*"]` is the correct fix, not a dev shortcut — this widget is embedded via `<script>` tag on arbitrary third-party client sites, so the backend must accept calls from any origin.
- Bun's bundler has no `--define` flag (verified: not present in `bun build --help` on the installed bun version). Build-time env inlining only works via `--env <prefix>*` or `--env inline`/`--env disable`, and **only inlines a variable that is actually set in the shell environment at build time** — an unset variable matching the prefix is left as a live `process.env.X` reference in the output, which throws `ReferenceError: process is not defined` the instant a browser loads the bundle (verified by building both ways and inspecting the output). Fix: name the variable `PUBLIC_BACKEND_URL`, pass `--env 'PUBLIC_*'`, and give it a shell-level default (`${PUBLIC_BACKEND_URL:-http://localhost:8000}`) directly in `widget/package.json`'s `build`/`dev` scripts so it is **always** set before `bun build` runs.
- `process.env.X` does not type-check under this project's actual `tsconfig.json` (`lib: ["ES2020", "DOM"]`, no Node types) — verified: `tsc` reports `TS2591: Cannot find name 'process'`. Fix with a local ambient declaration in `chat.ts`, not a new `@types/node` dependency (keeps the dependency footprint minimal — only `PUBLIC_BACKEND_URL` is ever accessed, nothing else Node-specific).
- `bun:test` (used for `sse.ts`'s unit tests) does not resolve under `tsc --noEmit` without `@types/bun` **and** `"types": ["bun"]` explicitly set in `tsconfig.json` — verified: adding the dependency alone was not sufficient; the explicit `types` array was required.
- No semicolons, single quotes, 100-char width in all `widget/src/*.ts` — match the project's actual current `.prettierrc`/source files, not the (different) draft shown inside the CAN-32 plan document.
- Per explicit user instruction for this ticket: **do not auto-run `bun run lint`, `bun run format:check`, `cd backend && uv run ruff check .`/`ruff format --check .`, or the manual browser verification** — these are called out explicitly in Task 6 and are the user's to run themselves. Each code task's own automated gate is limited to `bun run typecheck` (and `bun run build`/`bun test` where the task introduces buildable or testable code) — correctness checks, not style/lint checks.
- Don't run `uv run pytest` / `make test` on the backend on your own initiative (standing project rule) — there is no automated test added for the CORS middleware change; it's verified manually in Task 6 alongside the rest of the chat flow.

---

### Task 1: Backend — allow cross-origin requests from the widget (CORS)

**Files:**
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Access-Control-Allow-Origin` (and related) headers on every backend response, including `OPTIONS` preflights. Required by Task 5's `fetch()` call to `/chat/stream` succeeding from a different origin.

- [ ] **Step 1: Add `CORSMiddleware` to `backend/app/main.py`**

Current file:

```python
import logging

from fastapi import FastAPI

from .core.config import settings
from .core.database import supabase
from .core.logging import setup_logging
from .routers import chat, ingest

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()

app.include_router(ingest.router)
app.include_router(chat.router)
```

Replace with:

```python
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import supabase
from .core.logging import setup_logging
from .routers import chat, ingest

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()

# Wildcard is intentional: this widget is embedded via <script> tag on
# arbitrary third-party client websites, so any origin must be allowed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(chat.router)
```

(The rest of the file — `verify_db()` and `root()` — is unchanged.)

- [ ] **Step 2: Verify the app still imports cleanly**

```bash
cd backend && uv run python -c "import app.main"
```

Expected: no output, exit code 0. (Per this project's CLAUDE.md, this is the correct way to catch import errors the way `fastapi dev` would hit them — not a substitute for `ruff check`/`format --check`, which are deferred to Task 6.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): allow cross-origin requests from the embedded widget"
```

---

### Task 2: Panel layout + styles (`buildPanel()` in `ui.ts`)

**Files:**
- Modify: `widget/src/ui.ts`

**Interfaces:**
- Consumes: `WidgetElements` (already defined in this file).
- Produces: `buildPanel(panel: HTMLElement, shadow: ShadowRoot): void` — fills the panel with header/messages/input-row markup and appends matching CSS to the shared `<style>` element. Consumed by `widget.ts` in Task 5.

- [ ] **Step 1: Replace `widget/src/ui.ts` with the panel-aware version**

```typescript
export interface WidgetElements {
  shadow: ShadowRoot
  panel: HTMLElement
}

export function buildWidget(): WidgetElements {
  const host = document.createElement('div')
  host.id = 'rag-widget-host'
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }

    #bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: #6366f1; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      color: white; font-size: 24px;
    }
    #bubble:hover { background: #4f46e5; }

    #chat-panel {
      display: none;
      position: fixed; bottom: 90px; right: 24px;
      width: 360px; height: 520px;
      background: white; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      flex-direction: column; overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    #chat-panel.open { display: flex; }
  `
  shadow.appendChild(style)

  const bubble = document.createElement('button')
  bubble.id = 'bubble'
  bubble.innerHTML = '💬'
  bubble.setAttribute('aria-label', 'Open chat')
  shadow.appendChild(bubble)

  const panel = document.createElement('div')
  panel.id = 'chat-panel'
  shadow.appendChild(panel)

  bubble.addEventListener('click', () => {
    panel.classList.toggle('open')
    bubble.innerHTML = panel.classList.contains('open') ? '✕' : '💬'
  })

  return { shadow, panel }
}

export function buildPanel(panel: HTMLElement, shadow: ShadowRoot): void {
  panel.innerHTML = `
    <div id="header">
      <span id="bot-name">Assistant</span>
      <button id="close-btn" aria-label="Close">✕</button>
    </div>
    <div id="messages"></div>
    <div id="input-row">
      <input id="question-input" type="text" placeholder="Ask me anything..." />
      <button id="send-btn">➤</button>
    </div>
  `

  const style = shadow.querySelector('style') as HTMLStyleElement
  style.textContent += `
    #header {
      padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      font-weight: 600; font-size: 14px; color: #111827;
    }
    #close-btn { background: none; border: none; cursor: pointer; color: #6b7280; font-size: 16px; }

    #messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
    .msg.user { align-self: flex-end; background: #6366f1; color: white; border-bottom-right-radius: 4px; }
    .msg.bot  { align-self: flex-start; background: #f3f4f6; color: #111827; border-bottom-left-radius: 4px; }
    .msg.bot.loading { color: #9ca3af; font-style: italic; }

    .citations { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .citation {
      font-size: 11px; padding: 2px 8px; border-radius: 4px;
      background: #ede9fe; color: #5b21b6; text-decoration: none;
      border: 1px solid #c4b5fd; cursor: pointer;
    }
    .citation:hover { background: #ddd6fe; }

    #input-row {
      padding: 12px 16px; border-top: 1px solid #e5e7eb;
      display: flex; gap: 8px;
    }
    #question-input {
      flex: 1; padding: 8px 12px; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 14px; outline: none;
    }
    #question-input:focus { border-color: #6366f1; }
    #send-btn {
      padding: 8px 14px; background: #6366f1; color: white;
      border: none; border-radius: 8px; cursor: pointer; font-size: 16px;
    }
    #send-btn:disabled { background: #c7d2fe; cursor: not-allowed; }
  `
}
```

Note: the CAN-32 placeholder line (`panel.innerHTML = '<p>...Chat coming in M1-D3...</p>'`) is removed from `buildWidget()` — `buildPanel()` now owns the panel's content, called separately from `widget.ts` in Task 5. Also note `buildPanel`'s signature drops the `apiKey` parameter the ticket's sample `buildPanel(panel, apiKey, shadow)` declared but never used in its body — kept here as `buildPanel(panel, shadow)` only.

- [ ] **Step 2: Typecheck**

```bash
cd widget && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add widget/src/ui.ts
git commit -m "feat(widget): add buildPanel() — chat header, message list, input row"
```

---

### Task 3: SSE chunk parser (`sse.ts`) — TDD

**Files:**
- Create: `widget/src/sse.ts`
- Create: `widget/src/sse.test.ts`
- Modify: `widget/package.json` (add `test` script, `@types/bun` dev dependency)
- Modify: `widget/tsconfig.json` (add `"types": ["bun"]`)

**Interfaces:**
- Consumes: nothing (pure string parsing).
- Produces: `interface SseEvent { type: string; [key: string]: unknown }` and `parseSseChunk(buffer: string, chunk: string): { events: SseEvent[]; remainder: string }`. Consumed by `chat.ts`'s `sendMessage()` in Task 4.

This is the trickiest part of the ticket (per its own "T-shirt size: L... streaming, SSE parsing... all in one" framing) — a `fetch()` `ReadableStream` can split a single `data: {...}` SSE line across two `read()` calls at any byte boundary. The ticket's sample code parses each chunk independently and would silently drop or fail to parse a line split that way. `parseSseChunk` fixes this by buffering any incomplete trailing line and prepending it to the next chunk, and is pure/DOM-free so it's unit-testable directly.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/sse.test.ts`:

```typescript
import { test, expect } from 'bun:test'
import { parseSseChunk } from './sse'

test('parses a single complete event in one chunk', () => {
  const { events, remainder } = parseSseChunk('', 'data: {"type":"token","content":"hi"}\n\n')
  expect(events).toEqual([{ type: 'token', content: 'hi' }])
  expect(remainder).toBe('')
})

test('parses multiple complete events in one chunk', () => {
  const chunk = 'data: {"type":"token","content":"a"}\n\ndata: {"type":"token","content":"b"}\n\n'
  const { events, remainder } = parseSseChunk('', chunk)
  expect(events).toEqual([
    { type: 'token', content: 'a' },
    { type: 'token', content: 'b' },
  ])
  expect(remainder).toBe('')
})

test('buffers a line split across two chunks', () => {
  const first = parseSseChunk('', 'data: {"type":"tok')
  expect(first.events).toEqual([])
  expect(first.remainder).toBe('data: {"type":"tok')

  const second = parseSseChunk(first.remainder, 'en","content":"x"}\n\n')
  expect(second.events).toEqual([{ type: 'token', content: 'x' }])
  expect(second.remainder).toBe('')
})

test('ignores SSE comment/keepalive lines', () => {
  const { events, remainder } = parseSseChunk('', ': ping - 123\n\ndata: {"type":"done"}\n\n')
  expect(events).toEqual([{ type: 'done' }])
  expect(remainder).toBe('')
})

test('ignores non-data lines and blank lines', () => {
  const { events, remainder } = parseSseChunk('', 'event: message\ndata: {"type":"done"}\n\n')
  expect(events).toEqual([{ type: 'done' }])
  expect(remainder).toBe('')
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd widget && bun test src/sse.test.ts
```

Expected: fails with `Cannot find module './sse'` (or similar) — `sse.ts` doesn't exist yet.

- [ ] **Step 3: Implement `widget/src/sse.ts`**

```typescript
export interface SseEvent {
  type: string
  [key: string]: unknown
}

export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseEvent[]; remainder: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  const remainder = lines.pop() ?? ''

  const events: SseEvent[] = []
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    events.push(JSON.parse(line.slice(6)) as SseEvent)
  }

  return { events, remainder }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd widget && bun test src/sse.test.ts
```

Expected: `5 pass`, `0 fail`.

- [ ] **Step 5: Wire up `bun:test` typings and the `test` script**

Add `@types/bun` as a dev dependency:

```bash
cd widget && bun add -d @types/bun
```

Modify `widget/tsconfig.json` — add `"types": ["bun"]` (verified necessary: installing `@types/bun` alone is not picked up automatically, unlike most `@types/*` packages):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src"]
}
```

Add a `test` script to `widget/package.json`'s `scripts` block (alongside the existing ones):

```json
    "test": "bun test",
```

- [ ] **Step 6: Typecheck and re-run tests**

```bash
cd widget && bun run typecheck && bun test
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add widget/src/sse.ts widget/src/sse.test.ts widget/package.json widget/bun.lock widget/tsconfig.json
git commit -m "feat(widget): add parseSseChunk() — chunk-boundary-safe SSE line parsing"
```

---

### Task 4: Chat logic (`chat.ts`) + build-time backend URL

**Files:**
- Create: `widget/src/chat.ts`
- Modify: `widget/package.json` (`build`/`dev` scripts)

**Interfaces:**
- Consumes: `parseSseChunk`, `SseEvent` from `sse.ts` (Task 3).
- Produces: `sendMessage(question: string, messagesEl: HTMLElement, apiKey: string): Promise<void>` and `wireInput(shadow: ShadowRoot, apiKey: string): void`. Consumed by `widget.ts` in Task 5.

- [ ] **Step 1: Update `widget/package.json`'s build/dev scripts to inline `PUBLIC_BACKEND_URL`**

Bun's bundler only inlines an env var that is actually present in the shell at build time (verified — an unset var is left as a live, browser-breaking `process.env.X` reference). The `${PUBLIC_BACKEND_URL:-http://localhost:8000}` shell default guarantees it's always set, while still letting it be overridden by exporting `PUBLIC_BACKEND_URL` before running the script.

Current scripts:

```json
    "build": "bun build src/widget.ts --outfile=dist/widget.js --minify --target=browser",
    "dev": "bun build src/widget.ts --outfile=dist/widget.js --watch --target=browser",
```

Replace with:

```json
    "build": "PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL:-http://localhost:8000} bun build src/widget.ts --outfile=dist/widget.js --minify --target=browser --env 'PUBLIC_*'",
    "dev": "PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL:-http://localhost:8000} bun build src/widget.ts --outfile=dist/widget.js --watch --target=browser --env 'PUBLIC_*'",
```

- [ ] **Step 2: Create `widget/src/chat.ts`**

```typescript
import { parseSseChunk } from './sse'

// @types/node isn't a dependency here (only DOM types are) — this var is the
// only Node-shaped global this codebase touches, and it's fully replaced with
// a string literal at build time by `bun build --env 'PUBLIC_*'` (see
// widget/package.json), so a minimal local ambient type is enough.
declare const process: { env: { PUBLIC_BACKEND_URL: string } }

const BACKEND_URL = process.env.PUBLIC_BACKEND_URL

interface Source {
  filename?: string
}

export async function sendMessage(
  question: string,
  messagesEl: HTMLElement,
  apiKey: string,
): Promise<void> {
  const userMsg = document.createElement('div')
  userMsg.className = 'msg user'
  userMsg.textContent = question
  messagesEl.appendChild(userMsg)

  const botMsg = document.createElement('div')
  botMsg.className = 'msg bot loading'
  botMsg.textContent = '...'
  messagesEl.appendChild(botMsg)
  messagesEl.scrollTop = messagesEl.scrollHeight

  let fullAnswer = ''

  try {
    const response = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ question }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Backend returned ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    botMsg.classList.remove('loading')
    botMsg.textContent = ''

    let sources: Source[] = []
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }))
      buffer = parsed.remainder

      for (const event of parsed.events) {
        if (event.type === 'token') {
          fullAnswer += event.content as string
          botMsg.textContent = fullAnswer
          messagesEl.scrollTop = messagesEl.scrollHeight
        } else if (event.type === 'done') {
          sources = event.sources as Source[]
        }
      }
    }

    if (sources.length > 0) {
      const citationsEl = document.createElement('div')
      citationsEl.className = 'citations'
      for (const src of sources) {
        const chip = document.createElement('span')
        chip.className = 'citation'
        chip.textContent = src.filename || 'Source'
        citationsEl.appendChild(chip)
      }
      botMsg.appendChild(citationsEl)
    }
  } catch {
    botMsg.classList.remove('loading')
    botMsg.textContent = 'Something went wrong. Please try again.'
    botMsg.style.color = '#dc2626'
  }

  messagesEl.scrollTop = messagesEl.scrollHeight
}

export function wireInput(shadow: ShadowRoot, apiKey: string): void {
  const input = shadow.querySelector('#question-input') as HTMLInputElement
  const sendBtn = shadow.querySelector('#send-btn') as HTMLButtonElement
  const messagesEl = shadow.querySelector('#messages') as HTMLElement

  async function handleSend() {
    const question = input.value.trim()
    if (!question) return
    input.value = ''
    sendBtn.disabled = true
    await sendMessage(question, messagesEl, apiKey)
    sendBtn.disabled = false
    input.focus()
  }

  sendBtn.addEventListener('click', handleSend)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  })
}
```

Three deliberate deviations from the ticket's sample, all already called out in Global Constraints — listed here for traceability: (1) `${BACKEND_URL}/chat/stream`, not `/chat`; (2) `response.ok`/`response.body` are checked before streaming, so a 401 (bad API key) or 422/500 response shows the same readable error as a network failure, instead of silently leaving the bot bubble blank; (3) `decoder.decode(value, { stream: true })` plus `parseSseChunk`'s buffering, so multi-byte UTF-8 characters and SSE lines split across `read()` calls are handled correctly instead of occasionally corrupting streamed text.

- [ ] **Step 3: Typecheck**

```bash
cd widget && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add widget/src/chat.ts widget/package.json
git commit -m "feat(widget): add sendMessage()/wireInput() — fetch, SSE stream, citations"
```

---

### Task 5: Wire the entry point (`widget.ts`) + full build verification

**Files:**
- Modify: `widget/src/widget.ts`

**Interfaces:**
- Consumes: `buildWidget()` (existing), `buildPanel()` (Task 2), `wireInput()` (Task 4).
- Produces: the complete, bundled `dist/widget.js` — this is the ticket's actual deliverable.

- [ ] **Step 1: Update `widget/src/widget.ts`**

```typescript
import { getApiKey } from './auth'
import { buildWidget, buildPanel } from './ui'
import { wireInput } from './chat'

declare global {
  interface Window {
    __ragWidget?: {
      apiKey: string
      shadow: ShadowRoot
      panel: HTMLElement
    }
  }
}

function init(): void {
  const apiKey = getApiKey()
  const { shadow, panel } = buildWidget()
  buildPanel(panel, shadow)
  wireInput(shadow, apiKey)
  window.__ragWidget = { apiKey, shadow, panel }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
```

- [ ] **Step 2: Typecheck, build, and smoke-check the bundle**

```bash
cd widget && bun run typecheck && bun run build
grep -q "PUBLIC_BACKEND_URL\|process.env" dist/widget.js && echo "FAIL: unreplaced env reference leaked into bundle" || echo "OK: no raw process.env reference in bundle"
```

Expected: `typecheck`/`build` exit 0, and the grep prints `OK: no raw process.env reference in bundle` — this is the concrete check that `--env 'PUBLIC_*'` actually inlined `BACKEND_URL` into a literal string (the failure mode this guards against was verified directly in Task 4's research: an unset/non-inlined var leaves the literal text `process.env.PUBLIC_BACKEND_URL` in the output, which throws at runtime in the browser).

- [ ] **Step 3: Commit**

```bash
git add widget/src/widget.ts
git commit -m "feat(widget): wire panel + chat input into the bootstrap entry point"
```

---

### Task 6: Manual verification + lint/format (performed by you, not the implementing agent)

**Files:** none — verification only.

This task is a deliberate handoff, not something for an executing agent (subagent or otherwise) to run and self-certify — per explicit instruction for this ticket, you're running linting and manual testing yourself. Do not mark this task complete on the agent's say-so; it's done when you've personally run these and they pass.

- [ ] **Step 1: Lint/format — backend**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

- [ ] **Step 2: Lint/format — widget**

```bash
cd widget && bun run lint && bun run format:check
```

- [ ] **Step 3: Start the backend with a tenant + at least one ingested document**

```bash
cd backend && make dev
```

(Use an existing tenant API key from the `testing` schema with at least one ingested source — needed for the bot to have something to answer from and cite.)

- [ ] **Step 4: Build and serve the widget**

```bash
cd widget && bun run build && cd ..
bunx serve widget
```

Update `widget/test.html`'s script tag to use a real tenant API key if `test123` isn't one (`<script src="./dist/widget.js?key=YOUR_REAL_KEY"></script>`).

- [ ] **Step 5: Manually verify in a browser against the ticket's "Done when" criteria**

Open `<printed-url>/test.html`, click the bubble, and confirm:

- The full panel renders: header with "Assistant" + close button, empty message list, input field, send button.
- Typing a question and clicking send (or pressing Enter) appends a right-aligned purple user bubble immediately.
- A bot bubble appears showing `...` in italic gray, then fills in token-by-token as the answer streams (not all at once).
- Citation chips render below the finished bot answer, one per cited source.
- The send button is disabled (and visually grayed via `#send-btn:disabled`) while a response is streaming, and re-enables (with focus returning to the input) once it finishes.
- Pressing Enter sends the message the same way the send button does; Shift+Enter does not send (no multiline support needed, but should not trigger a send either).
- Stop the backend (`Ctrl+C` in its terminal) and send another message — confirm a readable red error message appears in the bot bubble instead of a silent failure or a stuck loading state.
- Re-check the CAN-32 Shadow DOM isolation properties still hold (purple bubble survives the page's hostile `red !important` rule; `#rag-widget-host` is a closed shadow root, not direct children of `<body>`).

- [ ] **Step 6: If everything above passes, this ticket is done**

No commit needed for this task — Tasks 1–5 already committed the actual changes. If anything above fails, fix it in the relevant task's files and re-run that task's automated gate before re-checking here.
