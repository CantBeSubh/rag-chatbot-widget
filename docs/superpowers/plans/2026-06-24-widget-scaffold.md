# Widget Scaffold (CAN-32) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CAN-32 scaffold: a standalone bun-managed `widget/` package that compiles TypeScript to a single `dist/widget.js`, renders a chat bubble inside a closed Shadow DOM root on any page that loads it, and toggles an (empty) panel on click. No chat functionality — that's CAN-33/CAN-34.

**Architecture:** Three small TypeScript modules — `auth.ts` (reads the API key off the widget's own `<script>` tag), `ui.ts` (builds the Shadow DOM host, styles, bubble, panel), and `widget.ts` (the only bundle entrypoint; composes the other two and exposes the result on `window.__ragWidget`) — bundled into one file via bun's native bundler. `widget/` is a fully standalone bun package: its own `package.json`/`bun.lock`, independent of the repo root's `package.json` and of `backend/`.

**Tech Stack:** bun (package manager + runtime + bundler, no esbuild), TypeScript 5.x (strict, `target: ES2020`, `lib: ["ES2020", "DOM"]`, `noEmit: true`), ESLint 9 flat config + `typescript-eslint` + `eslint-config-prettier`, Prettier, the browser's native Shadow DOM API. No test framework — verification is `typecheck`/`lint`/`format:check`/`build` succeeding per task, plus one manual browser pass at the end (design decision: no unit-testable logic exists yet in this scaffold).

## Global Constraints

- Use bun for everything in `widget/` — `bun install`, `bun add -d <pkg>`, `bun run <script>`. Never `npm`/`yarn`/`pnpm`.
- `widget/` is a standalone bun package (own `package.json` + `bun.lock`), not a workspace under the repo root's `package.json`.
- Bundler is native `bun build` — no esbuild dependency anywhere in `widget/package.json`.
- `tsconfig.json`: `"target": "ES2020"`, `"lib": ["ES2020", "DOM"]`, `"strict": true`, `"noEmit": true` (bun build strips types/bundles; `tsc --noEmit` is the only type-checking step — there is no separate emit step to keep in sync).
- Shadow DOM mode must be `'closed'` (external page JS must not be able to reach widget internals via `element.shadowRoot`).
- No automated tests in this ticket. Each task's gate is `bun run typecheck && bun run lint && bun run format:check` (and `bun run build` where relevant) succeeding — not a test suite. Full behavioral verification (bubble renders, click toggles, Shadow DOM isolates styles) happens once in Task 5, manually, in a real browser.
- Out of scope, do not implement: chat message UI/streaming/citations (CAN-33), API-key transmission to the backend + domain allowlist enforcement (CAN-34), deployment (CAN-35).
- `widget/.gitignore` must exclude `node_modules/` and `dist/` — `dist/widget.js` is a build artifact, never committed.

---

### Task 1: Scaffold the bun package (TypeScript, ESLint, Prettier, build scripts)

**Files:**
- Create: `widget/package.json`
- Create: `widget/tsconfig.json`
- Create: `widget/.gitignore`
- Create: `widget/.prettierrc`
- Create: `widget/eslint.config.js`
- Create: `widget/src/widget.ts` (placeholder — replaced in Task 4)

**Interfaces:**
- Produces: working `bun run build|dev|typecheck|lint|lint:fix|format|format:check` scripts. Tasks 2–4 add real files under `widget/src/`; Task 4 replaces the placeholder `widget.ts`.

- [ ] **Step 1: Create the directory and static config files**

```bash
mkdir -p widget/src
```

Create `widget/package.json`:

```json
{
  "name": "rag-widget",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build src/widget.ts --outfile=dist/widget.js --minify --target=browser",
    "dev": "bun build src/widget.ts --outfile=dist/widget.js --watch --target=browser",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write src",
    "format:check": "prettier --check src"
  }
}
```

Create `widget/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `widget/.gitignore`:

```
node_modules/
dist/
```

Create `widget/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100
}
```

- [ ] **Step 2: Install dev dependencies**

```bash
cd widget
bun add -d typescript eslint @eslint/js typescript-eslint eslint-config-prettier prettier
```

Expected: `widget/bun.lock` and `widget/node_modules/` are created; `widget/package.json`'s `devDependencies` are populated automatically by bun.

- [ ] **Step 3: Create the ESLint config and a placeholder entrypoint**

Create `widget/eslint.config.js`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // TypeScript's own type-checking already catches undefined identifiers;
      // core no-undef produces false positives on DOM globals (window, document).
      'no-undef': 'off',
    },
  },
);
```

