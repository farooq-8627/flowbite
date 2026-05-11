# Entity Scaffolds — Architecture

> **Purpose**: Build once, use 4× (or 6×). Every entity page in the app is a
> thin configuration layer over four shared scaffolds.
> **Status**: NOT_STARTED (backend 100% done — this is the frontend layer)
> **Last Updated**: 2026-05-12

---

## Decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Ship 4 entities in UI** (lead, contact, deal, company) — NOT 6 | Entity5/Entity6 stay as schema + backend slots for industries that need a 5th/6th type (e.g. Real Estate "Property", E-commerce "Product"). We don't build their UI until a concrete customer needs it. Over-building costs more than a late slot activation. |
| 2 | **Route-group-style sub-folder**: `core/entities/(entities)/` | The parentheses are purely organizational (mimics Next.js route-group syntax for visual grouping). Keeps scaffolds + shared + (entities) at three clean top-level folders inside `core/entities/`. |
| 3 | **ALL 4 entities render through the SAME 4 scaffolds** | `EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`. Zero custom layout per entity. Per-entity files are config + column defs + tab contents only. |
| 4 | **Entity slug & label are DB-backed** (`useEntityLabels()`) | Workspace renames "Lead" → "Inquiry" → every UI surface updates instantly via Convex reactivity. |
| 5 | **Single dynamic route for entity lists**: `app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx` | Resolves the slug at runtime via `useEntityLabels().lead/contact/deal/company`. Supports renamed slugs (`/inquiries`, `/opportunities`) with zero code duplication. |
| 6 | **Single detail page for people**: `/profile/[personCode]` | Lead + contact are one identity with one URL. Backend query `getByPersonCode` resolves to whichever table has it. See `FRONTEND-DECISIONS.md` Rule 1. |
| 7 | **Deals and Companies keep their own detail routes** | They aren't "people" — they're distinct records. `/deals/[id]` and `/companies/[id]`. |
| 8 | **entity5 / entity6 folders stay empty** | Schema + backend already support them. UI scaffolds work for them out-of-the-box if a customer activates them later. No code to delete — just two empty folders and a comment. |

---

## Folder layout

```
core/entities/
├── MODULE.md                         # Rules + checklist (exists)
├── STATE.md                          # Done / pending (update every session)
├── ENTITY_SCAFFOLDS_ARCHITECTURE.md  # THIS FILE
│
├── scaffolds/                        # ← BUILD ONCE
│   ├── EntityListPage.tsx            # List + board toggle + toolbar + empty state
│   ├── EntityDetailPage.tsx          # Sticky header + tabs + right sidebar slot
│   ├── EntityFormDialog.tsx          # RHF + zod + DynamicFieldRenderer + dedup banner
│   └── EntityCard.tsx                # Base kanban/grid card (personCode badge + stale + assignee)
│
├── shared/                           # ← REUSABLE ACROSS ALL ENTITIES
│   ├── components/
│   │   ├── DynamicFieldRenderer.tsx  # Renders fieldDefinitions (stage-aware)
│   │   ├── TagPicker.tsx
│   │   ├── AssigneeSelect.tsx
│   │   ├── DedupBanner.tsx
│   │   ├── StaleIndicator.tsx        # Reads stage.staleColor — never hardcoded
│   │   ├── PersonCodeBadge.tsx       # ✅ already exists
│   │   └── EmptyState.tsx
│   └── hooks/
│       ├── useEntity.ts              # Generic CRUD factory
│       ├── useEntityColumns.ts       # Base column factory (DataTable)
│       ├── useDynamicFields.ts
│       ├── usePipeline.ts            # Pipeline stages for deals + stale thresholds
│       ├── useTags.ts
│       ├── useBulkActions.ts
│       ├── useDedup.ts
│       └── useSavedViews.ts
│
└── (entities)/                       # ← PER-ENTITY CONFIG (tiny files)
    │                                 # Parentheses = visual grouping, NOT a Next.js route group
    ├── leads/
    │   ├── types.ts                  # Doc<"leads"> + status enum
    │   ├── hooks/
    │   │   ├── useLeads.ts           # api.crm.entities.leads.queries.list
    │   │   ├── useLeadColumns.ts     # Column defs for DataTable
    │   │   └── useLeadMutations.ts   # create / update / convertToContact / softDelete
    │   ├── components/
    │   │   ├── LeadCard.tsx          # Extends EntityCard (adds status badge + source)
    │   │   └── AddLeadDialog.tsx     # Config for EntityFormDialog
    │   └── views/
    │       └── LeadsView.tsx         # ~25 lines — passes config to EntityListPage
    │
    ├── contacts/                     # same shape as leads
    ├── companies/                    # list-only, no kanban
    ├── deals/                        # kanban primary, list secondary
    │
    └── people/                       # ONE unified view for lead+contact at /profile/[personCode]
        ├── hooks/
        │   └── usePerson.ts          # api.crm.people.queries.getByPersonCode
        ├── components/
        │   ├── PersonHeader.tsx
        │   ├── PersonSidebar.tsx
        │   ├── PersonOverviewTab.tsx
        │   ├── PersonTimelineTab.tsx # uses UnifiedTimeline from core/timelines/
        │   ├── PersonNotesTab.tsx
        │   ├── PersonMessagesTab.tsx # activity-chat (notes where isActivityChat===true)
        │   ├── PersonDealsTab.tsx
        │   ├── PersonRemindersTab.tsx
        │   ├── ConvertLeadDialog.tsx
        │   └── PersonCard.tsx        # compact overview popover for deal cards etc.
        └── views/
            └── PersonDetailView.tsx  # ~40 lines — resolves personCode → lead or contact, assembles tabs
```

