# entities Module (Core)

> All CRM entities: leads, contacts, deals, companies + 2 optional slots (entity5, entity6).
> Shared scaffolds ensure every entity uses the same patterns. New entity = ~5 files, 1-2 days.

## Ownership
- **Location**: `core/entities/`
- **Backend**: `convex/leads/`, `convex/contacts/`, `convex/deals/`, `convex/companies/`, `convex/entity5/`, `convex/entity6/`
- **Routes**: `app/[locale]/dashboard/[orgSlug]/[entity]/`
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-ENT-01: Every entity MUST use the 4 shared scaffolds (EntityListPage, EntityDetailPage, EntityFormDialog, EntityCard)
- [ ] R-ENT-02: `displayName` field MUST be set on create for leads/contacts. `title` for deals. `name` for companies.
- [ ] R-ENT-03: All entities use `pipelineId` + `currentStageId` + `stageEnteredAt` for pipeline tracking
- [ ] R-ENT-04: Dedup check runs on create for leads and contacts (shared engine in `convex/dedup/`)
- [ ] R-ENT-05: Entity labels are dynamic from `orgSettings.entityLabels` — never hardcode "Lead", "Contact", etc.
- [ ] R-ENT-06: Entity5/Entity6 use the SAME scaffolds — zero special code. Only difference is `entityType` value.
- [ ] R-ENT-07: Each entity module only defines: custom columns, custom card, custom detail tabs, types
- [ ] R-ENT-08: Never import one entity module from another (leads ≠ contacts ≠ deals)
- [ ] R-ENT-09: All mutations call `logActivity()` with correct `entityType` and `entityId`
- [ ] R-ENT-10: Dynamic fields loaded via `useDynamicFields(entityType)` — renders in EntityFormDialog automatically

## Checklist — Scaffolds (build FIRST)
- [ ] `scaffolds/EntityListPage.tsx` — list+board toggle, toolbar, filters, empty state, loading skeleton
- [ ] `scaffolds/EntityDetailPage.tsx` — tab layout, right sidebar, unified timeline, activity chat
- [ ] `scaffolds/EntityFormDialog.tsx` — react-hook-form + zod + dynamic fields + dedup check
- [ ] `scaffolds/EntityCard.tsx` — base kanban card (name, stage, assignee, tags, stale indicator)

## Checklist — Shared Components
- [ ] `shared/components/DynamicFieldRenderer.tsx` — renders fields from fieldDefinitions
- [ ] `shared/components/TagPicker.tsx` — tag selector for any entity
- [ ] `shared/components/AssigneeSelect.tsx` — user picker
- [ ] `shared/components/DedupBanner.tsx` — "Possible duplicate" banner
- [ ] `shared/components/StaleIndicator.tsx` — red border + badge for stale records
- [ ] `shared/components/EmptyState.tsx` — AI-suggested empty states

## Checklist — Shared Hooks
- [ ] `shared/hooks/useEntity.ts` — generic entity CRUD hook factory
- [ ] `shared/hooks/useEntityColumns.ts` — base column factory
- [ ] `shared/hooks/useDynamicFields.ts` — load fieldDefinitions + fieldValues
- [ ] `shared/hooks/usePipeline.ts` — load pipeline stages
- [ ] `shared/hooks/useTags.ts` — tag operations
- [ ] `shared/hooks/useBulkActions.ts` — select-all + bulk operations
- [ ] `shared/hooks/useDedup.ts` — dedup check on create
- [ ] `shared/hooks/useSavedViews.ts` — filter presets + sidebar pinning

## Checklist — Entity Modules (build AFTER scaffolds)
- [ ] `leads/` — types, useLeads, useLeadColumns, LeadList, LeadBoard, LeadCard, LeadDetail, AddLeadDialog
- [ ] `contacts/` — same pattern, adapted from leads
- [ ] `companies/` — list-only (no board view), simpler
- [ ] `deals/` — kanban is PRIMARY view
- [ ] `entity5/` — hidden by default, activated per industry
- [ ] `entity6/` — hidden by default, activated per industry

