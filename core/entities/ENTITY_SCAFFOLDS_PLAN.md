# Entity Scaffolds — Build Plan (v3, 2026-05-12)

> **Companion to** `core/entities/ENTITY_SCAFFOLDS_ARCHITECTURE.md`. That file locks the
> folder layout, route structure, and scaffold decisions. **This file** extends it
> with every UI/UX decision from three clarification rounds with the user.
>
> **Status**: 2 remaining confirmations at §15. Say "proceed" or answer them and I
> build Slice 0.
>
> **What changed in v3 vs v2**:
> - Card fields / list columns / board groupBy are now **DB-configurable from day 1**
>   (not deferred to a later session). Hardcoded values only exist as **fallback
>   defaults** in TypeScript constants.
> - New shared system component **`<PersonDisplay>`** replaces ad-hoc
>   "badge + name" rendering across the app.
> - Per-entity primary Add button is a **split button** (click = primary action,
>   dropdown = secondary actions). On Contacts page the primary is "Convert Lead"
>   since we don't allow direct contact creation.
> - All selectors with many items get a **search input** (already free via Combobox;
>   TagPicker and list filters also get it).
> - Explicit **"future dynamic" inventory** at §16 — every current hardcoded value
>   has a clear migration path.

---

## Table of contents

1. [Hard-locked decisions (all three rounds consolidated)](#1-hard-locked-decisions-all-three-rounds-consolidated)
2. [Rule — search shadcn / shadcnstudio before building](#2-rule--search-shadcn--shadcnstudio-before-building)
3. [Existing primitives we'll reuse](#3-existing-primitives-well-reuse)
4. [Entity Page Layout (dedicated toolbar)](#4-entity-page-layout-dedicated-toolbar)
5. [`FormDrawer` — reusable right-side form primitive](#5-formdrawer--reusable-right-side-form-primitive)
6. [`PersonDisplay` & `PersonSelect` — the person-rendering system](#6-persondisplay--personselect--the-person-rendering-system)
7. [Hover-quick-view cards](#7-hover-quick-view-cards)
8. [Lead-first workflow + split Add button](#8-lead-first-workflow--split-add-button)
9. [**Dynamic configuration (v1)** — cards, columns, groupBy from DB](#9-dynamic-configuration-v1--cards-columns-groupby-from-db)
10. [Pagination — tweak defaults](#10-pagination--tweak-defaults)
11. [Default view — URL → user pref → workspace → fallback](#11-default-view--url--user-pref--workspace--fallback)
12. [File-level build inventory](#12-file-level-build-inventory)
13. [Build order (6 slices)](#13-build-order-6-slices)
14. [Acceptance criteria (Definition of Done)](#14-acceptance-criteria-definition-of-done)
15. [Remaining open questions (2)](#15-remaining-open-questions-2)
16. [Future dynamic items — explicit migration paths](#16-future-dynamic-items--explicit-migration-paths)

---

## 1. Hard-locked decisions (all three rounds consolidated)

| # | Decision | Source |
|---|---|---|
| D1 | All 4 entities (lead / contact / deal / company) get a Board view in addition to List | Round 2 |
| D2 | The list/board toggle and the Add button live in a **dedicated entity-page toolbar** (`<EntityPageLayout>`) — not the app TopNav | Round 2 |
| D3 | View-toggle = two independent icon buttons (List / Board), not a segmented toggle | Round 2 |
| D4 | **Per-entity primary Add button with split dropdown.** Click = primary action (create the entity whose list you're viewing). ▾ = secondary actions (Convert, etc.). Contacts page has NO "Add Contact" primary — its primary is "Convert Lead". | Round 3 |
| D5 | Row click → detail page. Row `⋯` menu = Edit / Convert / Delete (role-gated). | Round 2 |
| D6 | Workspace default view (admin) overridable per user (Appearance). URL `?view=` always wins. | Round 2 |
| D7 | Every person-select returns the full `PersonRef` object `{ id, type, personCode, displayName, avatarUrl, … }` — never just an id | Round 2 |
| D8 | `<PersonDisplay>` is THE system component for rendering a person anywhere (avatar + configurable sections like personCode, name, email, status). Hover → overview quick-view. Click → /profile/[personCode]. **Replaces** scattered "badge + name" renderings. | Round 3 |
| D9 | `<EntityHoverCard>` shows overview for any entity on hover. Reuses shared `<EntityOverview>` component (same one used by the profile Overview tab). | Round 2 |
| D10 | Dedup banner: "Edit fields" + link to existing personCode. No Merge / Continue-anyway. | Round 1 |
| D11 | **Card fields, list columns, and board groupBy are DB-configurable in v1.** Hardcoded constants serve as fallback defaults only. Admin changes them in Settings → Workspace → Display. | Round 3 |
| D12 | Schema adds (all optional; no migration): `orgs.settings.modules[].{defaultView, cardFields, listColumns, boardGroupBy}` + `users.preferences.entityDefaultView` | Round 2 + Round 3 |
| D13 | Every filter/group option from the DB, never hardcoded (lead statuses come from an optional `orgSettings.leadStatuses[]` until then fall back to English defaults) | Round 2 |
| D14 | Bulk actions: `assign`, `tag`, `softDelete`, **`convert`** (for leads only — bulk-convert rows of selected leads) | Round 2 + 3 |
| D15 | Rule: search `components/ui/`, then shadcn/ui docs, then shadcnstudio **before building any UI component** | Round 2 |
| D16 | **Search everywhere a picker has many items** — PersonSelect, TagPicker, faceted filters. Already free via Combobox / Command primitives. | Round 3 |
| D17 | CSV import + AI chat are **out of scope** for this build. Backend mutations stay callable by those surfaces when they arrive. | Round 2 |
| D18 | Company detail page has "Contacts" tab listing all contacts with that companyId + deals for that companyCode. Hover on a company shows these counts in the overview card. | Round 3 |
| D19 | Convert Lead drawer: PersonSelect (scope=`"lead"`) + "Also create a deal?" checkbox → pipeline + stage + deal title + value inputs (reveal on check) | Round 3 |
| D20 | Bulk-convert: row-multiselect + "Convert Selected" bulk action — reuses same Convert drawer pre-filled with multiple leads | Round 3 |
| D21 | Every hardcoded fallback currently shipped is **documented in §16** with a clear "how to make it dynamic later" note. No silent hardcodes. | Round 3 |

---

## 2. Rule — search shadcn / shadcnstudio before building

### The rule — to be added to `.github/agents/base/rules.md`

> **Before building ANY UI component:**
>
> 1. **Local inventory** — read `components/ui/` and `components/shadcn-studio/`.
>    Repo already has 50+ shadcn primitives + 24 shadcn-studio variants installed.
> 2. **shadcn/ui docs** — https://ui.shadcn.com/docs/components
> 3. **shadcnstudio** — https://shadcnstudio.com/docs/components/{name}. Install with:
>
>    ```bash
>    pnpm dlx shadcn@latest add "https://shadcnstudio.com/r/{name}-{NN}.json"
>    ```
>
> **Only build custom** when no variant fits or the need is domain-specific
> (`PersonDisplay`, `PersonSelect`, `EntityCard`, `EntityPageLayout`, etc.).
>
> **Attestation** — every commit that adds UI code ends with:
>
> ```
> shadcn-scan: reused <list> | installed <list> | built custom <list — why>
> ```

### Applied to this build

No new shadcnstudio installs needed. Everything we need is already local (see §3).

---

## 3. Existing primitives we'll reuse

```
components/ui/
  sheet.tsx               → FormDrawer foundation
  combobox.tsx            → PersonSelect (rich, searchable, chips)
  item.tsx                → PersonDisplay rows (ItemMedia / Content / Title / Description)
  hover-card.tsx          → EntityHoverCard
  dropdown-menu.tsx       → Split-button ▾ + row ⋯ menu + Add menu
  button.tsx + button-group.tsx  → List/Board icon pair + split-button assembly
  table.tsx               → already wrapped by core/datatable/DataTable
  form.tsx + field.tsx + input-group.tsx + input.tsx + textarea.tsx + checkbox.tsx + select.tsx
                          → every form field inside FormDrawer bodies
  avatar.tsx              → everywhere we show people
  badge.tsx               → every status / stage / source badge
  alert-dialog.tsx        → delete / destructive confirms
  popover.tsx             → used internally by DropdownMenu + HoverCard
  tooltip.tsx             → icon-only button tooltips
  tabs.tsx                → profile/company/deal detail tabs (Slice 2+)
  scroll-area.tsx         → drawer bodies, hover-card content
  command.tsx             → Combobox internals
  skeleton.tsx            → loading states on cards + rows + hover-cards
  sonner.tsx              → toast via lib/toast.ts

core/kanban/               → KanbanBoard<T> already config-driven
core/datatable/             → DataTable + useDataTable already URL-synced + pagination
core/entities/shared/
  PersonCodeBadge.tsx      → keeps existing purpose — shorthand pill form of PersonDisplay

No new shadcnstudio installs needed for Slice 0–6.
```

---

## 4. Entity Page Layout (dedicated toolbar)

### 4.1 Component — `<EntityPageLayout>`

**File**: `core/entities/scaffolds/EntityPageLayout.tsx`

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [app shell TopNav — untouched — breadcrumb / search / notifs / AI]          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EntityPageLayout toolbar (full-width, visible on every screen size, wraps   │
│  to two rows below md:)                                                     │
│                                                                              │
│  ┌── Left cluster ───────────────┐   ┌── Right cluster ──────────────────┐ │
│  │ title + count subtitle         │   │ [⊞] [≡]  ← view-toggle icons     │ │
│  │ optional filter chips          │   │                                   │ │
│  │  (e.g. "My assignments"        │   │ [Add Lead ▼] ← split button      │ │
│  │   "Created this week")         │   │   click  → primary action         │ │
│  │                                 │   │   ▼      → dropdown (Convert, …) │ │
│  └─────────────────────────────────┘   └───────────────────────────────────┘ │
│                                                                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  children (list OR board based on view state)                                │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Props

```tsx
type EntityPageLayoutProps = {
  // Left cluster
  title: string;                       // labels[slot].plural
  subtitle?: string;                   // "123 leads · 12 converted"
  leftExtras?: React.ReactNode;        // filter chips (view-independent, e.g. "My assignments")

  // Right cluster
  views?: Array<"list" | "board">;     // default ["list", "board"]
  view: "list" | "board";
  onViewChange: (v: "list" | "board") => void;

  // The primary add button — see §4.3
  primaryAction?: PrimaryActionConfig;

  // Body
  children: React.ReactNode;           // <DataTable> or <KanbanBoard>
};
```

### 4.3 Primary action — split button

```tsx
type PrimaryActionConfig = {
  label: string;                       // "Add Lead" / "Convert Lead" / …
  icon?: LucideIcon;                   // default <Plus />
  onClick: () => void;                 // primary click
  permission?: string;                 // if user lacks, button is hidden
  secondary?: Array<{
    label: string;
    icon?: LucideIcon;
    onSelect: () => void;
    permission?: string;
  }>;                                  // renders as ▾ dropdown beside the button
};
```

Rendered composition (uses existing `ButtonGroup` + `DropdownMenu`):

```tsx
<ButtonGroup>
  <Button onClick={primaryAction.onClick} size="sm">
    <Plus /> {primaryAction.label}
  </Button>
  {primaryAction.secondary?.length ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="outline" aria-label="More add options">
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {primaryAction.secondary.map(s => (
          <DropdownMenuItem key={s.label} onSelect={s.onSelect}>
            {s.icon && <s.icon className="me-2 size-4" />} {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null}
</ButtonGroup>
```

### 4.4 Per-entity primary action config

| Page | Primary click | ▾ Secondary items |
|---|---|---|
| Leads | Add {lead.singular} | Convert {lead.singular} · Bulk-convert Selected (if rows selected) |
| Contacts | **Convert {lead.singular}** (contacts are born from conversion — so convert is the primary) | — |
| Deals | Add {deal.singular} | — |
| Companies | Add {company.singular} | — |

### 4.5 Filters + display options

**Both** placements per your answer to §4.6 in v2:

- **`leftExtras` filter chips** — view-independent (apply to both list and board). E.g. "My assignments", "Created this week", "Has follow-up". Read from `orgs.settings.modules[slot].defaultFilters` (future — for v1 we ship with a fixed set of 2–3 chips per entity).
- **DataTable toolbar filters** — column-level, list-view only. Driven from column `meta.variant`. Already works.

**Display options**:

- **List view** — DataTable's existing `DataTableViewOptions` dropdown (column visibility). Now reads `orgs.settings.modules[slot].listColumns` to pick default visible set.
- **Board view** — new `<BoardCardFieldsMenu>` in the left cluster. Lets user show/hide card fields in the current session. Persists preference locally (cookies) for the current session; explicit "Save as workspace default" button (admin only) persists to `modules[slot].cardFields`.

---

## 5. `FormDrawer` — reusable right-side form primitive

Unchanged from v2. Summary:

- **File**: `core/entities/shared/components/FormDrawer.tsx`
- Wraps `components/ui/sheet.tsx` (`side="right"`)
- Default footer `[Cancel] [Save]`, loading spinner on submit, close-on-success
- Sizes: `sm | md | lg | xl` (default `md`)
- Sticky header + footer, scroll-area body
- **`EntityFormDrawer`** thin wrapper adds RHF + zod + dedup banner + toast

Used everywhere:

- `AddLeadDrawer`, `AddDealDrawer`, `AddCompanyDrawer`
- `ConvertLeadDrawer` (the single-lead convert dialog)
- `BulkConvertLeadsDrawer` (multi-lead convert — same component, takes array)
- Settings: `AddRoleDrawer`, `AddTagDrawer`, etc. — incremental replacements

---

## 6. `PersonDisplay` & `PersonSelect` — the person-rendering system

### 6.1 Why two components

| Component | Purpose |
|---|---|
| `<PersonDisplay>` | **Renders** a person somewhere in the UI. Read-only. With hover-card + click-to-navigate. |
| `<PersonSelect>` | **Picks** a person from a list. Returns a full `PersonRef`. |

Both use the same underlying `PersonRef` type:

```tsx
type PersonRef = {
  id: string;                  // Id<"leads"> | Id<"contacts"> | Id<"users">
  type: "lead" | "contact" | "user";
  personCode?: string;         // "P-007" — set for leads/contacts; undefined for org users
  displayName: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  status?: string;             // lead status / contact converted / user role
};
```

### 6.2 `<PersonDisplay>` — system component

**File**: `core/entities/shared/components/PersonDisplay.tsx`

Per D8: one component, everywhere.

```tsx
type PersonDisplayProps = {
  person: PersonRef;

  // Which pieces to render, in order. Default: ["avatar", "name", "personCode"]
  show?: Array<
    | "avatar"          // 24x24 by default — size prop adjusts
    | "name"            // displayName
    | "personCode"      // P-007 badge
    | "email"
    | "phone"
    | "status"          // lead status / converted badge
    | "role"            // for org users
  >;

  size?: "xs" | "sm" | "md" | "lg";            // default "sm"
  layout?: "inline" | "stack";                 // default "inline"
  clickable?: boolean;                         // default true — wraps in <Link to /profile/P-xxx>
  hover?: boolean;                             // default true — wraps children in <EntityHoverCard person={…}>
  className?: string;
};
```

Example uses:

```tsx
{/* Compact inline — kanban card footer */}
<PersonDisplay person={assignee} show={["avatar", "name"]} size="xs" />

{/* With code badge — DataTable person column */}
<PersonDisplay person={lead} show={["avatar", "name", "personCode"]} />

{/* Full card — profile header */}
<PersonDisplay person={lead} show={["avatar", "name", "personCode", "email", "status"]} size="lg" layout="stack" />

{/* Read-only, no hover, no click — inside the hover-card itself to avoid recursion */}
<PersonDisplay person={lead} show={["avatar", "name", "personCode"]} clickable={false} hover={false} />
```

Behaviour:

- `clickable && person.personCode` → wraps in `<Link to=/profile/{personCode}>`
- `hover && person.type !== "user"` → wraps in `<EntityHoverCard person={{personCode}}>`
- `show` array renders in the exact order given
- `layout="stack"` renders sections as rows; `"inline"` as flex-row with gap

### 6.3 `<PersonSelect>` — picker

**File**: `core/entities/shared/components/PersonSelect.tsx`

```tsx
type PersonSelectProps = {
  scope: "user" | "lead" | "contact" | "person" /* lead ∪ contact */;
  value?: PersonRef | null;
  onChange: (person: PersonRef | null) => void;
  orgId: Id<"orgs">;
  placeholder?: string;                  // default "Select someone…"
  allowClear?: boolean;                  // default true
  filter?: (p: PersonRef) => boolean;
  multiple?: boolean;                    // default false — for bulk-convert (Q-v3.1)
};
```

Each option row renders via the existing `<Item>` primitive:

```tsx
<ComboboxItem value={person.id}>
  <Item size="xs">
    <ItemMedia variant="image"><Avatar src={person.avatarUrl} /></ItemMedia>
    <ItemContent>
      <ItemTitle>{person.displayName}</ItemTitle>
      <ItemDescription>
        {person.personCode && <span className="font-mono">{person.personCode}</span>}
        {person.email && <span className="ms-2">{person.email}</span>}
      </ItemDescription>
    </ItemContent>
  </Item>
</ComboboxItem>
```

Search is built-in (Combobox has a filter input). Per D16 every Combobox-backed selector gets search for free.

### 6.4 Where `<PersonDisplay>` replaces existing code

- `PersonCodeBadge` usages that render `<PersonCodeBadge> + name` together → single `<PersonDisplay show={["name","personCode"]}>`. `PersonCodeBadge` stays as a stand-alone for rare cases where we want ONLY the badge.
- Kanban card footer assignee avatar → `<PersonDisplay person={assignee} show={["avatar"]} size="xs" hover={false} />`
- DataTable assignee cell → `<PersonDisplay person={assignee} show={["avatar","name"]} size="xs" />`
- Profile header → `<PersonDisplay person={profilePerson} show={["avatar","name","personCode","email","status"]} size="lg" />`
- Activity log "by {user}" → `<PersonDisplay person={actor} show={["avatar","name"]} size="xs" />`

---

## 7. Hover-quick-view cards

**File**: `core/entities/shared/components/EntityHoverCard.tsx`

```tsx
type EntityHoverCardProps = {
  person?: { personCode: string };
  deal?: { id: Id<"deals"> } | { dealCode: string };
  company?: { id: Id<"companies"> } | { companyCode: string };
  children: React.ReactNode;           // the trigger
  openDelay?: number;                  // default 400 ms
  sideOffset?: number;                 // default 6
};
```

- Renders `<HoverCardContent>` around a new shared `<EntityOverview entity=…>` component.
- `<EntityOverview>` is built once in Slice 0 with the final shape — used by BOTH hover-card AND the profile Overview tab.
- For companies: the overview shows `<#contacts>`, `<#open deals>`, `<total pipeline value>` (permission-gated), and 3 most recent contacts as avatar stack. Per D18.

---

## 8. Lead-first workflow + split Add button

### 8.1 Backend already enforces the contract

- `generatePersonCode` is called ONLY in `leads.create`.
- `contacts.create` accepts an optional `personCode` (used by `leads.convertToContact`).
- Direct `contacts.create` without personCode WILL throw (or auto-generate a new personCode — confirm in convex code). UI simply doesn't expose the direct path.

### 8.2 UI funnel

```
[Leads list]  →  + Add Lead  → lead with status="new"
                                      │
                                      │  [row ⋯ / Convert button / ▾ Bulk convert]
                                      ▼
[Contacts list]  ←  Convert Lead drawer  (ConvertLeadDrawer)
                     │
                     │  "Also create a deal?" ☑
                     ▼
[Deals kanban]
```

### 8.3 Per-page primary action config

```tsx
// LeadsView
const primary: PrimaryActionConfig = {
  label: `Add ${labels.lead.singular}`,
  icon: Plus,
  permission: "leads.create",
  onClick: () => setAddLeadOpen(true),
  secondary: [
    {
      label: `Convert ${labels.lead.singular}`,
      icon: ArrowRightCircle,
      permission: "leads.convert",
      onSelect: () => setConvertLeadOpen(true),
    },
    // Shown only when rows are selected:
    ...(selectedLeadIds.length > 0 ? [{
      label: `Convert ${selectedLeadIds.length} Selected`,
      icon: ArrowRightCircle,
      permission: "leads.convert",
      onSelect: () => setBulkConvertOpen(true),
    }] : []),
  ],
};

// ContactsView (NO "Add Contact" — primary is Convert)
const primary: PrimaryActionConfig = {
  label: `Convert ${labels.lead.singular}`,
  icon: ArrowRightCircle,
  permission: "leads.convert",
  onClick: () => setConvertLeadOpen(true),
};

// DealsView
const primary: PrimaryActionConfig = {
  label: `Add ${labels.deal.singular}`,
  icon: Plus,
  permission: "deals.create",
  onClick: () => setAddDealOpen(true),
};

// CompaniesView
const primary: PrimaryActionConfig = {
  label: `Add ${labels.company.singular}`,
  icon: Plus,
  permission: "companies.create",
  onClick: () => setAddCompanyOpen(true),
};
```

### 8.4 Convert Lead drawer

**File**: `core/entities/leads/components/ConvertLeadDrawer.tsx`

```
┌─────────────────────────────────────────────┐
│  Convert {lead.singular}                     │
│                                               │
│  Pick the {lead.singular}(s) to convert.      │
│  ───────────────────────────────────────      │
│                                               │
│  <PersonSelect scope="lead"                   │
│                 multiple                      │
│                 value={leads}                 │
│                 onChange={setLeads} />        │
│                                               │
│  ☐ Also create a {deal.singular}?             │
│                                               │
│  (when checked:)                              │
│    Pipeline:  [Default ▾]                     │
│    First stage: [First Stage ▾]               │
│    Deal title:  (auto from lead name)         │
│    Value:       [ AED 0 ]                     │
│                                               │
│  ───────────────────────────────────────      │
│  [Cancel]                   [Convert (n)]     │
└─────────────────────────────────────────────┘
```

Backend call: `api.crm.entities.leads.mutations.convertToContact` per each selected lead (parallel `Promise.all`). If "also create deal" is checked, each call includes the deal payload.

### 8.5 Search everywhere (D16)

- `<PersonSelect>` — search built-in via Combobox.
- `<TagPicker>` — multi-select Combobox; same search.
- DataTable faceted filters (stage, assignee, company, source) — already have a search input via `<DataTableFacetedFilter>`.
- Settings lists (roles, tags, field definitions, pipelines) — add search input to each of their list pages in the future (not this build, but it's a standing expectation).

---

## 9. Dynamic configuration (v1) — cards, columns, groupBy from DB

Per D11: we build this properly the first time. Hardcoded constants in TypeScript
only serve as **fallback defaults**. Admin changes in Settings update the DB; UI
re-renders via Convex reactivity.

### 9.1 Schema additions (optional fields — no migration)

```ts
// convex/schema.ts
orgs: defineTable({
  // ...
  settings: v.object({
    // ...existing
    modules: v.optional(v.array(v.object({
      slot: v.string(),
      label: v.optional(v.string()),
      hidden: v.optional(v.boolean()),
      order: v.optional(v.number()),
      defaultView: v.optional(v.union(v.literal("list"), v.literal("board"))),
      cardFields: v.optional(v.array(v.string())),        // NEW — ordered field keys
      listColumns: v.optional(v.array(v.string())),       // NEW — ordered column keys
      boardGroupBy: v.optional(v.string()),               // NEW — "status" | "assignedTo" | "company" | "tag" | "industry" | "currentStageId"
      defaultFilters: v.optional(v.array(v.string())),    // NEW — filter-chip keys
    }))),
  }),
});

users: defineTable({
  // ...
  preferences: v.optional(v.object({
    // ...existing
    entityDefaultView: v.optional(
      v.record(v.string(), v.union(v.literal("list"), v.literal("board")))
    ),  // keyed by slot
  })),
});
```

### 9.2 Field catalog per entity (the universe of keys admin can choose from)

**File**: `core/entities/shared/config/field-catalog.ts`

```ts
/** What keys exist per entity, and how each key renders on a card + in a list column */
export const FIELD_CATALOG: Record<EntitySlot, Record<string, FieldSpec>> = {
  lead: {
    personCode:  { label: "Person Code", render: "personCode" },
    displayName: { label: "Name", render: "text", cellTemplate: "<PersonDisplay person={…} show={['avatar','name']} />" },
    email:       { label: "Email", render: "text" },
    phone:       { label: "Phone", render: "text" },
    status:      { label: "Status", render: "badge" },
    source:      { label: "Source", render: "badge" },
    assignedTo:  { label: "Assignee", render: "personDisplay", scope: "user" },
    tags:        { label: "Tags", render: "tags" },
    createdAt:   { label: "Created", render: "relativeTime" },
    updatedAt:   { label: "Updated", render: "relativeTime" },
    // + dynamic fields from fieldDefinitions table (future — not in v1)
  },
  contact: {
    personCode:  { label: "Person Code", render: "personCode" },
    displayName: { label: "Name", render: "text", cellTemplate: "personDisplay" },
    email:       { label: "Email", render: "text" },
    phone:       { label: "Phone", render: "text" },
    companyId:   { label: "Company", render: "companyLink" },
    assignedTo:  { label: "Assignee", render: "personDisplay", scope: "user" },
    tags:        { label: "Tags", render: "tags" },
    convertedFromLeadId: { label: "Converted from", render: "personDisplay", scope: "lead" },
    createdAt:   { label: "Created", render: "relativeTime" },
  },
  deal: {
    dealCode:       { label: "Deal Code", render: "entityCode" },
    title:          { label: "Title", render: "text" },
    personCode:     { label: "Person", render: "personCode" },
    value:          { label: "Value", render: "currency", permission: "deals.viewValues" },
    currentStageId: { label: "Stage", render: "stageBadge" },
    assignedTo:     { label: "Assignee", render: "personDisplay", scope: "user" },
    tags:           { label: "Tags", render: "tags" },
    staleIndicator: { label: "Stale", render: "stale" },
    createdAt:      { label: "Created", render: "relativeTime" },
  },
  company: {
    companyCode:    { label: "Company Code", render: "entityCode" },
    name:           { label: "Name", render: "text" },
    industry:       { label: "Industry", render: "badge" },
    website:        { label: "Website", render: "link" },
    assignedTo:     { label: "Assignee", render: "personDisplay", scope: "user" },
    tags:           { label: "Tags", render: "tags" },
    contactCount:   { label: "Contacts", render: "count", computed: true },
    openDealCount:  { label: "Open Deals", render: "count", computed: true },
    createdAt:      { label: "Created", render: "relativeTime" },
  },
};
```

Every key in this catalog becomes a selectable option in the Settings UI and a renderable field in `<EntityCard>` / DataTable columns.

### 9.3 Fallback defaults (used when DB value is absent)

**File**: `core/entities/shared/config/defaults.ts`

```ts
export const DEFAULT_CARD_FIELDS: Record<EntitySlot, string[]> = {
  lead:    ["personCode", "displayName", "status", "source", "assignedTo", "tags"],
  contact: ["personCode", "displayName", "companyId", "email", "assignedTo", "tags"],
  deal:    ["dealCode", "title", "personCode", "value", "staleIndicator", "assignedTo"],
  company: ["companyCode", "name", "industry", "contactCount", "openDealCount", "tags"],
};

export const DEFAULT_LIST_COLUMNS: Record<EntitySlot, string[]> = {
  lead:    ["personCode", "displayName", "status", "source", "assignedTo", "tags", "createdAt"],
  contact: ["personCode", "displayName", "email", "companyId", "assignedTo", "tags", "createdAt"],
  deal:    ["dealCode", "title", "personCode", "value", "currentStageId", "assignedTo", "createdAt"],
  company: ["companyCode", "name", "industry", "contactCount", "openDealCount", "assignedTo"],
};

export const DEFAULT_BOARD_GROUP_BY: Record<EntitySlot, string> = {
  lead:    "status",            // enum: new / qualified / won / lost
  contact: "assignedTo",        // per your Q-v2.3 answer
  deal:    "currentStageId",    // pipeline stages
  company: "industry",          // per your Q-v2.4 answer (fallback "Uncategorized")
};

export const ALLOWED_BOARD_GROUP_BY: Record<EntitySlot, string[]> = {
  lead:    ["status", "assignedTo", "source", "tag"],
  contact: ["assignedTo", "companyId", "tag"],                  // all three per your Q-v2.3 answer
  deal:    ["currentStageId", "assignedTo", "tag"],
  company: ["industry", "assignedTo", "tag"],                   // all three per your Q-v2.4 answer
};
```

### 9.4 `useModuleDisplay(slot)` — the read hook

**File**: `core/entities/shared/hooks/useModuleDisplay.ts`

```tsx
export function useModuleDisplay(slot: EntitySlot) {
  const org = useCurrentOrg();
  const mod = org?.settings?.modules?.find(m => m.slot === slot);
  return {
    cardFields:   mod?.cardFields   ?? DEFAULT_CARD_FIELDS[slot],
    listColumns:  mod?.listColumns  ?? DEFAULT_LIST_COLUMNS[slot],
    boardGroupBy: mod?.boardGroupBy ?? DEFAULT_BOARD_GROUP_BY[slot],
  } as const;
}
```

### 9.5 `<EntityCard>` iterates fieldKeys

```tsx
// core/entities/scaffolds/EntityCard.tsx (simplified)
const { cardFields } = useModuleDisplay(slot);

return (
  <KanbanCard itemId={item.id} onClick={onClick}>
    <KanbanCardHeader itemId={item.id} /* …*/ />
    <KanbanCardContent title={item.displayName}>
      {cardFields.map(key => renderFieldValue(slot, key, item))}
    </KanbanCardContent>
  </KanbanCard>
);
```

`renderFieldValue(slot, key, item)` is a switch over the catalog's `render` kind —
it maps to the right primitive (`<PersonDisplay>`, `<Badge>`, `<PersonCodeBadge>`,
currency formatting, stale indicator, etc.).

### 9.6 List columns — same pattern

```tsx
// core/entities/leads/hooks/useLeadColumns.ts
const { listColumns } = useModuleDisplay("lead");

return listColumns.map(key => buildColumnDef(slot, key, FIELD_CATALOG[slot][key]));
```

`buildColumnDef` returns a TanStack `ColumnDef<T>` with the right `header`, `cell`,
`accessorKey`, and `meta.variant` (for filter auto-rendering) based on the
catalog's render spec.

### 9.7 Settings UI — the admin controls

**File**: `core/settings/components/groups/workspace/ModuleDisplaySection.tsx`

One section — expandable per slot — with three sub-controls each:

```
Lead display
├─ Default view:     [◉ List  ○ Board]
├─ Board group by:   [Status ▾]           (options from ALLOWED_BOARD_GROUP_BY.lead)
├─ Card fields:      [pick + reorder]     ← multi-select with drag-reorder
└─ List columns:     [pick + reorder]     ← multi-select with drag-reorder
```

Save button per slot updates `modules[slot].{defaultView, boardGroupBy, cardFields, listColumns}` via `api.orgs.mutations.update`.

Drag-reorder uses `@dnd-kit/sortable` (already installed).

### 9.8 User-level override

**File**: `core/settings/components/groups/appearance/UserEntityDefaultsSection.tsx`

Per user:

```
My default view
├─ Leads:     [◉ Workspace default  ○ List  ○ Board]
├─ Contacts:  [◉ Workspace default  ○ List  ○ Board]
├─ Deals:     [◉ Workspace default  ○ List  ○ Board]
└─ Companies: [◉ Workspace default  ○ List  ○ Board]
```

Saves to `users.preferences.entityDefaultView[slot]`. Undefined = inherit workspace.

Card-fields / list-columns are **workspace-only** in v1 — per-user variation is
noise for collab (everyone sees the same board). We can revisit if requested.

---

## 10. Pagination — tweak defaults

Existing `core/datatable/components/DataTablePagination.tsx` already has:

- Rows-per-page Select
- "X of Y row(s) selected" / "X row(s) total"
- "Page X of Y"
- First/Prev/Next/Last buttons

Minor tweaks:

- Change default `pageSizeOptions` from `[10, 20, 30, 40, 50]` to `[10, 25, 50, 100]`
- Change status text from "Page X of Y" to "Showing A–B of C {labels[slot].plural}"
- Expose `pageSizeOptions` prop so each entity list can customise

No shadcnstudio install needed.

---

## 11. Default view — URL → user pref → workspace → fallback

```
?view=  →  users.preferences.entityDefaultView[slot]  →  modules[slot].defaultView  →  DEFAULT_VIEW[slot]
```

Where `DEFAULT_VIEW = { lead: "list", contact: "list", deal: "board", company: "list" }`.

Hook: `useViewToggle(slot) → [view, setView]` walks the chain. Clicking the
toggle updates URL only; persistent layer changes happen in Settings.

---

## 12. File-level build inventory

Complete diff vs v2. `*` = new in v3; `+` = new since v1; plain text = carry-over.

### 12.1 `core/entities/scaffolds/`

```
+ EntityPageLayout.tsx         dedicated toolbar (title, view-toggle icons, split Add button)
+ EntityListPage.tsx           wraps EntityPageLayout + DataTable/KanbanBoard based on view
+ EntityCard.tsx               generic card — iterates cardFields via FIELD_CATALOG
+ EntityFormDrawer.tsx         FormDrawer + RHF + zod + dedup banner
```

### 12.2 `core/entities/shared/components/`

```
+ FormDrawer.tsx               the base right-side drawer
* PersonDisplay.tsx            NEW — system component for rendering people
+ PersonSelect.tsx             combobox picker returning PersonRef (search, multiple, filter)
+ EntityHoverCard.tsx          hover → overview quick-view
+ EntityOverview.tsx           shared overview content (hover-card AND profile tab both consume)
+ StaleIndicator.tsx
+ DedupBanner.tsx
+ TagPicker.tsx                multi-select combobox (search built-in)
+ DynamicFieldRenderer.tsx     renders fieldDefinitions (placeholder in v1)
+ EmptyState.tsx
+ ViewToggleIcons.tsx          two independent icon buttons
* BoardCardFieldsMenu.tsx      show/hide card fields per session + "Save as default" for admins
* FieldValueRenderer.tsx       the switch-on-kind renderer for FIELD_CATALOG
```

### 12.3 `core/entities/shared/hooks/`

```
+ useViewToggle.ts
+ useDefaultView.ts            reads org default
+ useUserEntityDefaultView.ts  reads current user's override
* useModuleDisplay.ts          NEW — reads cardFields/listColumns/boardGroupBy
+ useOrgPermission.ts
+ useDedup.ts
+ useBulkActions.ts
+ usePerson.ts                 resolves any PersonRef/personCode to fresh record
```

### 12.4 `core/entities/shared/config/`

```
* field-catalog.ts             NEW — FIELD_CATALOG per entity (labels + render kinds)
* defaults.ts                  NEW — DEFAULT_CARD_FIELDS / DEFAULT_LIST_COLUMNS / DEFAULT_BOARD_GROUP_BY / ALLOWED_BOARD_GROUP_BY
```

### 12.5 Per-entity wiring

```
core/entities/leads/
  types.ts                             +
  hooks/useLeads.ts                    +
  hooks/useLeadColumns.ts              + (uses useModuleDisplay + field-catalog)
  hooks/useLeadMutations.ts            +
  components/LeadCard.tsx              +  (thin — delegates to EntityCard + slot="lead")
  components/AddLeadDrawer.tsx         +
  components/ConvertLeadDrawer.tsx     *  single + bulk convert
  views/LeadsView.tsx                  REPLACE placeholder

core/entities/contacts/
  types.ts                             +
  hooks/useContacts.ts                 +
  hooks/useContactColumns.ts           +
  hooks/useContactMutations.ts         +
  components/ContactCard.tsx           + (board view enabled)
  views/ContactDetailView.tsx          REPLACE (exported ContactsView gets full wiring)
  /* NO AddContactDrawer per D4 — primary action = ConvertLeadDrawer */

core/entities/deals/
  types.ts                             +
  hooks/useDeals.ts                    +
  hooks/useDealColumns.ts              +
  hooks/useDealMutations.ts            +
  components/DealCard.tsx              +
  components/AddDealDrawer.tsx         + (PersonSelect scope="person" for the linked person)
  views/DealDetailView.tsx             REPLACE (exported DealsView gets full wiring)

core/entities/companies/
  types.ts                             +
  hooks/useCompanies.ts                +
  hooks/useCompanyColumns.ts           +
  hooks/useCompanyMutations.ts         +
  components/CompanyCard.tsx           + (board view enabled)
  components/AddCompanyDrawer.tsx      +
  views/CompaniesView.tsx              REPLACE
```

### 12.6 Settings additions

```
core/settings/components/groups/workspace/
  ModuleDefaultViewSection.tsx         +  (admin — per-slot default view — already planned)
* ModuleDisplaySection.tsx             NEW — admin — per-slot cardFields / listColumns / boardGroupBy

core/settings/components/groups/appearance/
* UserEntityDefaultsSection.tsx        NEW — per-user default view override
```

### 12.7 Backend additions

```
convex/schema.ts                       + 4 optional fields on orgs.settings.modules[] + 1 on users.preferences
convex/orgs/mutations.ts::update       validator extended to accept new settings.modules shape
convex/users/mutations.ts              new mutation (or extend existing) to save preferences.entityDefaultView
```

### 12.8 Counts

- **~45 new / replaced files** (~38 in v2 + 7 for PersonDisplay + BoardCardFieldsMenu + FieldValueRenderer + field-catalog + defaults + ConvertLeadDrawer + ModuleDisplaySection)
- **5 tiny optional schema fields** (no migration)
- **Zero new shadcnstudio installs**

---

## 13. Build order (6 slices)

### Slice 0 — Scaffolds + shared + dynamic config infrastructure

1. **Primitives**
   - `FormDrawer` + `EntityFormDrawer`
   - `PersonDisplay` (with default `show`, clickable, hover)
   - `PersonSelect` (scope=user/lead/contact/person; search; multiple)
   - `EntityHoverCard` + `EntityOverview` (skeleton content; real content added in Slice 2)
   - `TagPicker`, `StaleIndicator`, `DedupBanner`, `EmptyState`, `ViewToggleIcons`
2. **Config layer**
   - `field-catalog.ts` — every key with its render kind
   - `defaults.ts` — DEFAULT_CARD_FIELDS / DEFAULT_LIST_COLUMNS / DEFAULT_BOARD_GROUP_BY / ALLOWED_BOARD_GROUP_BY
   - `FieldValueRenderer.tsx` — switch over render kinds → JSX
   - Hooks: `useModuleDisplay`, `useViewToggle`, `useDefaultView`, `useUserEntityDefaultView`, `useOrgPermission`, `useDedup`, `useBulkActions`, `usePerson`
3. **Scaffolds**
   - `EntityCard` — iterates `cardFields` via `FieldValueRenderer`
   - `EntityPageLayout` — toolbar + split button + view-toggle icons
   - `EntityListPage` — wraps the two
4. **Backend**
   - Schema fields added to `orgs.settings.modules[]` + `users.preferences`
   - Mutation validators updated
5. **Settings**
   - `ModuleDisplaySection` — per-slot cardFields / listColumns / boardGroupBy / defaultView (admin)
   - `UserEntityDefaultsSection` — per-slot default view override (per user)

**Gate**: `pnpm typecheck` + `pnpm exec biome check .` both clean before proceeding.

### Slice 1 — Leads

`LeadsView` + hooks + `LeadCard` + `AddLeadDrawer` + `ConvertLeadDrawer` + `BulkConvertLeadsDrawer` (or param on ConvertLeadDrawer). Smoke test: create lead, convert lead, see the new contact in Contacts list, see the new deal in Deals kanban.

### Slice 2 — Real `<EntityOverview>` content + hover-cards

Replace the skeleton with actual content (personCode, name, status, assignee, email, phone, tags, lightweight recent activity summary). Hover cards become useful in Leads list and the Kanban cards.

### Slice 3 — Contacts

Mirror Slice 1. Primary action = `ConvertLeadDrawer`. Board grouped by `assignedTo` by default; ALLOWED_BOARD_GROUP_BY allows `companyId` / `tag`.

### Slice 4 — Deals (kanban + list)

Pipeline stages → board columns. `moveToStage` on drag. `closeAsDone` + confetti on won. Value hidden from `member` role.

### Slice 5 — Companies

Board grouped by `industry` by default. `CompanyDetailView` replaces placeholder. Contacts tab on detail page lists all contacts with that companyId (per D18). Hover card shows `contactCount` + `openDealCount`.

### Slice 6 — Polish + user-pref default view

Wire `useUserEntityDefaultView` into the default-view precedence chain. Add `UserEntityDefaultsSection` to Appearance. Verify all acceptance criteria.

---

## 14. Acceptance criteria (Definition of Done)

Per slice + per entity:

- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm exec biome check .` → 0 errors, 0 warnings
- [ ] Rename `lead` → `Inquiry` in Settings → sidebar, URL slug, entity toolbar title, subtitle, Add button label, kanban column labels, all update live.
- [ ] Hide the module → sidebar hides it, URL returns 404.
- [ ] Change workspace default view → reloading lands on new default (no URL param).
- [ ] Change user default view → same thing for that user only.
- [ ] `?view=list|board` overrides both.
- [ ] **The entity toolbar is visible on every screen size** including mobile (wraps to two rows).
- [ ] Clicking the List icon → list; clicking the Board icon → board. URL updates.
- [ ] Clicking the primary Add button → drawer opens. Clicking ▾ → dropdown with secondary actions (Convert for leads).
- [ ] Submitting Add drawer → toast → drawer closes → new row/card appears.
- [ ] Submitting duplicate → DedupBanner at top with "Edit fields" + link to existing personCode.
- [ ] Row click → detail page; row ⋯ menu → Edit/Convert/Delete (role-gated).
- [ ] **Hovering on a person name / personCode / deal title / company name shows the EntityHoverCard.** Same content appears on the profile/detail Overview tab.
- [ ] `<PersonDisplay>` is used everywhere a person is shown (no ad-hoc avatar+name render).
- [ ] `<PersonSelect>` has a search input that filters the dropdown.
- [ ] Drag a deal to a new column → `moveToStage` fires → activity log entry → visual update.
- [ ] Close a deal as won → `closeAsDone({finalType:"positive"})` → confetti.
- [ ] Deal value hidden from `member` role.
- [ ] Stale border color = `pipeline.stages[].staleColor`.
- [ ] **Admin changes Settings → Workspace → Module Display → Card Fields → cards re-render with new fields.** No reload.
- [ ] **Admin changes Module Display → Board Group By → board re-groups.** No reload.
- [ ] **Admin changes Module Display → List Columns → DataTable columns change.** No reload.
- [ ] Pagination shows rows-per-page `[10, 25, 50, 100]` + "Showing A–B of C".
- [ ] No hardcoded entity labels / slugs / radius / directional Tailwind in new code (grep-verified).
- [ ] `STATE.md` updated in every touched module.
- [ ] Commit attestation: `shadcn-scan: reused <list> | built custom <PersonDisplay, PersonSelect, EntityCard, EntityPageLayout, EntityHoverCard, FormDrawer, FieldValueRenderer>`.

---

## 15. Remaining open questions (2)

### Q-v3.1 — `PersonSelect multiple` for bulk-convert

For `BulkConvertLeadsDrawer` I'm planning to set `<PersonSelect scope="lead" multiple />` so the admin can either:

- **(a)** Tick the rows on the list first, then click ▾ → "Convert Selected" → drawer pre-fills the multi-select with the selected leads
- **(b)** Open the drawer from the primary dropdown and search/pick one-by-one via the multiple-select
- **(c)** Both — pre-filled if rows selected, otherwise manual pick

I recommend **(c)**. Confirm?

### Q-v3.2 — What happens on Contacts page if user can't create contacts directly?

On the Contacts page, the primary button is `[Convert {lead.singular} ▾]`. But what
if the user lacks `leads.convert` permission? Options:

- **(a)** Hide the whole primary button (cleaner but empty-feeling toolbar)
- **(b)** Show a disabled button with a tooltip: "You don't have permission to convert leads"
- **(c)** Replace it with a message: "Contacts are created by converting leads — ask an admin"

I recommend **(a)** — matches the general RBAC pattern: no permission = no button.

---

## 16. Future dynamic items — explicit migration paths

Everything here is **not built in this session**, but every current hardcoded
fallback has an explicit path to become dynamic.

| # | Hardcoded today | File | Future: dynamic via | When |
|---|---|---|---|---|
| F1 | `DEFAULT_CARD_FIELDS[slot]` | `core/entities/shared/config/defaults.ts` | Admin picks via `ModuleDisplaySection` → `orgs.settings.modules[slot].cardFields` | **ALREADY DYNAMIC in this build** — the hardcoded value is just the fallback |
| F2 | `DEFAULT_LIST_COLUMNS[slot]` | same | `modules[slot].listColumns` | **ALREADY DYNAMIC** |
| F3 | `DEFAULT_BOARD_GROUP_BY[slot]` | same | `modules[slot].boardGroupBy` | **ALREADY DYNAMIC** |
| F4 | `ALLOWED_BOARD_GROUP_BY[slot]` (list of allowed groupBy options per entity) | same | For now, a code constant. Future: `orgSettings.moduleExtras[slot].allowedBoardGroupBy`. Rarely edited so keeping it in code is fine for a while. | Later — not needed unless a customer asks for a non-standard groupBy |
| F5 | Lead status values (`new`/`qualified`/`won`/`lost`) | `core/entities/leads/types.ts` + backend enum | New `orgs.settings.leadStatuses: Array<{ id, name, color, order }>`. Admin manages via `Settings → Workspace → Lead Statuses`. Then board column config + status badges read from this array. Mutation `update` loosens status to `v.string()`. | **Phase 2 Slice 6** per PHASE2-PROGRESS — already on roadmap |
| F6 | Lead source values (`manual`/`referral`/`website`/`whatsapp`/`csv`) | same | `orgs.settings.leadSources: Array<{ id, name, color }>`. Settings → Workspace → Lead Sources. Same migration as above. | Same roadmap — add to Slice 6 |
| F7 | Company industries | hardcoded list in UI | `orgs.settings.companyIndustries: Array<{ id, name, color }>` | Same Slice 6 |
| F8 | Filter chips in `EntityPageLayout.leftExtras` (e.g. "My assignments", "Created this week") | hardcoded per entity view for now | `orgs.settings.modules[slot].defaultFilters: Array<string>` — catalog of filter-chip keys maintained similar to `FIELD_CATALOG` | Future slice — not blocking |
| F9 | `staleAfterDays` + `staleColor` per stage | `convex/crm/fields/pipelines/*` — ALREADY CONFIGURABLE | Settings → Pipelines → per-stage inputs | Already planned in Phase 2 Slice 6 |
| F10 | Default view per slot (`board` for deals, `list` for others) | `DEFAULT_VIEW` const | `orgs.settings.modules[slot].defaultView` + `users.preferences.entityDefaultView[slot]` | **ALREADY DYNAMIC in this build** |
| F11 | Card field keys (what `FIELD_CATALOG` exposes for each entity) | `core/entities/shared/config/field-catalog.ts` | Custom fields via `fieldDefinitions` table — admin defines a new field; catalog auto-extends; card/column picker shows it | **Phase 2 Slice 6** — `fieldDefinitions` backend done, UI not wired |
| F12 | Currency code on deal value | `"USD"` default + per-org `orgs.settings.currencyCode` | ALREADY — just read `org.settings.currencyCode` (existing field) | Wire into `renderCurrency` call in Slice 4 |
| F13 | Bulk actions catalog (`assign`, `tag`, `softDelete`, `convert`) | hardcoded per entity | Future: `orgs.settings.modules[slot].bulkActions: string[]` — admin picks which to show | Later slice — noise for v1 |
| F14 | Entity labels | ALREADY DYNAMIC — `useEntityLabels` | — | Done |
| F15 | Module visibility / order | ALREADY DYNAMIC — `modules[slot].hidden/order` | — | Done |
| F16 | Sidebar grouping | hardcoded `NAV_GROUPS` in `core/shell/config/navigation.ts` | Future: user-pinned saved views + custom groups via `savedViews` table | Shell MODULE.md roadmap item |
| F17 | Quick-Add global "+" button (TopNav) | not built | Shell MODULE.md has it as P0 — wraps the same PrimaryActionConfig dropdown | Future — out of scope for this build |

### Rule for the agent

When introducing a new hardcoded value in this session's code, **add a row to the
table above** with an explicit "Future: dynamic via X" note. No silent hardcodes
— every hardcode must have a plan.

---

## Proceed immediately?

Reply with either **"proceed with your recommendations on Q-v3.1 and Q-v3.2, start
Slice 0"** or answer the two questions explicitly and I'll build Slice 0 end-to-end
with typecheck + biome clean, then stop for review before starting Slice 1.
