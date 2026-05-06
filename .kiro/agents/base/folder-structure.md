# Folder Structure — Production Architecture

> Core infrastructure vs real features. Entities in one scaffold. Settings RBAC-scoped.
> Aligned with `PLAN.md` and `deep-plan.md`.
> Last Updated: 2026-04-25 | Session 3 (Architecture Redesign v2)

---

## Architecture Principle: Core vs Features

**Core** = Things the CRM cannot exist without. They are necessities, not features.
**Features** = Things we build in later phases that add NEW capabilities.

| Category | What Goes Here | Folder |
|---|---|---|
| **Core** | Shell, Entities, AI Assistant, Settings, Timelines, Kanban, DataTable, Onboarding, Notifications, Command Palette, CSV Import | `core/` |
| **Features** | AI Automation, PM, Client Portal, Integrations, Industry Templates | `features/` |

---

## Root

```
flowbite/
├── app/                              # Next.js App Router (thin route files)
├── components/                       # Global shared UI primitives (shadcn)
├── core/                             # Core CRM infrastructure (necessities)
├── features/                         # Real features (AI, Portal, Integrations, etc.)
├── convex/                           # Convex backend
├── trigger/                          # Trigger.dev background jobs
├── lib/                              # Frontend shared utilities
├── styles/                           # Theme presets, global CSS
├── messages/                         # i18n message bundles
├── i18n/                             # next-intl config
└── public/                           # Static assets
```

---

## `core/` — CRM Infrastructure (Necessities)

> Everything here is a NECESSITY. The CRM cannot function without these.
> None of these are "features" — they are the foundation that features build on.

