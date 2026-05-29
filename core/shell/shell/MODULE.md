# shell Module (Core)

> App scaffold — sidebar, topnav, layout controls, theme/font settings, page wrappers.
> Every other module's routes render inside this shell. The shell is config-driven:
> navigation, badges, permissions, and feature flags all come from DB queries or
> the navigation.ts config file — never hardcoded in JSX.

## Ownership
- **Location**: `core/shell/`
- **Routes**: None (it IS the layout, not a page)
- **Backend**: No Convex tables (UI-only — reads from orgs, users, notifications, featureFlags)
- **Phase**: 1 | **Status**: PARTIALLY BUILT (layout done, wiring needed)

---

## Current State — What Exists vs What Needs Change

| File | Status | Action |
|---|---|---|
| `DashboardLayoutClient.tsx` | ✅ Built — 3-pane, resizable AI panel (280-600px), drag handle, cookie persistence, Sheet for mobile | **Keep — architecture correct** |
| `DashboardLayout.tsx` | ✅ Built — server component, reads cookies | Move auth guard logic to `(private)/layout.tsx` |
| `components/sidebar/app-sidebar.tsx` | ⚠️ Hardcoded sidebarItems from `navigation/sidebar/` | **Rewrite: read from `core/shell/config/navigation.ts`** |
| `components/sidebar/nav-main.tsx` | ⚠️ No RBAC, no badges, no entity labels, hardcoded QuickCreate+Inbox | **Major update: add RBAC + badges + labels + feature flags** |
| `components/TopNav.tsx` | ⚠️ Has AI toggle ✅, has GitHub link (remove), AccountSwitcher (hardcoded) | **Update: add NotificationBell, WorkspaceSwitcher** |
| `components/sidebar/nav-user.tsx` | ⚠️ Uses hardcoded `rootUser` import | **Update: connect to Convex auth session** |
| `components/sidebar/account-switcher.tsx` | ⚠️ Local state, hardcoded users | **Rename → WorkspaceSwitcher, connect to Convex orgs** |
| `components/ai-chat-panel/ai-chat-panel.tsx` | ⚠️ UI shell only (hardcoded message, static input) | **Phase 3: wire to useAIChat() hook** |
| `navigation/sidebar/sidebar-items.ts` | ⚠️ Wrong location, generic items | **Deprecate → rewrite at `core/shell/config/navigation.ts`** |
| `core/shell/config/` | ⚠️ Empty | **CREATE navigation.ts** |
| `core/shell/hooks/` | ⚠️ Empty | **CREATE useModuleEnabled.ts, useViewToggle.ts** |

---

## Missing Features (P0/P1 — Add to Shell)

### Quick-Add Global "+" Button (P0)

Every production CRM has a global create button accessible from any page. Add to TopNav.

```tsx
// core/shell/components/QuickAddButton.tsx
// Keyboard shortcut: C (from anywhere)
// Opens a command-palette-style modal with entity type selection

export function QuickAddButton() {
  return (
    <PermissionGate permission="leads.create">
      <Button size="sm" variant="outline" onClick={() => openQuickAdd()}>
        <Plus className="size-4" />
        <span className="sr-only">Quick add</span>
      </Button>
    </PermissionGate>
  );
}

// QuickAddModal: shows entity type cards (Lead, Contact, Deal, Note)
// Selecting one opens the EntityFormDialog for that type
// Keyboard: C → opens modal, 1/2/3/4 → selects entity type
```

**Where it lives**: TopNav (always visible). Keyboard shortcut `C` from any page.
**Permission**: Checks `leads.create` — if user can create at least one entity type, show the button.

### Mobile PWA (P1)

Gulf market is mobile-first. Agents are in the field. Add PWA manifest + service worker.

```
// public/manifest.json — add to project
{
  "name": "Orbitly CRM",
  "short_name": "Orbitly",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [...]
}

// app/layout.tsx — add metadata
export const metadata = {
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default" },
};
```

**Key mobile considerations:**
- Bottom navigation bar on mobile (instead of left sidebar)
- Touch-friendly tap targets (min 44px)
- Offline: show cached data, queue mutations for when online
- Push notifications via Web Push API (for reminders)

---

## The Navigation Config — Single Source of Truth

