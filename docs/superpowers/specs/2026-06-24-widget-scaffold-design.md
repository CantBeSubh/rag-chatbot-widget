# Widget Scaffold Design (CAN-32)

## Context

CAN-32 (M1-D2, parent: CAN-22 "M1: Widget + Streaming") asks for the build
pipeline and outer shell of the embeddable chat widget: TypeScript compiled
to a single `widget.js`, a closed Shadow DOM root for style isolation, and a
chat bubble button in the bottom-right corner of any page that loads the
script. No chat functionality yet — that's CAN-33 (chat UX) and CAN-34
(auth + domain allowlist), both separate tickets that build on top of this
scaffold.

The ticket's sample code assumes esbuild + npm. This repo's user-level
convention is to use bun for all Node-related development, so the tooling
choices below adapt the ticket's intent to bun rather than following the
sample verbatim.

## Decisions

- **Bundler: native `bun build`**, not esbuild. One less dependency; `bun
  build src/widget.ts --outfile=dist/widget.js --minify --target=browser`
  covers the ticket's bundling/minification needs. Caveat: unlike esbuild's
  `--target=es2017`, `bun build` does not downlevel syntax — it strips types
  and bundles, passing JS syntax through unchanged. Browser-syntax
  compatibility is therefore enforced by `tsconfig.json`'s `target`/`lib`
  (caught at type-check time, not at build time), not by the bundler.
- **Standalone package**: `widget/` gets its own `package.json` + `bun.lock`,
  mirroring how `backend/` is self-contained with its own `pyproject.toml`.
  Not a bun workspace under the root `package.json` (which currently holds
  only husky).
