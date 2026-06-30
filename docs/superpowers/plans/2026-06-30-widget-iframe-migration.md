# Widget iframe Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the chat widget from a vanilla-TS Shadow DOM implementation to an iframe-based architecture so the chat panel can use React + shadcn components (starting with MessageScroller).

**Architecture:** The existing `widget.js` loader is slimmed to create only a floating bubble + a hidden `<iframe>` pointing to a new `/widget` route in the existing admin Next.js app. The iframe hosts the full React chat UI using shadcn. The bubble (in the host page Shadow DOM) and the close button (inside the iframe) communicate via `postMessage`.

**Tech Stack:** Bun, TypeScript, React 19, Next.js 16 App Router, shadcn (radix-vega / olive), Tailwind 4, Bun bundler for the loader script, existing FastAPI SSE backend.

## Global Constraints

- Use `bun` (not npm/yarn/npx) for all package management and script running
- shadcn style must match `admin/components.json`: style `radix-vega`, baseColor `olive`, cssVariables true
- SSE wire format is unchanged: `data: {"type":"token","content":"..."}` and `data: {"type":"done","sources":[...]}` — do not touch the backend
- The `/widget` route must be accessible without Clerk auth (public route)
- The iframe must have a transparent background so the React panel's `border-radius` shows through on the host page
- The widget loader (`widget/src/`) stays vanilla TypeScript — no React in the loader
- New env vars: `PUBLIC_WIDGET_APP_URL` in the widget build; `BACKEND_URL` (private, server-only) in the admin app
- All `bun tsc --noEmit` checks must pass after each task

---

## File Map

**admin/ — new files**
- `src/app/widget/layout.tsx` — minimal layout: hides root header, sets transparent background
- `src/app/widget/page.tsx` — server component; reads `?apiKey` + `?botName` from searchParams, renders `WidgetView`
- `src/views/widget/WidgetView.tsx` — client component; composes header, MessageList, ChatInput
- `src/views/widget/hooks/useStreamingChat.ts` — SSE streaming hook (port of `widget/src/chat.ts` + `sse.ts`)
- `src/views/widget/components/MessageBubble.tsx` — renders one user or bot message with citation chips
- `src/views/widget/components/MessageList.tsx` — wraps messages in shadcn `MessageScroller`
- `src/views/widget/components/ChatInput.tsx` — textarea + send button, emits `postMessage({type:'close'})` via close handler passed as prop

**admin/ — modified files**
- `src/middleware.ts` *(create)* — Clerk middleware making `/widget(.*)` a public route
- `src/app/layout.tsx` — no change needed (header hidden via CSS override in widget layout)

**widget/ — modified files**
- `src/ui.ts` — completely rewritten: bubble + iframe injection only (no panel HTML, no styles for messages)
- `src/widget.ts` — simplified: removes `wireInput` and `buildPanel` calls; adds postMessage close listener
- `package.json` — adds `PUBLIC_WIDGET_APP_URL` to build + dev scripts

**widget/ — deleted files**
- `src/chat.ts` — logic moves to `useStreamingChat.ts`
- `src/sse.ts` — `parseSseChunk` is inlined in the hook (10 lines, already proven by tests)
- `src/sse.test.ts` — deleted with its source

---

### Task 1: Install shadcn MessageScroller in admin

**Files:**
- Modify: `admin/src/components/ui/` (shadcn CLI adds files here)

**Interfaces:**
- Produces: `MessageScroller` importable from `@/components/ui/message-scroller` (or whichever path shadcn places it)

- [ ] **Step 1: Install the component**

```bash
cd admin && bun shadcn add message-scroller
```

Expected: one or more files appear under `src/components/ui/`. If the CLI prompts for confirmation, accept.

- [ ] **Step 2: Record the actual import path and props**

```bash
ls admin/src/components/ui/ | grep -i scroller
```

Open the generated file and note:
- Exact import path (e.g., `@/components/ui/message-scroller`)
- The component name exported (e.g., `MessageScroller`)
- The prop that enables auto-scroll pinning (look for `autoScroll`, `followOutput`, or similar)