`core/shell/config/navigation.ts` drives EVERYTHING:
- Which items appear in the sidebar
- Which require RBAC permissions
- Which are plan-gated (ModuleGuard)
- Which show badge counts
- Which labels come from orgSettings (dynamic entity labels)

```typescript
// core/shell/config/navigation.ts

export type NavItem = {
  id:          string;
  title:       string;          // Fallback label if no i18n
  labelKey:    string;          // i18n key
  icon:        LucideIcon;
  href:        string;          // Relative to /dashboard/[orgSlug]
  badge?:      "count" | "new";
  badgeKey?:   string;          // Key in NavBadgeCounts query result
  entitySlot?: string;          // "lead"|"contact"|"deal"|"company" → label from orgSettings
  featureFlag?: string;         // Wraps in ModuleGuard if set
  permission?:  string;         // RBAC permission key required
  comingSoon?:  boolean;        // Shows "Soon" badge, link disabled
};

export type NavGroup = {
  id:       string;
  label?:   string;
  labelKey?: string;
  items:    NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "core",
    items: [
      {
        id: "dashboard", title: "Dashboard", labelKey: "nav.dashboard",
        icon: LayoutDashboard, href: "",
      },
    ],
  },
  {
    id: "crm",
    label: "CRM", labelKey: "nav.group.crm",
    items: [
      {
        id: "leads", title: "Leads", labelKey: "nav.leads",
        icon: Target, href: "/leads",
        badge: "count", badgeKey: "leads",
        entitySlot: "lead", permission: "leads.view",
      },
      {
        id: "contacts", title: "Contacts", labelKey: "nav.contacts",
        icon: Users, href: "/contacts",
        entitySlot: "contact", permission: "contacts.view",
      },
      {
        id: "companies", title: "Companies", labelKey: "nav.companies",
        icon: Building2, href: "/companies",
        entitySlot: "company", permission: "companies.view",
      },
      {
        id: "deals", title: "Deals", labelKey: "nav.deals",
        icon: DollarSign, href: "/deals",
        badge: "count", badgeKey: "openDeals",
        entitySlot: "deal", permission: "deals.view",
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace", labelKey: "nav.group.workspace",
    items: [
      {
        id: "projects", title: "Projects", labelKey: "nav.projects",
        icon: KanbanSquare, href: "/projects",
        featureFlag: "project_management", permission: "projects.view",
      },
      {
        id: "messages", title: "Messages", labelKey: "nav.messages",
        icon: MessageSquare, href: "/messages",
        badge: "count", badgeKey: "unreadMessages",
        featureFlag: "communications",
      },
      {
        id: "calendar", title: "Calendar", labelKey: "nav.calendar",
        icon: Calendar, href: "/calendar",
        comingSoon: true,
      },
    ],
  },
  // Pinned saved views group — appended dynamically in NavMain from savedViews query
];
```

---

## NavMain — Updated Logic

The existing `nav-main.tsx` needs these changes:

```typescript
// core/shell/components/sidebar/nav-main.tsx — key additions

// 1. Queries (replace static import)
const entityLabels  = useQuery(api.orgs.getEntityLabels);      // dynamic labels
const badgeCounts   = useQuery(api.orgs.getNavBadgeCounts);    // ALL counts in 1 query
const entityVis     = useQuery(api.orgs.getEntityVisibility);  // which slots visible
const { check }     = useOrgPermission();                      // RBAC hook
const pinnedViews   = useQuery(api.savedViews.listPinned);     // sidebar pinned views

// 2. Filter items (replace static map)
const visibleGroups = NAV_GROUPS
  .map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.permission && !check(item.permission)) return false;
      if (item.entitySlot && entityVis?.[item.entitySlot] === false) return false;
      return true;
    }),
  }))
  .filter(group => group.items.length > 0);

// 3. Dynamic label replacement
const getLabel = (item: NavItem): string =>
  item.entitySlot && entityLabels?.[item.entitySlot]?.plural
    ? entityLabels[item.entitySlot].plural
    : item.title;

// 4. Badge count
const getBadge = (item: NavItem): number | null =>
  item.badgeKey ? (badgeCounts?.[item.badgeKey] ?? null) : null;

// 5. Remove: hardcoded QuickCreate button and Inbox button from nav-main
//    Those belong in entity list pages (EntityListPage scaffold)

// 6. ModuleGuard wrap for feature-flagged items
// 7. Pinned views appended as sub-group after CRM group
```

