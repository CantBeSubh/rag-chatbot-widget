# Shadcn Sidebar — Design Spec

**Date:** 2026-06-30  
**Scope:** `admin/` (Next.js app)

---

## Goal

Add a shadcn `Sidebar` to the admin dashboard shell. The sidebar replaces the current Clerk-header-only layout in `app/dashboard/layout.tsx`, provides navigation for all dashboard pages plus a Widget Preview link, and surfaces the `UserButton` and `ThemeToggle` in its footer.

---

## Scope

- Sidebar wraps `/dashboard/*` only (via `app/dashboard/layout.tsx`).
- `/widget`, `/onboarding`, `/features`, `/pricing`, and the root landing page are unaffected.
- The `/widget` route is intentionally an iframe shell — its layout hides all chrome. It appears as a sidebar nav link that opens in a new tab, not as a route inside the dashboard shell.

---

## Nav items

| Label | Route | Icon | Target |
|---|---|---|---|
| Sources | `/dashboard/sources` | `Database` | same tab |
| Logs | `/dashboard/logs` | `ScrollText` | same tab |
| Config | `/dashboard/config` | `SlidersHorizontal` | same tab |
| Settings | `/dashboard/settings` | `Settings` | same tab |
| Widget Preview | `/widget` | `ExternalLink` | `_blank` |

Active state: driven by `usePathname()` exact match on each href. Widget Preview is never marked active (it's an external-style link).

---

## Layout structure

```
SidebarProvider
  AppSidebar
    SidebarHeader      → "Wizz AI" wordmark
    SidebarContent
      SidebarGroup     → main nav: Sources, Logs, Config, Settings
      SidebarGroup     → Widget Preview (new tab)
    SidebarFooter
      ThemeToggle      → existing component from src/components/theme-toggle.tsx
      UserButton       → Clerk <UserButton /> inside a SidebarMenuItem
  SidebarInset
    {children}         → dashboard page content
```

`SidebarInset` handles the content margin shift automatically when the sidebar opens/collapses. No manual margin CSS needed.

---

## Files

### Install
Run `bunx shadcn@latest add sidebar` from `admin/` — generates `src/components/ui/sidebar.tsx` and patches `globals.css` with sidebar CSS variables.

### Create
**`src/components/app-sidebar.tsx`** — `"use client"` component.  
Contains the full sidebar: nav items array, `usePathname()` for active state, `SidebarHeader`/`SidebarContent`/`SidebarFooter` slots, `ThemeToggle`, and Clerk `<UserButton />`.

### Modify
**`src/app/dashboard/layout.tsx`** — replace the current `<header>` + Clerk show/hide block with:
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>
```
Clerk `Show` / `SignInButton` / `SignUpButton` blocks in the header are removed — auth gating is handled elsewhere (onboarding redirect) and `UserButton` moves to the sidebar footer.

---

## Constraints

- `app-sidebar.tsx` is a client component (`"use client"`) — needs `usePathname`.
- It lives in `src/components/` (shared layout component), not `src/views/` (the views pattern applies to feature UI, not shell components).
- No barrel `index.ts` in `src/components/` — import directly from the file path.
- Widget Preview link uses `target="_blank" rel="noopener noreferrer"`.
- The existing `ThemeToggle` component is reused as-is — no changes needed.
- The `/widget` layout hides `body > header` via CSS; after this change there is no `<header>` element in the DOM for dashboard routes, so that CSS rule is a no-op and harmless.