```
core/
├── shell/                            App scaffold (Phase 1)
│   ├── MODULE.md                     ✅
│   ├── config/
│   │   └── navigation.ts             Sidebar nav items + module guards
│   ├── layouts/
│   │   └── DashboardLayout.tsx       Sidebar + TopNav + content + AI panel slot
│   ├── components/
│   │   ├── AppSidebar.tsx            Config-driven sidebar
│   │   ├── TopNav.tsx                Breadcrumb + search + user menu
│   │   ├── UserMenu.tsx              Avatar dropdown
│   │   ├── NotificationBell.tsx      Unread count + dropdown
│   │   ├── WorkspaceSwitcher.tsx     Org switching
│   │   ├── ModuleGuard.tsx           Feature flag gate
│   │   ├── LayoutControls.tsx        Sidebar/theme/font pickers
│   │   └── ThemeSwitcher.tsx         Dark/light/system + preset
│   └── hooks/
│       ├── useViewToggle.ts          'list' | 'board' synced to URL
│       └── useModuleEnabled.ts       Feature flag check
│
├── entities/                         Entity scaffold system (Phase 2)
│   ├── MODULE.md                     Rules, checklist, avoids for ALL entities
│   │
│   ├── scaffolds/                    Reusable page scaffolds (build ONCE, use 6x)
│   │   ├── EntityListPage.tsx        List + Board toggle, toolbar, filters, empty state
│   │   ├── EntityDetailPage.tsx      Tab layout + right sidebar + timeline
│   │   ├── EntityFormDialog.tsx      Create/Edit dialog (react-hook-form + zod + dynamic fields)
│   │   └── EntityCard.tsx            Base kanban card (extended per entity)
│   │
│   ├── shared/                       Shared entity components + hooks
│   │   ├── components/
│   │   │   ├── DynamicFieldRenderer.tsx   Renders fields from fieldDefinitions
│   │   │   ├── TagPicker.tsx              Tag selector for any entity
│   │   │   ├── AssigneeSelect.tsx         User picker for assignment
│   │   │   ├── DedupBanner.tsx            "Possible duplicate" banner
│   │   │   ├── StaleIndicator.tsx         Red border + badge for stale records
│   │   │   └── EmptyState.tsx             AI-suggested empty states
│   │   ├── hooks/
│   │   │   ├── useEntity.ts               Generic entity CRUD hook factory
│   │   │   ├── useEntityColumns.ts        Base column factory
│   │   │   ├── useDynamicFields.ts        Load fieldDefinitions + fieldValues
│   │   │   ├── usePipeline.ts             Load pipeline stages
│   │   │   ├── useTags.ts                 Tag operations
│   │   │   ├── useBulkActions.ts          Select-all + bulk operations
│   │   │   ├── useDedup.ts                Dedup check on create
│   │   │   └── useSavedViews.ts           Filter presets + sidebar pinning
│   │   └── types.ts                       Shared entity types, filter types
│   │
│   ├── leads/                        Lead entity (uses scaffolds)
│   │   ├── types.ts                  Lead type from Doc<"leads">
│   │   ├── hooks/
│   │   │   ├── useLeads.ts           useQuery + filters
│   │   │   └── useLeadColumns.ts     Column defs (extends useEntityColumns)
│   │   └── components/
│   │       ├── LeadList.tsx           Uses EntityListPage scaffold
│   │       ├── LeadBoard.tsx          Uses KanbanBoard + pipeline
│   │       ├── LeadCard.tsx           Extends EntityCard
│   │       ├── LeadDetail.tsx         Uses EntityDetailPage scaffold
│   │       └── AddLeadDialog.tsx      Uses EntityFormDialog
│   │
│   ├── contacts/                     Contact entity (same pattern as leads)
│   │   ├── types.ts
│   │   ├── hooks/
│   │   └── components/
│   │
│   ├── deals/                        Deal entity (Kanban is PRIMARY view)
│   │   ├── types.ts
│   │   ├── hooks/
│   │   └── components/
│   │
│   ├── companies/                    Company entity (list-only, no board)
│   │   ├── types.ts
│   │   ├── hooks/
│   │   └── components/
│   │
│   ├── entity5/                      Optional entity slot (hidden by default)
│   │   ├── types.ts                  e.g. "Property" for Real Estate
│   │   ├── hooks/
│   │   └── components/
│   │
│   └── entity6/                      Optional entity slot (hidden by default)
│       ├── types.ts                  e.g. "Product" for E-commerce
│       ├── hooks/
│       └── components/
│
├── kanban/                           Shared kanban primitives (@dnd-kit)
│   ├── MODULE.md                     ✅
│   ├── components/
│   │   ├── KanbanBoard.tsx           DndContext + columns
│   │   ├── KanbanColumn.tsx          Droppable column
│   │   └── KanbanCard.tsx            Draggable card base
│   └── hooks/
│       └── usePipelineBoard.ts       Pipeline stages → columns
│
├── datatable/                        Shared table primitives (@tanstack/react-table)
│   ├── MODULE.md                     ✅
│   ├── components/
│   │   ├── DataTable.tsx             Table shell + tanstack logic
│   │   ├── DataTableToolbar.tsx      Search + filters + view toggle
│   │   ├── DataTablePagination.tsx   Page controls
│   │   ├── DataTableColumnHeader.tsx Sortable headers
│   │   └── DataTableFacetedFilter.tsx Faceted filters
│   ├── hooks/
│   │   └── useDataTable.ts           Table state management
│   └── types.ts                      Column/filter types
│
├── timelines/                        Two timeline systems
│   ├── MODULE.md
│   ├── unified-timeline/             Everything logged — RBAC-scoped visibility
│   │   ├── components/
│   │   │   ├── UnifiedTimeline.tsx   Chronological feed (logs + notes + reminders + AI + integrations)
│   │   │   ├── TimelineEntry.tsx     Single entry renderer
│   │   │   └── TimelineFilters.tsx   Filter by type
│   │   └── hooks/
│   │       └── useUnifiedTimeline.ts Fetches all timeline data, RBAC-filtered
│   │
│   └── activity-chat/                People conversations + AI on-behalf messages
│       ├── components/
│       │   ├── ActivityChat.tsx       Chat-style thread (member↔member + AI on behalf)
│       │   ├── ChatMessage.tsx        Message bubble (shows "sent by AI on behalf of [user]" badge)
│       │   └── ChatComposer.tsx       Message input
│       └── hooks/
│           └── useActivityChat.ts     Real-time Convex subscription
│
├── notifications/                    Bell + dropdown + email
│   ├── components/
│   │   ├── NotificationDropdown.tsx
│   │   └── NotificationItem.tsx
│   └── hooks/
│       └── useNotifications.ts
│
├── onboarding/                       3-step wizard (Phase 1)
│   ├── MODULE.md
│   ├── components/
│   │   ├── OnboardingWizard.tsx      Step container
│   │   ├── OrgNameStep.tsx           Step 1
│   │   ├── IndustryPicker.tsx        Step 2 → seeds pipeline
│   │   └── CompleteStep.tsx          Step 3 → dashboard
│   └── hooks/
│       └── useOnboarding.ts          Step state + completion
│
├── command-palette/                  Cmd+K global search
│   ├── components/
│   │   └── CommandPalette.tsx         Search entities + pages + actions
│   └── hooks/
│       └── useCommandPalette.ts
│
└── ai/                               [Phase 3] AI Assistant — THE differentiator
    ├── MODULE.md                     Rules, checklist, avoids, security requirements
    ├── components/
    │   ├── ChatSheet.tsx             Right-side resizable panel
    │   ├── ChatMessage.tsx           Message bubble (user + assistant)
    │   ├── ChatToolCall.tsx          Tool result cards
    │   ├── ChatConfirmation.tsx      Destructive action confirm
    │   └── ChatSuggestions.tsx       Proactive prompt suggestions
    ├── stores/
    │   └── chatStore.ts             Zustand: isOpen, pendingMessage
    └── hooks/
        └── useAIChat.ts             useChat() wrapper + page context

NOTE: settings/ is also in core/ (see below)
```