- **TS target: ES2020** (not the ticket's ES2017). Gives `async`/`await`
  (needed soon for CAN-33's fetch calls) plus optional chaining `?.` and
  nullish coalescing `??`. The ticket's ES2017/"Safari 10+" rationale is
  stale for 2026 — ES2020 is safely supported everywhere relevant today.
- **Testing: manual only.** No automated tests for this ticket — there's no
  logic worth unit-testing yet, just DOM scaffolding and one `throw`.
  Verification follows the ticket's own done-criteria via a manual browser
  check (see Testing section).
- **Full ESLint + Prettier now**, wired into the existing pre-commit hook
  alongside the backend's `make lint && make format-check`, rather than
  deferring TS tooling to a later ticket.

## File layout

```
widget/
├── package.json          # standalone bun package
├── bun.lock
├── tsconfig.json          # strict, ES2020 + DOM, noEmit (type-check only)
├── eslint.config.js        # flat config, typescript-eslint + eslint-config-prettier
├── .prettierrc
├── .gitignore             # node_modules, dist
├── src/
│   ├── widget.ts          # entry point — bootstraps on DOMContentLoaded
│   ├── auth.ts            # getApiKey()
│   └── ui.ts              # buildWidget() — shadow root, styles, bubble, panel
├── dist/                  # build output (gitignored)
└── test.html              # manual verification page
```

No `Makefile` in `widget/` — `package.json` scripts are the idiomatic
equivalent for a JS package (unlike `backend/`, which wraps `uv run` in a
Makefile by existing convention).

**package.json scripts:**
- `build` → `bun build src/widget.ts --outfile=dist/widget.js --minify --target=browser`
- `dev` → `bun build src/widget.ts --outfile=dist/widget.js --watch --target=browser`
- `typecheck` → `tsc --noEmit`
- `lint` / `lint:fix` → eslint
- `format` / `format:check` → prettier

## Components

**`src/auth.ts`**
```typescript
export function getApiKey(): string
```
Finds the `<script src="...widget.js?key=...">` tag that loaded the widget,
parses the `key` query param from its `src`, and throws if no key is found.
Isolated in its own file because CAN-34 (auth + domain allowlist) will
extend this area next — likely adding allowlist-check logic alongside it.

**`src/ui.ts`**
```typescript
export function buildWidget(apiKey: string): { shadow: ShadowRoot; panel: HTMLElement }
```
Creates the host `<div id="rag-widget-host">` fixed to the bottom-right,
attaches a **closed** Shadow DOM root (external JS cannot reach into shadow
internals), injects a `<style>` block scoped to the shadow root, renders the
bubble button and an (initially empty/placeholder) chat panel, and wires the
bubble's click handler to toggle the panel open/closed. Returns `shadow` and
`panel` so the entry point can expose them for later tickets. Isolated here
because CAN-33 (chat UX) will replace the panel's placeholder content
entirely within this file, without touching auth or bootstrap logic.

**`src/widget.ts`** (entry point)
```typescript
function init(): void
```
Calls `getApiKey()`, then `buildWidget(apiKey)`, stores the result on
`(window as any).__ragWidget = { apiKey, shadow, panel }` for later tickets,
and guards execution behind `document.readyState` (runs immediately if the
DOM is already loaded, otherwise waits for `DOMContentLoaded`). This is the
file `bun build` points at directly; `auth.ts` and `ui.ts` are bundled into
the single output file via `bun build`'s default bundling behavior for a
single entrypoint.

## Data flow

1. Host page loads `<script src=".../widget.js?key=API_KEY"></script>`.
2. `widget.ts`'s top-level `readyState` guard runs `init()` immediately if
   the DOM is already loaded, otherwise on `DOMContentLoaded`.
3. `init()` calls `getApiKey()` — synchronously parses the key from the
   script tag's own `src`.
4. `init()` calls `buildWidget(apiKey)` — synchronously builds the host
   element, shadow root, styles, bubble, and panel; wires the click handler.
5. The result is stored on `window.__ragWidget` for CAN-33/CAN-34 to consume.

Everything in this ticket is synchronous DOM construction — no network
calls, no async logic (that arrives in CAN-33).

## Error handling

The only failure mode in scope is a missing/malformed API key.
`getApiKey()` throws a plain `Error('[RAG Widget] No API key found. Add
?key=YOUR_KEY to the script src.')`. Uncaught, this aborts `init()` before
any DOM is touched — no bubble renders, and the error is visible in the
browser console. This is the correct behavior for a scaffold: a
misconfigured embed should fail loudly and visibly to whoever installed the
script, not fail silently or render a broken partial UI. No try/catch, no
retry, no fallback UI — there is nothing sensible to fall back to without a
key.

## Testing & verification

No automated tests for this ticket. Manual verification via
`widget/test.html` — a minimal page with a heading, some body text, and
`<script src="./dist/widget.js?key=test123"></script>`, served via any
static file server (e.g. `bunx serve widget` or `python3 -m http.server`
from `widget/`). Confirm:

- The bubble renders in the bottom-right corner.
- Clicking the bubble toggles the panel open/closed.
- DevTools' Elements panel shows the widget living inside a `#shadow-root`
  under `#rag-widget-host`, not directly in the page's light DOM.
- Adding `button { background: red !important; }` to `test.html`'s own
  `<head>` does **not** change the bubble's purple color — proves Shadow DOM
  style isolation actually works, not just that a shadow root exists.

## Pre-commit wiring

Extend `.husky/pre-commit` (currently `cd backend && make lint && make
format-check`) to also run the widget's checks:

```sh
cd backend && make lint && make format-check
cd ../widget && bun run typecheck && bun run lint && bun run format:check
```

Same flat structure as today — no path-filtering (both backend and widget
checks always run regardless of which files changed), matching the
simplicity of the existing hook.

## Out of scope (deferred to later tickets)

- Chat message UI, streaming, citation cards → CAN-33
- API key transmission to the backend, domain allowlist enforcement → CAN-34
- Deployment (Railway/Vercel) → CAN-35
- Any automated/unit testing infrastructure for the widget
