# Settings Code Architecture — Build Guide

> **Purpose**: Complete code-level guide for building the settings page. Give this to any AI agent and they can build the entire settings system.
> **Prerequisite**: Read `SETTINGS_ARCHITECTURE.md` first for the full spec (groups, sub-groups, RBAC matrix).
> **Route**: `/{locale}/{orgSlug}/settings` — SINGLE PAGE, NO SUB-ROUTES
> **Last Updated**: 2026-05-09

---

## Locked Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Single `/settings` route | No sub-routes. Group switching via left nav + `?group=` query param |
| 2 | Org-scoped | Every setting belongs to logged-in org. Different orgs = independent |
| 3 | Org slug immutable | Set during onboarding. Only name editable in settings |
| 4 | Dynamic labels everywhere | NEVER hardcode "Leads", "Contacts", "Deals" — always from `orgs.entityLabels` |
| 5 | Shortcuts = reference page only | Shortcuts are code-only (same for all workspaces). Settings shows a read-only reference page listing all shortcuts. No editing. |
| 6 | Appearance = ALL users | Every role gets full Appearance settings. Theme/font/layout are per-user cookies, not org settings. No harm in any user changing their own appearance. |
| 7 | RBAC-gated, never plan-gated | Every org on every plan gets settings |
| 8 | Convex storage for files | No Cloudinary. Use Convex `_storage` for logos, CSVs, exports |
| 9 | Shadboard UI reference | Left sidebar + right content layout from shadboard |
| 10 | Group-wise notification toggles | "Toggle All" per group (CRM, Reminders, AI, Team, System) |
| 11 | O(1) to O(log N) queries | 2 queries load entire page: org doc + permissions |
| 12 | Portal shares settings | Client portal reads same org settings |
| 13 | Activity Log NOT in settings | Activity log is a full page at `/{locale}/{orgSlug}/activity` — not a settings group. Data & Security group has Export + Danger Zone only. |
| 14 | Slug reserved keywords | Org slugs validated against `RESERVED_SLUGS` list at creation. Pattern: lowercase, alphanumeric + hyphens, 3-48 chars, no reserved words. See slug section below. |
| 15 | Backend = `orgMutation` + `requireRole()` | Settings mutations use `orgMutation` (injects user) then call `requireOrgMember()` + `requireRole(member.permissions, key)` inside. `adminMutation` is NOT a security gate — it only injects user. Never rely on the builder name for security. |

---

## File Structure

```
core/settings/
├── MODULE.md                          # Module decisions & rules
├── views/
│   └── SettingsView.tsx               # Main view (left nav + right content)
├── components/
│   ├── SettingsNav.tsx                # Left sub-panel: search + group buttons
│   ├── SettingsSearch.tsx             # Fuse.js search bar + results dropdown
│   ├── SettingsContent.tsx            # Right panel: renders active group component
│   ├── shared/
│   │   ├── SettingsSection.tsx        # Card wrapper: title + description + children
│   │   ├── SettingsRow.tsx            # Single setting: label + control inline
│   │   ├── SettingsSaveButton.tsx     # Per-section save with loading state
│   │   └── DangerZone.tsx            # Red-bordered destructive section
│   └── groups/
│       ├── WorkspaceGroup.tsx         # General + Entity Labels + Record Codes + Modules
│       ├── TeamGroup.tsx              # Members + Roles
│       ├── CRMGroup.tsx               # Pipelines + Fields + Tags + Reminders
│       ├── AIGroup.tsx                # Business Context + Usage + Entity Viewer
│       ├── AppearanceGroup.tsx        # Theme + Font + Layout
│       ├── NotificationsGroup.tsx     # Group-wise toggles
│       ├── BillingGroup.tsx           # Plan + Usage + Payment
│       └── DataGroup.tsx              # Activity Log + Export + Danger Zone
├── config/
│   ├── settings-nav.ts               # SETTINGS_GROUPS array
│   └── settings-search-index.ts      # Flat searchable entries
└── hooks/
    ├── useSettingsSearch.ts           # Fuse.js hook
    └── useActiveGroup.ts             # State + query param sync

app/[locale]/(private)/[orgSlug]/settings/
└── page.tsx                           # Thin wrapper only

convex/orgs/
├── queries.ts                         # getFullSettings, getCurrent
└── mutations.ts                       # updateSettings, updateEntityLabels, updateName
```

---

## Rules (MUST follow in every settings file)

### R-SET-01: No hardcoded entity names
```tsx
// ❌ NEVER
<h3>Leads</h3>
<p>Pipeline for deals</p>
"CRM — Contacts"

// ✅ ALWAYS
<h3>{labels.lead.plural}</h3>
<p>Pipeline for {labels.deal.plural}</p>
`CRM — ${labels.contact.plural}`
```

### R-SET-02: Every section wraps in PermissionGate
```tsx
<PermissionGate permission="org.settings" fallback={null}>
  <SettingsSection title="General" description="...">
    {/* controls */}
  </SettingsSection>
</PermissionGate>
```

### R-SET-03: RTL-safe classes only
Use `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`. Never `ml-*`, `mr-*`, `pl-*`, `pr-*`.