---

## `core/settings/` — Settings (Core Infrastructure)

> Settings are a NECESSITY. You cannot manage org, members, billing, pipelines, or fields without them.

```
core/settings/
├── MODULE.md
├── layouts/
│   └── SettingsLayout.tsx        Settings sidebar nav
└── pages/
    ├── GeneralSettings.tsx       Org name, logo, timezone (admin+)
    ├── MembersPage.tsx           Invite, list, change roles (admin+)
    ├── RolesManager.tsx          GitHub-style permission picker (owner)
    ├── BillingPage.tsx           Plan, usage, upgrade (owner)
    ├── PipelineSettings.tsx      Pipeline CRUD, stages, colors, stale days (admin+)
    ├── FieldSettings.tsx         Field builder, groups, sensitive toggle (admin+)
    ├── TagSettings.tsx           Tag CRUD org-wide (admin+)
    ├── EntityLabels.tsx          Rename Lead/Contact/Deal labels (admin+)
    ├── AppearanceSettings.tsx    Theme, font, layout prefs (any role)
    └── ActivityLogSettings.tsx   View org-wide audit log (admin+)
```

---

## `core/csv-import/` — CSV Import (Core Infrastructure)

> Necessary for onboarding — every org needs to bring existing data in.

```
core/csv-import/
├── MODULE.md
└── components/
    ├── ImportWizard.tsx          Upload → Map → Preview → Import
    ├── FieldMapper.tsx           AI-assisted column → Orbitly field mapping
    └── ImportPreview.tsx         First 10 rows preview before committing

---

## `features/` — Real Features (Built in Later Phases)

> These ADD new capabilities. The CRM works without them. They are sellable differentiators.
> AI is in `core/ai/` — Settings is in `core/settings/` — CSV Import is in `core/csv-import/` — all core infrastructure.

```
features/
├── _registry.ts                      ✅ Feature registration
│
├── project-management/               [Phase 4] PM — Deal Won → Project
│   ├── MODULE.md
│   ├── projects/
│   │   ├── types.ts
│   │   ├── hooks/
│   │   └── components/               Project board, detail, auto-creation
│   ├── tasks/
│   │   ├── types.ts
│   │   ├── hooks/
│   │   └── components/               Task board, list, assignment
│   └── milestones/
│       ├── types.ts
│       ├── hooks/
│       └── components/               Milestone timeline
│
├── client-portal/                    [Phase 5] External client/partner access
│   ├── MODULE.md
│   ├── layouts/
│   │   └── PortalLayout.tsx          Separate from dashboard (no sidebar)
│   ├── components/
│   │   ├── PortalDashboard.tsx       Client's project view
│   │   ├── PortalFiles.tsx           Deliverables download
│   │   ├── PortalInvitation.tsx      Invite flow
│   │   └── PortalAI.tsx              Scoped AI for client role
│   └── hooks/
│       └── usePortalContext.ts       Client-scoped data
│
├── integrations/                     [Phase 6] Data bridges (inbound only)
│   ├── MODULE.md
│   ├── components/
│   │   ├── IntegrationWizard.tsx     Connect → Map → Sync (3 steps)
│   │   ├── FieldMapper.tsx           Map external fields to Orbitly fields
│   │   ├── StagingReview.tsx         Admin reviews unmapped fields
│   │   └── IntegrationCard.tsx       Status card per integration
│   └── hooks/
│       └── useIntegrations.ts
│
├── ai-automation/                    [Phase 7] AI proactive + scheduled
│   ├── MODULE.md
│   ├── components/
│   │   ├── MorningBriefing.tsx       Daily AI summary card
│   │   ├── DraftPreview.tsx          AI email/WhatsApp draft approval
│   │   └── ProactiveSuggestion.tsx   "This deal is stuck" cards
│   └── hooks/
│       └── useMorningBriefing.ts
│
├── industry-templates/               [Phase 2] Config bundles for setup
│   ├── MODULE.md
│   └── config/
│       ├── b2b-sales.ts             Pipeline + fields + labels + metrics + AI persona
│       ├── freelancer.ts
│       └── productivity.ts
```

---

## `convex/` — Backend

```
convex/
├── schema.ts                         ✅
├── auth.ts                           ✅
├── auth.config.ts                    ✅
├── http.ts                           ✅
│
├── _shared/                          ✅ Shared infrastructure
│   ├── validators.ts                 ✅
│   ├── types.ts                      ✅
│   ├── constants.ts                  ✅
│   ├── errors.ts                     ✅
│   └── utils.ts
│
├── _functions/                       ✅ Function builders
│   ├── authenticated.ts              ✅
│   ├── admin.ts                      ✅
│   └── system.ts                     Internal system functions
│
├── users/                            ✅
├── orgs/                             ✅
├── invitations/                      ✅
├── notifications/                    ✅ (helpers)
├── activityLogs/                     ✅ (helpers)
│
├── pipelines/                        Pipeline CRUD + stage management
│   ├── queries.ts
│   ├── mutations.ts
│   └── helpers.ts                    validateStage, seedDefaults
│
├── fieldDefinitions/                 Dynamic field schema
│   ├── queries.ts
│   └── mutations.ts
│
├── fieldValues/                      Dynamic field data
│   ├── queries.ts
│   └── mutations.ts
│
├── tags/                             Org-wide tag system
│   ├── queries.ts
│   └── mutations.ts
│
├── savedViews/                       Filter presets
│   ├── queries.ts
│   └── mutations.ts
│
├── notes/                            Notes per entity
│   ├── queries.ts
│   ├── mutations.ts
│   └── helpers.ts
│
├── reminders/                        Follow-up reminders
│   ├── queries.ts
│   └── mutations.ts
│
├── dedup/                            Shared dedup engine (leads + contacts)
│   └── helpers.ts
│
├── leads/                            Lead entity backend
│   ├── queries.ts
│   └── mutations.ts
│
├── contacts/                         Contact entity backend
│   ├── queries.ts
│   └── mutations.ts
│
├── companies/                        Company entity backend
│   ├── queries.ts
│   └── mutations.ts
│
├── deals/                            Deal entity backend
│   ├── queries.ts
│   ├── mutations.ts
│   └── helpers.ts                    forecast, won/lost handling
│
├── entity5/                          Optional entity slot backend
│   ├── queries.ts
│   └── mutations.ts
│
├── entity6/                          Optional entity slot backend
│   ├── queries.ts
│   └── mutations.ts
│
├── activityChat/                     People-only conversations
│   ├── queries.ts                    listByEntity, listByProject
│   └── mutations.ts                  send, delete (member-only chat)
│
├── ai/                               [Phase 3] AI core
│   ├── processChat.ts                internalAction — AI runtime
│   ├── systemPrompt.ts               Dynamic prompt builder
│   ├── conversations.ts              Conversation CRUD
│   ├── toolRegistry.ts               Role → tool mapping
│   └── tools/                        All AI tools (10 core tools from PLAN.md)
│       ├── search.ts                 search_crm — cross-entity search
│       ├── update.ts                 update_entity — any field on any entity
│       ├── create.ts                 create_entity — lead, contact, deal
│       ├── notes.ts                  add_note — note on any entity
│       ├── reminders.ts              set_reminder — follow-up
│       ├── detail.ts                 get_entity_detail — full timeline
│       ├── analytics.ts              get_summary — pipeline, overdue, forecast
│       ├── email.ts                  draft_email — from deal/contact history
│       ├── dateSearch.ts             search_by_date — by dates
│       ├── bulk.ts                   bulk_update — with confirmation
│       ├── workspace.ts              AI Workspace Setup (post-onboarding)
│       └── scraping.ts              [Phase 7] Web scraping tools
│
├── projects/                         [Phase 4]
│   ├── queries.ts
│   ├── mutations.ts
│   └── helpers.ts                    auto-create from won deal
│
├── tasks/                            [Phase 4]
│   ├── queries.ts
│   └── mutations.ts
│
├── milestones/                       [Phase 4]
│   ├── queries.ts
│   └── mutations.ts
│
├── integrations/                     [Phase 6]
│   ├── queries.ts
│   ├── mutations.ts
│   └── helpers.ts
│
└── platform/                         [Phase 4+] Platform admin
    ├── queries.ts
    └── mutations.ts
