# Shell — State

> Updated: 2026-05-18
> Status: 100% Complete for Phase 1 — wired to dynamic entity labels + module visibility flags.
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