You will need these exact names in Task 5.

- [ ] **Step 3: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/ui/
git commit -m "feat(widget): install shadcn message-scroller component"
```

---

### Task 2: Create /widget public route with minimal layout

**Files:**
- Create: `admin/src/middleware.ts`
- Create: `admin/src/app/widget/layout.tsx`
- Create: `admin/src/app/widget/page.tsx` (placeholder — replaced in Task 7)

**Interfaces:**
- Produces: `GET /widget` returns 200 for unauthenticated requests, with no admin header visible

- [ ] **Step 1: Create Clerk middleware**

Create `admin/src/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/onboarding(.*)',
  '/widget(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 2: Create widget layout**

Create `admin/src/app/widget/layout.tsx`:

```tsx
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide the root layout's admin header and reset body background for iframe transparency */}
      <style>{`
        body > header { display: none !important; }
        body { background: transparent !important; margin: 0; }
      `}</style>
      {children}
    </>
  )
}
```

- [ ] **Step 3: Create placeholder page**

Create `admin/src/app/widget/page.tsx`:

```tsx
export default function WidgetPage() {
  return <p style={{ color: 'red', padding: '1rem' }}>Widget placeholder — Task 7 replaces this.</p>
}
```

- [ ] **Step 4: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

- [ ] **Step 5: Start admin dev server and verify in incognito**

```bash
cd admin && bun dev
```

Open `http://localhost:3000/widget` in an incognito window (no Clerk session). Expected: red "Widget placeholder" text, no admin header, no sign-in redirect.

- [ ] **Step 6: Commit**

```bash
git add admin/src/app/widget/ admin/src/middleware.ts
git commit -m "feat(widget): add public /widget route with minimal layout"
```

---

### Task 3: Build useStreamingChat hook

**Files:**
- Create: `admin/src/views/widget/hooks/useStreamingChat.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Source { filename?: string }
  export interface ChatMessage {
    id: string
    role: 'user' | 'bot'
    content: string
    sources: Source[]
    loading: boolean
  }
  export function useStreamingChat(
    apiKey: string,
    backendUrl: string
  ): {
    messages: ChatMessage[]
    isStreaming: boolean
    sendMessage: (question: string) => Promise<void>
  }
  ```

- [ ] **Step 1: Create the directory**

```bash
mkdir -p admin/src/views/widget/hooks
```

- [ ] **Step 2: Write the hook**

Create `admin/src/views/widget/hooks/useStreamingChat.ts`:

```ts
'use client'

import { useState } from 'react'

export interface Source {
  filename?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  sources: Source[]
  loading: boolean
}

function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: Array<{ type: string; [key: string]: unknown }>; remainder: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  const remainder = lines.pop() ?? ''
  const events = lines
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as { type: string; [key: string]: unknown })
  return { events, remainder }
}

export function useStreamingChat(apiKey: string, backendUrl: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  async function sendMessage(question: string) {
    const userId = crypto.randomUUID()
    const botId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: question, sources: [], loading: false },
      { id: botId, role: 'bot', content: '', sources: [], loading: true },
    ])
    setIsStreaming(true)

    try {
      const response = await fetch(`${backendUrl}/chat/stream`, {
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
      let buffer = ''
      let fullContent = ''

      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, loading: false } : m)),
      )

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }))
        buffer = parsed.remainder

        for (const event of parsed.events) {
          if (event.type === 'token') {
            fullContent += event.content as string
            setMessages((prev) =>
              prev.map((m) => (m.id === botId ? { ...m, content: fullContent } : m)),
            )
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId ? { ...m, sources: event.sources as Source[] } : m,
              ),
            )
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? { ...m, content: 'Something went wrong. Please try again.', loading: false }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  return { messages, isStreaming, sendMessage }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add admin/src/views/widget/
git commit -m "feat(widget): add useStreamingChat hook — ports SSE logic from widget loader"
```

---

### Task 4: Build MessageBubble component

**Files:**
- Create: `admin/src/views/widget/components/MessageBubble.tsx`