---

## New Files to Create

### `core/shell/config/navigation.ts`
Full NAV_GROUPS config as shown above. Single source for sidebar, route guards, AI context detection.

### `core/shell/hooks/useModuleEnabled.ts`
```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useModuleEnabled(featureFlag: string): boolean {
  const flags = useQuery(api.featureFlags.getForOrg);
  return flags?.[featureFlag] ?? false;
}
```

### `core/shell/hooks/useViewToggle.ts`
```typescript
"use client";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/lib/hooks/useAppRouter";

// Syncs list|board view toggle to URL query param ?view=
// Persists view preference across navigation within the same entity type
export function useViewToggle(defaultView: "list" | "board" = "list") {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as "list" | "board") ?? defaultView;
  const setView = (v: "list" | "board") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("view", v);
    router.replace(`?${p.toString()}`);
  };
  return [view, setView] as const;
}
```

### `core/shell/hooks/useOrgPermission.ts`
```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useOrgPermission() {
  const permissions = useQuery(api.orgRoles.getMyPermissions); // returns string[]

  return {
    check: (permission: string): boolean =>
      permissions?.includes(permission) ?? false,
    checkAny: (perms: string[]): boolean =>
      perms.some(p => permissions?.includes(p)) ?? false,
  };
}
```

### `core/shell/components/ModuleGuard.tsx`
```typescript
"use client";
import { useModuleEnabled } from "@/core/shell/shell/hooks/useModuleEnabled";

interface Props {
  featureFlag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;  // e.g., <UpgradeBadge /> when locked
}

export function ModuleGuard({ featureFlag, children, fallback = null }: Props) {
  const isEnabled = useModuleEnabled(featureFlag);
  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
```

### `core/shell/components/NotificationBell.tsx`
```typescript
"use client";
// Real-time notification bell — connects to Convex notifications query
// Shows unread count badge, dropdown with first 5-8 notifications
// "View all" → /dashboard/[orgSlug]/notifications
```

### `core/shell/components/WorkspaceSwitcher.tsx`
```typescript
"use client";
// Renamed from AccountSwitcher
// Queries api.orgs.myOrgs → list of all orgs user is a member of
// Shows current org name + avatar
// On switch: sets lastOrgSlug cookie → router.push to new org
// Replaces hardcoded local state and static users array
```

---

## Route Groups (App Folder)

```
app/[locale]/
├── (public)/                    # No auth required
│   ├── layout.tsx               # Minimal header + footer
│   └── pricing/page.tsx         # ISR pricing page
│
├── (auth)/                      # Already exists ✅
│   ├── layout.tsx               # Centered card layout
│   ├── signin/page.tsx
│   └── signup/page.tsx
│
├── (private)/                   # Auth required
│   ├── layout.tsx               # NEW: auth guard → redirect to /signin
│   ├── onboarding/
│   │   ├── layout.tsx           # Wizard layout (no sidebar)
│   │   └── page.tsx
│   └── dashboard/
│       ├── layout.tsx           # Onboarding guard → redirect if !onboardingCompleted
│       └── [orgSlug]/
│           ├── layout.tsx       # Org resolver + DashboardLayout (existing, update)
│           └── ...entity pages
```

**Auth guard pattern:**
```typescript
// app/[locale]/(private)/layout.tsx
import { redirect } from "next/navigation";
import { getAuthSession } from "@/convex/_functions/authenticated";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session) redirect("/signin");
  return <>{children}</>;
}
```

---

## Layout Settings (Preferences)

All layout preferences stored in cookies (SSR-safe). Never localStorage.
Defaults in `lib/preferences/preferences-config.ts`.

| Setting | Type | Default | Options |
|---|---|---|---|
| `sidebar_variant` | SidebarVariant | `inset` | `sidebar` \| `inset` \| `floating` |
| `sidebar_collapsible` | SidebarCollapsible | `icon` | `icon` \| `offcanvas` |
| `content_layout` | ContentLayout | `centered` | `centered` \| `full-width` |
| `navbar_style` | NavbarStyle | `sticky` | `sticky` \| `scroll` |
| `theme_mode` | ThemeMode | `light` | `light` \| `dark` \| `system` |
| `theme_preset` | ThemePreset | `orbitly` | `default` \| `orbitly` \| `brutalist` \| `soft-pop` |
| `font` | FontKey | `geist` | 18 Google Fonts |

