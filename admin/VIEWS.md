# Views Pattern

All feature UI lives under `src/views/`, mirroring the `app/` route structure. Route files in `app/` are thin Server Components that only import and render the view.

## Directory structure

```
src/
  app/dashboard/sources/
    page.tsx                   ← Server Component, imports SourcesView, nothing else
  views/dashboard/sources/
    constants.ts               ← view-level constants (e.g. PENDING statuses)
    interface.ts               ← types introduced by this view (omit if none)
    logic.ts                   ← custom hook (useState, useQuery, useMutation, etc.)
    view.tsx                   ← "use client", stitches logic + sub-components
    _components/
      columns.tsx              ← stateless — no split needed (see rule below)
      add-url-dialog/
        interface.ts
        logic.ts
        view.tsx
```

## Rules

### The three files
| File | Contains | Extension |
|---|---|---|
| `view.tsx` | JSX only — calls hook from `logic.ts`, renders sub-components | `.tsx` |
| `logic.ts` | Custom hook — all `useState`, `useQuery`, `useMutation`, `useRef`, etc. | `.ts` (no JSX) |
| `interface.ts` | Types introduced by this view or component | `.ts` (no JSX) |
| `constants.ts` | View-level constants shared across the three files above | `.ts` |

### Client boundary
`"use client"` goes on `view.tsx` only. `logic.ts` and `interface.ts` never need it — they're pulled into the client boundary by the import chain. The route `page.tsx` stays a Server Component.

### _components
Sub-components live in `views/…/_components/`. They follow the same view/logic/interface split **only when there is actually something to split**:
- Has state or data fetching → create all three files
- Purely stateless (e.g. a column definition factory, a static card) → single `.tsx` file, no split

### interface.ts
Only create `interface.ts` when the view introduces new types. If all types come from `@/server/` or an external library, skip the file.

### Promoting to shared components
If a component ends up used in 3+ places, move it to `src/components/common/`. Don't preemptively extract — wait until the third usage.

### No barrel files
Do not add `index.ts` inside `_components/`. Import directly from the file path. Barrel files inflate the bundle (Vercel `bundle-barrel-imports` rule).

### Deduplication with React Query
Queries with the same `queryKey` are automatically deduplicated by React Query's cache. Keep hooks in their own `logic.ts` per page and trust the cache. Only extract to `src/hooks/` when the same hook is used in 3+ views.
