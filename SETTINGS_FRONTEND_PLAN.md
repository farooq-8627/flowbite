# Settings Frontend Plan — Template → Production Mapping

> **Purpose**: Comprehensive plan for building the settings UI. Maps shadboard template patterns to our architecture, identifies what to take, what to improve, and how to reduce code duplication.
> **Backend**: ✅ Complete (getFullSettings, getMyPermissions, update, updateNotificationPreferences)
> **Template**: `/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/`
> **Date**: 2026-05-10

---

## 1. Layout Architecture — Template vs Ours

### Shadboard Template Pattern
```
container grid md:grid-cols-[180px_1fr] gap-6 p-4
├── Left: h1 "Settings" + NavList (links with active state)
└── Right: children (page content)
```
- Uses Next.js `layout.tsx` with sub-routes (`/settings/security`, `/settings/notifications`)
- NavList = `<Link>` elements with pathname matching
- Each sub-route = separate page file

### Our Pattern (IMPROVED)
```
flex h-full
├── Left aside (w-60, border-e): Search + Nav buttons (scroll-to-section, not route change)
└── Right main (flex-1, overflow-y-auto): Active group component
```

**Why ours is better:**
| Shadboard | Ours | Why |
|---|---|---|
| Sub-routes (`/settings/security`) | Single route + `?group=` param | Faster navigation, no page reload, preserves scroll |
| `<Link>` nav items | `<button>` with `onClick` | No route transition = instant group switch |
| No search | Fuse.js search bar | VS Code-style find-in-settings |
| No RBAC filtering | `PermissionGate` + nav filtering | Groups hidden if user lacks permission |
| No scroll-to-section | Sub-group buttons scroll to section | Deep linking within a group |

### Layout Decision
```tsx
// Our layout — NOT a Next.js layout.tsx (single page, no sub-routes)
<div className="flex h-full">
  <aside className="w-60 shrink-0 border-e border-border overflow-y-auto">
    <SettingsNav />  {/* Search + group buttons + sub-group scroll links */}
  </aside>
  <main className="flex-1 overflow-y-auto p-6 space-y-6">
    <SettingsContent />  {/* Renders active group */}
  </main>
</div>
```

---

## 2. What to Take from Shadboard (Reuse)

### ✅ Take: Card + CardHeader + CardContent pattern
```tsx
// Shadboard pattern — GOOD, keep it
<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <CardDescription>Helpful description.</CardDescription>
  </CardHeader>
  <CardContent>
    <Form>...</Form>
  </CardContent>
</Card>
```
We wrap this in `SettingsSection` for consistency.

### ✅ Take: react-hook-form + zod + per-section save
```tsx
// Shadboard pattern — GOOD
const form = useForm({ resolver: zodResolver(schema), values: serverData });
const { isSubmitting, isDirty } = form.formState;
const isDisabled = isSubmitting || !isDirty;

<ButtonLoading isLoading={isSubmitting} disabled={isDisabled}>Save</ButtonLoading>
```
We use this exact pattern. Save button right-aligned (not left like shadboard).

### ✅ Take: FormField render pattern
```tsx
<FormField control={form.control} name="fieldName" render={({ field }) => (
  <FormItem>
    <FormLabel>Label</FormLabel>
    <FormControl><Input {...field} /></FormControl>
    <FormMessage />
  </FormItem>
)} />
```

### ✅ Take: DangerousZone card with red styling
Separate card for destructive actions. We add `border-destructive` class.

---

## 3. What to Improve Over Shadboard

### ❌ Fix: Save button alignment
Shadboard puts save on the LEFT (`className="w-fit"`). We put it on the RIGHT:
```tsx
<div className="flex justify-end gap-2 pt-4">
  <Button variant="outline" onClick={handleReset} disabled={isDisabled}>Reset</Button>
  <ButtonLoading isLoading={isSubmitting} disabled={isDisabled}>Save</ButtonLoading>
</div>
```

### ❌ Fix: No hardcoded data arrays
Shadboard hardcodes states, countries, timezones inline. We use constants from `lib/constants/`:
```tsx
// ❌ Shadboard: inline array of 50 states
// ✅ Ours: import { TIMEZONES } from "@/lib/constants/timezones"
```