### R-SET-04: Dynamic border-radius
Use `rounded-[var(--radius)]`. Never `rounded-md`, `rounded-lg`.

### R-SET-05: Per-section save (not global)
Each section has its own save button. Mutations are granular per section.

### R-SET-06: Lazy load group data
Only fetch pipelines/fields/tags/members when that group is active. Use Convex `useQuery` with `skip` pattern.

### R-SET-07: No app name hardcoding
Use `APP_CONFIG.name` from env vars. Never write "Orbitly" in UI.

### R-SET-08: Thin app/ wrapper
`page.tsx` only unwraps params and renders `<SettingsView />`. Zero logic in app/.

---

## Core Hook: useEntityLabels

This hook is the foundation. Used in settings AND every other module.

```typescript
// core/entities/shared/hooks/useEntityLabels.ts
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type EntityLabel = { singular: string; plural: string; slug: string };
type EntityLabels = {
  lead: EntityLabel;
  contact: EntityLabel;
  deal: EntityLabel;
  company: EntityLabel;
};

const DEFAULTS: EntityLabels = {
  lead: { singular: "Lead", plural: "Leads", slug: "leads" },
  contact: { singular: "Contact", plural: "Contacts", slug: "contacts" },
  deal: { singular: "Deal", plural: "Deals", slug: "deals" },
  company: { singular: "Company", plural: "Companies", slug: "companies" },
};

export function useEntityLabels(): EntityLabels {
  const org = useQuery(api.orgs.getCurrent);
  if (!org?.entityLabels) return DEFAULTS;
  return {
    lead: org.entityLabels.lead ?? DEFAULTS.lead,
    contact: org.entityLabels.contact ?? DEFAULTS.contact,
    deal: org.entityLabels.deal ?? DEFAULTS.deal,
    company: org.entityLabels.company ?? DEFAULTS.company,
  };
}
```

**Usage everywhere**: Import this hook in any component that displays entity names. Never import a hardcoded string.

---

## Core Hook: useActiveGroup

```typescript
// core/settings/hooks/useActiveGroup.ts
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";

const DEFAULT_GROUP = "workspace";

export function useActiveGroup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = searchParams.get("group") ?? DEFAULT_GROUP;
  const [activeGroup, setActiveGroupState] = useState(initial);

  const setActiveGroup = useCallback((group: string) => {
    setActiveGroupState(group);
    const params = new URLSearchParams(searchParams.toString());
    params.set("group", group);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  return { activeGroup, setActiveGroup };
}
```

---

## Component Patterns

### SettingsView (Main Entry)

```tsx
// core/settings/views/SettingsView.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SettingsNav } from "../components/SettingsNav";
import { SettingsContent } from "../components/SettingsContent";
import { useActiveGroup } from "../hooks/useActiveGroup";

export function SettingsView() {
  const org = useQuery(api.orgs.getFullSettings);
  const permissions = useQuery(api.orgRoles.getMyPermissions);
  const { activeGroup, setActiveGroup } = useActiveGroup();

  if (!org || !permissions) return <SettingsSkeleton />;

  return (
    <div className="flex h-full">
      <SettingsNav
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
        permissions={permissions}
      />
      <SettingsContent
        activeGroup={activeGroup}
        org={org}
        permissions={permissions}
      />
    </div>
  );
}
```

### SettingsNav (Left Sub-Panel)

```tsx
// core/settings/components/SettingsNav.tsx
"use client";

import { SETTINGS_GROUPS } from "../config/settings-nav";
import { SettingsSearch } from "./SettingsSearch";
import { cn } from "@/lib/utils";

type Props = {
  activeGroup: string;
  onGroupChange: (group: string) => void;
  permissions: string[];
};

export function SettingsNav({ activeGroup, onGroupChange, permissions }: Props) {
  const visibleGroups = SETTINGS_GROUPS.filter((g) => {
    if (g.ownerOnly) return permissions.includes("org.owner");
    if (g.permission) return permissions.includes(g.permission);
    return true;
  });

  return (
    <aside className="w-60 shrink-0 border-e border-border p-4 space-y-4">
      <SettingsSearch onNavigate={onGroupChange} />
      <nav className="space-y-1">
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => onGroupChange(group.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm",
              activeGroup === group.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <group.icon className="size-4" />
            {group.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

### SettingsSection (Reusable Card)

```tsx
// core/settings/components/shared/SettingsSection.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function SettingsSection({ title, description, children }: Props) {
  return (
    <Card className="rounded-[var(--radius)]">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
```

### SettingsRow (Label + Control)

```tsx
// core/settings/components/shared/SettingsRow.tsx
type Props = {
  label: string;
  description?: string;
  children: React.ReactNode;
};

export function SettingsRow({ label, description, children }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
```

### App Page (Thin Wrapper)

```tsx
// app/[locale]/(private)/[orgSlug]/settings/page.tsx
import { SettingsView } from "@/core/settings/views/SettingsView";

export default function SettingsPage() {
  return <SettingsView />;
}
```

---

## Backend Patterns (Convex)

### Query: getFullSettings

```typescript
// convex/orgs/queries.ts
import { orgQuery } from "../_shared/helpers";

export const getFullSettings = orgQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db.get(ctx.org._id);
    return {
      _id: org!._id,
      name: org!.name,
      slug: org!.slug,
      logoStorageId: org!.logoStorageId,
      industry: org!.industry,
      plan: org!.plan,
      aiContext: org!.aiContext,
      entityLabels: org!.entityLabels,
      settings: org!.settings,
    };
  },
});
```

### Query: getMyPermissions

```typescript
// convex/orgRoles/queries.ts
import { authenticatedQuery } from "../_shared/helpers";

