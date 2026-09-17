# TanStack Start — learn how `apps/web` works

**Who this is for:** you, learning this codebase. When this doc names a concept, it also tells you **which file to open**, **what the syntax means**, and **what happens at runtime**.

**Related:** [WORKFLOW.md](./WORKFLOW.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ANALYZERS.md](./ANALYZERS.md) · [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) · [TCP_INGESTION_DRIVER.md](./TCP_INGESTION_DRIVER.md) (edge TCP — separate Nest app)

---

## Table of contents

0. [Read this first — the picture in your head](#0--read-this-first--the-picture-in-your-head)
1. [Glossary — every term this doc uses](#1--glossary--every-term-this-doc-uses)
2. [Where every important file lives (jump list)](#2--where-every-important-file-lives-jump-list)
3. [Layouts and `<Outlet />` — crystal clear](#3--layouts-and-outlet----crystal-clear) — includes [why Flask/title appears in both sidebar and `_lab` header](#why-flask--drax-hall-lis--workbench-appears-twice-appsidebar--_lab-header) and [dock+grid breakpoint rule](#responsive-rule--dock-and-css-columns-must-share-a-breakpoint)
4. [`export const Route` vs Next’s exported page component](#4--export-const-route-vs-nexts-exported-page-component)
5. [`createFileRoute` — Bench page line by line](#5--createfileroute--bench-page-line-by-line)
6. [How the router boots (`router.tsx` + `routeTree.gen.ts`)](#6--how-the-router-boots-routertsx--routetreegents)
7. [Other route patterns (redirect, login search)](#7--other-route-patterns-redirect-login-search)
8. [TanStack Query on a page (how Bench loads data)](#8--tanstack-query-on-a-page-how-bench-loads-data)
9. [TanStack Start vs Next.js — differences, momentum, why here](#9--tanstack-start-vs-nextjs--differences-momentum-why-here)
10. [Public files / logos / CSS](#10--public-files--logos--css)
11. [Vite + Start — what those packages are](#11--vite--start--what-those-packages-are)
12. [Appendix — machine data file map (not the web UI)](#12--appendix--machine-data-file-map-not-the-web-ui)
13. [Cheat sheet](#13--cheat-sheet)

---

## 0 — Read this first — the picture in your head

This monorepo’s UI lives in **`apps/web`**. It is **not** Next.js.

When you open `http://localhost:3100/bench` in the browser, React does **not** only render the Bench table. It stacks **three layers**:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ROOT LAYOUT                                              │
│    File: apps/web/src/routes/__root.tsx                     │
│    Component: RootComponent → RootDocument                  │
│    Job: <html>, <head>, auth providers                      │
│    Hole for children: <Outlet />   ← about line 36          │
│                                                             │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ 2. LAB LAYOUT (sidebar + header)                    │  │
│    │    File: apps/web/src/routes/_lab.tsx               │  │
│    │    Component: LabLayout                             │  │
│    │    Job: AppSidebar, top bar, QueryClientProvider    │  │
│    │    Hole for children: <Outlet />   ← about line 95  │  │
│    │                                                     │  │
│    │    ┌─────────────────────────────────────────────┐  │  │
│    │    │ 3. PAGE (Bench, Accession, …)               │  │  │
│    │    │    File: apps/web/src/routes/_lab/bench.tsx │  │  │
│    │    │    Component: BenchPage                     │  │  │
│    │    │    Job: the actual screen content           │  │  │
│    │    └─────────────────────────────────────────────┘  │  │
│    └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**`<Outlet />` is the hole.** Parent layouts draw chrome around that hole. The child route’s `component` is what gets painted **into** the hole.

There are **two** primary layout files / layout components in this app (not one):

| Layer | File you open | **Our layout component** (function name) | Where we put `<Outlet />` |
| --- | --- | --- | --- |
| Document / auth | [`apps/web/src/routes/__root.tsx`](../apps/web/src/routes/__root.tsx) | **`RootComponent`** (helper: `RootDocument`) | Inside `RootComponent`, under `AuthProvider` |
| Lab chrome (sidebar) | [`apps/web/src/routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx) | **`LabLayout`** | Inside `LabLayout`, in the main column after the header |

Those two function names — **`RootComponent`** and **`LabLayout`** — are the only “layout components” in this app that contain `<Outlet />`. Details in [§3](#3--layouts-and-outlet----crystal-clear). What `export const Route` means vs Next’s `export default function Page` is in [§4](#4--export-const-route-vs-nexts-exported-page-component).

Login (`/login`) uses **only** `RootComponent` — it is **not** under `_lab`, so `LabLayout` never mounts and you get **no** sidebar. Bench **is** under `_lab`, so you get both layouts.

---

## 1 — Glossary — every term this doc uses

| Term | Plain English | Where you see it here |
| --- | --- | --- |
| **Vite** | Dev server + bundler (what runs `apps/web` in dev) | [`apps/web/vite.config.ts`](../apps/web/vite.config.ts) |
| **TanStack Start** | Framework plugin on top of Vite that wires the app shell + Router | `tanstackStart()` in `vite.config.ts` |
| **TanStack Router** | Library that maps URLs → React components via route files | imports from `@tanstack/react-router` |
| **TanStack Query** | Library for fetching/caching server data (`useQuery`) | `@tanstack/react-query` in `_lab.tsx` / `bench.tsx` |
| **Route file** | A file under `src/routes/` that **exports** `Route` | e.g. `bench.tsx` |
| **`createFileRoute`** | Function that builds a typed route config for one file | Top of most route files |
| **`export const Route`** | Exported **route config** for the router/codegen (not “export the page so other UI can import it”). Points at a component via `component:` | Required in every route file — see [§4](#4--export-const-route-vs-nexts-exported-page-component) |
| **Pathless route / `_lab`** | Layout whose name starts with `_` so `_lab` is **not** in the URL | [`_lab.tsx`](../apps/web/src/routes/_lab.tsx) → component **`LabLayout`**; wraps `/bench`; URL stays `/bench` |
| **`<Outlet />`** | Library tag meaning “render the matched child route here”; we put it inside **`RootComponent`** and **`LabLayout` only** | [`__root.tsx`](../apps/web/src/routes/__root.tsx), [`_lab.tsx`](../apps/web/src/routes/_lab.tsx) |
| **`routeTree.gen.ts`** | Auto-generated file that imports all routes and nests them | [`apps/web/src/routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts) — **do not edit** |
| **`getRouter()`** | Function that creates the live router instance | [`apps/web/src/router.tsx`](../apps/web/src/router.tsx) |
| **Search params** | The `?q=foo&analyzer=…` part of the URL | `validateSearch` + `Route.useSearch()` |
| **`component:`** | Which React function to render when this route matches | e.g. `component: BenchPage` |
| **Layout** | A route whose job is chrome + `<Outlet />`, not a full page alone | `__root.tsx`, `_lab.tsx` |
| **Page** | A leaf route: the screen content (Bench, Patients, …) | `_lab/bench.tsx`, etc. |

---

## 2 — Where every important file lives (jump list)

Open these in the IDE while you read.

### App shell (routing)

| File | Open it for… |
| --- | --- |
| [`apps/web/vite.config.ts`](../apps/web/vite.config.ts) | How Start/Vite are plugged in |
| [`apps/web/src/router.tsx`](../apps/web/src/router.tsx) | `createRouter`, QueryClient defaults |
| [`apps/web/src/routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts) | Generated parent/child links (proof `_lab` parents `/bench`) |
| [`apps/web/src/styles.css`](../apps/web/src/styles.css) | Global CSS |
| [`apps/web/package.json`](../apps/web/package.json) | Scripts (`dev` on port 3100) and dependencies |

### Layouts (the two parents)

| File | Role |
| --- | --- |
| [`apps/web/src/routes/__root.tsx`](../apps/web/src/routes/__root.tsx) | **Primary document layout** — `<html>`, auth, first `<Outlet />` |
| [`apps/web/src/routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx) | **Primary lab UI layout** — sidebar, header, second `<Outlet />` |

### Pages (children that fill the lab `<Outlet />`)

| URL in browser | File |
| --- | --- |
| `/` | [`apps/web/src/routes/index.tsx`](../apps/web/src/routes/index.tsx) (redirects to `/bench`) |
| `/login` | [`apps/web/src/routes/login.tsx`](../apps/web/src/routes/login.tsx) (child of **root only**, no sidebar) |
| `/bench` | [`apps/web/src/routes/_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) |
| `/accession` | [`apps/web/src/routes/_lab/accession.tsx`](../apps/web/src/routes/_lab/accession.tsx) |
| `/release` | [`apps/web/src/routes/_lab/release.tsx`](../apps/web/src/routes/_lab/release.tsx) |
| `/patients` | [`apps/web/src/routes/_lab/patients.tsx`](../apps/web/src/routes/_lab/patients.tsx) |
| `/labels` | [`apps/web/src/routes/_lab/labels.tsx`](../apps/web/src/routes/_lab/labels.tsx) |
| `/orders` | [`apps/web/src/routes/_lab/orders.tsx`](../apps/web/src/routes/_lab/orders.tsx) |
| `/messages` | [`apps/web/src/routes/_lab/messages.tsx`](../apps/web/src/routes/_lab/messages.tsx) |
| `/staff` | [`apps/web/src/routes/_lab/staff.tsx`](../apps/web/src/routes/_lab/staff.tsx) |
| `/sync` | [`apps/web/src/routes/_lab/sync.tsx`](../apps/web/src/routes/_lab/sync.tsx) |
| `/profile` | [`apps/web/src/routes/_lab/profile.tsx`](../apps/web/src/routes/_lab/profile.tsx) |
| `/register` | [`apps/web/src/routes/_lab/register.tsx`](../apps/web/src/routes/_lab/register.tsx) |

### Supporting code (not routes)

| Folder / file | Role |
| --- | --- |
| [`apps/web/src/components/`](../apps/web/src/components/) | Reusable UI (sidebar, buttons, Bench empty state, …). **Not** URL routes. |
| [`apps/web/src/components/app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) | Sidebar rendered by `LabLayout` |
| [`apps/web/src/lib/`](../apps/web/src/lib/) | Helpers: API client, auth, analyzer labels, … |
| [`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts) | HTTP calls to edge-engine / cloud API |
| [`apps/web/src/lib/auth.tsx`](../apps/web/src/lib/auth.tsx) | `AuthProvider` used in `__root.tsx` |

Folder layout on disk:

```
apps/web/
  vite.config.ts
  package.json
  public/                    ← optional; create when you add /logo.png etc.
  src/
    router.tsx
    routeTree.gen.ts         ← generated
    styles.css
    routes/
      __root.tsx             ← layout layer 1
      index.tsx
      login.tsx
      _lab.tsx               ← layout layer 2
      _lab/
        bench.tsx            ← page for /bench
        accession.tsx
        ...
    components/
    lib/
```

---

## 3 — Layouts and `<Outlet />` — crystal clear

### What is `<Outlet />`?

`<Outlet />` is a React component **imported from the library** `@tanstack/react-router` (see the import at the top of `__root.tsx` and `_lab.tsx`).

It means: **“Router, paint the matched child route’s UI right here in my JSX.”**

It is the TanStack equivalent of Next.js App Router’s `{children}` prop in a `layout.tsx`.

**Important clarifications:**

- We did **not** create an `Outlet.tsx` file in this repo.
- We do **not** “replace” `<Outlet />` with something else.
- We **write JSX that includes** `<Outlet />` as one of the tags inside **our** layout function components — the same way you’d write `<div>` or `<header>`. The router fills that tag with the child page at runtime.

---

### Exactly which things are “our layout components” in this app?

In **this** application there are only **two** layout components that contain `<Outlet />`. Both are ordinary React function components defined **inside route files** (not under `src/components/`).

| # | Layout component (function name) | File where it is defined | Does it contain `<Outlet />`? | What wraps the outlet? |
| --- | --- | --- | --- | --- |
| 1 | **`RootComponent`** | [`apps/web/src/routes/__root.tsx`](../apps/web/src/routes/__root.tsx) | **Yes** — about line 36 | Auth + HTML document shell |
| 2 | **`LabLayout`** | [`apps/web/src/routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx) | **Yes** — about line 95 | Sidebar, header, providers |

That is the full list for this app. No other file places `<Outlet />`.

**Related helpers that are *not* layout routes:**

| Name | File | Is it a layout route? | Why it exists |
| --- | --- | --- | --- |
| `RootDocument` | same `__root.tsx` | **No** — helper only | Renders `<html>` / `<head>` / `<body>`; receives `children`, not `<Outlet />` |
| `AuthTokenBridge` | same `__root.tsx` | **No** | Wires auth tokens into `lib/api.ts`; returns `null` |
| `AppSidebar` | [`apps/web/src/components/app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) | **No** | UI chrome **used by** `LabLayout`; it does not own an `<Outlet />` |
| `BenchPage`, `LoginPage`, … | `_lab/bench.tsx`, `login.tsx`, … | **No** — these are **pages** | They fill the hole; they do not leave a hole for a further child |

**Rule of thumb:**

- **Layout component** = has `<Outlet />` (or Next’s `{children}`) so a child route can appear inside it.
- **Page component** = the leaf UI (`BenchPage`, etc.). No `<Outlet />` unless that page itself had nested child routes (this app’s lab pages do not).

How the route config **points at** those layout components:

| Route export lives in | Config says | So the router renders… |
| --- | --- | --- |
| `__root.tsx` → `export const Route = createRootRouteWithContext…` | `component: RootComponent` | `RootComponent` (layout #1) |
| `_lab.tsx` → `export const Route = createFileRoute("/_lab")` | `component: LabLayout` | `LabLayout` (layout #2) |
| `_lab/bench.tsx` → `export const Route = createFileRoute("/_lab/bench")` | `component: BenchPage` | `BenchPage` (page, into Lab’s outlet) |

So: **“our layout components” = `RootComponent` and `LabLayout`.** Those are the only places we put `<Outlet />`.

---

### Layout 1 — `RootComponent` in `__root.tsx`

**File:** [`apps/web/src/routes/__root.tsx`](../apps/web/src/routes/__root.tsx)

**Why the name `__root`?** Special TanStack convention: double underscore + `root` = the top of the route tree. Every URL goes through this file.

**Exported route** (about lines 17–29):

```ts
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Drax Hall LIS" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});
```

**Syntax explained:**

| Piece | Meaning |
| --- | --- |
| `createRootRouteWithContext<{ queryClient: QueryClient }>()` | Create the **root** route (not a normal file route). The generic tells TypeScript: “every route can see a `queryClient` on context.” |
| `()({ ... })` | Curried call: first `()` locks the context type; second `(config)` passes options. |
| `head: () => ({ ... })` | Function that returns document head tags (title, meta, CSS link). TanStack Start puts these into the HTML `<head>`. |
| `component: RootComponent` | When any URL loads, render **this** function component as the outermost UI. |

**`RootComponent`** (same file, about lines 31–39) — layout component #1. Look at the JSX: this is where we **place** `<Outlet />`:

```tsx
function RootComponent() {
  return (
    <RootDocument>
      <AuthProvider>
        <AuthTokenBridge />
        <Outlet />   {/* ← library component; router fills this with the child route */}
      </AuthProvider>
    </RootDocument>
  );
}
```

What each child means:

| Element | What it does |
| --- | --- |
| `RootDocument` | Local helper (same file) that outputs `<html>`, `<head>`, `<body>` |
| `AuthProvider` | From [`lib/auth.tsx`](../apps/web/src/lib/auth.tsx) — login session for the whole app |
| `AuthTokenBridge` | Same file — copies auth tokens into the API client |
| `<Outlet />` | **Hole #1** — next matched child (`LoginPage`, or `LabLayout`, or the `/` redirect route) |

**`RootDocument`** (about lines 53–65):

```tsx
function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
```

| Piece | Meaning |
| --- | --- |
| `children` | Whatever `RootComponent` passed in (auth + `<Outlet />`) |
| `HeadContent` | TanStack component that injects the `head:` config (title, CSS) |
| `Scripts` | TanStack component that injects the JS bundles for hydration |
| `suppressHydrationWarning` | React prop: don’t warn if server HTML and client HTML differ slightly (themes/extensions often cause this on `<html>`) |

Notice: `RootDocument` uses React’s normal **`{children}`** prop. It does **not** use `<Outlet />`. Only **`RootComponent`** (the route’s `component`) uses `<Outlet />`, because only the router knows which **route** is the child.

**Next.js analogy:** `__root.tsx` ≈ `app/layout.tsx` that owns `<html>` and `<body>`.

---

### Layout 2 — `LabLayout` in `_lab.tsx`

**File:** [`apps/web/src/routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx)

**Why the name `_lab`?** In TanStack file routing, a leading `_` marks a **pathless layout**:

- Folder / file: `_lab`
- Route id: `/_lab`
- **URL does NOT contain** `/_lab`
- Child file `_lab/bench.tsx` → browser URL **`/bench`**, still wrapped by this layout

**Exported route** (lines 17–19):

```ts
export const Route = createFileRoute("/_lab")({
  component: LabLayout,
});
```

| Piece | Meaning |
| --- | --- |
| `createFileRoute("/_lab")` | “This file owns the pathless layout id `/_lab`.” The string must match this file’s place in the tree. |
| `component: LabLayout` | Render **`LabLayout`** whenever a child under `_lab` matches (Bench, Accession, …). |

**`LabLayout`** (same file, starting about line 34) — layout component #2.

Near the bottom of its JSX (about line 95) you will find where we **place** the second `<Outlet />`:

```tsx
{/* inside LabLayout’s return, in the main column */}
<Outlet />   {/* ← Hole #2: BenchPage / Accession / etc. appear here */}
```

That hole sits under the header, beside `AppSidebar`. Open `_lab.tsx` and scroll to that line — you will see the real JSX structure (sidebar, header, then `<Outlet />`).

**What `LabLayout` also wraps (same file):**

| Import | From file | Job |
| --- | --- | --- |
| `QueryClientProvider` | `@tanstack/react-query` | Makes `useQuery` work for all lab pages |
| `ThemeProvider` | [`components/theme-provider.tsx`](../apps/web/src/components/theme-provider.tsx) | Light/dark theme |
| `AppSidebar` | [`components/app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) | Left nav |
| `MobileBottomNav` | [`components/mobile-bottom-nav.tsx`](../apps/web/src/components/mobile-bottom-nav.tsx) | Mobile nav |
| `CommandPalette` | [`components/command-palette.tsx`](../apps/web/src/components/command-palette.tsx) | Search overlay |
| `NotificationCenter` | [`components/notification-center.tsx`](../apps/web/src/components/notification-center.tsx) | Bell / toasts |

Also in `LabLayout`:

```ts
const { queryClient } = Route.useRouteContext();
```

| Piece | Meaning |
| --- | --- |
| `Route.useRouteContext()` | Hook on **this** layout’s `Route` object. Reads the `context` object the router was created with. |
| `queryClient` | The same `QueryClient` instance created in [`router.tsx`](../apps/web/src/router.tsx). Passed into `QueryClientProvider`. |

**Next.js analogy:** `_lab.tsx` ≈ `app/(lab)/layout.tsx` — a route group that adds chrome without adding a URL segment.

---

### Why Flask + “Drax Hall LIS / Workbench” appears twice (`AppSidebar` + `_lab` header)

This looks like a copy-paste bug. It is **not**. It is **responsive UI**: the same brand mark is shown in **different places depending on screen width**, because the sidebar is not always visible.

**Open these two spots side by side:**

| Brand block | File | About where |
| --- | --- | --- |
| Sidebar brand (Flask + title) | [`apps/web/src/components/app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) | Inside `SidebarBody` — about lines 182–199 |
| Main-column brand (Flask + title again) | [`apps/web/src/routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx) | Inside `LabLayout`’s `<header>` — about lines 54–66 |

**How `AppSidebar` is shown (same file, ~lines 97–110 and 112–117):**

```tsx
const showSidebar = useShowSidebar();   // pointer-aware — not width-only xl:

<aside className={cn(…, showSidebar ? "flex" : "hidden")}>
  <SidebarBody … />                   {/* includes Flask + Drax Hall LIS */}
</aside>

<Sheet …>                             {/* compact chrome drawer */}
  <SheetContent className={cn(…, showSidebar && "hidden")}>
    <SidebarBody … />                 {/* same brand, only when drawer is open */}
  </SheetContent>
</Sheet>
```

| Input / viewport | Persistent left rail (`<aside>`) | What the user sees for “where is the app name?” |
| --- | --- | --- |
| **Mouse workstation** (`useShowSidebar()` — fine pointer + hover, ≥ 1100px, not compact chrome) | **Visible** | Brand lives in the **sidebar** top. The main header brand is hidden. |
| **Compact chrome** (`useIsCompactChrome()` — touch-primary or hybrid tablet ≤ 1535px) | **Hidden** | Rail is gone. Nav is **bottom bar** + drawer. Brand in main **header**. |

**The duplicate block in `_lab.tsx` is intentionally compact-chrome only:**

```tsx
<div className={cn(…, showSidebar ? "hidden" : "flex")}>
  {/* FlaskConical + “Drax Hall LIS” / “Workbench” */}
</div>
```

So at desktop width you do **not** see two brands at once:

```
Mouse workstation (sidebar):
┌─────────────┬──────────────────────────────┐
│ Sidebar     │ main <header>                │
│ Flask+title │ (brand div hidden)  [bell]   │
│ nav links   │ <Outlet /> page content      │
└─────────────┴──────────────────────────────┘

Compact chrome (phone, tablet, iPad Pro landscape):
┌────────────────────────────────────────────┐
│ main <header>: Flask+title  [search][bell] │  ← brand lives HERE
│ <Outlet />  (full width — no sidebar)      │
│ [bottom nav]  → opens Sheet with SidebarBody│
└────────────────────────────────────────────┘
```

**Also in that same `_lab` header (compact chrome):**

- Search button hidden when sidebar is shown — sidebar search is desktop-only.
- `NotificationCenter` stays in the main header on all sizes.

**`AppSidebar` props from `LabLayout` (why the layout owns drawer state):**

```tsx
<AppSidebar
  onOpenSearch={() => setSearchOpen(true)}
  navOpen={navOpen}
  onNavOpenChange={setNavOpen}
/>
```

Comment in [`app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) (about lines 59–63): mobile drawer state is **owned by the layout** so the top bar / bottom nav can open it (`MobileBottomNav onMore={() => setNavOpen(true)}`). The brand duplication is the same idea: **chrome that must remain visible when the sidebar rail is gone lives in `LabLayout`’s header; chrome that belongs to the nav rail lives in `AppSidebar` / `SidebarBody`.**

**Not a routing concern.** Both blocks are ordinary React UI inside `LabLayout`. The router only cares that `LabLayout` still has one `<Outlet />` for the page.

---

### Responsive model — three tiers (mobile / tablet workstation / desktop)

Hooks live in [`apps/web/src/lib/use-media-query.ts`](../apps/web/src/lib/use-media-query.ts).

| Tier | Width / input | Hooks | Chrome | Data layout |
| --- | --- | --- | --- | --- |
| **Mobile** | &lt; 1024 | `!useIsWorkstation()` | Bottom nav, drawer, compact header | Card lists, bottom Sheet detail |
| **Tablet workstation** | ≥ 1024 + compact chrome | `useIsWorkstation()` + `useIsCompactChrome()` | **No sidebar** — full width; bottom nav + header | Tables, side-by-side master-detail, Accession wizard |
| **Desktop** | Fine pointer + hover, ≥ 1100px, not compact | `useShowSidebar()` | Persistent sidebar, no bottom nav | Full multi-column workstations |

| Hook / token | Signal | Job |
| --- | --- | --- |
| `useIsDesktop()` / `md:` | ≥ 768px | Tables instead of card lists |
| `useIsWorkstation()` / `lg:` | ≥ 1024px | Workstation pages, docked splits (**not** sidebar) |
| `useIsWide()` | same as workstation | Deprecated alias |
| `useIsCompactChrome()` | `(pointer: coarse)` **or** `(any-pointer: coarse) and (max-width: 1535px)` | Bottom nav, mobile header, native scroll, Accession wizard |
| `useShowSidebar()` | `!useIsCompactChrome()` **and** `(pointer: fine) and (hover: hover) and (min-width: 1100px)` | Sidebar rail only |
| `useWorkstationViewportClass()` | — | `100svh` minus header, or header + bottom nav on tablet |

**Pointer rules (why iPad Pro landscape stays compact at 1366px):**

1. **`(pointer: coarse)`** — touch-primary phones/tablets → compact chrome at any width.
2. **`(any-pointer: coarse) and (max-width: 1535px)`** — hybrid tablet backstop (iPad Pro + Magic Keyboard still has a touchscreen).
3. **`(pointer: fine) and (hover: hover) and (min-width: 1100px)`** — mouse/trackpad laptops get sidebar without penalizing 1280px screens.

Chrome DevTools device profiles set `(pointer: coarse)` for iPad — good for local QA. Test Magic Keyboard on real hardware when possible (iPadOS versions vary).

**Layout rules:**

1. **Do not tie sidebar to width alone.** Sidebar follows `useShowSidebar()` in JS (`AppSidebar`, `_lab`, bottom nav). iPad Pro landscape gets **full width** for Bench/Accession data.
2. **Dock + grid at the same breakpoint.** When `useIsWorkstation()` docks a panel, CSS must use **`lg:grid-cols-[…]`** beside the list — not width-only `xl:` in page components.
3. **Accession on compact chrome:** mobile wizard (`!useShowWorkstationChrome()`). Four-column desktop shell only when `useShowSidebar()` is true.

Phone / tablet **portrait** stay below `lg` → unchanged mobile UX.

---

### Proof in the generated tree

Open [`apps/web/src/routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts). You will see (simplified):

```ts
const LabRoute = LabRouteImport.update({
  id: '/_lab',
  getParentRoute: () => rootRouteImport,   // _lab’s parent is __root
})

const LabBenchRoute = LabBenchRouteImport.update({
  id: '/bench',
  path: '/bench',
  getParentRoute: () => LabRoute,          // /bench’s parent is _lab
})
```

That is the machine-readable version of the nesting diagram in section 0.

---

### What you see for different URLs

| You visit | Root `<Outlet />` (inside `RootComponent`) shows | Lab `<Outlet />` (inside `LabLayout`) shows |
| --- | --- | --- |
| `/login` | `LoginPage` from `login.tsx` | *(nothing — login is not under `_lab`, so `LabLayout` never mounts)* |
| `/bench` | `LabLayout` | `BenchPage` from `_lab/bench.tsx` |
| `/accession` | `LabLayout` | Accession page component |
| `/` | `index` route (redirect only) | usually never stays here |

---

## 4 — `export const Route` vs Next’s exported page component

This is the mental-model gap if you know Next.js.

### What Next.js trains you to expect

In Next App Router you often write something like:

```tsx
// app/(lab)/bench/page.tsx
export default function BenchPage() {
  return <div>…JSX / HTML tags…</div>;
}
```

What that means:

- You **export a React component** (`BenchPage`).
- Next’s file convention (`page.tsx` in a folder) is enough for Next to treat it as the `/bench` page.
- Other files can also `import BenchPage from '…'` if they want — but the **main** reason for `export default` here is “this is the page for this URL.”
- You **see** the component: function name, `return (…tags…)`, exported.

### What this TanStack app does instead

In [`_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) you see **two** things:

1. **`export const Route = createFileRoute(...)({ … })`** — exported for the **router / codegen**, not so random UI files can `<BenchRoute />`.
2. **`function BenchPage() { return (…JSX…) }`** — the actual React component with the tags you care about. In this file it is usually **not** `export default`; it is a normal function, wired in via `component: BenchPage` on the Route config.

So:

| Question | Answer |
| --- | --- |
| Is `export const Route` “exporting the page component so other components can import it”? | **No.** Other screens do **not** typically `import { Route } from './bench'` to reuse UI. |
| Then what is being exported? | A **route definition object** (config + typed hooks). The file-route plugin / `routeTree.gen.ts` imports that `Route` to wire URL → parent → component. |
| Where is the component with the HTML/JSX? | Still in the same file: `function BenchPage() { … }`, `function LabLayout() { … }`, `function RootComponent() { … }`. Open the file and scroll past the `Route` export — the JSX is there. |
| How does the router know which component to show? | The config field **`component: BenchPage`** (or `LabLayout` / `RootComponent`) **points at** that function. |
| Can other files import `BenchPage`? | Only if you also `export` it. Today many page functions are **module-local** (not exported). The router still gets them because `component: BenchPage` is in the same file as the `Route` export. |

### Side-by-side

**Next (simplified):**

```text
export default function Page() { return <UI/> }
        ↑
   “This function IS the route’s UI.”
   Framework finds it by filename (page.tsx).
```

**TanStack in this repo (simplified):**

```text
export const Route = createFileRoute("/_lab/bench")({
  validateSearch: …,
  component: BenchPage,   // ← pointer to the UI function
});

function BenchPage() { return <UI/> }
        ↑
   “This function is the UI.”
   Framework finds the route via exported `Route`, then renders whatever `component` names.
```

### What `export const Route` is for (precisely)

Think of `Route` as a **registration card**, not as the page itself:

| On the card | Purpose |
| --- | --- |
| Route id (`"/_lab/bench"`) | Which file/URL slot this is |
| `validateSearch` | How to parse `?q=` |
| `component: BenchPage` | Which React function to mount in the parent `<Outlet />` |
| Hooks like `Route.useSearch()` | Typed helpers **for code in this same route module** (and patterns that import this `Route`) |

`routeTree.gen.ts` does things like:

```ts
import { Route as LabBenchRouteImport } from './routes/_lab/bench'
```

It imports **`Route`**, not `BenchPage`. Then it attaches parent/child relationships. At runtime the router reads `component` off that route object and renders `BenchPage` into `LabLayout`’s `<Outlet />`.

### Short answers to your exact questions

1. **“Is export Route the exportation of the component so other components can have access to it?”**  
   **No.** It is not “share `BenchPage` with the rest of the app.” It is “register this URL slot with the TanStack router.”

2. **“Or is it just exportation of a component for it to be used as a route?”**  
   Closer, but precise wording: you export a **route config object**. That object **references** a component via `component: …`. The component itself is the JSX function (`BenchPage` / `LabLayout` / `RootComponent`). You still write and see all the tags inside those functions — same as Next — they are just **wired through** `Route` instead of `export default`.

3. **Where do I look to “see the component” like in Next?**  
   - Layout UI + `<Outlet />`: `RootComponent` in [`__root.tsx`](../apps/web/src/routes/__root.tsx), `LabLayout` in [`_lab.tsx`](../apps/web/src/routes/_lab.tsx).  
   - Page UI: `BenchPage` in [`_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) (scroll below the `export const Route` block).

---

## 5 — `createFileRoute` — Bench page line by line

This section is the **real** Bench route, not a fake example.

**File:** [`apps/web/src/routes/_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx)  
**Browser URL:** `/bench` (optional query: `?q=…&analyzer=…`)  
**Page component name:** `BenchPage`  
**Parent layout:** [`_lab.tsx`](../apps/web/src/routes/_lab.tsx) → **`LabLayout`** → `<Outlet />`

### Imports that matter for routing (top of file)

```ts
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
```

| Import | Package | Job |
| --- | --- | --- |
| `createFileRoute` | `@tanstack/react-router` | Declare this file as the `/_lab/bench` route |
| `useQuery` | `@tanstack/react-query` | Fetch results from the API with caching |

Other imports in that file (`useReactTable`, UI components, `api`) are **Bench UI / data**, not routing.

### Search type (about lines 94–97)

```ts
type BenchSearch = {
  analyzer?: string;
  q?: string;
};
```

TypeScript type for allowed query-string keys. `?` on a property means optional. This is **our** type; TanStack does not invent it.

### The route export (about lines 99–108) — dissect every token

```ts
export const Route = createFileRoute("/_lab/bench")({
  validateSearch: (search: Record<string, unknown>): BenchSearch => ({
    analyzer:
      typeof search.analyzer === "string" && search.analyzer
        ? search.analyzer
        : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: BenchPage,
});
```

Walk it left to right:

| Syntax | What it does |
| --- | --- |
| `export` | Other modules (and the codegen) can import this `Route`. **Required** so `routeTree.gen.ts` can pick it up. |
| `const Route` | Convention: the exported name must be `Route` for the file-route plugin. |
| `=` | Assign the result of `createFileRoute(...)({...})` to `Route`. |
| `createFileRoute` | Factory from TanStack Router. |
| `("/_lab/bench")` | **Route id tied to this file’s path.** Must match: under `_lab/`, named `bench`. It is **not** only the browser path — the `_lab` part is the pathless parent id. The **URL path** becomes `/bench` because codegen sets `path: '/bench'` (see `routeTree.gen.ts`). |
| `({ ... })` | Second call: pass a **config object** for this route. |
| `validateSearch: (search) => …` | Function TanStack runs on the raw URL search object. You return a **clean, typed** object. Garbage query params get dropped or coerced. |
| `(search: Record<string, unknown>)` | Input type: object with string keys and unknown values (what the URL parser gives you). |
| `: BenchSearch` | Return type annotation — must match our `BenchSearch` type. |
| `typeof search.q === "string" && search.q ? search.q : undefined` | Runtime guard: only keep `q` if it’s a non-empty string; otherwise `undefined` (param absent). Same idea for `analyzer`. |
| `component: BenchPage` | **Which React function to render** into the parent’s `<Outlet />` when URL is `/bench`. |

**Important:** `createFileRoute("/_lab/bench")` does **not** by itself paint pixels. It **registers** config. Painting happens because `component: BenchPage` points at a real function, and the router mounts that function inside `_lab`’s `<Outlet />`.

### The page component (starts about line 125)

```ts
function BenchPage() {
  const { analyzer, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  // ... rest of Bench UI ...
}
```

| Syntax | What it does |
| --- | --- |
| `function BenchPage()` | Normal React function component. Name is arbitrary but must match `component: BenchPage`. |
| `Route.useSearch()` | Hook **on this file’s Route object**. Returns the **validated** search params (`analyzer`, `q`) with full TypeScript typing. |
| `Route.useNavigate()` | Hook that returns a navigate function typed for this app’s routes (e.g. later `navigate({ to: "/bench", search: { q: "…" } })`). |

Why `Route.useSearch()` instead of a global `useSearch()`? Because attaching hooks to **this** `Route` ties types to **this** page’s `validateSearch` output. Autocomplete knows `q` and `analyzer` exist on Bench.

`BenchPage` is a long UI function (table, filters, mobile list). You do **not** need to understand all of it to understand routing: routing’s job ended when `BenchPage` was mounted into `_lab`’s `<Outlet />`.

### End-to-end for `/bench?q=DH123`

1. Vite/Start serves the app; router matches URL `/bench`.  
2. Match chain: `__root` → `_lab` → `bench`.  
3. Render `RootComponent` → its `<Outlet />` gets `LabLayout`.  
4. `LabLayout` draws sidebar/header → its `<Outlet />` gets `BenchPage`.  
5. `validateSearch` turns `?q=DH123` into `{ q: "DH123", analyzer: undefined }`.  
6. `BenchPage` reads that via `Route.useSearch()` and filters / fetches accordingly.

---

## 6 — How the router boots (`router.tsx` + `routeTree.gen.ts`)

### [`apps/web/src/router.tsx`](../apps/web/src/router.tsx)

```ts
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryClient } from "@tanstack/react-query";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    context: { queryClient },
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

| Piece | Meaning |
| --- | --- |
| `QueryClient` | TanStack Query’s cache manager. Created once per router. |
| `staleTime: 5_000` | Treat fetched data as fresh for 5 seconds before refetch is “needed.” |
| `refetchOnWindowFocus: true` | When you tab back to the browser, refetch stale queries. |
| `createRouter({ routeTree, … })` | Build the live router from the **generated** tree. |
| `context: { queryClient }` | Stuff available to routes via context (root typed this as `{ queryClient }`). That is why `_lab.tsx` can do `Route.useRouteContext()` and get `queryClient`. |
| `declare module … Register` | TypeScript module augmentation: teach the library “our router type is whatever `getRouter` returns,” so `Link`/`navigate` know all paths. |

TanStack Start’s Vite plugin calls `getRouter()` as part of app startup (you do not manually mount this in a CRA-style `index.tsx`).

### [`apps/web/src/routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts)

- **Auto-generated** when you run dev/build.  
- **Do not edit by hand** — your edits will be overwritten.  
- It imports every `Route` export and calls `.update({ getParentRoute: … })` to stitch parents/children.

If you add a new file under `routes/` and export `Route` correctly, this file gains a new import after the next codegen pass.

---

## 7 — Other route patterns (redirect, login search)

### Redirect — [`apps/web/src/routes/index.tsx`](../apps/web/src/routes/index.tsx)

```ts
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/bench" });
  },
});
```

| Piece | Meaning |
| --- | --- |
| `createFileRoute("/")` | This file owns the `/` URL. |
| `beforeLoad` | Runs **before** the route tries to render a component. |
| `throw redirect({ to: "/bench" })` | TanStack’s control-flow style: throwing a redirect object aborts load and navigates to `/bench`. |
| No `component` | Fine — this route never paints UI; it only redirects. |

### Login — [`apps/web/src/routes/login.tsx`](../apps/web/src/routes/login.tsx)

```ts
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : undefined,
  }),
  component: LoginPage,
});
```

Same pattern as Bench’s `validateSearch`, but for `?redirect=/accession` after login.  
**Parent:** `__root` only (see `routeTree.gen.ts`: `getParentRoute: () => rootRouteImport`). **No** `_lab` sidebar.

---

## 8 — TanStack Query on a page (how Bench loads data)

Routing puts `BenchPage` on screen. **Data** still has to be fetched.

In `BenchPage` you will see `useQuery` from `@tanstack/react-query` calling helpers on [`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts) (e.g. results list). That HTTP goes to **edge-engine** (Nest), **not** into TanStack Start “server components.”

Who provides the Query client?

1. `getRouter()` creates a `QueryClient` and puts it on router `context` — [`router.tsx`](../apps/web/src/router.tsx).  
2. `LabLayout` reads it with `Route.useRouteContext()` and wraps children in `<QueryClientProvider client={queryClient}>` — [`_lab.tsx`](../apps/web/src/routes/_lab.tsx).  
3. `BenchPage` can call `useQuery(...)`.

**Instruments never talk to these React files.** Analyzers → edge TCP/serial → SQLite → HTTP API → `api.ts` → Bench. See [Appendix](#12--appendix--machine-data-file-map-not-the-web-ui).

---

## 9 — TanStack Start vs Next.js — differences, momentum, why here

This section is for anyone who knows React and maybe Next.js, but wants the **big picture**: what is different, **why** those differences exist, why TanStack Start is getting more attention, and why **this lab app** uses it instead of Next.

For “where is the same idea in our files?” see [§4](#4--export-const-route-vs-nexts-exported-page-component) and the file table at the end of this section.

### One sentence each

| | Next.js (App Router) | TanStack Start |
| --- | --- | --- |
| **Pitch** | The default full-stack React framework: server-first, lots of built-in conventions, deep Vercel integration. | A full-stack React framework on **Vite + TanStack Router**: explicit routes, strong TypeScript, TanStack Query as the natural data layer, deploy almost anywhere. |
| **Best when** | Content sites, SEO-heavy pages, teams that want RSC streaming and platform features out of the box. | Dashboards, SaaS, internal tools, real-time UIs — apps that are **mostly client-interactive** and talk to APIs you already own. |

Neither is “wrong.” They optimize for different shapes of product.

### Significant differences (and why they matter)

#### 1. Server-first vs client-first mental model

**Next.js (especially App Router)** is built around **React Server Components (RSC)**. By default, components can run on the server, stream HTML, and ship less JavaScript to the browser. Data can be fetched inside the component tree on the server. Mutations often use **Server Actions**. Caching is woven into `fetch` and route segments.

**Why Next did that:** marketing pages, docs, e-commerce, and anything where SEO and first paint on a cold visit matter a lot.

**TanStack Start** does **not** center on RSC. You write normal React components. Data loading is **explicit**: route **loaders** (optional), **TanStack Query** (`useQuery`) in components, and **server functions** when you need server-only code. SSR and streaming exist, but the model feels closer to “SPA with a server” than “the server is the main app.”

**Why TanStack did that:** many production apps (admin panels, lab bench, CRM, analytics) are interactive shells that hydrate once and then live on API calls and WebSockets. For those apps, RSC adds concepts (`"use client"`, `"use server"`, cache rules) without always buying you much.

**In this monorepo:** clinical data does **not** flow Browser → Next → Supabase. It flows Browser → **Nest** (`edge-engine` / `api`) → database. The web app is a **thick client** over HTTP. That matches TanStack’s model better than adding a second server layer inside the UI framework.

#### 2. Routing: conventions vs typed registration

**Next.js** maps folders to URLs: `app/(lab)/bench/page.tsx` → `/bench`. Layouts use `{children}`. Search params are typed only if you add extra tooling.

**TanStack Router** requires each route file to **`export const Route = createFileRoute(...)({ component, validateSearch, … })`**. A codegen step builds [`routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts) so parent/child links are wired and **TypeScript knows** valid paths, search params, and loader data for that route.

**Why that trade-off exists:** Next optimizes for “drop a file in a folder and go.” TanStack optimizes for **compile-time correctness** on URLs — fewer broken links and wrong `?q=` shapes in large apps.

**Biggest mental shift in our repo:** see [§4](#4--export-const-route-vs-nexts-exported-page-component). Next: `export default function Page()`. Here: `export const Route` + `component: BenchPage`.

#### 3. Data and caching

| Topic | Next.js | TanStack Start |
| --- | --- | --- |
| **Default data story** | Server Components, `fetch` with cache tags/revalidate, Server Actions | TanStack Query + optional route loaders + server functions |
| **Caching** | Framework-managed (powerful, sometimes surprising) | **Opt-in** — Query `staleTime`, loader stale times; nothing cached unless you configure it |
| **Mutations** | Server Actions, Route Handlers | Server functions (RPC-style) or call your API (what we do) |

**Why developers care:** Next’s automatic caching is excellent when you understand it and painful when you do not (“why did my data not update?”). TanStack’s explicit Query cache matches how teams already think about REST APIs and refetch intervals — which is exactly how Bench, Accession, and Release work here via [`lib/api.ts`](../apps/web/src/lib/api.ts).

#### 4. Dev experience: Vite vs Turbopack

**TanStack Start** runs on **Vite**. Dev server startup and hot module replacement (HMR) are typically very fast; the plugin ecosystem is huge.

**Next.js** uses **Turbopack** (default in recent majors) with its own bundling story, tuned for Next’s RSC pipeline.

**Why momentum shows up here:** teams that already use Vite for libraries or SPAs feel at home. Reports from teams that migrated (e.g. large route counts, CI build times) often cite **faster dev loops and shorter production builds** — your mileage varies with app size and hosting.

This repo’s dev script is plain Vite on port **3100** — see [`apps/web/package.json`](../apps/web/package.json).

#### 5. Deployment and platform coupling

**Next.js** is deployable outside Vercel, but the **best** integration (edge middleware, image optimizer, partial prerendering, analytics) is Vercel-shaped. That is a feature if you choose that platform; it is a concern if you need arbitrary hosts.

**TanStack Start** (often via **Nitro** under the hood) targets **portable output**: Node, static SPA, serverless adapters, etc. No single vendor owns the happy path.

**Why it matters for Drax Hall:** production ships the UI as a **static SPA embedded in the lab PC container** (`build:spa`, served by `edge-engine` on one port). That is “one binary on the bench network,” not “deploy the frontend to Vercel and the API elsewhere.” TanStack + Vite fits that packaging story cleanly.

#### 6. Bundle size and hydration

**Next.js** can ship **less client JavaScript** on content-heavy routes because RSC leaves non-interactive UI on the server.

**TanStack Start** typically hydrates a more traditional client tree; public benchmarks often show **smaller total client bundles** for app-like UIs but not always better **First Contentful Paint** on marketing-style pages.

**Plain English:** Next can win on “visitor reads a blog post on a phone.” TanStack often wins on “staff stares at a dashboard for eight hours.”

#### 7. Maturity and ecosystem

**Next.js** wins on hiring pool, tutorials, Stack Overflow answers, and third-party templates. It is the safe default for many companies.

**TanStack Start** is **younger** (production **v1** landed in 2026). APIs still move faster than Next’s. You trade ecosystem depth for alignment with **TanStack Query / Router**, which many teams already use in non-Next SPAs.

### Why TanStack Start is gaining momentum (2025–2026)

This is not “Next.js is dead.” It is “the market noticed there are two legitimate shapes of React app.”

**1. App Router fatigue.** Server Components, caching semantics, and `"use client"` boundaries have a learning cliff. Teams building **CRUD dashboards** found they were fighting the framework instead of shipping features.

**2. Type-safe routing went mainstream.** TanStack Router proved that URLs, search params, and loader outputs can be **inferred in TypeScript**. Start bundles that into a full-stack package. Fewer `router.push("/benhc")` typos in production.

**3. TanStack Query is already the data layer.** Many apps migrated from Redux + manual fetch to Query years ago. Start treats Query as a first-class citizen (prefetch in loaders, dehydrate/hydrate patterns). Next can use Query too, but it is not the framework’s center of gravity.

**4. Vite won the tooling mindshare.** Developers expect instant HMR. Start rides that wave instead of inventing a parallel toolchain.

**5. Deploy-anywhere and avoid vendor lock-in.** Startups and infra-heavy teams (reports from Railway, Inngest, and others in 2025–2026) publicly moved **client-heavy** apps off Next when RSC was not paying for itself but operational complexity was.

**6. Credible v1 and production stories.** After v1, TanStack Start stopped being “Router plus experiments” and became a framework you can justify for new greenfield SaaS — with the caveat that it is still newer than Next.

**7. Security and complexity conversations.** High-profile discussions around RSC attack surface and framework CVEs made some teams re-evaluate whether they **need** server components at all for apps that were always going to hydrate fully anyway.

**Counterweight — when Next is still the better default:**

- Marketing site, blog, docs, SEO landing pages
- Heavy use of streaming RSC, Partial Prerendering, and edge middleware on Vercel
- Large team that needs maximum hiring pool and conservative stability
- Product where server-rendered HTML **is** the product, not a shell around API calls

### Why this monorepo uses TanStack Start (not Next)

| Requirement | Why Start fits |
| --- | --- |
| **Bench / Accession / Release are interactive workstations** | Query-driven UI, live refetch, filters in the URL — classic TanStack strengths |
| **Backends are already NestJS** (`edge-engine`, `api`) | No need for Next Route Handlers or Server Actions as a second API layer |
| **Lab production = SPA on the mini PC** | `TSS_SPA=1` build embedded in edge-engine — see [§11](#11--vite--start--what-those-packages-are) |
| **Same codebase, two modes** (`VITE_LIS_MODE=edge` vs `cloud`) | Client talks to different API bases; no RSC split required |
| **Offline-first lab floor** | UI must run as a durable client against local HTTP; not dependent on a Next server rendering each navigation |

We are **not** claiming Next could not build this product. We are saying the **shape** of this product (API-backed lab client, embeddable SPA, Query everywhere) aligns with TanStack’s design center.

### File mapping in this repo (same ideas, different files)

| Idea | Next.js App Router | This repo (TanStack) | Open this file |
| --- | --- | --- | --- |
| Root HTML layout | `app/layout.tsx` | `__root.tsx` + `RootDocument` | [`routes/__root.tsx`](../apps/web/src/routes/__root.tsx) |
| Group layout without URL segment | `app/(lab)/layout.tsx` | `_lab.tsx` pathless route | [`routes/_lab.tsx`](../apps/web/src/routes/_lab.tsx) |
| Page | `app/(lab)/bench/page.tsx` | `_lab/bench.tsx` exporting `Route` + `BenchPage` | [`routes/_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) |
| `{children}` in layout | built-in | `<Outlet />` from `@tanstack/react-router` | used in `__root.tsx` and `_lab.tsx` |
| `useSearchParams` | `next/navigation` | `validateSearch` + `Route.useSearch()` | Bench / login routes |
| `<Link href="/bench">` | `next/link` | `<Link to="/bench">` from `@tanstack/react-router` | e.g. sidebar, login |
| `next.config.js` | Next config | `vite.config.ts` | [`vite.config.ts`](../apps/web/vite.config.ts) |
| Route Handlers / RSC data | `app/api`, Server Components | Nest `edge-engine` / `api` + `lib/api.ts` | [`lib/api.ts`](../apps/web/src/lib/api.ts) |
| `public/logo.png` | `public/` | same Vite rule | create `apps/web/public/` when needed |

### Decision checklist (for your next project)

Ask honestly:

1. **Is most of the UI interactive after first load?** → TanStack lean.
2. **Is SEO / server HTML the main deliverable?** → Next lean.
3. **Do you already have a dedicated API (Nest, Go, Supabase via backend)?** → TanStack lean; avoid duplicating API in Server Actions.
4. **Must the UI ship inside an edge device or arbitrary host without Node SSR?** → TanStack SPA path lean.
5. **Do you need maximum library examples and hires tomorrow?** → Next lean.

---


## 10 — Public files / logos / CSS

| Need | Do this |
| --- | --- |
| Global CSS | Edit [`apps/web/src/styles.css`](../apps/web/src/styles.css). Root already links it via `import appCss from "../styles.css?url"` in [`__root.tsx`](../apps/web/src/routes/__root.tsx). |
| Static logo at `/logo.png` | Create `apps/web/public/logo.png`. Vite serves `public/` at the site root. Use `<img src="/logo.png" />`. |
| Bundled/hashed asset | Put file under `src/` and `import logo from "./logo.svg"` so Vite fingerprints it. |
| PDF report branding | [`apps/web/src/lib/lab-report-branding.ts`](../apps/web/src/lib/lab-report-branding.ts) |

This repo may not have a `public/` folder until you add one. Brand marks currently use the Lucide icon `FlaskConical` in **two** places on purpose (sidebar vs mobile header) — see [why the brand appears twice](#why-flask--drax-hall-lis--workbench-appears-twice-appsidebar--_lab-header).

The `?url` in `import appCss from "../styles.css?url"` is a **Vite** feature: import the stylesheet as a URL string to put in a `<link href=...>`, instead of injecting CSS as a JS side effect.

---

## 11 — Vite + Start — what those packages are

Open [`apps/web/vite.config.ts`](../apps/web/vite.config.ts):

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
// ...
plugins: [
  tsconfigPaths(),
  tailwindcss(),
  tanstackStart(/* optional SPA mode */),
  viteReact(),
],
```

| Name | npm package | Job in one sentence |
| --- | --- | --- |
| **Vite** | `vite` | Runs `pnpm dev` (port **3100** here) and bundles for production. |
| **TanStack Start plugin** | `@tanstack/react-start` | Integrates Start + Router file routing / SSR-or-SPA with Vite. |
| **React plugin** | `@vitejs/plugin-react` | Compiles JSX/TSX. |
| **Tailwind plugin** | `@tailwindcss/vite` | Tailwind v4. |
| **TanStack Router** | `@tanstack/react-router` | `createFileRoute`, `Outlet`, `Link`, `redirect`. |
| **TanStack Query** | `@tanstack/react-query` | `useQuery`, `QueryClient`. |

**Start vs Router:** Start is the **app framework** (Vite plugin, document helpers like `HeadContent` / `Scripts`). Router is the **URL → component** library. This project uses both; almost every screen file you touch is **Router** syntax.

**SPA mode:** `TSS_SPA=1` (see `package.json` script `build:spa`) tells Start to emit a static SPA build for embedding behind edge-engine. Day-to-day `vite dev` uses the default Start config.

---

## 12 — Appendix — machine data file map (not the web UI)

The **browser does not open TCP ports to analyzers.** Edge does. Full TCP walkthrough: [TCP_INGESTION_DRIVER.md](./TCP_INGESTION_DRIVER.md).

```
Instrument → TCP/serial → edge drivers → packages/protocols → IngestionService → SQLite
                                                              → HTTP /results
                                                              → Bench via lib/api.ts
```

| Role | Path |
| --- | --- |
| TCP listeners | [`apps/edge-engine/src/ingestion/tcp-ingestion.driver.ts`](../apps/edge-engine/src/ingestion/tcp-ingestion.driver.ts) |
| Serial (ProLyte) | [`apps/edge-engine/src/ingestion/serial-ingestion.driver.ts`](../apps/edge-engine/src/ingestion/serial-ingestion.driver.ts) |
| Persist / match | [`apps/edge-engine/src/ingestion/ingestion.service.ts`](../apps/edge-engine/src/ingestion/ingestion.service.ts) |
| Protocols | [`packages/protocols/src/`](../packages/protocols/src/) |
| Bench display | [`apps/web/src/routes/_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) |
| API client | [`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts) |

---

## 13 — Cheat sheet

| You want to… | You do… | File |
| --- | --- | --- |
| Understand sidebar layout | Read `LabLayout` + find `<Outlet />` | [`_lab.tsx`](../apps/web/src/routes/_lab.tsx) |
| Why Flask/title is in sidebar **and** main header | Responsive: sidebar brand on desktop; `lg:hidden` brand in `_lab` header on mobile | [`_lab.tsx`](../apps/web/src/routes/_lab.tsx) header + [`app-sidebar.tsx`](../apps/web/src/components/app-sidebar.tsx) `SidebarBody` |
| Tablet landscape layout | `useIsCompactChrome()` / `useShowSidebar()` (pointer-aware); workstation data at `lg`; `useWorkstationViewportClass()` | [`use-media-query.ts`](../apps/web/src/lib/use-media-query.ts), [`_lab.tsx`](../apps/web/src/routes/_lab.tsx), [`bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) |
| Understand `<html>` / auth wrap | Read `RootComponent` + `RootDocument` | [`__root.tsx`](../apps/web/src/routes/__root.tsx) |
| Understand a page registration | Read `export const Route = createFileRoute…` | e.g. [`_lab/bench.tsx`](../apps/web/src/routes/_lab/bench.tsx) |
| Add a new lab page `/foo` | Add `src/routes/_lab/foo.tsx` with `createFileRoute("/_lab/foo")({ component: FooPage })` | new file under `_lab/` |
| Change query params on Bench | Edit `validateSearch` + `Route.useSearch()` / `navigate` | `bench.tsx` |
| See parent/child wiring | Read generated updates | [`routeTree.gen.ts`](../apps/web/src/routeTree.gen.ts) |
| Change default fetch freshness | Edit `QueryClient` defaults | [`router.tsx`](../apps/web/src/router.tsx) |
| Call the backend | Use helpers in | [`lib/api.ts`](../apps/web/src/lib/api.ts) |
| Add a static logo | Create | `apps/web/public/your-logo.png` → `/your-logo.png` |

---

## Related docs

| Doc | Why |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Edge vs cloud vs web (plain English) |
| [ANALYZERS.md](./ANALYZERS.md) | Instruments |
| [TCP_INGESTION_DRIVER.md](./TCP_INGESTION_DRIVER.md) | Nest + `net` TCP driver lesson |
| [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) | Ports / field setup |
| [LOCAL_DEV.md](./LOCAL_DEV.md) | Run the stack |
| [WORKFLOW.md](./WORKFLOW.md) | Bench / release product rules |
| [STAFF_SYNC_CODE_GUIDE.md](./STAFF_SYNC_CODE_GUIDE.md) | NestJS HTTP DI lesson (different app, same “explain every token” style) |