## Avoids
- ❌ Never build a custom list/detail page from scratch — always use scaffolds
- ❌ Never import one entity from another (leads cannot import contacts code)
- ❌ Never hardcode entity labels ("Lead", "Contact") — always use `orgSettings.entityLabels`
- ❌ Never hardcode pipeline stages — always read from `pipelines` table
- ❌ Never skip dedup check on lead/contact creation
- ❌ Never accept `userId` or `orgId` as mutation arguments — derive from context

## Tables Owned
| Table | Description | Key Indexes |
|---|---|---|
| `leads` | Lead records with dynamic fields | `by_orgId`, `by_orgId_and_status`, `by_orgId_and_assignee` |
| `contacts` | Contact records | `by_orgId`, `by_orgId_and_email`, `by_orgId_and_company` |
| `deals` | Deal records | `by_orgId`, `by_orgId_and_pipeline`, `by_orgId_and_stage` |
| `companies` | Company records | `by_orgId`, `by_orgId_and_name` |
| `entity5s` | Optional entity slot | `by_orgId` |
| `entity6s` | Optional entity slot | `by_orgId` |

## Permission Keys
| Key | Roles | Description |
|---|---|---|
| `[entity].create` | owner, admin, member | Create record |
| `[entity].read` | owner, admin, member, viewer | View records |
| `[entity].update` | owner, admin, member | Edit record |
| `[entity].delete` | owner, admin | Delete record |
| `leads.convert` | owner, admin, member | Convert lead → contact/deal |
| `leads.import` | owner, admin | CSV import |
| `deals.moveStage` | owner, admin, member | Drag deal between stages |

## Cross-Module Integration Checklist

> When building entities, you will touch these shared systems. Follow these rules:

### → Notifications
- Every status change + assignment sends a notification via `sendNotification(ctx, { ... })`
- Templates live in `convex/[entity]/notifications.ts` — register at top of `mutations.ts`
- Never pass `orgId`/`userId` — auto-injected from `ctx`

### → Activity Logs
- Every mutation that changes user-visible data MUST call `logActivity()`
- Use `actorType: "user"` for human actions, `actorType: "ai"` when triggered by AI tool

### → AI System
- AI tools in `convex/ai/tools/` call entity mutations — entity modules do NOT import AI code
- Entity field definitions are loaded into AI system prompt dynamically — no manual sync needed
- When AI creates entities, it uses `create_entity` tool → calls the same `orgMutation` as UI

### → Dynamic Fields
- All entity forms use `useDynamicFields(entityType)` to load field definitions
- `EntityFormDialog` scaffold handles dynamic field rendering automatically
- Sensitive fields (`fieldDefinitions.sensitive: true`) are hidden from non-admin AI responses

### → Pipelines
- Entity list/board views use `usePipeline(entityType)` to load stages
- Stage transitions validated server-side via `validateStageTransition()` helper
- `staleAfterDays` checked from pipeline config — never hardcoded

### → Tags
- Shared org-wide tag system via `useTags()` → `<TagPicker>` component
- Tags stored as array of IDs on entity documents

---

## Schema Tables (Full definitions in `schema.md`)

| Table | Purpose |
|---|---|
| `pipelines` | Per-org, per-entityType configurable stages |
| `fieldDefinitions` | Admin-defined custom fields per entity type |
| `fieldValues` | Dynamic field values per record (junction table) |
| `leads` | Prospects — `pipelineId`, `currentStageId`, `stageEnteredAt`, `displayName`, `email` |
| `contacts` | Qualified leads — `displayName`, `companyId` |
| `companies` | B2B first-class entity linking contacts + deals |
| `deals` | Opportunities — `pipelineId`, `currentStageId`, `title`, `companyId` |
| `reminders` | Follow-up scheduling per entity |
| `notes` | Short-form text — `authorType: "user"\|"ai"`, `isPinned`, `isInternal` |
| `tags` + `entityTags` | Org-wide tag system (junction table) |
| `savedViews` | Shareable filters — `scope: "user"\|"org"` |