### ❌ Fix: No RTL support
Shadboard uses `ml-*`, `mr-*`, `gap-x-*`. We use `ms-*`, `me-*`, `gap-x-*` (gap-x is fine, it's logical).

### ❌ Fix: Hardcoded border-radius
Shadboard uses default Tailwind `rounded-*`. We use `rounded-[var(--radius)]`.

### ❌ Fix: No permission gating
Shadboard shows everything to everyone. We wrap sections in `PermissionGate`.

### ❌ Fix: No dynamic labels
Shadboard hardcodes "Profile", "Security". We use `useEntityLabels()` for CRM-related labels.

### ❌ Fix: No Convex reactivity
Shadboard uses static `userData`. We use `useQuery(api.orgs.getFullSettings)` — live updates.

---

## 4. Code Duplication Strategy

### Pattern: SettingsSection (eliminates Card boilerplate)
Every group has 2-5 sections. Each section is a Card. Instead of repeating Card/CardHeader/CardContent:

```tsx
// core/settings/components/shared/SettingsSection.tsx
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

### Pattern: SettingsRow (eliminates label+control boilerplate)
Most settings are "label on left, control on right":

```tsx
// core/settings/components/shared/SettingsRow.tsx
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

### Pattern: SettingsSaveButton (eliminates save button boilerplate)
```tsx
// core/settings/components/shared/SettingsSaveButton.tsx
export function SettingsSaveButton({ isSubmitting, isDirty, onReset }: Props) {
  const isDisabled = isSubmitting || !isDirty;
  return (
    <div className="flex justify-end gap-2 pt-4">
      {onReset && (
        <Button variant="outline" disabled={isDisabled} onClick={onReset}>Reset</Button>
      )}
      <ButtonLoading isLoading={isSubmitting} disabled={isDisabled}>Save</ButtonLoading>
    </div>
  );
}
```

### Pattern: useSettingsForm (eliminates form setup boilerplate)
```tsx
// core/settings/hooks/useSettingsForm.ts
export function useSettingsForm<T extends z.ZodType>({
  schema, values, onSubmit,
}: { schema: T; values: z.infer<T>; onSubmit: (data: z.infer<T>) => Promise<void> }) {
  const form = useForm({ resolver: zodResolver(schema), values });
  const { isSubmitting, isDirty } = form.formState;

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
    form.reset(data); // Reset dirty state after successful save
    toast.success("Settings saved");
  });

  return { form, isSubmitting, isDirty, handleSubmit, isDisabled: isSubmitting || !isDirty };
}
```

**Result**: Each group component is ~80-120 lines instead of 200+ because shared patterns handle the boilerplate.

---

## 5. File Structure (Final)

```
core/settings/
├── views/
│   └── SettingsView.tsx               # Main entry — fetches data, renders nav + content
├── components/
│   ├── SettingsNav.tsx                # Left panel: search + group buttons + sub-group links
│   ├── SettingsSearch.tsx             # Fuse.js search input + results
│   ├── SettingsContent.tsx            # Renders active group component
│   ├── shared/
│   │   ├── SettingsSection.tsx        # Card wrapper (title + desc + children)
│   │   ├── SettingsRow.tsx            # Label + control inline
│   │   ├── SettingsSaveButton.tsx     # Right-aligned save + reset
│   │   └── DangerZone.tsx            # Red-bordered destructive section
│   └── groups/
│       ├── WorkspaceGroup.tsx         # General + Entity Labels + Record Codes + Modules
│       ├── TeamGroup.tsx              # Members + Roles
│       ├── CRMGroup.tsx               # Pipelines + Fields + Tags + Reminders
│       ├── AIGroup.tsx                # Business Context + Usage
│       ├── AppearanceGroup.tsx        # Theme + Font + Layout (cookies)
│       ├── NotificationsGroup.tsx     # Group-wise toggles
│       ├── ShortcutsGroup.tsx         # Read-only reference
│       ├── BillingGroup.tsx           # Plan + Usage + Payment
│       └── DataGroup.tsx              # Export + Danger Zone
├── config/
│   ├── settings-nav.ts               # SETTINGS_GROUPS array
│   └── settings-search-index.ts      # Flat searchable entries for Fuse.js
└── hooks/
    ├── useSettingsSearch.ts           # Fuse.js hook
    ├── useActiveGroup.ts             # State + ?group= query param sync
    └── useSettingsForm.ts            # Shared form setup hook

app/[locale]/(private)/[orgSlug]/settings/
└── page.tsx                           # Thin wrapper: <SettingsView />
```

---

## 6. Nav Architecture — Sub-Group Scroll Links

The left nav has TWO levels:
1. **Group buttons** — switch the active group (workspace, team, crm, etc.)
2. **Sub-group links** — scroll to a section within the active group

```tsx
// SettingsNav.tsx
<aside className="w-60 shrink-0 border-e border-border p-4 space-y-4 overflow-y-auto">
  <SettingsSearch onNavigate={setActiveGroup} />

  <nav className="space-y-1">
    {visibleGroups.map((group) => (
      <div key={group.id}>
        {/* Group button */}
        <button
          onClick={() => setActiveGroup(group.id)}
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

        {/* Sub-group scroll links (only shown when group is active) */}
        {activeGroup === group.id && group.sections && (
          <div className="ms-7 mt-1 space-y-0.5">
            {group.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className="block w-full text-start text-xs text-muted-foreground hover:text-foreground py-1"
              >
                {section.label}
              </button>
            ))}
          </div>
        )}
      </div>
    ))}
  </nav>
</aside>
```

---

## 7. Settings Search — Fuse.js Client-Side

No backend query needed. The search index is a static array in code.

```tsx
// core/settings/config/settings-search-index.ts
export type SettingEntry = {
  id: string;
  groupId: string;
  sectionId: string;
  label: string;
  description: string;
  keywords: string[];
  permission?: string;
};

export const SETTINGS_SEARCH_INDEX: SettingEntry[] = [
  { id: "ws-name", groupId: "workspace", sectionId: "general", label: "Organization Name", description: "Change your workspace name", keywords: ["org", "workspace", "rename"] },
  { id: "ws-currency", groupId: "workspace", sectionId: "general", label: "Default Currency", description: "Set the default currency for deals", keywords: ["money", "aed", "usd"] },
  { id: "ws-timezone", groupId: "workspace", sectionId: "general", label: "Timezone", description: "Set your workspace timezone", keywords: ["time", "zone", "gmt"] },
  // ... 50+ entries covering all settings
];
```

```tsx
// core/settings/hooks/useSettingsSearch.ts
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { SETTINGS_SEARCH_INDEX, type SettingEntry } from "../config/settings-search-index";

export function useSettingsSearch(permissions: string[]) {
  const [query, setQuery] = useState("");

  const filteredIndex = useMemo(() =>
    SETTINGS_SEARCH_INDEX.filter((entry) =>
      !entry.permission || permissions.includes(entry.permission)
    ),
    [permissions]
  );

  const fuse = useMemo(() => new Fuse(filteredIndex, {
    keys: ["label", "keywords", "description"],
    threshold: 0.3,
  }), [filteredIndex]);

  const results = useMemo(() =>
    query.length >= 2 ? fuse.search(query).slice(0, 8).map(r => r.item) : [],
    [query, fuse]
  );

  return { query, setQuery, results };
}
```

---

## 8. Build Order (Implementation Sequence)

### Phase 1: Shell (must work before any group)
```
1. core/settings/config/settings-nav.ts          — SETTINGS_GROUPS + sections
2. core/settings/hooks/useActiveGroup.ts          — state + URL sync
3. core/settings/components/shared/SettingsSection.tsx
4. core/settings/components/shared/SettingsRow.tsx
5. core/settings/components/shared/SettingsSaveButton.tsx
6. core/settings/hooks/useSettingsForm.ts         — shared form hook
7. core/settings/components/SettingsNav.tsx        — left panel
8. core/settings/components/SettingsContent.tsx    — group renderer
9. core/settings/views/SettingsView.tsx            — main view
10. app/[locale]/(private)/[orgSlug]/settings/page.tsx — thin wrapper
```

### Phase 2: First group (proves the pattern)
```
11. core/settings/components/groups/WorkspaceGroup.tsx
    - General section (name, timezone, currency)
    - Entity Labels section (4 entities, singular+plural+slug)
    - Record Codes section (prefixes with live preview)
    - Modules section (toggle visibility, drag-reorder)
```

### Phase 3: Remaining groups
```
12. AppearanceGroup.tsx    — cookies, no mutations (simplest)
13. NotificationsGroup.tsx — per-user, simple toggles
14. ShortcutsGroup.tsx     — static data, no mutations
15. AIGroup.tsx            — textarea + usage meter
16. TeamGroup.tsx          — DataTable + role editor (complex)
17. CRMGroup.tsx           — pipelines + fields + tags (most complex)
18. BillingGroup.tsx       — read-only + external links
19. DataGroup.tsx          — export + danger zone
```

### Phase 4: Search + Polish
```
20. core/settings/config/settings-search-index.ts
21. core/settings/hooks/useSettingsSearch.ts
22. core/settings/components/SettingsSearch.tsx
23. core/settings/components/shared/DangerZone.tsx
```

---

## 9. RBAC Matrix (Quick Reference)

| Group | Permission | Who Sees It |
|---|---|---|
| Workspace | `org.settings` | Owner, Admin |
| Team > Members | `org.inviteMembers` | Owner, Admin |
| Team > Roles | `ownerOnly` | Owner only |
| CRM | `pipelines.manage` | Owner, Admin |
| AI | `org.settings` | Owner, Admin |
| Appearance | — | Everyone |
| Notifications | — | Everyone |
| Shortcuts | — | Everyone |
| Billing | `ownerOnly` | Owner only |
| Data > Export | `org.settings` | Owner, Admin |
| Data > Danger Zone | `ownerOnly` | Owner only |

---

## 10. Key Rules Checklist (Apply to Every File)

- [ ] RTL-safe: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*` only
- [ ] Dynamic radius: `rounded-[var(--radius)]` only (except `rounded-full` for avatars)
- [ ] No hardcoded entity names: use `useEntityLabels()` hook
- [ ] No hardcoded app name: use `APP_CONFIG.name`
- [ ] Per-section save (not global save)
- [ ] Save button RIGHT-aligned
- [ ] `PermissionGate` wraps every section
- [ ] Thin `app/` wrapper — all logic in `core/settings/`
- [ ] Lazy load group data (skip queries when group not active)
- [ ] Toast on save success/failure
- [ ] Loading skeleton while data loads

---

## 11. Dependencies Needed

```bash
pnpm add fuse.js@7.0.0
```

No other new dependencies. We already have:
- `react-hook-form` + `@hookform/resolvers` + `zod`
- `lucide-react` (icons)
- shadcn/ui components (Card, Form, Input, Select, Switch, Button, etc.)
- `sonner` (toast)
- `convex/react` (useQuery, useMutation)

---

## 12. Data Flow Summary

```
┌─ Settings Page ─────────────────────────────────────────────┐
│                                                              │
│  2 queries load everything:                                  │
│    useQuery(api.orgs.getFullSettings, { orgId })             │
│    useQuery(api.orgRoles.getMyPermissions, { orgId })        │
│                                                              │
│  Per-group lazy queries (only when active):                  │
│    useQuery(api.pipelines.list, { orgId })     // CRM group  │
│    useQuery(api.fieldDefinitions.list, { orgId }) // CRM     │
│    useQuery(api.tags.list, { orgId })          // CRM group  │
│    useQuery(api.orgMembers.list, { orgId })    // Team group │
│    useQuery(api.orgRoles.list, { orgId })      // Team group │
│                                                              │
│  Mutations (per-section save):                               │
│    useMutation(api.orgs.update)                // most       │
│    useMutation(api.users.updateNotificationPreferences)      │
│    useMutation(api.pipelines.*)                // CRM        │
│    useMutation(api.fieldDefinitions.*)         // CRM        │
│    useMutation(api.tags.*)                     // CRM        │
│    useMutation(api.orgRoles.*)                 // Team       │
│                                                              │
│  Cookies (no Convex):                                        │
│    Appearance group → theme, font, layout cookies            │
└──────────────────────────────────────────────────────────────┘
```

---

## 13. Component Size Targets

| Component | Target Lines | Why |
|---|---|---|
| SettingsView.tsx | ~40 | Just fetches + renders nav + content |
| SettingsNav.tsx | ~60 | Filter groups + render buttons |
| SettingsContent.tsx | ~30 | Switch statement → render group |
| SettingsSection.tsx | ~15 | Card wrapper |
| SettingsRow.tsx | ~15 | Label + control |
| SettingsSaveButton.tsx | ~20 | Save + reset buttons |
| WorkspaceGroup.tsx | ~120 | 4 sections, each with form |
| AppearanceGroup.tsx | ~80 | Cookie-based, no mutations |
| NotificationsGroup.tsx | ~100 | Toggle groups |
| ShortcutsGroup.tsx | ~60 | Static data |
| AIGroup.tsx | ~80 | Textarea + meter |
| TeamGroup.tsx | ~150 | DataTable + role editor |
| CRMGroup.tsx | ~200 | Most complex (pipelines + fields + tags) |
| BillingGroup.tsx | ~60 | Read-only |
| DataGroup.tsx | ~80 | Export + danger zone |

**Total**: ~1000 lines for the entire settings UI. Shadboard's equivalent is ~2500 lines because they repeat Card/Form/Button patterns everywhere.
