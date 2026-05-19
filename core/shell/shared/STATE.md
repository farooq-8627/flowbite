# Shared — State

> Updated: 2026-05-19 (round 3 — ShellLayout fillHeight chain fix)
> Status: Shell-layout primitives + canonical `useEntityLabels` + entity-layout chrome live here.
>
> **2026-05-19 round 3 — ShellLayout fillHeight chain fix.**
> The shell `<main>` is `flex-1 overflow-y-auto`; its inner wrapper
> previously was `<div className="max-w-full space-y-6">` which had no
> height. ProfileSection's `fillHeight` workaround used a fixed
> `h-[calc(100vh-7rem)]` magic number — but the actual main height
> rarely matched 100vh-7rem (varying topnav + toolbar chrome), leaving
> a bottom gap on Messages and Timeline tabs.
>
> Fix: shell main inner is now `flex min-h-full max-w-full flex-col
> space-y-6`. The flex-col claims at-least the full main height so a
> single fillHeight section can flex into it; when content exceeds main
> height, the natural overflow + main's `overflow-y-auto` still
> scrolls. ProfileSection's fillHeight is now `flex flex-1 min-h-[26rem]
> min-h-0 flex-col` — proper flex chain, no magic number, perfectly
> fills the column whatever the actual main height ends up being. File:
> `core/shell/shared/layouts/ShellLayout.tsx`.
>
> **2026-05-19 — Currency rendering fixed (`narrowSymbol`).**
> `formatCurrency()` in `useOrgDefaultCurrency.ts` now defaults to
> `currencyDisplay: "narrowSymbol"`. Previously USD rendered as "US$0"
> in en-GB / en-CA / en-AU / Arabic locales — that's CLDR-correct but
> confused users who chose USD. The narrow symbol gives "$" in any
> English locale, "₹" for INR, "€" for EUR. AED has no narrower form
> so it stays "AED N" — acceptable. Used everywhere money is rendered:
> dashboard PipelineCard, kanban totals, deal-value cells, AI prompts.
>
> **2026-05-18 (afternoon) — `useMe()` joins the OrgProvider context.**
> Added a 5th hoisted subscription to `OrgProvider`: `api.users.queries.me`.
> Was being called via `useQuery(api.users.queries.me)` from 9 different
> components (ThreadHeader, MessagesThread, ParticipantsDialog,
> NoteReminderDialog, NotesPanel, NotesView, SavedViewsMenu, NavUser,
> DashboardHomeView). All migrated to the new `useMe()` hook (zero new
> subscriptions per component; reads the shared context). `OrgContext`
> also exposes `allOrgs` for the workspace switcher and `fullOrgEntry`
> for views that need `org.settings.*` (currency, modules, fileUpload,
> reminderDefaults).
>
> Same pass migrated 6+ entity hooks (`useLeads`, `useViewToggle`,
> `useModuleDisplay`, `usePerson`) + 4 entity views (Companies, Contacts,
> Deals, Leads, PersonSelect) from per-component `listMyOrgs` lookups
> to the shared `useCurrentOrg().orgId`. Net: identity/auth subscription
> count for a typical board view is now ~5 (one per OrgProvider hook),
> down from ~25+ pre-cleanup.
>
> **2026-05-18 — OrgProvider expanded into the per-org session cache**
> (driven by Convex insights showing 20 % of all calls were per-component
> identity / RBAC subscriptions). The provider now owns ONE subscription
> for each of `listMyOrgs`, `getMyMembership`, `listMembers`, and
> `getEntityLabels`. Descendants read via context-only hooks:
>
>   - `useCurrentOrg()` — full slice (orgId, org, isLoading, membership,
>     members, memberMap, memberNameMap, entityLabels)
>   - `useOrgPermissions()` — readonly permission array
>   - `useOrgMembers()` — full member list, undefined while loading
>   - `useOrgMemberMap()` — Map<userId, member> for O(1) avatar / assignee
>     lookups
>   - `useOrgMemberNameMap()` — Map<userId, displayName> for O(1) labels
>   - `useEntityLabels()` — auto-detects context, falls back to its own
>     subscription only outside the dashboard tree
>
> 13 `listMembers` call sites + 5 `getMyMembership` call sites were
> migrated. `useOrgPermission` (the legacy permission-check hook) was
> rewritten to read from the context — it no longer fires its own
> `useQuery` AND it no longer chains a redundant `orgRoles.get` call.
>
> The `useEntityLabels` ↔ `useCurrentOrg` circular import was broken by
> extracting types/defaults to `entity-labels-types.ts` and the entity-
> labels context to `org-entity-labels-context.ts` (both leaf modules).

## ✅ Completed

| Component | File | Used by |
|---|---|---|
| useEntityLabels (canonical) | `core/shared/hooks/useEntityLabels.ts` | AppSidebar, EntitySlugView, entity placeholder views, settings groups |
| useEntityLabel | `core/shared/hooks/useEntityLabels.ts` | Anywhere that needs a single slot's labels |
| Shell types | `core/shared/layouts/types.ts` | Settings shell, profile shell |
| ShellLayout | `core/shared/layouts/ShellLayout.tsx` | SettingsView, ProfileDetailView |
| ShellNav | `core/shared/layouts/ShellNav.tsx` | ShellLayout (left rail on xl+) |
| ShellToolbar | `core/shared/layouts/ShellToolbar.tsx` | ShellLayout (topnav slot + mobile inline) |
| ShellSearch | `core/shared/layouts/ShellSearch.tsx` | ShellToolbar |
| useActiveShellGroup | `core/shared/layouts/useActiveShellGroup.ts` | ShellLayout — URL-param-driven active group |
| useShellSearch + scrollToShellSection + getVisibleShellSections | `core/shared/layouts/useShellSearch.ts` | ShellLayout — Fuse-backed search + blink-safe scroll |
| SearchFilterProvider + useSearchFilter | `core/shared/layouts/search-filter-context.tsx` | SettingsSection, ProfileSection |
| Barrel export | `core/shared/layouts/index.ts` | Single import path for any shell consumer |
| **EntityPageLayout** *(new 2026-05-17)* | `core/shell/shared/entity-layout/EntityPageLayout.tsx` | EntityListPage (entities), NotesView (planned) — slim 40px toolbar + body slot |
| **ViewToggleIcons** *(moved 2026-05-17)* | `core/shell/shared/entity-layout/ViewToggleIcons.tsx` | EntityPageLayout — list/board switch |
| **EmptyState** *(moved 2026-05-17)* | `core/shell/shared/entity-layout/EmptyState.tsx` | EntityListPage, future shared views |
| **ViewKind type** *(moved 2026-05-17)* | `core/shell/shared/entity-layout/types.ts` | Re-exported by `core/entities/shared/types.ts` for back-compat |
| **Entity-layout barrel** *(new 2026-05-17)* | `core/shell/shared/entity-layout/index.ts` | One import path for the toolbar chrome |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| Mobile toolbar accordion (< 640px) | LOW | Current pill row wraps; accordion would be nicer for very small viewports |
| Keyboard navigation for nav rail | LOW | Arrow up/down to move between groups |
| Reusable `DangerZoneCard` in shared | LOW | Settings has its own; move once Profile needs it |

## Architecture Notes (2026-05-12)

- **Shell layout is now a true shared primitive.** Extracted from `core/settings/views/SettingsView.tsx`. Settings + Profile both build on top of it; any future view that wants "left rail + topnav pills + scrollable content with search" drops in `ShellLayout` and passes its own `groups`, `sections`, and `renderGroup`.
- **Consumer responsibility vs. shell responsibility.**
  - Consumer: fetch data, permission-check its specific domain, render each group via `renderGroup`, define stable section ids.
  - Shell: left rail, mobile sheet, topnav-slot injection, scrollspy (Intersection Observer), Fuse search, search-filter context, scroll-without-layout-shift, URL persistence.
- **Scroll container contract.** The shell's inner `<main>` is tagged with both `data-shell-scroll="true"` (new canonical) and `data-settings-scroll="true"` (back-compat) so existing doc references + rules in AGENTS.md keep working unchanged.
- **Canonical `useEntityLabels`.** All new consumers should import from `@/core/shell/shared/hooks/useEntityLabels`. The `core/shell/hooks/useEntityLabels.ts` re-export stays for back-compat.
