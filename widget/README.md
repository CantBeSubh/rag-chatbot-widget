# Widget

Embeddable chat widget — a single `<script>` tag that clients paste into their
site. Built standalone with [bun](https://bun.sh) (its own `package.json` /
`bun.lock`, independent of `backend/` and the repo root).

Currently scaffold-only (CAN-32): a chat bubble in a closed Shadow DOM root
that toggles an empty panel. Chat functionality lands in CAN-33/CAN-34.

## Structure

- `src/auth.ts` — `getApiKey()`: reads the `key` query param off the widget's
  own `<script src="...widget.js?key=...">` tag.
- `src/ui.ts` — `buildWidget()`: creates the `#rag-widget-host` element,
  attaches a **closed** Shadow DOM root, and renders the bubble + panel inside
  it for style isolation from the host page.
- `src/widget.ts` — bundle entry point. Composes `auth.ts` + `ui.ts` on
  `DOMContentLoaded` and exposes the result on `window.__ragWidget`.
- `dist/widget.js` — build output (gitignored, not committed).
- `test.html` — manual verification page (see below).

## Setup

```bash
bun install
```

## Build

```bash
bun run build   # one-shot minified build -> dist/widget.js
bun run dev     # rebuild on file change
```

## Typecheck, lint, format

```bash
bun run typecheck     # tsc --noEmit
bun run lint          # eslint src
bun run lint:fix
bun run format
bun run format:check
```

These also run in the repo's pre-commit hook (`.husky/pre-commit`).

## Embedding the widget

```html
<script src="https://your-cdn/widget.js?key=YOUR_API_KEY"></script>
```

The widget reads `key` off its own script tag and throws if it's missing.

## Manual verification

There's no test runner for this scaffold — `test.html` is the functional
gate, loaded with a deliberately hostile `button { background: red !important; }`
host-page style to prove Shadow DOM isolation.

```bash
bun run build
bunx serve .
```

Open `<printed-url>/test.html` and confirm:

- A purple circular bubble renders bottom-right.
- Clicking it shows the panel ("Chat coming in M1-D3") and the icon switches
  💬 ↔ ✕; clicking again hides it.
- DevTools → Elements: `#rag-widget-host` contains a `#shadow-root (closed)`
  node with `#bubble`/`#chat-panel` nested inside — not direct children of
  `<body>`.
- The bubble stays purple (`#6366f1`, darker `#4f46e5` on hover) despite the
  page's `red !important` rule.