---

## Keyboard Shortcuts (Registered in DashboardLayoutClient)

```typescript
// Registered via react-hotkeys-hook in DashboardLayoutClient.tsx
// Add in Phase 2 alongside command-palette

useHotkeys("mod+k",         openCommandPalette);
useHotkeys("mod+\\",        toggleAIPanel);
useHotkeys("mod+b",         toggleSidebar);
useHotkeys("mod+shift+n",   toggleNotifications);
useHotkeys("mod+shift+l",   () => router.push(`/dashboard/${orgSlug}/leads`));
useHotkeys("mod+shift+c",   () => router.push(`/dashboard/${orgSlug}/contacts`));
useHotkeys("mod+shift+e",   () => router.push(`/dashboard/${orgSlug}/deals`));
useHotkeys("mod+,",         () => router.push(`/dashboard/${orgSlug}/settings`));
```

---

## Rules
- [ ] R-SHELL-01: Nav items MUST come from `navigation.ts` config — never hardcoded in JSX
- [ ] R-SHELL-02: Shell NEVER imports from entity modules or features — they import from shell
- [ ] R-SHELL-03: All layout preferences stored in cookies (SSR-safe), NOT localStorage
- [ ] R-SHELL-04: ModuleGuard wraps every feature-gated nav item — disabled → hide + redirect
- [ ] R-SHELL-05: DashboardLayout MUST include AI panel slot (always present from Phase 3)
- [ ] R-SHELL-06: Badge counts loaded from ONE query (`getNavBadgeCounts`) — not N separate queries
- [ ] R-SHELL-07: Entity labels in nav loaded from `getEntityLabels` — never hardcoded "Lead"
- [ ] R-SHELL-08: NavUser connects to real Convex auth session — never hardcoded rootUser import
- [ ] R-SHELL-09: Keyboard shortcuts registered in DashboardLayoutClient (Phase 2)

## Avoids
- ❌ Never import from `core/entities/`, `features/`, or any feature module
- ❌ Never hardcode nav items in component JSX — always from navigation.ts
- ❌ Never use localStorage for layout prefs (breaks SSR)
- ❌ Never make shell conditional on plan tier — shell is always available
- ❌ Never use hardcoded user data (rootUser) — always real Convex session

## Cross-Module Dependencies
- **READS FROM**: `api.orgs.getEntityLabels`, `api.orgs.getNavBadgeCounts`,
  `api.orgs.getEntityVisibility`, `api.notifications.getSummary`,
  `api.users.me`, `api.orgs.myOrgs`, `api.savedViews.listPinned`, `api.featureFlags.getForOrg`
- **WRITES TO**: Nothing (read-only shell)
- **NEVER IMPORTS FROM**: Any entity or feature module


---

## Decisions Log

