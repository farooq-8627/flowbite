# Shell — State

> Updated: 2026-05-21
> Status: 100% Complete for Phase 1 — wired to dynamic entity labels + module visibility flags.
>
> **2026-05-21 — Friendly 404 + restored pretty error UI.**
>
> 1. **Pretty `<DashboardError>` restored.** The component had been swapped
>    out for a "show raw error" debugging surface earlier in the session.
>    Now back to a calm, production-grade UI: ringed alert icon, `Try
>    again` / `Reload page` / `Go back` actions, and the raw error
>    message + stack trace tucked into a collapsed `<details>` so the
>    info is still recoverable when reporting an issue. Lives at
>    `components/errors/DashboardError.tsx`.
> 2. **`<DashboardNotFound>` added** at `components/errors/DashboardNotFound.tsx`
>    — the 404 counterpart, same visual language (compass icon, headline
>    + description, `usePathname()` chip showing the requested URL,
>    primary CTA back to the dashboard, secondary `Go back` button).
> 3. **`app/[locale]/not-found.tsx`** — universal 404 fallback at the
>    locale root. Rendered when an unmatched URL hits the public routing
>    surface or when a server component above the dashboard segment
>    calls `notFound()`.
> 4. **`app/[locale]/(private)/[orgSlug]/not-found.tsx`** — segment-scoped
>    404. This is the critical one: when `EntitySlugView` calls
>    `notFound()` (e.g. user navigates to `/en/{org}/some-bad-slug`) the
>    file renders INSIDE the dashboard shell — sidebar + topnav stay
>    visible, the user keeps their navigation context, and the
>    `(private)/error.tsx` boundary never sees the 404 digest. Without
>    this file, `notFound()` fell through to Next.js's default 404 →
>    threw `NEXT_HTTP_ERROR_FALLBACK;404` → was caught by `error.tsx` →
>    surfaced as a raw stack trace.
> 5. **`(private)/error.tsx` JSDoc updated** to clarify that 404s are
>    handled by `not-found.tsx` and should never reach the error boundary
>    in normal operation. If they do, that's a missing `not-found.tsx` in
>    the route hierarchy.
>
> Verified: `pnpm typecheck` 0 errors · `pnpm exec biome check` 0 issues
> on all touched files · `pnpm build` all 18 routes generated, including
> the new `/_not-found` static prerender.
>
> **2026-05-19 — Dashboard cards split + currency fix + calendar route deleted.**
>
> 1. **`DashboardHomeView` split into per-card files.** The 530-line
>    monolith at `core/shell/shell/views/DashboardHomeView.tsx` was
>    deleted and rebuilt as a thin (~140-line) layout shell at
>    `core/shell/shell/views/dashboard/DashboardHomeView.tsx`. Each card
>    now owns its own file under `cards/`:
>    - `StatTile.tsx` — single KPI tile (link or static)
>    - `StatStrip.tsx` — row of 4 KPI tiles
>    - `RemindersCard.tsx` — today/overdue + inline new-form drawer
>    - `NextReminderFallback.tsx` — empty-state for RemindersCard
>    - `PipelineCard.tsx` — open value + win-rate + bar
>    - `RecentActivityCard.tsx`
>    - `TodaySummaryCard.tsx` — "today's focus" list
>    Single barrel at `cards/index.ts` so the parent imports them all in
>    one block. The view itself only owns the 12-column grid + ONE
>    `useQuery(getDashboardStats)` subscription + the FirstTimeTour
>    mount. Cards never call `useQuery` — every value is propagated as
>    a prop (per AGENTS.md "per-row data on a list view comes from one
>    batched query").
> 2. **Pipeline value "US$0" rendering fixed.** `formatCurrency` in
>    `core/shell/shared/hooks/useOrgDefaultCurrency.ts` now defaults to
>    `currencyDisplay: "narrowSymbol"` so USD shows as "$" in any
>    English locale (was "US$" in en-GB / en-CA / en-AU). When the
>    pipeline has zero deals AND zero value, `PipelineCard` and
>    `StatStrip` render "—" instead of "$0" so empty workspaces look
>    intentional.
> 3. **`/calendar` route deleted.** The `app/[locale]/(private)/[orgSlug]/calendar/`
>    directory (a redirect-only page) is gone. The reminders page hosts
>    the calendar via `?view=calendar`. Sidebar nav has only "Reminders".
>    Bookmarks of `/calendar` will 404 — explicit user request.
> 4. **`navigation.ts` JSDoc updated** to reflect that there's no longer
>    a back-compat redirect from `/calendar`.
>
> **2026-05-18 — Task 5 / Dashboard rewrite.** `DashboardHomeView` rebuilt:
> "Welcome back" header removed, dense 12-column grid (Reminders 5 / Week
> ahead 4 / Recent activity 3, then Messages 7 / Mini-cal 5), every card is
> `flex flex-col h-full` so siblings align, the Reminders "+ New" button
> opens an inline `<ReminderForm>` instead of routing, the empty-today
> tab falls back to a "Next reminder" card via `useRemindersNextUpcoming`,
> and overdue items dragged to yesterday now show up correctly thanks to
> the new `useRemindersDueAndOverdue` hook. Sidebar Calendar entry was
> removed — `/calendar` redirects to `/reminders?view=calendar` and
> the reminders page now hosts three views (today / list / calendar) via
> a URL-persisted `?view=` toggle. See `core/scheduling/STATE.md` for the
> matching scheduling-side changes.
>
> **2026-05-18 — Subscription dedup pass.** Removed two duplicate
> `api.orgs.queries.listMyOrgs` subscriptions in `app-sidebar.tsx` and
> `workspace-switcher.tsx`. Both now read from the single canonical
> `OrgProvider` context via `useCurrentOrg().fullOrgEntry` /
> `useCurrentOrg().allOrgs`, per the locked rule "Identity/auth/labels via
> context, not subscriptions" (AGENTS.md). `OrgProvider` is the SSOT for
> `listMyOrgs`, `users.me`, `getMyMembership`, `listMembers`, and
> `getEntityLabels`; all five queries fire once at the layout level and
> propagate via React context. Result: leads-page mount drops from ~22
> `useQuery` registrations to ~12 (the floor that view actually needs).

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Navigation config | `core/shell/config/navigation.ts` | Dynamic module config, default modules exported |
| Dashboard layout (server) | `core/shell/layouts/DashboardLayout.tsx` | Reads cookies |
| Dashboard layout (client) | `core/shell/layouts/DashboardLayoutClient.tsx` | 3-pane resizable AI panel, Sheet for mobile, RTL-aware |
| **DashboardHomeView (split)** *(2026-05-19)* | `core/shell/shell/views/dashboard/DashboardHomeView.tsx` | Thin ~140-line layout. ONE `getDashboardStats` query. All cards under `dashboard/cards/`, one card per file. |
| **Dashboard cards** *(2026-05-19)* | `core/shell/shell/views/dashboard/cards/*.tsx` | StatTile, StatStrip, RemindersCard, NextReminderFallback, PipelineCard, RecentActivityCard, TodaySummaryCard. No `useQuery` inside cards. |
| AppSidebar | `core/shell/components/sidebar/app-sidebar.tsx` | ✅ Reads `useEntityLabels()` + filters by `orgSettings.modules[].hidden` + honors `modules[].order` overrides |
| useEntityLabels (re-export) | `core/shell/hooks/useEntityLabels.ts` | Thin re-export of canonical hook in `core/shared/hooks/` |
| useModuleEnabled | `core/shell/hooks/useModuleEnabled.ts` | Feature-flag reader |
| WorkspaceSwitcher | `core/shell/components/sidebar/workspace-switcher.tsx` | |
| NavUser | `core/shell/components/sidebar/nav-user.tsx` | |
| TopNav | `core/shell/components/TopNav.tsx` | Includes NavSlot injection for page-specific toolbars |
| Theme switcher | `core/shell/components/sidebar/theme-switcher.tsx` | |
| ModuleGuard | `core/shell/components/ModuleGuard.tsx` | |
| NavSlotProvider | `core/shell/context/nav-slot-context.tsx` | Used by settings + profile shells to inject toolbar into topnav |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| NotificationBell in TopNav | MEDIUM | From shadboard — Phase 2 |
| FullscreenToggle in TopNav | LOW | Phase 2 (currently in sidebar footer) |
| QuickAdd "+" button in TopNav | MEDIUM | Global create. Keyboard shortcut `C`. |
| Dead code cleanup | LOW | nav-main, nav-documents, nav-secondary, layout-controls, account-switcher, sidebar-support-card |

## Architecture Notes (this session — 2026-05-12)

- **Sidebar respects `orgSettings.modules[].hidden`.** Freelancers / solo consultants can turn Companies off in Settings → Workspace → Module Visibility (UI **now shipped** in `WorkspaceGroup`). The sidebar filters the module out *and* the `/[entitySlug]` route short-circuits to `notFound()` via `EntitySlugView`. Renaming and hiding share the same mechanism — both are driven by `orgSettings.modules[]`.
- **`modules[].order` is honored for custom reordering.** AppSidebar merges the per-slot `order` override with each DEFAULT_MODULE so users can drag-reorder (UI pending).
- **Dynamic labels everywhere.** `AppSidebar` calls `useEntityLabels()` (no args), which auto-detects the active org from the URL and returns DB-backed labels. Renaming "Lead" → "Inquiry" in Settings updates the sidebar instantly via Convex reactivity. Fallback to English defaults while the query is in-flight.
- **DashboardHomeView also uses dynamic labels.** `GetStartedCard` checklist + `MetricCards` are now functions of labels — "Add your first lead" becomes "Add your first inquiry" after a rename.
- **`useEntityLabels` is canonical at `core/shared/hooks/useEntityLabels.ts`** — shell path is a thin re-export for back-compat.
- **Route structure cleanup.** Hardcoded `/deals` and `/companies` folders under `app/[locale]/(private)/[orgSlug]/` have been deleted. Entity list and detail routes are served via the dynamic `/[entitySlug]` and `/[entitySlug]/[id]` segments, so renaming a slug (e.g. "deals" → "opportunities") works without any file-system changes.
- **TopNav `NotificationBell` unused param renamed.** `onToggleNotifications` → `_onToggleNotifications` to satisfy the lint rule; will be wired up in Phase 2 when the notifications popover becomes controllable from outside.
- **DashboardLayoutClient drag handle** is now a semantic `<button>` instead of a `<div role="separator">` to satisfy a11y rules. Cookie writes for the chat-panel state are kept as direct `document.cookie` with a focused `biome-ignore` explaining Cookie Store API browser support.
