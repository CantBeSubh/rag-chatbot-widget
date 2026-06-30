# Shadcn Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's bare Clerk header with a shadcn `Sidebar` containing full nav, a Widget Preview external link, and a custom user row in the footer.

**Architecture:** The sidebar is installed as a shadcn component and wrapped in a single `AppSidebar` client component. The dashboard layout (`app/dashboard/layout.tsx`) gains `SidebarProvider` + `SidebarInset` as its shell. The user footer row uses `useUser()` + `useClerk()` directly — Clerk's `<UserButton />` component is not used.

**Tech Stack:** Next.js 16, shadcn/ui (sidebar, avatar), Clerk (`useUser`, `useClerk`), lucide-react, Tailwind CSS 4

## Global Constraints

- Use `bun` / `bunx` for all package and script operations — never `npm` or `npx`
- All new components: no barrel `index.ts` — import by direct file path
- `"use client"` goes on `app-sidebar.tsx` only; `dashboard/layout.tsx` stays a Server Component
- No tests — user handles QA manually
- Import order must satisfy `eslint-plugin-simple-import-sort`: React/Next → third-party → `@/` aliases → relative
- Widget Preview link: `target="_blank" rel="noopener noreferrer"`
- Active state: `usePathname()` exact match; Widget Preview is never marked active
- Working directory for all commands: `admin/`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Install (generated) | `src/components/ui/sidebar.tsx` | shadcn sidebar primitives |
| Install (generated) | `src/components/ui/avatar.tsx` | Avatar primitive for NavUser row |
| Create | `src/components/app-sidebar.tsx` | Full sidebar: nav items, active state, ThemeToggle, NavUser footer |
| Modify | `src/app/dashboard/layout.tsx` | Wrap children in `SidebarProvider` + `AppSidebar` + `SidebarInset` |

---

## Task 1: Install shadcn sidebar and avatar components

**Files:**
- Generate: `src/components/ui/sidebar.tsx`
- Generate: `src/components/ui/avatar.tsx`
- Patch: `src/app/globals.css` (sidebar CSS variables added automatically)

**Interfaces:**
- Produces: `Sidebar`, `SidebarProvider`, `SidebarInset`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` — all from `@/components/ui/sidebar`
- Produces: `Avatar`, `AvatarImage`, `AvatarFallback` — from `@/components/ui/avatar`

- [ ] **Step 1: Add sidebar component**

Run from `admin/`:
```bash
bunx shadcn add sidebar
```
When prompted to overwrite existing files, accept. This generates `src/components/ui/sidebar.tsx` and injects `--sidebar-*` CSS variables into `globals.css`.

- [ ] **Step 2: Add avatar component**

```bash
bunx shadcn add avatar
```
Generates `src/components/ui/avatar.tsx`. (Sidebar does not pull this in automatically — needed for the NavUser row.)

- [ ] **Step 3: Verify generated files exist**

```bash
ls src/components/ui/sidebar.tsx src/components/ui/avatar.tsx
```
Expected: both paths print without error.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sidebar.tsx src/components/ui/avatar.tsx src/app/globals.css
git commit -m "chore: add shadcn sidebar and avatar components"
```

---

## Task 2: Create `app-sidebar.tsx`

**Files:**
- Create: `src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes (from Task 1): `Sidebar`, `SidebarProvider`, `SidebarInset`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` from `@/components/ui/sidebar`
- Consumes (from Task 1): `Avatar`, `AvatarImage`, `AvatarFallback` from `@/components/ui/avatar`
- Consumes (existing): `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- Consumes (existing): `ThemeToggle` from `@/components/theme-toggle`
- Produces: `AppSidebar` — default-exported client component, no props

- [ ] **Step 1: Create `src/components/app-sidebar.tsx`**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useClerk, useUser } from "@clerk/nextjs"
import { ChevronUp, Database, ExternalLink, LogOut, ScrollText, Settings, SlidersHorizontal, User } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
  { label: "Sources", href: "/dashboard/sources", icon: Database },
  { label: "Logs", href: "/dashboard/logs", icon: ScrollText },
  { label: "Config", href: "/dashboard/config", icon: SlidersHorizontal },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
]

function NavUser() {
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? ""} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user?.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
              <ChevronUp className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            className="w-[--radix-dropdown-menu-trigger-width]"
          >
            <DropdownMenuItem onClick={() => openUserProfile()}>
              <User className="mr-2 h-4 w-4" />
              View profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard/sources">
                <span className="font-semibold text-base">Wizz AI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={pathname === href}>
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/widget" target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    <span>Widget Preview</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-end px-2 pb-1">
          <ThemeToggle />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors. If `user?.firstName` triggers a type error on index `0`, fix with `(n ?? "")[0]` instead of `n![0]`.

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add AppSidebar with nav items and custom NavUser footer"
```

---

## Task 3: Wire sidebar into dashboard layout

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes (from Task 1): `SidebarProvider`, `SidebarInset` from `@/components/ui/sidebar`
- Consumes (from Task 2): `AppSidebar` from `@/components/app-sidebar`

- [ ] **Step 1: Replace `src/app/dashboard/layout.tsx`**

The current file uses `Show`, `SignInButton`, `SignUpButton`, `UserButton` from Clerk in a header element. Replace it entirely:

```tsx
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
bun run lint
```
Expected: no errors. If `simple-import-sort` complains, the import order in the file above is: `@/components/app-sidebar` then `@/components/ui/sidebar` — adjust alphabetically if the rule requires it.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat: replace dashboard header with shadcn sidebar shell"
```