**Interfaces:**
- Consumes: `ChatMessage`, `Source` from `../hooks/useStreamingChat`
- Produces: `<MessageBubble message={ChatMessage} />` — renders one chat turn

- [ ] **Step 1: Create the directory**

```bash
mkdir -p admin/src/views/widget/components
```

- [ ] **Step 2: Write the component**

Create `admin/src/views/widget/components/MessageBubble.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { ChatMessage } from '../hooks/useStreamingChat'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted text-foreground',
          message.loading && 'italic text-muted-foreground',
        )}
      >
        {message.loading ? '…' : message.content}

        {message.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.sources.map((src, i) => (
              <span
                key={i}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
              >
                {src.filename ?? 'Source'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/views/widget/components/MessageBubble.tsx
git commit -m "feat(widget): add MessageBubble component"
```

---

### Task 5: Build MessageList with MessageScroller

**Files:**
- Create: `admin/src/views/widget/components/MessageList.tsx`

**Interfaces:**
- Consumes: `ChatMessage[]` from `useStreamingChat`, `MessageBubble`, shadcn `MessageScroller`
- Produces: `<MessageList messages={ChatMessage[]} />` — auto-scrolling, streaming-aware message list

> **Before writing this file:** Check the actual component name, import path, and auto-scroll prop you noted in Task 1 Step 2. Substitute them below where indicated.

- [ ] **Step 1: Write the component**

Create `admin/src/views/widget/components/MessageList.tsx`:

```tsx
// Replace MessageScroller import path + prop name with what you found in Task 1 Step 2
import { MessageScroller } from '@/components/ui/message-scroller'
import type { ChatMessage } from '../hooks/useStreamingChat'
import { MessageBubble } from './MessageBubble'

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    // Replace `autoScroll` with the actual prop name from the installed component
    <MessageScroller className="flex-1 overflow-y-auto px-4 py-3" autoScroll>
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Ask me anything!
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
    </MessageScroller>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

If the `MessageScroller` prop name is wrong, the typecheck will tell you. Fix it now.

- [ ] **Step 3: Commit**

```bash
git add admin/src/views/widget/components/MessageList.tsx
git commit -m "feat(widget): add MessageList with MessageScroller auto-scroll"
```

---

### Task 6: Build ChatInput component

**Files:**
- Create: `admin/src/views/widget/components/ChatInput.tsx`

**Interfaces:**
- Consumes: `isStreaming: boolean`, `onSend: (question: string) => void`
- Produces: `<ChatInput isStreaming={boolean} onSend={fn} />` — textarea + send button

- [ ] **Step 1: Write the component**

Create `admin/src/views/widget/components/ChatInput.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatInputProps {
  isStreaming: boolean
  onSend: (question: string) => void
}

