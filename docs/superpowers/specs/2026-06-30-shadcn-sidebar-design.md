# Shadcn Sidebar — Design Spec

**Date:** 2026-06-30  
**Scope:** `admin/` (Next.js app)

---

## Goal

Add a shadcn `Sidebar` to the admin dashboard shell. The sidebar replaces the current Clerk-header-only layout in `app/dashboard/layout.tsx`, provides navigation for all dashboard pages plus a Widget Preview link, and surfaces a custom user row and `ThemeToggle` in its footer.

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
      NavUser          → custom full-width SidebarMenuButton (size lg):
                         avatar (shadcn Avatar) + name + ChevronUp icon,
                         wrapped in DropdownMenu with:
                           • "View profile" → clerk.openUserProfile()
                           • "Sign out"     → clerk.signOut()
                         Data sourced from useUser(); actions from useClerk().
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
Contains the full sidebar: nav items array, `usePathname()` for active state, `SidebarHeader`/`SidebarContent`/`SidebarFooter` slots, `ThemeToggle`, and the custom NavUser footer row.  
The NavUser row uses `useUser()` for avatar URL + display name and `useClerk()` for `signOut()` and `openUserProfile()`. Clerk's `<UserButton />` component is not used. Rendered with shadcn `Avatar`, `DropdownMenu`, and `SidebarMenuButton` (size `lg`).

### Modify
**`src/app/dashboard/layout.tsx`** — replace the current `<header>` + Clerk show/hide block with:
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>
```
Clerk `Show` / `SignInButton` / `SignUpButton` / `UserButton` blocks in the header are removed entirely — auth gating is handled elsewhere (onboarding redirect) and the user row moves to the sidebar footer as a custom NavUser component.

---

## Constraints

- `app-sidebar.tsx` is a client component (`"use client"`) — needs `usePathname`.
- It lives in `src/components/` (shared layout component), not `src/views/` (the views pattern applies to feature UI, not shell components).
- No barrel `index.ts` in `src/components/` — import directly from the file path.
- Widget Preview link uses `target="_blank" rel="noopener noreferrer"`.
- The existing `ThemeToggle` component is reused as-is — no changes needed.
- Clerk's `<UserButton />` component is not used anywhere in the dashboard after this change. `useUser()` + `useClerk()` replace it.
- The `/widget` layout hides `body > header` via CSS; after this change there is no `<header>` element in the DOM for dashboard routes, so that CSS rule is a no-op and harmless.
- The `shadcn add sidebar` command also installs the `Avatar` component if not already present — needed for the NavUser row.