| # | Decision | Outcome |
|---|---|---|
| D1 | Dashboard cards stack max 2 per row (never 3+) | AI panel takes ~360px when open. With 3-card rows the middle card collapsed into a sliver. New layout: 4-tile KPI strip → 2-card content rows → full-width strip → 2-card row. Opening AI panel only changes density inside cards, not their count. |
| D2 | Week-ahead widget cells use natural height (no `h-full`) | Cells now grow to content + a `min-h-[110px]` floor. Inflated to "full height" when its grid row had a tall sibling — looked awful in dashboard row 1 next to a packed reminders card. Each cell is now exactly as tall as its content needs. |
| D3 | Dashboard messages limit increased to 8 (was 5) | Filled the empty bottom of the messages card; matches the activity card's row count visually. |
| D4 | Pipeline + Today's Focus cards added to dashboard | The shell user complained about "we have lot of cards to work" — added a Pipeline snapshot (open value, win rate, won/lost bar) and a Today's Focus list (reminders due, leads to qualify, deals to advance, deals won). Both link straight into the entity list pages. |
| D5 | (Stage 1 of `DASHBOARD-V2-PLAN.md`, 2026-05-28) `ProactiveWorkspaceSection` renamed `AICockpitSection` (TITLE: "AI Cockpit", SUBTITLE: "Your workspace, on autopilot"). | "Proactive workspace" was internally accurate but invisibly so — every other AI vendor (Anthropic, OpenAI, Linear, Vercel) leans into the brand mark + a confident metaphor. "AI Cockpit" pairs with the new `<AIMark>` (Sparkles) component and pre-empts Stage 5's AI-written widgets that mount inside the section. The user-prefs storage key (`dashboardSectionsCollapsed.proactive`) stayed unchanged so existing per-user collapse state carries over the rename. |
| D6 | (Stage 1 of `DASHBOARD-V2-PLAN.md`, 2026-05-28) Single canonical AI brand mark via `core/ai/components/AIMark.tsx`. | Replaced 7 `lucide:Bot` usages (TopNav, ChatAvatar, AssistantTurn, ChatSheet, ChatMessage, DailyBriefingCard, WeeklyInsightCard) with one component that takes `tone` + `size` + `aria-label`. Future re-skin is a one-file change. The robot icon felt dated; `Sparkles` is the canonical AI mark across the vendor space and pairs with the workspace's theme primary tone. |
| D7 | (Stage 1 of `DASHBOARD-V2-PLAN.md`, 2026-05-28) `deals.pipelineValue` KPI tile uses `WalletIcon` instead of `DollarSignIcon`. | The card body already calls `formatCurrency(value, stats.currency)` so the displayed amount honours `org.settings.currency` — only the icon was hardcoded to USD. `WalletIcon` is currency-agnostic and reads cleanly for ₹ / € / ج.م / etc. workspaces. |
| D8 | (Stage 1 of `DASHBOARD-V2-PLAN.md`, 2026-05-28) `ai.morningBriefing` removed from the KPI registry. | The full-width `<DailyBriefingCard>` IS the briefing surface; rendering a "—" KPI tile alongside it produced a redundant 5th column in the metric strip (the user's "5 cards in metric strip — AI briefing is duplicated, want 4 in one line" complaint). The data-side `WIDGETS["ai.morningBriefing"]` (size: "full") stays — only the KPI tile is gone. |
| D9 | (2026-05-29 hotfix wave) AICockpitSection header — title rendered title-case (not uppercase), chevron icon removed, full header bar to the LEFT of the refresh button is the toggle target with `cursor-pointer`, refresh button calls `event.stopPropagation()`. | The previous header used `uppercase` on the h2 and a small `<button>` containing only icon+text — too narrow a hit area for the obvious dashboard-section gesture. Removing the chevron drops one redundant signal (the body collapse animation already conveys state). The `<button>` is now `flex flex-1`, so the visible header row out to the refresh button is one big clickable region. The refresh button's `onClick` calls `event.stopPropagation()` so a click on it never bubbles up to the toggle. |
| D10 | (2026-05-29 hotfix wave) `DailyBriefingCard` + `WeeklyInsightCard` every visual state pinned to `h-full min-h-[180px]`; populated states use `mt-auto` on the footer; the `max-h-[220px]` cap on empty + loading variants was dropped. | Parent grid is `lg:grid-cols-2 lg:auto-rows-fr` — `auto-rows-fr` only equalises if every cell honours the row's stretch. The empty-state cap on `WeeklyInsightCard` was capping it shorter than a content-rich `DailyBriefingCard`, producing the visible asymmetry the user flagged. Removing the cap + adding `h-full` lets both cards fill the row regardless of which side has more content. |
| D11 | (2026-05-29 hotfix wave) `lazyWarmForUser` per-`(userId,orgId)` rate budget raised 1/min → 5/min and the handler now soft-fails on rate-limit (returns `{ scheduled: false, rateLimited: true }`) instead of throwing. AIPulseRibbon also gates the call on a sessionStorage TTL keyed `flowbite:ai:lazyWarm:${orgId}:${userId}` (60s). | Original 1/min budget was set defensively when the warm was a manual click only. With AIPulseRibbon's auto-warm-on-empty wired to the dashboard, every navigation back to `/` remounts the component and tries to warm — within 60s of a successful warm the second call would `throw ConvexError("Too many requests")`, which is the storm the user pasted from the Convex logs. The sessionStorage gate prevents the storm at the source; the budget bump tolerates fast multi-tab use; the soft-fail return type means the Convex error log no longer records benign rate-limit drops. The actual rebuild is bounded by `internal.rebuildForUser` running on the scheduler and by `nextActionsTrigger.ts`'s 5s token-bucket dedup, so loosening the public-mutation budget does not change the effective backend pressure. |
| D12 | (Stage 2 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) Pipeline visibility on the dashboard collapses to ONE full-width `<SalesPipelinePanel>` with three tabs (Summary / Velocity / Forecast). Legacy `PipelineCard` (KPI summary) and `PipelineVelocityCard` (per-stage funnel) deleted; `WeeklyInsightCard` empty-state footer now matches its populated-state footer pattern (Generated by — / Generate button on the right). | Two cards rendering pipeline data side-by-side under different gates (`deals.pipelineValue` for the KPI summary, `pipeline.velocity` for the funnel) split user attention and made it impossible to add the HubSpot weighted-forecast view without a third card. Tabs collapse three concerns into one canvas; the user keeps `deals.pipelineValue` as a KPI tile in the metric strip and gets full forecast detail in the panel. The Velocity tab reuses the existing `getOrgPipelineVelocity` query verbatim — no re-implementation, no test churn. The Weekly Insight footer parity (per user feedback 2026-05-29) means a user dropping into the dashboard mid-week sees the same affordance — Generated by / button — regardless of whether content has rendered yet. |
| D13 | (Stage 2 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) Win probabilities derived deterministically from sorted stage order; pipeline schema is NOT extended with a per-stage `winProbability` field. Final positive=100, final negative=0, final neutral=50, default stage=0, non-default non-final at sorted index `i` of `N` peers gets `round((i+1)/(N+1)*100)`. | Adding a schema field would force every existing org owner to fill in numbers across every stage of every pipeline before the panel could compute a forecast — that's a hard onboarding cliff. Linear ramp from sorted order is good enough for HubSpot bucket routing (Commit ≥75 / Best Case 50–74 / Pipeline <50) and it works for every existing pipeline today. If users later want to override per-stage probabilities, that's an additive optional field and a one-line precedence change in `derivedWinProbability` — captured against a future deferral card if asked. |
| D14 | (Stage 2 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) Sparkline rendered as pure SVG (`components/ui/sparkline.tsx`) — no recharts dependency. Anchored at `currentColor` + tokenised so wrapping `<span className="text-emerald-600">` cascades through. RTL-friendly via SVG viewBox + `preserveAspectRatio="none"`. | recharts pulls 80kb gzipped for a single 12-bucket sparkline. SVG path generation costs ~30 lines and renders in 100µs. RTL support cleanly inherits the document direction without `transform: scaleX(-1)` hacks because the viewBox is locale-agnostic. Future chart consumers can still pull recharts when they need axes / tooltips / legends — this primitive only owns the "tiny trend line" use case. |
| D15 | (Stage 3 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) `<LiveTasksWidget>` embeds `<TasksDataTable compact>` and slices the result of `useTasksAllForOrg` to 10 rows client-side; the dashboard widget never issues its own paginated query and never writes URL state on remount. | The user complaint was "tasks should be the live table from /tasks page". Sharing `<TasksDataTable>` between /tasks and the dashboard means power users see a familiar surface with the same badges, assignee avatars, type chips, and one-click ✓ everywhere. The compact mode uses a plain `useReactTable` (not `useDataTable`) so a dashboard remount never writes `?page=&perPage=&sort=` into the URL — those query keys belong to the /tasks route alone. Sorting + slicing happens client-side via the existing `bucketTasksByDue` helper because the underlying `listAllForOrg` query is already cached at the dashboard level (calendar + tasks panel both subscribe), so an extra "give me 10 rows" query would have been a third subscription on top of the same source-of-truth. |
| D16 | (Stage 3 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) `<RecentActivityWidget>` reads from the parent's already-loaded `getDashboardStats.recentActivity` payload — NOT from a per-widget query. | The plan referenced `convex/_shared/activityLog.ts:listForOrg` as the data feed, but no such function exists in the codebase. The closest live equivalent (`convex/crm/shared/timeline/queries.ts:getForOrg`) is gated on the `activityLogs.viewOrg` permission (Owner/Admin only by default), which would hide the widget from members + viewers entirely. Reading from `getDashboardStats.recentActivity` solves both problems at once: zero extra subscriptions (the parent already loads it), works for every member regardless of permission (the dashboard-stats query has its own self-membership gate), and the payload is already the most recent 10 `activityLogs` rows ordered desc — exactly what the widget renders. The `ActivityItem` TypeScript type was widened with `userId`, `entityType`, `entityId`, `personCode?` so the widget can resolve actor avatars + deep-link hrefs; the server already returns those fields on every row, only the type was narrowing them away. |
| D17 | (Stage 4 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) `org.settings.dashboardLayout` is an additive optional slot — when set, the dashboard renderer swaps to `<DashboardLayoutRenderer>`; when unset, the legacy fixed-grid path keeps shipping unchanged. | A fresh schema field would force a migration on every existing org. Optional + additive means the new layout-aware path opts-in per-template — `b2b-saas`, `freelancer`, `real-estate-global`, `productivity` ship layouts; the other 5 built-ins keep the default flow until they explicitly opt in. The renderer pre-validates via `validateDashboardLayoutShape` and silently falls back when validation fails — defence-in-depth against a misconfigured layout from a future template editor. The schema validator + the template editor's `validateDefinition` ALSO check the shape at write boundaries, so the runtime fallback should never trip in practice. |
| D18 | (Stage 4 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) Three new analytical widgets (`InvoiceAgingWidget`, `PropertyFunnelWidget`, `ARRCohortWidget`) each ship a backing `orgQuery` + `*ForAI` internal twin in `convex/crm/entities/deals/industryAnalytics.ts` even though no AI tool currently calls them. | AGENTS.md's "AI tools call `*ForAI` internal twins" rule is non-negotiable — Stage 5's `render_widget` AI tool will surface these aggregations through the AI loop, and that surface CANNOT call public `orgQuery` directly because scheduled-action auth doesn't propagate. Adding the twins now means Stage 5 can wire `render_widget` without touching the analytics file. Cost: 3 extra ~15-line internal exports. Saving: zero auth-propagation pain when the AI tools land. The pure-helper unit tests (`bucketForDays`, `isInvoiceStage`, `monthKey`, `buildArrCohortBuckets`, `computePropertyFunnel`) lock in the math irrespective of which entry-point reaches them. |
| D19 | (Stage 5 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) Dashboard layout is resolved per (userId, orgId) via a 3-tier fallback: `user.preferences.dashboardLayoutOverride.layout` → `org.settings.dashboardLayout` → legacy fixed grid. The per-user override is org-scoped (single-org-active model) — when the user switches active org, mismatched override falls through to the org default. | Production CRMs (Salesforce Lightning App Personalization, HubSpot My Dashboards, monday.com per-user views, Attio Personal Saved Views) all do per-user dashboards on top of an org default. Org-wide-only would mean any user editing the layout broadcasts to every other member — unacceptable multi-tenancy. Per-user override + org default + legacy grid = three-tier fallback that's familiar to every user coming from another CRM. |
| D20 | (Stage 5 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) AI never writes the canonical dashboard layout. `render_widget` writes to `ephemeralDashboardCells` (per-user, 24h TTL); `annotate_widget` writes to `dashboardAnnotations` (per-org, per-user dismissable). The user's deliberate "Pin to my dashboard" gesture on an AI-pinned cell is the only path that mutates `user.preferences.dashboardLayoutOverride.layout`. | Architectural rule, not a guideline. Per AGENTS.md locked decision #26, `settings` category is hard-locked (always asks). Even if AI proposed a layout change, decision #26 would force a confirmation card. Net gain over "user clicks Pin to my dashboard": 0. Net cost: every AI tool gains a settings-category confirmation surface, every layout edit needs a propose/commit pair, and the "AI rearranged your dashboard" UX is unavoidably noisy. The Pin-button path delivers the same outcome with zero ambiguity. Industry consensus (Attio Reporting 2.0, monday.com 2026 dashboard guide, HubSpot AI insights, Salesforce Einstein) — none of them mutate the canonical layout from AI. |