export function ChatInput({ isStreaming, onSend }: ChatInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const q = value.trim()
    if (!q || isStreaming) return
    setValue('')
    onSend(q)
    ref.current?.focus()
  }

  return (
    <div className="flex items-end gap-2 border-t px-3 py-3">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder="Ask a question…"
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
        disabled={isStreaming}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={isStreaming || !value.trim()}
        aria-label="Send"
      >
        <SendHorizonal />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/views/widget/components/ChatInput.tsx
git commit -m "feat(widget): add ChatInput component"
```

---

### Task 7: Build WidgetView and wire up page.tsx

**Files:**
- Create: `admin/src/views/widget/WidgetView.tsx`
- Modify: `admin/src/app/widget/page.tsx` (replaces placeholder from Task 2)

**Interfaces:**
- Consumes: `apiKey: string`, `backendUrl: string`, `botName: string`; all components from Tasks 3–6
- Produces: full chat panel rendered at `GET /widget?apiKey=xxx&botName=xxx`

- [ ] **Step 1: Create WidgetView**

Create `admin/src/views/widget/WidgetView.tsx`:

```tsx
'use client'

import { useStreamingChat } from './hooks/useStreamingChat'
import { ChatInput } from './components/ChatInput'
import { MessageList } from './components/MessageList'

interface WidgetViewProps {
  apiKey: string
  backendUrl: string
  botName: string
}

export function WidgetView({ apiKey, backendUrl, botName }: WidgetViewProps) {
  const { messages, isStreaming, sendMessage } = useStreamingChat(apiKey, backendUrl)

  function handleClose() {
    window.parent.postMessage({ type: 'close' }, '*')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{botName}</span>
        <button
          onClick={handleClose}
          className="text-lg leading-none text-muted-foreground hover:text-foreground"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      <MessageList messages={messages} />

      <ChatInput isStreaming={isStreaming} onSend={sendMessage} />
    </div>
  )
}
```

- [ ] **Step 2: Replace page.tsx**

Replace `admin/src/app/widget/page.tsx` with:

```tsx
import { WidgetView } from '@/views/widget/WidgetView'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

interface Props {
  searchParams: Promise<{ apiKey?: string; botName?: string }>
}

export default async function WidgetPage({ searchParams }: Props) {
  const { apiKey, botName } = await searchParams

  if (!apiKey) {
    return (
      <p className="p-4 text-sm text-destructive">Missing apiKey URL parameter.</p>
    )
  }

  return (
    <WidgetView
      apiKey={apiKey}
      backendUrl={BACKEND_URL}
      botName={botName ?? 'Assistant'}
    />
  )
}
```

- [ ] **Step 3: Add BACKEND_URL to admin .env.local**

```bash
grep -q 'BACKEND_URL' admin/.env.local 2>/dev/null || echo 'BACKEND_URL=http://localhost:8000' >> admin/.env.local
```

(For production: add `BACKEND_URL` as a private env var in the Vercel dashboard for the admin project.)

- [ ] **Step 4: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

- [ ] **Step 5: Visual check in browser**

With `bun dev` running in `admin/`, open in incognito:

```
http://localhost:3000/widget?apiKey=FAKE&botName=TestBot
```

Expected:
- No admin header, no sidebar
- Chat panel fills the viewport: header "TestBot" + × button, empty message area ("Ask me anything!"), textarea + send button
- Background is transparent (white if body default, but no solid white box — the panel has `border` + `shadow-2xl`)
- Clicking × triggers `window.parent.postMessage({type:'close'}, '*')` (visible in devtools console as no-op since there's no parent frame yet)

- [ ] **Step 6: Commit**

```bash
git add admin/src/views/widget/ admin/src/app/widget/page.tsx
git commit -m "feat(widget): WidgetView — full chat UI with shadcn, MessageScroller, streaming"
```

---

### Task 8: Rewrite widget loader

**Files:**
- Modify: `widget/package.json`
- Modify: `widget/src/ui.ts` (full rewrite)
- Modify: `widget/src/widget.ts` (simplify)
- Delete: `widget/src/chat.ts`, `widget/src/sse.ts`, `widget/src/sse.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_WIDGET_APP_URL` (base URL of admin app, e.g. `http://localhost:3000`)
- Consumes: `WidgetConfig` + `apiKey` from existing `config.ts` / `auth.ts` (unchanged)
- Produces: `dist/widget.js` that injects bubble + iframe on customer page

- [ ] **Step 1: Update package.json build scripts**

Open `widget/package.json`. Replace the `build` and `dev` script values:

```json
"build": "PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL:-http://localhost:8000} PUBLIC_WIDGET_APP_URL=${PUBLIC_WIDGET_APP_URL:-http://localhost:3000} bun build src/widget.ts --outfile=dist/widget.js --minify --target=browser --env 'PUBLIC_*'",
"dev": "PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL:-http://localhost:8000} PUBLIC_WIDGET_APP_URL=${PUBLIC_WIDGET_APP_URL:-http://localhost:3000} bun build src/widget.ts --outfile=dist/widget.js --watch --target=browser --env 'PUBLIC_*'"
```

- [ ] **Step 2: Rewrite ui.ts**

Replace the entire contents of `widget/src/ui.ts`:

```ts
import type { WidgetConfig } from './config'

declare const process: { env: { PUBLIC_WIDGET_APP_URL: string } }

const WIDGET_APP_URL = process.env.PUBLIC_WIDGET_APP_URL

export function buildWidget(config: WidgetConfig, apiKey: string): void {
  const host = document.createElement('div')
  host.id = 'rag-widget-host'
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; }
    #bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${config.color}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      color: white; font-size: 24px;
    }
    #bubble:hover { filter: brightness(0.9); }
    #chat-frame {
      display: none;
      position: fixed; bottom: 90px; right: 24px;
      width: 360px; height: 520px;
      border: none; background: transparent;
    }
    #chat-frame.open { display: block; }
  `
  shadow.appendChild(style)

  const iframeUrl = new URL(`${WIDGET_APP_URL}/widget`)
  iframeUrl.searchParams.set('apiKey', apiKey)
  iframeUrl.searchParams.set('botName', config.bot_name)

  const iframe = document.createElement('iframe')
  iframe.id = 'chat-frame'
  iframe.src = iframeUrl.toString()
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('title', config.bot_name)
  shadow.appendChild(iframe)

  const bubble = document.createElement('button')
  bubble.id = 'bubble'
  bubble.innerHTML = '💬'
  bubble.setAttribute('aria-label', 'Open chat')
  shadow.appendChild(bubble)

  function openWidget() {
    iframe.classList.add('open')
    bubble.innerHTML = '✕'
  }

  function closeWidget() {
    iframe.classList.remove('open')
    bubble.innerHTML = '💬'
  }

  bubble.addEventListener('click', () => {
    iframe.classList.contains('open') ? closeWidget() : openWidget()
  })

  const widgetOrigin = new URL(WIDGET_APP_URL).origin
  window.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
    if (e.origin !== widgetOrigin) return
    if (e.data?.type === 'close') closeWidget()
  })
}
```

- [ ] **Step 3: Simplify widget.ts**

Replace the contents of `widget/src/widget.ts`:

```ts
import { getApiKey } from './auth'
import { buildWidget } from './ui'
import { fetchConfig, isDomainAllowed } from './config'