Create `widget/src/widget.ts` (temporary — Task 4 replaces this with the real bootstrap):

```typescript
export {};
```

- [ ] **Step 4: Format, typecheck, lint, and build — verify the whole pipeline is clean**

```bash
cd widget
bun run format
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all five commands exit 0. The last one produces `widget/dist/widget.js`.

- [ ] **Step 5: Commit**

```bash
git add widget/package.json widget/bun.lock widget/tsconfig.json widget/.gitignore widget/.prettierrc widget/eslint.config.js widget/src/widget.ts
git commit -m "chore(widget): scaffold bun package with TypeScript, ESLint, Prettier"
```

---

### Task 2: API key extraction (`auth.ts`)

**Files:**
- Create: `widget/src/auth.ts`

**Interfaces:**
- Consumes: nothing (browser `document`/`URL` APIs only).
- Produces: `getApiKey(): string` — throws if no key is found. Consumed by `widget.ts`'s `init()` in Task 4.

- [ ] **Step 1: Create `widget/src/auth.ts`**

```typescript
export function getApiKey(): string {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]');
  for (const script of Array.from(scripts)) {
    const url = new URL(script.src);
    const key = url.searchParams.get('key');
    if (key) return key;
  }
  throw new Error('[RAG Widget] No API key found. Add ?key=YOUR_KEY to the script src.');
}
```

- [ ] **Step 2: Format, typecheck, lint**

```bash
cd widget
bun run format
bun run typecheck
bun run lint
```

Expected: all exit 0. (Behavioral verification of `getApiKey()` — does it actually find the right key on a real page — happens in Task 5's browser check, not here; there's no test runner in this project for the widget.)

- [ ] **Step 3: Commit**

```bash
git add widget/src/auth.ts
git commit -m "feat(widget): add getApiKey() to read the API key from the script tag"
```

---

### Task 3: Shadow DOM widget shell (`ui.ts`)

**Files:**
- Create: `widget/src/ui.ts`

**Interfaces:**
- Consumes: nothing new (pure DOM construction).
- Produces: `interface WidgetElements { shadow: ShadowRoot; panel: HTMLElement }` and `buildWidget(): WidgetElements`. Consumed by `widget.ts`'s `init()` in Task 4.

- [ ] **Step 1: Create `widget/src/ui.ts`**

```typescript
export interface WidgetElements {
  shadow: ShadowRoot;
  panel: HTMLElement;
}