**Why `(entities)` and not just `entities/`**: makes the sibling folders (`scaffolds/`, `shared/`, `(entities)/`) visually distinct in the file tree — scaffolds and shared are "library" layers, `(entities)` is the "catalog" layer. Reading the folder alphabetically gives `(entities)` → `scaffolds` → `shared` which matches the conceptual hierarchy.

---

## Route layout (app/)

```
app/[locale]/(private)/[orgSlug]/
├── page.tsx                       # Dashboard home — thin wrapper
├── [entitySlug]/
│   └── page.tsx                   # Unified entry: resolves slug → entity type → EntitySlugView
├── profile/
│   ├── page.tsx                   # /profile — combined leads+contacts list (filter by type)
│   └── [personCode]/
│       └── page.tsx               # /profile/P-001 — PersonDetailView (thin wrapper)
├── deals/
│   └── [id]/
│       └── page.tsx               # /deals/D-001 — DealDetailView
├── companies/
│   └── [id]/
│       └── page.tsx               # /companies/C-001 — CompanyDetailView
└── settings/
    └── page.tsx                   # (existing)
```

### Why `[entitySlug]` catches ALL list views (not separate `/leads`, `/contacts`, ...)

Named segments win over dynamic segments in Next.js routing. So:

- `/profile` → `profile/page.tsx` (named — wins)
- `/settings` → `settings/layout.tsx` (named — wins)
- `/deals/[id]` → `deals/[id]/page.tsx` (named deals folder — wins over `[entitySlug]`)
- `/leads` → `[entitySlug]/page.tsx` (falls through — correctly caught here)
- `/inquiries` → `[entitySlug]/page.tsx` (renamed slug — same page handles it)

`EntitySlugView` inside reads `useEntityLabels()` and finds which slot matches the URL slug:

```tsx
// core/entities/views/EntitySlugView.tsx
const labels = useEntityLabels();
const slotBySlug = {
  [labels.lead.slug]: "lead",
  [labels.contact.slug]: "contact",
  [labels.deal.slug]: "deal",
  [labels.company.slug]: "company",
} as const;
const slot = slotBySlug[params.entitySlug];
if (!slot) return notFound();

switch (slot) {
  case "lead":    return <LeadsView />;
  case "contact": return <ContactsView />;
  case "deal":    return <DealsView />;
  case "company": return <CompaniesView />;
}
```

---

## Scaffold APIs (stable — build these first)

### `EntityListPage`

```tsx
type Props<TRow> = {
  entityType: EntityType;          // "lead" | "contact" | "deal" | "company"
  title: string;                   // From useEntityLabels() — e.g. labels.lead.plural
  items: TRow[] | undefined;       // undefined = loading, [] = empty
  columns: ColumnDef<TRow>[];
  views?: Array<"list" | "board">; // default ["list"]
  defaultView?: "list" | "board";
  BoardCard?: React.ComponentType<{ item: TRow }>;  // required if "board" in views
  boardGroupBy?: keyof TRow;       // e.g. "currentStageId" for deals
  onAdd?: () => void;
  emptyState?: React.ReactNode;
  bulkActions?: Array<"assign" | "tag" | "delete" | ...>;
};
```