declare global {
  interface Window {
    __ragWidget?: { apiKey: string }
  }
}

async function init(): Promise<void> {
  const apiKey = getApiKey()
  const config = await fetchConfig(apiKey)

  if (!isDomainAllowed(config.allowed_domains)) return

  buildWidget(config, apiKey)
  window.__ragWidget = { apiKey }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init())
} else {
  void init()
}
```

- [ ] **Step 4: Delete dead source files**

```bash
rm widget/src/chat.ts widget/src/sse.ts widget/src/sse.test.ts
```

- [ ] **Step 5: Build the loader**

```bash
cd widget && bun run build
```

Expected: `dist/widget.js` produced, no build errors.

- [ ] **Step 6: Typecheck**

```bash
cd widget && bun tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add widget/src/ widget/package.json
git commit -m "feat(widget): rewrite loader as iframe injector — removes vanilla chat panel"
```

---

### Task 9: End-to-end manual test

**Files:**
- No code changes — this task validates everything together

- [ ] **Step 1: Start admin (terminal 1)**

```bash
cd admin && bun dev
```

Wait until "Ready" appears in the output.

- [ ] **Step 2: Start widget watcher (terminal 2)**

```bash
cd widget && bun run dev
```

Wait until `dist/widget.js` is written.

- [ ] **Step 3: Open test page**

Open `widget/test.html` via a local file server or directly as `file://`. The `?key=` in the script src must be a valid API key for a tenant in your local database.

```bash
# Quick local server if needed:
cd widget && bunx serve . --port 5500
# then open http://localhost:5500/test.html
```

- [ ] **Step 4: Verify bubble**

Expected: colored chat bubble fixed at bottom-right. The host page's `button { background: red !important }` style does NOT affect it (Shadow DOM isolation).

- [ ] **Step 5: Click bubble — iframe opens**

Expected:
- Chat panel appears above the bubble
- Panel has rounded corners visible against the host page (transparent iframe background)
- Header shows the tenant's `bot_name`
- Empty state: "Ask me anything!"
- Textarea + send button visible

- [ ] **Step 6: Send a message and watch streaming**

Type a question, press Enter.

