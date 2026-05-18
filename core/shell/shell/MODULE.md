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