export function buildWidget(): WidgetElements {
  const host = document.createElement('div');
  host.id = 'rag-widget-host';
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
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
  `;
  shadow.appendChild(style);

  const bubble = document.createElement('button');
  bubble.id = 'bubble';
  bubble.innerHTML = '💬';
  bubble.setAttribute('aria-label', 'Open chat');
  shadow.appendChild(bubble);

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = '<p style="padding:16px;color:#6b7280;">Chat coming in M1-D3</p>';
  shadow.appendChild(panel);

  bubble.addEventListener('click', () => {
    panel.classList.toggle('open');
    bubble.innerHTML = panel.classList.contains('open') ? '✕' : '💬';
  });

  return { shadow, panel };
}
```

- [ ] **Step 2: Format, typecheck, lint**

```bash
cd widget
bun run format
bun run typecheck
bun run lint
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add widget/src/ui.ts
git commit -m "feat(widget): add buildWidget() — Shadow DOM host, bubble, panel"
```

---

### Task 4: Entry point — wire bootstrap (`widget.ts`)

**Files:**
- Modify: `widget/src/widget.ts` (replace the `export {};` placeholder from Task 1)

**Interfaces:**
- Consumes: `getApiKey()` from `auth.ts` (Task 2), `buildWidget()` + `WidgetElements` from `ui.ts` (Task 3).
- Produces: `window.__ragWidget: { apiKey: string; shadow: ShadowRoot; panel: HTMLElement }`, set once at bootstrap. Consumed by CAN-33/CAN-34 (out of scope here).

- [ ] **Step 1: Replace `widget/src/widget.ts` with the real bootstrap**

```typescript
import { getApiKey } from './auth';
import { buildWidget } from './ui';

declare global {
  interface Window {
    __ragWidget?: {
      apiKey: string;
      shadow: ShadowRoot;
      panel: HTMLElement;
    };
  }
}

function init(): void {
  const apiKey = getApiKey();
  const { shadow, panel } = buildWidget();
  window.__ragWidget = { apiKey, shadow, panel };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 2: Format, typecheck, lint**

```bash
cd widget
bun run format
bun run typecheck
bun run lint
```

Expected: all exit 0.

- [ ] **Step 3: Build and smoke-check the bundle**

```bash
cd widget
bun run build
grep -q "rag-widget-host" dist/widget.js && echo "bundle contains widget code"
```

Expected: prints `bundle contains widget code` (confirms `auth.ts`/`ui.ts` were actually inlined into the single output file, not just `widget.ts` alone).

- [ ] **Step 4: Commit**

```bash
git add widget/src/widget.ts
git commit -m "feat(widget): wire entry point — bootstrap on DOMContentLoaded"
```

---

### Task 5: Manual verification page (`test.html`)

**Files:**
- Create: `widget/test.html`

**Interfaces:**
- Consumes: `widget/dist/widget.js` (built in Task 4).
- Produces: nothing consumed by later tasks — this is the ticket's actual functional gate.

- [ ] **Step 1: Create `widget/test.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Widget Test</title>
  <style>
    /* Deliberately hostile host-page CSS, to prove Shadow DOM isolation */
    button { background: red !important; }
  </style>
</head>
<body>
  <h1>My Client's Website</h1>
  <p>Some existing content here.</p>
  <script src="./dist/widget.js?key=test123"></script>
</body>
</html>
```

- [ ] **Step 2: Build and serve**

```bash
cd widget && bun run build && cd ..
bunx serve widget
```

Expected: `serve` prints a local URL (typically `http://localhost:3000`).

- [ ] **Step 3: Manually verify in a browser**

Open `<printed-url>/test.html` and confirm, one by one:

- A purple circular chat bubble renders in the bottom-right corner of the page.
- Clicking the bubble shows the panel with the text "Chat coming in M1-D3"; the bubble's icon switches from 💬 to ✕. Clicking again hides the panel and switches the icon back.
- In DevTools → Elements, `#rag-widget-host` contains a `#shadow-root (closed)` node, with `#bubble` and `#chat-panel` nested inside it — they do **not** appear as direct children of `<body>`.
- Despite the page's `button { background: red !important; }` rule in `<head>`, the bubble stays purple (`#6366f1`) on load and darker purple (`#4f46e5`) on hover — this is the proof that Shadow DOM style isolation actually works, not just that a shadow root exists.

This step has no automated assertion — check each bullet visually before marking the task done.

- [ ] **Step 4: Stop the server and commit**

```bash
git add widget/test.html
git commit -m "test(widget): add manual verification page for CAN-32 done-criteria"
```

---

### Task 6: Wire widget checks into the pre-commit hook

**Files:**
- Modify: `.husky/pre-commit` (repo root)

**Interfaces:** none — process-only change.

- [ ] **Step 1: Extend the pre-commit hook**

Current `.husky/pre-commit`:

```
cd backend && make lint && make format-check
```

Replace with:

```sh
cd backend && make lint && make format-check
cd ../widget && bun run typecheck && bun run lint && bun run format:check
```

- [ ] **Step 2: Verify the hook runs clean from the repo root**

```bash
sh .husky/pre-commit
```

Expected: exit code 0 — backend's `make lint`/`make format-check` and widget's `typecheck`/`lint`/`format:check` all pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add .husky/pre-commit
git commit -m "chore: run widget typecheck/lint/format checks in pre-commit"
```