Expected:
- User message appears right-aligned in the panel
- Bot message appears with "…" loading state
- Tokens stream in one by one, bottom of the message list stays visible (MessageScroller pins to bottom)

- [ ] **Step 7: Test scroll-up during streaming**

Ask a long question, immediately scroll up in the message list mid-stream.

Expected: auto-scroll stops. You can read earlier messages while the bot keeps streaming below. (MessageScroller behavior.)

- [ ] **Step 8: Close via × button**

Click the × in the panel header.

Expected: panel closes (`display: none`), bubble returns to '💬'. No page reload.

- [ ] **Step 9: Close via bubble toggle**

Re-open the panel by clicking the bubble, then click the bubble again.

Expected: panel closes. Same as × button.

- [ ] **Step 10: Commit a test note and update dev log**

Add a line to `docs/dev-log.md` under today's date noting that the iframe migration is complete and working.

```bash
git add docs/dev-log.md
git commit -m "chore: note iframe widget migration complete in dev log"
```

---

### Task 10: Connect config page Live Preview with the real widget iframe

**Files:**
- Modify: `admin/src/app/widget/page.tsx` — accept `color` and `mode=preview` params
- Modify: `admin/src/views/widget/WidgetView.tsx` — accept `color` + `isPreview` props; inject color as CSS variable; render static canned message when preview
- Modify: `admin/src/views/dashboard/config/_components/widget-preview.tsx` — replace static mock HTML with a live `<iframe>` pointing to `/widget?mode=preview&...`

**Interfaces:**
- Consumes: `preview: Partial<WidgetConfig>` already returned by `useConfigPage()` in `logic.ts` — no logic changes needed
- Produces: config page "Live Preview" card shows the exact same React UI that will be embedded on customer sites, updating live as the user edits form fields

**Why this matters:** The existing `WidgetPreview` is a hand-rolled HTML mock that diverges from the real widget as soon as the shadcn UI is in place. Replacing it with the actual `/widget` iframe means the preview is always pixel-accurate with no maintenance burden.

- [ ] **Step 1: Update `WidgetView` to accept `color` and `isPreview` props**

Open `admin/src/views/widget/WidgetView.tsx`. Change the props interface and component:

```tsx
'use client'

import { useStreamingChat } from './hooks/useStreamingChat'
import { ChatInput } from './components/ChatInput'
import { MessageList } from './components/MessageList'
import type { ChatMessage } from './hooks/useStreamingChat'

interface WidgetViewProps {
  apiKey: string
  backendUrl: string
  botName: string
  color?: string
  isPreview?: boolean
}

const PREVIEW_MESSAGES: ChatMessage[] = [
  {
    id: 'preview-bot',
    role: 'bot',
    content: 'Hi! How can I help you today?',
    sources: [],
    loading: false,
  },
  {
    id: 'preview-user',
    role: 'user',
    content: 'What can you do?',
    sources: [],
    loading: false,
  },
  {
    id: 'preview-bot-2',
    role: 'bot',
    content: "I can answer questions from your docs, pages, and files — with source citations.",
    sources: [{ filename: 'docs/getting-started.md' }],
    loading: false,
  },
]

export function WidgetView({ apiKey, backendUrl, botName, color, isPreview }: WidgetViewProps) {
  const chat = useStreamingChat(isPreview ? '' : apiKey, isPreview ? '' : backendUrl)
  const messages = isPreview ? PREVIEW_MESSAGES : chat.messages
  const isStreaming = isPreview ? false : chat.isStreaming
  const sendMessage = isPreview ? async () => {} : chat.sendMessage

  function handleClose() {
    window.parent.postMessage({ type: 'close' }, '*')
  }

  // Inject tenant brand color as --primary CSS variable so shadcn bg-primary reflects it
  const colorStyle = color ? ({ '--primary': color } as React.CSSProperties) : undefined

  return (
    <div
      className="flex h-screen flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
      style={colorStyle}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{botName}</span>
        {!isPreview && (
          <button
            onClick={handleClose}
            className="text-lg leading-none text-muted-foreground hover:text-foreground"
            aria-label="Close chat"
          >
            ×
          </button>
        )}
      </div>

      <MessageList messages={messages} />

      <ChatInput isStreaming={isStreaming} onSend={sendMessage} disabled={isPreview} />
    </div>
  )
}
```

