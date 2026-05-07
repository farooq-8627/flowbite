# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-08
> Status: **Phase 2 Backend ✅ 100% COMPLETE — Phase 2 Frontend NEXT**

---

## MUST READ Before Starting

- `FRONTEND-DECISIONS.md` — 20 locked rules (entity labels, routes, person page, AI, staleness, etc.)
- `PHASE2-PROGRESS.md` — full file-by-file build plan

---

## Phase 2 Backend — ✅ COMPLETE

All tables, mutations, queries, canonical pattern (steps 1-6), app route groups — done.

---

## Phase 2 Frontend — NEXT (Vertical Slices)

### Install First

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @tanstack/react-table canvas-confetti
pnpm add -D @types/canvas-confetti
```

### Slice 0 — Shared Primitives (do first — all slices depend on these)

| ID | Task | Priority |
|---|---|---|
| S0-01 | `core/datatable/DataTable.tsx` + `DataTableToolbar.tsx` | HIGH |
| S0-02 | `core/kanban/KanbanBoard.tsx` + `KanbanColumn.tsx` + `KanbanCard.tsx` | HIGH |
| S0-03 | `core/entities/scaffolds/EntityListPage.tsx` | HIGH |
| S0-04 | `core/entities/scaffolds/EntityDetailPage.tsx` | HIGH |
| S0-05 | `core/entities/scaffolds/EntityFormDialog.tsx` | HIGH |
| S0-06 | `core/entities/shared/DedupBanner.tsx` | HIGH |
| S0-07 | `core/entities/shared/AssigneeSelect.tsx` | HIGH |
| S0-08 | `core/entities/shared/TagPicker.tsx` | HIGH |
| S0-09 | `core/entities/shared/PersonCodeBadge.tsx` | HIGH |
| S0-10 | `core/entities/shared/StaleIndicator.tsx` (reads stage.staleColor from DB) | HIGH |
| S0-11 | `core/entities/shared/DynamicFieldRenderer.tsx` | HIGH |

### Slice 1 — Leads List + Contacts List

| ID | Task | Priority |
|---|---|---|
| S1-01 | leads: types, hooks (useLeads, useLeadColumns, useLeadMutations) | HIGH |
| S1-02 | leads: LeadList, LeadCard, AddLeadDialog | HIGH |
| S1-03 | leads: LeadsView (replace stub) | HIGH |
| S1-04 | contacts: types, hooks (useContacts, useContactColumns, useContactMutations) | HIGH |
| S1-05 | contacts: ContactList, ContactCard, AddContactDialog | HIGH |
| S1-06 | contacts: ContactsView (replace stub) | HIGH |

### Slice 2 — PersonDetailPage (Unified Person Hub)

| ID | Task | Priority |
|---|---|---|
| S2-01 | `convex/crm/people/queries.ts` — getByPersonCode (resolves lead or contact) | HIGH |
| S2-02 | `app/(private)/dashboard/[orgSlug]/people/[personCode]/page.tsx` | HIGH |
| S2-03 | `core/entities/people/views/PersonDetailView.tsx` | HIGH |
| S2-04 | `core/entities/people/components/PersonHeader.tsx` | HIGH |
| S2-05 | `core/entities/people/components/PersonSidebar.tsx` | HIGH |
| S2-06 | `core/entities/people/components/PersonDealsTab.tsx` | HIGH |
| S2-07 | `core/entities/people/components/PersonRemindersTab.tsx` | HIGH |
| S2-08 | `core/entities/people/components/ActivityChatTab.tsx` | HIGH |
| S2-09 | `core/entities/people/components/ConvertLeadDialog.tsx` | HIGH |

### Slice 3 — Companies

| ID | Task | Priority |
|---|---|---|
| S3-01 | companies: types, hooks | MEDIUM |
| S3-02 | companies: CompanyList, CompanyDetail, AddCompanyDialog | MEDIUM |
| S3-03 | companies: CompaniesView (replace stub) | MEDIUM |

### Slice 4 — Deals (Kanban Primary)

| ID | Task | Priority |
|---|---|---|
| S4-01 | deals: types, hooks (useDeals, useDealColumns, useDealMutations) | HIGH |
| S4-02 | deals: DealKanban, DealList, DealCard, DealDetail | HIGH |
| S4-03 | deals: AddDealDialog, CloseAsDoneDialog | HIGH |
| S4-04 | deals: DealsView + DealDetailView (replace stubs) | HIGH |

### Slice 5 — Unified Timeline

| ID | Task | Priority |
|---|---|---|
| S5-01 | `convex/crm/shared/timeline/queries.ts` — getForPerson, getForEntity, getForOrg | HIGH |
| S5-02 | `core/timelines/hooks/useEntityTimeline.ts` | HIGH |
| S5-03 | `core/timelines/components/UnifiedTimeline.tsx` | HIGH |
| S5-04 | `core/timelines/components/TimelineEntry.tsx` + NoteEntry + ReminderEntry | HIGH |
| S5-05 | `core/timelines/components/NoteComposer.tsx` | HIGH |
| S5-06 | `core/timelines/components/TimelineFilters.tsx` | MEDIUM |

### Slice 6 — Settings Pages

| ID | Task | Priority |
|---|---|---|
| S6-01 | GeneralSettingsView (entity labels, staleness defaults) | MEDIUM |
| S6-02 | MembersSettingsView | MEDIUM |
| S6-03 | RolesSettingsView (GitHub-style permission picker) | MEDIUM |
| S6-04 | BillingSettingsView | MEDIUM |
| S6-05 | PipelinesSettingsView (stage drag-reorder + stale thresholds + colors) | HIGH |
| S6-06 | AppearanceSettingsView | LOW |

### Slice 7 — Dashboard Home (Real Metrics)

| ID | Task | Priority |
|---|---|---|
| S7-01 | Update `getDashboardStats` query (leadCount, dealCount, pipelineValue, staleDeals) | HIGH |
| S7-02 | Replace DashboardHomeView placeholder with real metric cards | HIGH |

---

## Phase 3 — AI + WhatsApp (PENDING)

- `convex/ai/processChat.ts` — internalAction
- `convex/ai/systemPrompt.ts` — 3-layer prompt builder
- `convex/ai/tools/` — 11 core tools (everything user can do)
- WhatsApp webhook + Trigger.dev voice processor
- AI context rebuild (step 7 of canonical pattern)
- `convex/crm/shared/timeline/queries.ts::getForOrg` — platform timeline (admin only)