```

---

## `app/` — Next.js Routes (thin)

```
app/
├── [locale]/
│   ├── layout.tsx                    ✅ Root layout
│   ├── page.tsx                      ✅ Landing page
│   ├── globals.css                   ✅
│   ├── signin/                       ✅
│   ├── signup/
│   ├── pricing/page.tsx
│   ├── onboarding/
│   │   ├── layout.tsx                No sidebar
│   │   └── page.tsx                  3-step wizard
│   ├── dashboard/
│   │   ├── layout.tsx                Auth guard
│   │   └── [orgSlug]/
│   │       ├── layout.tsx            DashboardLayout wrapper
│   │       ├── page.tsx              Dashboard home
│   │       ├── leads/
│   │       │   ├── page.tsx          LeadList (thin — imports from core/)
│   │       │   └── [id]/page.tsx     LeadDetail
│   │       ├── contacts/
│   │       ├── companies/
│   │       ├── deals/
│   │       ├── projects/             [Phase 4]
│   │       ├── tasks/                [Phase 4]
│   │       ├── messages/             [Phase 4] Activity chat
│   │       └── settings/
│   │           ├── general/page.tsx
│   │           ├── members/page.tsx
│   │           ├── roles/page.tsx
│   │           ├── billing/page.tsx
│   │           ├── pipelines/page.tsx
│   │           ├── fields/page.tsx
│   │           ├── tags/page.tsx
│   │           ├── entity-labels/page.tsx
│   │           ├── appearance/page.tsx
│   │           └── activity-log/page.tsx
│   └── portal/                       [Phase 5] Client portal
│       └── [orgSlug]/
│           ├── layout.tsx            PortalLayout (no sidebar)
│           └── page.tsx
├── api/
│   ├── ai/chat/route.ts              [Phase 3] Streaming proxy
│   └── webhooks/
│       ├── stripe/route.ts           [Phase 2]
│       └── channels/                 [Phase 5+]
```

---

## Two Timeline Systems

### 1. Unified Timeline (RBAC-scoped)
Shows EVERYTHING: activity logs, notes, AI actions, reminders, integration events.
**Visibility is role-based:**
- **Admin/Owner**: Sees everything in the org
- **Member**: Sees everything related to their assigned entities
- **Client**: Sees only what's related to them (their reminders, their notes, their project updates)
- **Viewer**: Read-only view of assigned entity timelines

### 2. Activity Chat (People + AI on behalf)
Human conversations + AI-sent messages on user's behalf. No logs, no reminders, no notifications, no integration events.
- Member ↔ Member about an entity ("Hey, did you follow up with Ahmed?")
- Member ↔ Member about a project ("Design mockups are ready for review")
- Simple messages between team members
- **AI on behalf**: User says "Send the project status to Ahmed" → AI sends message in activity-chat as `senderType: "ai_on_behalf"` with `onBehalfOf: userId` → message shows badge "Sent by AI on behalf of [User Name]"
- Real-time via Convex subscription
- Renders as chat bubbles, not timeline entries
- `senderType`: `"user"` (typed by human) or `"ai_on_behalf"` (AI sent for user)

---

## `trigger/` — Background Jobs

```
trigger/
├── imports/
│   └── processCSVImport.ts           CSV background processing
├── scraping/                         [Phase 7]
│   └── scrapeWebLeads.ts
├── crons/                            [Phase 7]
│   ├── morningBriefing.ts
│   └── staleDealDetector.ts
└── emails/
    └── sendTransactional.ts
```

---

## Key Rules Extracted

1. **core/ items are NOT features** — they are necessities. Don't treat them as optional.
2. **features/ items ARE features** — they can be gated, disabled, sold as upgrades.
3. **All 6 entities use the SAME scaffolds** — EntityListPage, EntityDetailPage, EntityFormDialog.
4. **Settings are in `core/settings/`** — always available, RBAC-scoped pages (not plan-gated).
5. **Two timelines, not one** — unified (everything, RBAC-filtered) + activity-chat (people only).
6. **AI tools are in `convex/ai/tools/`** — NOT per-module. 10 core tools from PLAN.md.
7. **Entity slots 5 & 6** — hidden by default, activated + renamed per industry.