Internally assembles: `DataTableToolbar` + `DataTable` (from `core/datatable/`) OR `KanbanBoard` (from `core/kanban/`) + view toggle + skeleton + empty state + bulk-action bar.

### `EntityDetailPage`

```tsx
type Props = {
  entityType: EntityType;
  title: string;                       // e.g. lead.displayName
  subtitle?: string;                   // e.g. personCode
  badges?: React.ReactNode;            // status pill, stage pill, stale indicator
  headerActions?: React.ReactNode;     // "Convert", "Archive", etc.
  tabs: Array<{ id: string; label: string; content: React.ReactNode; permission?: string }>;
  sidebar?: React.ReactNode;           // right rail: contact info, assignee, company, tags
};
```

Renders sticky header + tabs + tab content + right sidebar. Tabs are role-filtered — if a user lacks `permission`, that tab is hidden.

### `EntityFormDialog`

```tsx
type Props<TSchema extends z.ZodType> = {
  entityType: EntityType;
  mode: "create" | "edit";
  schema: TSchema;                     // Zod schema for the form
  defaultValues: z.infer<TSchema>;
  onSubmit: (values: z.infer<TSchema>) => Promise<{ duplicates?: DupeResult[] } | void>;
  dynamicFieldSlots?: Array<{ section: string; fields: FieldDefinition[] }>;
  trigger?: React.ReactNode;           // the button that opens the dialog
};
```

Handles RHF + zod + optimistic dedup banner (when `onSubmit` returns duplicates) + DynamicFieldRenderer section below fixed fields.

### `EntityCard`

```tsx
type Props<TRow> = {
  item: TRow;
  personCode?: string;              // if entity has one
  title: string;                    // e.g. displayName or title
  subtitle?: string;                // e.g. company name or email
  badges?: React.ReactNode;         // status / stage
  assignee?: { name: string; avatarUrl?: string };
  // Stale border colors come from the PIPELINE STAGE config, NOT hardcoded
  staleIndicator?: { daysInStage: number; staleAfterDays: number; staleColor: string; warningAfterDays: number; warningColor: string };
  footer?: React.ReactNode;         // e.g. deal value (permission-gated)
  onClick?: () => void;
};
```

---

## Per-entity file anatomy (target: 25 lines per view)

```tsx
// core/entities/(entities)/leads/views/LeadsView.tsx — EXACT target
"use client";

import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useLeads } from "../hooks/useLeads";
import { useLeadColumns } from "../hooks/useLeadColumns";
import { AddLeadDialog } from "../components/AddLeadDialog";
import { LeadCard } from "../components/LeadCard";

export function LeadsView() {
  const labels = useEntityLabels();
  const { items, isLoading } = useLeads();
  const columns = useLeadColumns();

  return (
    <EntityListPage
      entityType="lead"
      title={labels.lead.plural}
      items={items}
      columns={columns}
      views={["list", "board"]}
      boardGroupBy="status"
      BoardCard={LeadCard}
      onAdd={() => {}}
      bulkActions={["assign", "tag", "delete"]}
    />
  );
}
```

That's the target. Anything more complex than this lives in the scaffold or shared hooks.

---

## Data flow (end-to-end)

```
┌────────────────────────────────────────────────────────────────────────┐
│  User navigates to /en/acme/inquiries                                   │
│  (labels.lead.slug = "inquiries")                                       │
└────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx                 │
│    → renders <EntitySlugView entitySlug="inquiries" />                  │
└────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  core/entities/views/EntitySlugView.tsx                                  │
│    const labels = useEntityLabels();                                    │
│    // labels.lead.slug === "inquiries" → slot === "lead"                │
│    return <LeadsView />;                                                │
└────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  core/entities/(entities)/leads/views/LeadsView.tsx                     │
│    const items = useLeads();          ← useQuery(api.crm.entities.leads.list) │
│    const columns = useLeadColumns();  ← label-aware TanStack column defs │
│    return <EntityListPage title={labels.lead.plural} items={items} … /> │
└────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  core/entities/scaffolds/EntityListPage.tsx                              │
│    DataTableToolbar + DataTable (or KanbanBoard)                        │
│    + skeleton + empty state + bulk-action bar                           │
└────────────────────────────────────────────────────────────────────────┘
```