export const getMyPermissions = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_orgId_and_userId", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    if (!member) return [];
    const role = await ctx.db.get(member.roleId);
    return role?.permissions ?? [];
  },
});
```

### Mutation: updateEntityLabels

```typescript
// convex/orgs/mutations.ts
import { v } from "convex/values";
import { adminMutation } from "../_shared/helpers";

export const updateEntityLabels = adminMutation({
  args: {
    entityLabels: v.object({
      lead: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
      contact: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
      deal: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
      company: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.org._id, {
      entityLabels: args.entityLabels,
      updatedAt: Date.now(),
    });
  },
});
```

### Mutation: updateSettings (granular)

```typescript
// convex/orgs/mutations.ts
export const updateSettings = adminMutation({
  args: {
    settings: v.object({
      defaultCurrency: v.optional(v.string()),
      timezone: v.optional(v.string()),
      leadStaleAfterDays: v.optional(v.number()),
      badgeCountsVisible: v.optional(v.boolean()),
      codePrefixes: v.optional(v.object({
        person: v.optional(v.string()),
        deal: v.optional(v.string()),
        company: v.optional(v.string()),
        followup: v.optional(v.string()),
      })),
      modules: v.optional(v.array(v.object({
        slot: v.string(),
        label: v.optional(v.string()),
        hidden: v.optional(v.boolean()),
        order: v.optional(v.number()),
      }))),
      reminderDefaults: v.optional(v.object({
        followUpWindowHours: v.optional(v.number()),
        staleAlertDays: v.optional(v.number()),
        morningBriefingEnabled: v.optional(v.boolean()),
        morningBriefingTime: v.optional(v.string()),
        rentAlertDays: v.optional(v.number()),
        rentAlertEnabled: v.optional(v.boolean()),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(ctx.org._id);
    await ctx.db.patch(ctx.org._id, {
      settings: { ...org!.settings, ...args.settings },
      updatedAt: Date.now(),
    });
  },
});
```

### Mutation: updateNotificationPreferences (per-user)

```typescript
// convex/users/mutations.ts
import { v } from "convex/values";
import { authenticatedMutation } from "../_shared/helpers";

export const updateNotificationPreferences = authenticatedMutation({
  args: {
    preferences: v.object({
      lead_assigned: v.optional(v.boolean()),
      lead_converted: v.optional(v.boolean()),
      contact_assigned: v.optional(v.boolean()),
      deal_assigned: v.optional(v.boolean()),
      deal_stage_changed: v.optional(v.boolean()),
      deal_won: v.optional(v.boolean()),
      deal_stale: v.optional(v.boolean()),
      reminder_due: v.optional(v.boolean()),
      reminder_overdue: v.optional(v.boolean()),
      ai_action_completed: v.optional(v.boolean()),
      ai_workspace_setup: v.optional(v.boolean()),
      member_invited: v.optional(v.boolean()),
      member_joined: v.optional(v.boolean()),
      role_changed: v.optional(v.boolean()),
      billing_trial_ending: v.optional(v.boolean()),
      billing_suspended: v.optional(v.boolean()),
      csv_import_complete: v.optional(v.boolean()),
      csv_import_failed: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.user._id);
    await ctx.db.patch(ctx.user._id, {
      notificationPreferences: { ...user!.notificationPreferences, ...args.preferences },
      updatedAt: Date.now(),
    });
  },
});
```

---

## Phase Prompts (Give these to AI agent for each phase)

### Phase 1 Prompt: Layout + Workspace Group

```
BUILD SETTINGS PHASE 1: Layout Shell + Workspace Group

Read these files first:
- SETTINGS_ARCHITECTURE.md (full spec)
- SETTINGS_CODE_ARCHITECTURE.md (code patterns)
- core/settings/MODULE.md (rules)
- .github/agents/base/rules.md (global rules)
- convex/schema.ts (tables)

Build in this order:
1. core/settings/config/settings-nav.ts — SETTINGS_GROUPS array with icons + permissions
2. core/settings/hooks/useActiveGroup.ts — state + query param sync
3. core/settings/components/shared/SettingsSection.tsx — card wrapper
4. core/settings/components/shared/SettingsRow.tsx — label + control
5. core/settings/components/SettingsNav.tsx — left panel with RBAC filtering
6. core/settings/components/SettingsContent.tsx — renders active group
7. core/settings/views/SettingsView.tsx — main view combining nav + content
8. app/[locale]/(private)/[orgSlug]/settings/page.tsx — thin wrapper
9. core/settings/components/groups/WorkspaceGroup.tsx — General + Entity Labels + Record Codes + Modules

Rules:
- NEVER hardcode entity names. Use useEntityLabels() hook.
- RTL-safe classes only (ms-*, me-*, ps-*, pe-*).
- rounded-[var(--radius)] only. Never rounded-md/lg.
- PermissionGate wraps every section.
- Per-section save buttons.
- Entity labels: singular + plural on same line, slug on 2nd line.
- Org slug NOT editable. Only name is editable.
- No keyboard shortcuts in settings.
- Appearance is admin+ only.

Backend needed:
- convex/orgs/queries.ts: getFullSettings
- convex/orgs/mutations.ts: updateName, updateEntityLabels, updateSettings
- convex/orgRoles/queries.ts: getMyPermissions
```

### Phase 2 Prompt: CRM Group

```
BUILD SETTINGS PHASE 2: CRM Group (Pipelines + Fields + Tags + Reminders)

Read these files first:
- SETTINGS_ARCHITECTURE.md (Group 3 section)
- SETTINGS_CODE_ARCHITECTURE.md (patterns)
- convex/crm/fields/pipelines/MODULE.md
- convex/crm/fields/fieldDefinitions/MODULE.md
- convex/crm/shared/tags/MODULE.md
- convex/crm/shared/reminders/MODULE.md

Build:
1. core/settings/components/groups/CRMGroup.tsx

Sections inside CRMGroup:
- Pipelines: accordion list, stage editor with drag-reorder, color pickers, stale thresholds
- Fields: entity type tabs (dynamic labels!), field list with drag-reorder, add/edit/delete
- Tags: grid with name + color, inline create/edit/delete
- Reminders: toggle + number inputs for each reminder type

Rules:
- Entity type tabs use dynamic labels (not "Leads" but labels.lead.plural)
- Lazy load: only fetch pipelines/fields/tags when CRM group is active
- Stage deletion blocked if deals exist in that stage
- Field deletion shows warning about cascading fieldValues
- Industry-specific reminders (rent alert) shown/hidden based on orgs.industry
- All mutations use adminMutation (admin+ only)
```

### Phase 3 Prompt: Team Group

```
BUILD SETTINGS PHASE 3: Team Group (Members + Roles)

Read these files first:
- SETTINGS_ARCHITECTURE.md (Group 2 section)
- SETTINGS_CODE_ARCHITECTURE.md (patterns)
- .github/agents/base/rbac.md

Build:
1. core/settings/components/groups/TeamGroup.tsx

Sections:
- Members: DataTable with name, email, role badge, status, actions (invite, change role, remove)
- Roles: Card list + permission checkbox grid (9 categories × ~40 keys)

Rules:
- Members section: permission "org.inviteMembers" (admin+)
- Roles section: ownerOnly (only org owner sees this)
- Permission category labels use DYNAMIC entity labels:
  "CRM — {labels.lead.plural}" not "CRM — Leads"
- Cannot delete system roles (Owner, Admin, Member)
- Role color picker for visual distinction
- Quick templates: "Full Access", "Read Only", "Standard"
```

### Phase 4 Prompt: AI + Appearance + Notifications

```
BUILD SETTINGS PHASE 4: AI + Appearance + Notifications Groups

Read these files first:
- SETTINGS_ARCHITECTURE.md (Groups 4, 5, 6)
- SETTINGS_CODE_ARCHITECTURE.md (patterns)
- core/ai/MODULE.md

Build:
1. core/settings/components/groups/AIGroup.tsx
2. core/settings/components/groups/AppearanceGroup.tsx
3. core/settings/components/groups/NotificationsGroup.tsx

AI Group:
- Business context textarea (10K char limit) → saves to orgs.aiContext
- Usage meter (progress bar, read-only)
- Entity context viewer (admin search + JSON display)

Appearance Group (admin+ only):
- Theme mode: Light/Dark/System radio → cookie
- Theme preset: color palette cards → cookie
- Font: select dropdown → cookie
- Layout: sidebar variant, collapsible, content layout, navbar style → cookies
- NO keyboard shortcuts section

Notifications Group:
- Group-wise toggles with "Toggle All" per group
- Groups: CRM, Reminders, AI, Team, System
- All entity-related labels use dynamic names
- Saves to users.notificationPreferences

Rules:
- Appearance stores in cookies (SSR-safe), NOT Convex
- AI context has 10K char limit with counter
- Notification labels use dynamic entity names
- "Toggle All" computes from individual toggle states
```

### Phase 5 Prompt: Billing + Data & Security

```
BUILD SETTINGS PHASE 5: Billing + Data & Security Groups

Read these files first:
- SETTINGS_ARCHITECTURE.md (Groups 7, 8)
- SETTINGS_CODE_ARCHITECTURE.md (patterns)

Build:
1. core/settings/components/groups/BillingGroup.tsx
2. core/settings/components/groups/DataGroup.tsx

Billing (owner only):
- Current plan display + upgrade/downgrade buttons
- Usage meters (AI messages, members, pipelines, fields)
- Payment history table (from LemonSqueezy API)

Data & Security:
- Activity Log: infinite scroll, filters (type, actor, date)
- Export: entity type select (dynamic labels!) + format radio + download button
- Danger Zone: org delete (type name to confirm), transfer ownership

Rules:
- Billing = ownerOnly
- Activity log = "timeline.viewAll" permission
- Export = "org.settings" permission
- Danger Zone = ownerOnly, red border, requires typing org name
- Export dropdown uses dynamic entity labels
- Org delete = soft-delete only, 24h email verification
```

### Phase 6 Prompt: Search

```
BUILD SETTINGS PHASE 6: Settings Search

Read these files first:
- SETTINGS_ARCHITECTURE.md (Search section)
- SETTINGS_CODE_ARCHITECTURE.md (patterns)

Build:
1. core/settings/config/settings-search-index.ts — flat array of SettingEntry objects
2. core/settings/hooks/useSettingsSearch.ts — Fuse.js fuzzy search
3. core/settings/components/SettingsSearch.tsx — search input + results dropdown

SettingEntry shape:
{ id, groupId, sectionId, label, description, keywords, permission? }

Behavior:
- Type → fuzzy match label + keywords + description
- Show max 8 results grouped by parent group
- Click result → setActiveGroup(groupId) + scroll to section
- RBAC: filter out entries where user lacks permission
- All labels in index use static fallbacks (search index is code-level)

Install: pnpm add fuse.js (exact version)
```

---

## How Settings Affect the Dashboard & User Behavior

### Entity Labels → Sidebar + All UI

When admin changes "Leads" → "Inquiries" in settings:
1. Mutation patches `orgs.entityLabels.lead = { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" }`
2. Convex reactivity pushes update to ALL connected clients instantly
3. `useEntityLabels()` hook re-renders every component using it
4. Sidebar nav item changes from "Leads" to "Inquiries"
5. Page titles, empty states, form labels, AI prompts — all update
6. URL slug changes: `/leads` → `/inquiries` (handled by slug field)

### Modules & Navigation → Sidebar Visibility

When admin hides "Companies" module:
1. Mutation patches `orgs.settings.modules[slot="companies"].hidden = true`
2. Shell sidebar reads `modules` array → hides "Companies" nav item
3. Direct URL access to `/companies` shows "Module disabled" message
4. Badge count for that module disappears

### Record Code Prefix → Background Job

When admin changes person prefix from "P" to "INQ":
1. Mutation saves new prefix to `orgs.settings.codePrefixes.person`
2. Triggers Trigger.dev background job: `renamePrefixes`
3. Job patches all existing persons: "P-001" → "INQ-001", "P-002" → "INQ-002"
4. Progress shown in settings (optional toast)
5. Numbers NEVER change — only prefix

### Pipelines → Kanban Board

When admin adds/removes/reorders stages:
1. Mutation patches `pipelines.stages[]`
2. Kanban board re-renders with new columns
3. Deals in deleted stages → moved to first stage (with warning)
4. Stale thresholds → kanban cards show warning/stale colors

### Custom Fields → Entity Forms

When admin adds a field:
1. Mutation inserts into `fieldDefinitions`
2. Entity create/edit forms re-render with new field
3. Field appears in correct group, correct order
4. Required fields block form submission

### Notification Preferences → Bell Icon

When user toggles off "Deal stage changed":
1. Mutation patches `users.notificationPreferences.deal_stage_changed = false`
2. `sendNotification()` checks preferences before inserting
3. User stops receiving that notification type
4. Existing notifications of that type remain visible

### Appearance → Immediate Visual Change

When admin changes theme/font/layout:
1. Cookie updated immediately
2. CSS variables change → entire UI re-renders
3. SSR respects cookies → no flash on page load
4. Other users in same org NOT affected (per-user cookies)

---

## RBAC Enforcement Pattern

### Frontend: PermissionGate Component

```tsx
// Already exists in features/orgs/components/PermissionGate.tsx
type Props = {
  permission: string;
  ownerOnly?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

// Usage in settings:
<PermissionGate permission="org.settings">
  <WorkspaceGroup org={org} />
</PermissionGate>

<PermissionGate ownerOnly>
  <DangerZone orgName={org.name} />
</PermissionGate>
```

### Backend: adminMutation / ownerMutation

```typescript
// All settings mutations use adminMutation (checks admin+ role)
// Billing/roles/danger-zone use ownerMutation (checks owner role)
// Notification preferences use authenticatedMutation (any logged-in user)

// Pattern:
export const updateEntityLabels = adminMutation({ ... });  // admin+
export const deleteOrg = ownerMutation({ ... });           // owner only
export const updateNotificationPreferences = authenticatedMutation({ ... }); // any user
```

### Nav Filtering

```typescript
// Settings nav hides groups user can't access:
const visibleGroups = SETTINGS_GROUPS.filter((g) => {
  if (g.ownerOnly) return permissions.includes("org.owner");
  if (g.permission) return permissions.includes(g.permission);
  return true; // no permission = visible to all (appearance, notifications)
});
```

But for Appearance: even though no `permission` field on the group, the group component itself checks admin+ and shows nothing to members (they use profile dropdown theme toggle instead).

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Settings Page                              │
│                                                              │
│  useQuery(api.orgs.getFullSettings)  ←── Convex (reactive)  │
│  useQuery(api.orgRoles.getMyPermissions)                     │
│                                                              │
│  ┌─────────────┐    ┌──────────────────────────────────┐    │
│  │ SettingsNav  │    │ Active Group Component           │    │
│  │ (filtered)   │    │                                  │    │
│  │              │    │  useMutation(api.orgs.update*)    │    │
│  │  workspace ──┼───▶│  useMutation(api.pipelines.*)    │    │
│  │  team        │    │  useMutation(api.fields.*)       │    │
│  │  crm         │    │  useMutation(api.tags.*)         │    │
│  │  ai          │    │                                  │    │
│  │  appearance  │    │  Lazy: useQuery(api.pipelines.*) │    │
│  │  ...         │    │  (only when group is active)     │    │
│  └─────────────┘    └──────────────────────────────────┘    │
│                                                              │
│  Cookies (appearance) ←── No Convex, SSR-safe               │
└─────────────────────────────────────────────────────────────┘
         │
         │ Convex reactivity
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard (other pages)                    │
│                                                              │
│  useEntityLabels() → sidebar labels, page titles, forms      │
│  useQuery(api.orgs.getCurrent) → modules visibility          │
│  useQuery(api.pipelines.*) → kanban columns                  │
│  useQuery(api.fieldDefinitions.*) → entity forms             │
│  cookies → theme, font, layout                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

After building each phase, verify:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint-check` passes
- [ ] Settings page loads without errors
- [ ] RBAC: member user cannot see admin-only groups
- [ ] RBAC: viewer user sees only notifications group
- [ ] Entity label change reflects in sidebar immediately
- [ ] Module hide/show reflects in sidebar immediately
- [ ] Theme change applies without page reload
- [ ] Save button shows loading state during mutation
- [ ] Error toast shown on mutation failure
- [ ] Mobile responsive: left nav collapses properly

---

## Avoids (Non-Negotiable)

- ❌ Never plan-gate settings pages — only role-gate
- ❌ Never store settings in env vars (use Convex orgs table)
- ❌ Never let non-admin access pipeline/field/tag/role settings
- ❌ Never run prefix rename synchronously — always background job (Trigger.dev)
- ❌ Never hardcode "Lead", "Contact", "Deal", "Company" in any settings UI text
- ❌ Never create sub-routes under /settings — single page with group navigation
- ❌ Never put keyboard shortcuts editing in settings — shortcuts are code-only (reference page is fine)
- ❌ Never use directional CSS (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`)
- ❌ Never hardcode border-radius (`rounded-md`, `rounded-lg`) — use `rounded-[var(--radius)]`
- ❌ Never write the app name in UI — use `APP_CONFIG.name`
- ❌ Never put logic in `app/` page files — thin wrappers only
- ❌ Never use Cloudinary — use Convex `_storage` for all file uploads
- ❌ Never put Activity Log in settings — it lives at `/{locale}/{orgSlug}/activity`
- ❌ Never gate Appearance by role — it's per-user cookies, all roles get it
- ❌ Never allow reserved slugs (api, admin, settings, etc.) — validate against `RESERVED_SLUGS` set
- ❌ Never rely on mutation builder name for security — always call `requireRole()` explicitly inside handler

> **Activity Log** is NOT in settings. It lives at `/{locale}/{orgSlug}/activity` as a full page.

---

## Schema Fields Summary (All Settings Storage)

| Category | Field | Table | Scope |
|----------|-------|-------|-------|
| Org name | `name` | `orgs` | Per-org |
| Org logo | `logoStorageId` | `orgs` | Per-org |
| Entity labels | `entityLabels` | `orgs` | Per-org |
| Timezone | `settings.timezone` | `orgs` | Per-org |
| Currency | `settings.defaultCurrency` | `orgs` | Per-org |
| Code prefixes | `settings.codePrefixes` | `orgs` | Per-org |
| Module visibility | `settings.modules` | `orgs` | Per-org |
| Badge counts | `settings.badgeCountsVisible` | `orgs` | Per-org |
| Reminder defaults | `settings.reminderDefaults` | `orgs` | Per-org |
| AI context | `aiContext` | `orgs` | Per-org |
| Roles | — | `orgRoles` table | Per-org |
| Pipelines | — | `pipelines` table | Per-org |
| Fields | — | `fieldDefinitions` table | Per-org |
| Tags | — | `tags` table | Per-org |
| Notification prefs | `notificationPreferences` | `users` | Per-user |
| Appearance | Cookies | Browser | Per-user per-browser |
| Plan/billing | `plan` | `orgs` | Per-org |

---

## Group Specifications

### Group 1: ⚙️ Workspace (`permission: "org.settings"`)

**Sections**: General · Entity Labels · Record Codes · Modules & Navigation

**General**: org name (editable), logo (Convex storage), timezone, currency, industry (read-only + "Re-run AI setup" link). Slug is NOT shown or editable.

**Entity Labels**: All 4 entities on one card. Each row: Singular + Plural inline, Slug on second line. Save button per section. Changes propagate everywhere via Convex reactivity.

**Record Codes**: Prefix per entity type (1-3 chars). Live preview: "Next person: **[PREFIX]-043**". On save → Trigger.dev background job renames existing records. Numbers never change.

**Modules & Navigation**: Toggle visibility per module slot. Drag-to-reorder. Badge counts toggle. Changes reflect in sidebar immediately.

---

### Group 2: 👥 Team (`permission: "org.inviteMembers"` / Roles: `ownerOnly`)

**Members section**: DataTable — name, email, role badge, status, joined, last active, actions (invite, change role, remove). Invite = email + role select → creates invitation row.

**Roles section (owner only)**: Card list + permission checkbox grid (9 categories × ~40 keys). Permission category labels use dynamic entity labels. Cannot delete system roles (Owner, Admin, Member). Role color picker. Quick templates: "Full Access", "Read Only", "Standard".

---

### Group 3: 📊 CRM (`permission: "pipelines.manage"`)

**Lazy load**: Only fetch pipelines/fields/tags when CRM group is active.

**Pipelines**: Accordion list. Stage editor with drag-reorder, color pickers, stale/warning thresholds, final type. Stage deletion blocked if deals exist in that stage.

**Custom Fields**: Entity type tabs (dynamic labels). Field list with drag-reorder. 14 field types. Group name, required, sensitive, showInStages. Field deletion shows cascading warning.

**Tags**: Grid with name + color. Inline create/edit/delete. Usage count shown.

**Reminders & Alerts**: Toggle + number inputs. Industry-specific settings (rent alert) shown/hidden based on `orgs.industry`. Stored in `orgs.settings.reminderDefaults`.

---

### Group 4: 🤖 AI (`permission: "org.settings"`)

**Business Context**: Textarea (10K char limit with counter). "AI improve" button. Saves to `orgs.aiContext`.

**AI Usage**: Progress bar (read-only). "347 / 500 messages this month". Reset date display.

**Entity Context Viewer (admin only)**: Search by code/name → JSON display of `entity.aiContext`. Edit button to override.

**Workspace Setup**: "Re-run AI setup" button → AI conversation. Shows current template name.

---

### Group 5: 🎨 Appearance (no permission — ALL users)

Every user (owner, admin, member, viewer) gets full Appearance settings. Appearance is stored in per-user cookies — changing your theme/font/layout has zero impact on other users or org data. There is no reason to gate this.

**Theme**: Mode radio (Light/Dark/System) → cookie. Preset color palette cards → cookie.

**Typography**: Font family select (18 options) → cookie.

**Layout**: Sidebar variant, collapsible mode, content layout, navbar style → cookies.

No keyboard shortcuts section here. Shortcuts are in their own reference group.

---

### Group 6: 🔔 Notifications (no permission — all roles)

Group-wise toggles with "Toggle All" per group. Groups: CRM · Reminders · AI · Team · System. All entity labels use dynamic names. Saves to `users.notificationPreferences`.

---

### Group 7: 💳 Billing (`ownerOnly`)

Current plan display + upgrade/downgrade. Usage meters (AI messages, members, pipelines, fields). Payment history table (LemonSqueezy API).

---

### Group 8: 🔒 Data & Security

- Export (`permission: "org.settings"`): Entity type select (dynamic labels) + format radio + download.
- Danger Zone (`ownerOnly`): Org delete (type name to confirm, 24h email verification, soft-delete). Transfer ownership.

> **Activity Log is NOT here.** It is a full page at `/{locale}/{orgSlug}/activity` with infinite scroll, filters (type, actor, date range), and export. Permission: `activityLogs.viewOrg` (admin+). It is NOT a setting — it is an operational view.

---

## Settings Nav Config

```typescript
// core/settings/config/settings-nav.ts
export const SETTINGS_GROUPS = [
  { id: "workspace",     label: "Workspace",       icon: Settings,   permission: "org.settings" },
  { id: "team",          label: "Team",            icon: Users,      permission: "org.inviteMembers" },
  { id: "crm",           label: "CRM",             icon: Target,     permission: "pipelines.manage" },
  { id: "ai",            label: "AI",              icon: Bot,        permission: "org.settings" },
  { id: "appearance",    label: "Appearance",      icon: Palette },  // no permission — all users
  { id: "notifications", label: "Notifications",   icon: BellRing }, // no permission — all users
  { id: "shortcuts",     label: "Shortcuts",       icon: Keyboard }, // no permission — all users, read-only
  { id: "billing",       label: "Billing",         icon: CreditCard, ownerOnly: true },
  { id: "data",          label: "Data & Security", icon: Database,   permission: "org.settings" },
] as const;
```

> **Shortcuts group**: Read-only reference page. Lists all keyboard shortcuts in the app. No editing. Same for all workspaces. Visible to all roles.

---

### Group 9: ⌨️ Shortcuts (no permission — ALL users, read-only)

A reference page listing all keyboard shortcuts in the app. No editing, no saving, no mutations. Same content for all workspaces and all roles.

```tsx
// core/settings/components/groups/ShortcutsGroup.tsx
// Static data — no queries needed
const SHORTCUT_SECTIONS = [
  { label: "Navigation", shortcuts: [
    { keys: ["G", "H"], description: "Go to Home" },
    { keys: ["G", "L"], description: "Go to Leads" },
    // ...
  ]},
  { label: "Actions", shortcuts: [
    { keys: ["C"], description: "Create new record" },
    { keys: ["⌘", "K"], description: "Open command palette" },
    // ...
  ]},
];
```

---

## Org Slug — Production-Grade Reserved Keywords Pattern

### The Problem

If a user creates an org with slug `api`, `admin`, or `settings`, your routes break:
- `/{locale}/api/leads` → Next.js API route, not a CRM page
- `/{locale}/admin/settings` → ambiguous
- `/{locale}/settings/settings` → nonsense

### The Industry-Standard Solution

Every production SaaS (GitHub, Linear, Vercel, Notion) maintains a **static reserved list** validated at slug creation time. The list is code-level (not DB), checked synchronously, and never changes at runtime.

### Implementation

```typescript
// convex/_shared/reservedSlugs.ts
// Production-grade reserved slug list for Orbitly
// Based on: https://github.com/miketromba/reserved-slugs (1000+ slugs)
// Filtered to what's relevant for our route structure

export const RESERVED_SLUGS = new Set([
  // ── Next.js / system routes ──────────────────────────────────────────────
  "api", "_next", "_vercel", "static", "public", "favicon.ico",

  // ── App top-level routes ─────────────────────────────────────────────────
  "login", "signup", "sign-in", "sign-up", "register", "logout", "sign-out",
  "auth", "oauth", "sso", "saml", "callback",
  "onboarding", "invite", "join", "accept",
  "settings", "admin", "dashboard", "home",
  "activity", "notifications", "search",
  "billing", "pricing", "plans", "upgrade",
  "help", "support", "docs", "documentation",
  "status", "health", "healthcheck", "ping",
  "about", "contact", "privacy", "terms", "legal",
  "blog", "changelog", "roadmap",

  // ── Platform admin ───────────────────────────────────────────────────────
  "platform", "superadmin", "super-admin", "staff", "internal",

  // ── Common confusables ───────────────────────────────────────────────────
  "null", "undefined", "true", "false", "test", "demo", "example",
  "localhost", "www", "mail", "email", "smtp",
  "orbitly", // your own brand name
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// Slug format rules (same as GitHub/Linear):
// - 3–48 characters
// - lowercase letters, numbers, hyphens only
// - cannot start or end with a hyphen
// - no consecutive hyphens
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 48;

export function validateSlug(slug: string): { valid: boolean; reason?: string } {
  if (slug.length < SLUG_MIN) return { valid: false, reason: `Minimum ${SLUG_MIN} characters` };
  if (slug.length > SLUG_MAX) return { valid: false, reason: `Maximum ${SLUG_MAX} characters` };
  if (!SLUG_REGEX.test(slug)) return { valid: false, reason: "Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen." };
  if (isReservedSlug(slug)) return { valid: false, reason: "This name is reserved. Please choose another." };
  return { valid: true };
}
```

**Where to call it:**
- `convex/orgs/mutations.ts` → `create` mutation: validate before insert
- `core/onboarding/` → slug input field: validate client-side with same function (import from shared)
- Error message: "This name is reserved. Please choose another." — never expose the full list to users

**Why a Set, not an array:** O(1) lookup. The list can grow to 1000+ entries with zero performance impact.

---

## RBAC Enforcement Pattern (Corrected)

### Frontend: PermissionGate Component ✅

```tsx
// components/rbac/PermissionGate.tsx — already built, correct
<PermissionGate permission="pipelines.manage" fallback={null}>
  <PipelineSettings />
</PermissionGate>
```

Uses `useOrgPermission(orgId, permission)` → checks `role.permissions[]` from DB. Fully DB-backed. Custom roles work.

### Backend: `orgMutation` + `requireRole()` ✅

```typescript
// ✅ CORRECT PATTERN — used everywhere
export const updateEntityLabels = orgMutation({
  args: { ... },
  handler: async (ctx, args) => {
    const { member } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.permissions, "org.settings"); // throws FORBIDDEN if missing
    // ... do the work
  },
});
```

### ⚠️ What `adminMutation` Actually Does

`adminMutation` in `convex/_functions/admin.ts` is **NOT a security gate**. It only injects `ctx.user`. The actual admin enforcement is `requireAdminMember()` called inside the handler.

```typescript
// adminMutation = just injects user. NOT a security gate.
export const adminMutation = customMutation(mutation, customCtx(resolveUser));

// The REAL enforcement is inside the handler:
export const someAdminAction = adminMutation({
  handler: async (ctx, args) => {
    const { member } = await requireAdminMember(ctx, args.orgId); // THIS enforces admin+
    // ...
  },
});
```

**Rule**: Never name a builder `adminMutation` and assume it enforces admin. Always call `requireOrgMember()` + `requireRole()` or `requireAdminMember()` explicitly inside the handler. The builder name is documentation, not security.

---

```
1. SettingsView + SettingsNav + SettingsContent (layout shell)
2. WorkspaceGroup — General (name, logo, timezone, currency)
3. WorkspaceGroup — Entity Labels
4. WorkspaceGroup — Record Codes + Modules
5. AppearanceGroup (reuse existing preference components)
6. CRMGroup — Pipelines (stage editor with drag-reorder)
7. CRMGroup — Fields + Tags + Reminders
8. TeamGroup — Members (DataTable + invite modal)
9. TeamGroup — Roles (permission picker)
10. NotificationsGroup (group-wise toggles)
11. AIGroup (business context + usage)
12. BillingGroup
13. DataGroup (activity log + export + danger zone)
14. Search (Fuse.js inline filter — VS Code style)
```