> Note: `disabled` prop needs to be added to `ChatInput` — see Step 2.

- [ ] **Step 2: Add `disabled` prop to `ChatInput`**

Open `admin/src/views/widget/components/ChatInput.tsx`. Add `disabled?: boolean` to `ChatInputProps` and pass it to the `Textarea` and `Button`:

```tsx
interface ChatInputProps {
  isStreaming: boolean
  onSend: (question: string) => void
  disabled?: boolean
}

export function ChatInput({ isStreaming, onSend, disabled }: ChatInputProps) {
  // ...existing state/refs...

  return (
    <div className="flex items-end gap-2 border-t px-3 py-3">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder="Ask a question…"
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
        disabled={isStreaming || disabled}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={isStreaming || !value.trim() || disabled}
        aria-label="Send"
      >
        <SendHorizonal />
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Update `page.tsx` to pass `color` and `isPreview`**

Open `admin/src/app/widget/page.tsx`. Update to read the new params:

```tsx
import { WidgetView } from '@/views/widget/WidgetView'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

interface Props {
  searchParams: Promise<{ apiKey?: string; botName?: string; color?: string; mode?: string }>
}

export default async function WidgetPage({ searchParams }: Props) {
  const { apiKey, botName, color, mode } = await searchParams
  const isPreview = mode === 'preview'

  if (!apiKey && !isPreview) {
    return (
      <p className="p-4 text-sm text-destructive">Missing apiKey URL parameter.</p>
    )
  }

  return (
    <WidgetView
      apiKey={apiKey ?? ''}
      backendUrl={BACKEND_URL}
      botName={botName ?? 'Assistant'}
      color={color}
      isPreview={isPreview}
    />
  )
}
```

- [ ] **Step 4: Replace `WidgetPreview` with live iframe**

Replace the entire contents of `admin/src/views/dashboard/config/_components/widget-preview.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type { WidgetConfig } from '@/server/config'

interface WidgetPreviewProps {
  config: Partial<WidgetConfig>
}

export function WidgetPreview({ config }: WidgetPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const src = buildPreviewUrl(config)

  // Reload iframe src when config changes (color/botName updates require a new URL)
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = src
    }
  }, [src])

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Widget preview"
      width={300}
      height={420}
      style={{ border: 'none', background: 'transparent', borderRadius: '12px' }}
      allowTransparency
    />
  )
}

function buildPreviewUrl(config: Partial<WidgetConfig>): string {
  const url = new URL('/widget', window.location.origin)
  url.searchParams.set('mode', 'preview')
  if (config.bot_name) url.searchParams.set('botName', config.bot_name)
  if (config.color) url.searchParams.set('color', config.color)
  if (config.placeholder) url.searchParams.set('placeholder', config.placeholder)
  return url.toString()
}
```

> `buildPreviewUrl` uses `window.location.origin` since this is a client component (`'use client'` implied by `useRef`/`useEffect`). The iframe reloads whenever the URL string changes (color, botName, placeholder edits in the form).

- [ ] **Step 5: Add `'use client'` directive if missing**

`WidgetPreview` now uses `useRef`/`useEffect`. Verify the file starts with `'use client'` — it's already added in Step 4 above.

- [ ] **Step 6: Typecheck**

```bash
cd admin && bun tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Visual check**

With `bun dev` running, open `http://localhost:3000/dashboard/config`. The "Live Preview" card on the right should now show the real shadcn widget panel with canned messages. Edit the "Bot Name" or "Primary Color" fields — the preview iframe should reload and reflect the changes within ~1 second.

- [ ] **Step 8: Commit**

```bash
git add admin/src/views/widget/WidgetView.tsx \
        admin/src/views/widget/components/ChatInput.tsx \
        admin/src/app/widget/page.tsx \
        admin/src/views/dashboard/config/_components/widget-preview.tsx
git commit -m "feat(widget): live iframe preview on config page — replaces static mock"
```