Zero hardcoded strings. Zero copy-pasted layout.

---

## Build Order (vertical slices)

### Slice 0 — Scaffolds & shared (do first)

```
□ core/entities/scaffolds/EntityListPage.tsx
□ core/entities/scaffolds/EntityDetailPage.tsx
□ core/entities/scaffolds/EntityFormDialog.tsx
□ core/entities/scaffolds/EntityCard.tsx
□ core/entities/shared/components/DynamicFieldRenderer.tsx
□ core/entities/shared/components/DedupBanner.tsx
□ core/entities/shared/components/TagPicker.tsx
□ core/entities/shared/components/AssigneeSelect.tsx
□ core/entities/shared/components/StaleIndicator.tsx
□ core/entities/shared/components/EmptyState.tsx
□ core/entities/shared/hooks/useDynamicFields.ts
□ core/entities/shared/hooks/usePipeline.ts
□ core/entities/shared/hooks/useTags.ts
□ core/entities/shared/hooks/useBulkActions.ts
```

Prerequisites: `@dnd-kit/*` + `@tanstack/react-table` installed ✅, `PersonCodeBadge` exists ✅.

### Slice 1 — Leads + Contacts lists

```
□ app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx (thin wrapper)
□ core/entities/views/EntitySlugView.tsx (slug → entity type resolver)
□ core/entities/(entities)/leads/{types,hooks,components,views}
□ core/entities/(entities)/contacts/{types,hooks,components,views}
```

### Slice 2 — PersonDetailPage (the unified person hub)

```
□ app/[locale]/(private)/[orgSlug]/profile/[personCode]/page.tsx
□ core/entities/(entities)/people/views/PersonDetailView.tsx
□ core/entities/(entities)/people/components/* (7 tabs + header + sidebar + ConvertLeadDialog)
```

### Slice 3 — Companies

```
□ core/entities/(entities)/companies/{types,hooks,components,views}
□ app/[locale]/(private)/[orgSlug]/companies/[id]/page.tsx
```

### Slice 4 — Deals (kanban primary)

```
□ core/entities/(entities)/deals/{types,hooks,components,views}
□ app/[locale]/(private)/[orgSlug]/deals/[id]/page.tsx
□ canvas-confetti on closeAsDone({finalType:"positive"})
```

### Slice 5 — Unified Timeline (consumed by profile + company + deal details)

```
□ core/timelines/hooks/useUnifiedTimeline.ts
□ core/timelines/components/UnifiedTimeline.tsx
□ core/timelines/components/TimelineEntry.tsx
□ core/timelines/components/NoteComposer.tsx
□ core/timelines/components/TimelineFilters.tsx
```

---

## Non-negotiable rules

| # | Rule |
|---|---|
| R-ENT-01 | Every entity UI uses the 4 scaffolds. Never custom layouts. |
| R-ENT-02 | Entity names come from `useEntityLabels()`. Never hardcoded. |
| R-ENT-03 | Code prefixes come from `orgs.settings.codePrefixes`. Never hardcoded "P", "D". |
| R-ENT-04 | Stale border colors come from `pipelineStage.staleColor`. Never hardcoded red/yellow. |
| R-ENT-05 | Never import one entity folder from another. Share via `core/entities/shared/`. |
| R-ENT-06 | Every mutation call-site logs `personCode` in `logActivity()` (enables unified timeline). |
| R-ENT-07 | `generatePersonCode()` is called ONLY in `leads.create`. Contacts inherit it on conversion. |
| R-ENT-08 | Deal value hidden from `member` role (gate with `hasPermission("deals.viewValues")`). |
| R-ENT-09 | Deal stage change MUST call `moveToStage()`. Won/Lost MUST call `closeAsDone()`. |
| R-ENT-10 | `app/` pages are thin wrappers — zero business logic, no data fetching. |
| R-ENT-11 | Entity5 / Entity6 folders stay empty until a customer requires a 5th type. When activated, they use the same 4 scaffolds with a different `entityType` string. |

---

## Open questions (none currently — please raise them here if new ones surface)

If anything in this doc is ambiguous, flag it BEFORE writing code. Do not guess a
folder, route shape, or scaffold API — everything here is intentional. Deviation
requires explicit user approval.
