# PHASE 2 — CRM Core Progress

> Last Updated: 2026-05-14
> Status: **Backend 100% COMPLETE — Frontend Slice 1 COMPLETE (polish pass 4)**
> Score: Backend 100/100 · Frontend Slice 1 ~95/100

---

## 🆕 2026-05-14 — Polish pass 4

Focus: universal view options for every entity, dynamic board grouping, and
settings cleanup.

**Frontend additions / rewrites:**
- `ViewOptionsMenu` (NEW) — universal replacement for the old lead-only
  `BoardOptionsMenu`. Supports list + board modes, dynamic group-by selector
  (backed by `ALLOWED_BOARD_GROUP_BY[slot]`), per-session field visibility
  toggles, and terminal-status reveal. Wired into Leads, Contacts, Deals,
  and Companies.
- Dynamic board grouping end-to-end — users can group by status/assignee/
  source (leads), assignee/company (contacts), stage/assignee (deals),
  industry/assignee (companies). Drag updates the active axis (status swap
  on lead, assigned-user swap on any entity). `board-grouping.ts` helper
  hides the grouped-by field from the card + reveals a complementary one.
- `useCustomFields` hook — reads `fieldDefinitions` per entity and feeds
  `ViewOptionsMenu.extraFields` so user-defined fields appear alongside
  built-ins in the "card fields" toggle list.
- `FieldValueRenderer` — added `file`, `files`, `date`, `number`, `checkbox`
  render kinds to support dynamic custom-field rendering.
- Settings Modules group — `getSettingsGroups(labels)` factory so sub-group
  labels track entity renames (e.g. "Leads" → "Inquiries"). URL uses the
  renamed slug (`?tab=inquiries`). `shell:section-requested` event lets
  sub-group pill clicks auto-switch the active tab + scroll.
- `QuickAddMenu` — creation from any page now navigates to the entity
  route with `?new=1`; each view's `useQuickAddListener` reads the param
  and auto-opens its drawer. Fixes global shortcuts not firing off the
  entity page.
- `AddLeadDrawer` — "Works at a {company}?" section with Skip/Existing/New
  tabs. "Existing" = Select of all companies. "New" = inline
  name/industry/website form; the company is created alongside the lead.
- `LeadCard` — single-click convert = instant (no form); double-click =
  open full convert drawer (with "also create a deal" option). Separate
  Lost (trash) icon. Overflow menu has "Convert with options…" + Delete.
- `LeadsView.handleMarkLost` — updates lead status to "lost" in one click.
- Lead status table column — renders colored pill matching the kanban
  column colour (single source of truth: `getStatusColor`).
- Contacts — `revertToLead` mutation. Soft-deletes the contact + flips the
  origin lead back to status="new". Row actions menu exposes it.
- Tag color picker (Settings → CRM → Tags) — 18 preset colours + a
  `<input type="color">` fallback for custom. Circles shrunk to size-4
  with hover-scale.
- CopyField, PersonCodeBadge, PersonDisplay — all `hover:underline`
  styles removed for a cleaner look.
- Pipeline `getDefault` — falls back to the first pipeline for the entity
  if no explicit default exists. Unblocks deal creation for new orgs.

**Backend additions:**
- `convex/crm/entities/leads/mutations.update` — added `source` to args.
- `convex/crm/entities/contacts/mutations.revertToLead` — new.
- `convex/crm/fields/pipelines/queries.getDefault` — first-pipeline fallback.

**Verification gate:**
```bash
pnpm typecheck                  →  ✅ 0 errors
pnpm exec biome check .         →  ✅ 0 errors / 0 warnings
pnpm build                      →  ✅ 20 static pages, 13s compile
```

**Deferred to next session:**
- `AddCompanyDrawer` restructure — drop `teamMembers` concept in favour of
  a multi-assignee + persons-without-company multi-select. Requires a
  schema decision on whether `companies.personCodes[]` or
  `contacts/leads.companyId` is the source of truth.
- Tag-axis board grouping — needs a batched tag-per-entity query.
- `PersonDisplay.show[]` card-level toggles to hide name/email
  independently. The plumbing exists; cards just don't expose it yet —
  users can already control visibility via Settings → Modules → {slot}
  → Card Fields.
- Entity-detail "Files" tab — file storage lib is done; just needs
  mounting once detail views are built (Slice 2).

---

## Verification

```bash
pnpm tsc --noEmit                                          →  ✅ 0 errors
npx vitest run --config vitest.convex.config.ts            →  ✅ 85 passing, 1 skipped
```

---

## ✅ BACKEND — 100% COMPLETE

### Schema Tables (all updated with audit fixes)

| Table | Status | Key Fields Added This Session |
|---|---|---|
| `leads` | ✅ | `normalizedPhone`, `by_org_and_email`, `by_org_and_normalizedPhone` indexes |
| `contacts` | ✅ | `normalizedPhone`, `by_org_and_email`, `by_org_and_normalizedPhone` indexes |
| `companies` | ✅ | — |
| `deals` | ✅ | — |
| `notes` | ✅ | `isActivityChat` field (true=message, false/undefined=note) |
| `reminders` | ✅ | — |
| `tags` + `entityTags` | ✅ | — |
| `fieldDefinitions` | ✅ | — |
| `fieldValues` | ✅ | — |
| `savedViews` | ✅ | — |
| `pipelines` | ✅ | `staleColor`, `warningAfterDays`, `warningColor` added to stage validator |
| `entityCodeCounters` | ✅ | — |
| `activityLogs` | ✅ | `personCode` top-level field + `by_org_and_personCode` index |
| `orbitLinks` | ✅ | — |
| `aiConversations` | ✅ | NEW — Phase 3 placeholder (empty) |
| `aiMessages` | ✅ | NEW — Phase 3 placeholder (empty) |

### Convex Functions

| Module | Queries | Mutations | Status |
|---|---|---|---|
| `leads` | list✅, getById✅, getByPersonCode✅ | create✅, update✅, convertToContact✅, updateAiContext✅, softDelete✅ | ✅ |
| `contacts` | list✅, getById✅, getByPersonCode✅ | create✅, update✅, updateAiContext✅, softDelete✅ | ✅ |
| `companies` | list✅, getById✅, getByCompanyCode✅ | create✅, update✅, softDelete✅ | ✅ |
| `deals` | list✅, listGroupedByStage✅, getById✅, getByDealCode✅ | create✅, update✅, moveToStage✅, closeAsDone✅, softDelete✅ | ✅ |
| `pipelines` | listByOrg✅, getDefault✅, getById✅ | create✅, addStage✅, removeStage✅, reorderStages✅, deletePipeline✅ | ✅ |
| `dedup/helpers` | — | runDedup (email/phone via index, name fuzzy) | ✅ |
| `notes` | listForEntity✅, listForPerson✅ | create✅, update✅, togglePin✅, remove✅ | ✅ |
| `reminders` | listForPerson✅, getDueToday✅, listOpen✅ | create✅, complete✅, update✅, remove✅ | ✅ |
| `tags` | listByOrg✅, getTagsForEntity✅ | create✅, remove✅, attachToEntity✅, detachFromEntity✅ | ✅ |
| `fieldDefinitions` | listByEntity✅, getById✅ | create✅, update✅, reorder✅, remove✅ | ✅ |
| `fieldValues` | getForEntity✅ | set✅, bulkSet✅ | ✅ |
| `savedViews` | listByEntity✅, listPinned✅ | create✅, update✅, togglePin✅, remove✅ | ✅ |
| `people/queries` | getByPersonCode✅, listAll✅, searchByCode✅ | — | ✅ NEW |
| `timeline/queries` | getForPerson✅, getForOrg✅ | — | ✅ NEW |
| `orgs/queries` | getEntityLabels✅ | — | ✅ NEW |
| `ai/internal` | — | rebuildEntityContext (no-op, Phase 3) | ✅ NEW |

### Canonical Pattern Compliance

| Step | Status | Notes |
|---|---|---|
| 1. RBAC: requireOrgMember() + requireRole() | ✅ | All mutations |
| 2. Dedup: runDedup() | ✅ | leads.create, contacts.create — now uses indexes |
| 3. Record codes: generatePersonCode() / generateEntityCode() | ✅ | All entities |
| 4. DB insert/patch with updatedAt | ✅ | All mutations |
| 5. logActivity() | ✅ | All mutations — now accepts personCode param |
| 6. sendNotification() | ✅ | On assignment, stage change, reminder create |
| 7. AI context rebuild | ⬜ | no-op wired in convex/ai/internal.ts — Phase 3 fills body |

### Performance Fixes Applied

| Issue | Fix |
|---|---|
| `.collect()` on all list queries | Replaced with best-fit index + `.take(cap*N)` |
| Timeline full org scan | `activityLogs.personCode` field + index — O(log n) |
| Dedup phone scan (1000 rows) | `normalizedPhone` field + index — O(log n) |
| Dedup email scan | `by_org_and_email` index — O(log n) |

### RBAC Fixes Applied

| Issue | Fix |
|---|---|
| `updateMemberRole` privilege escalation | Now syncs both `role` string AND `roleId` FK |
| `notes.viewInternal` undefined | Added to PERMISSIONS map (owner + admin) |

---

## ⬜ FRONTEND — VERTICAL SLICES

### Install Dependencies First

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @tanstack/react-table canvas-confetti
pnpm add -D @types/canvas-confetti
```

Then run `npx convex dev` once to regenerate `_generated/api.ts` (needed for `getEntityLabels`).

---

### ⚠️ PRE-BUILD CHECKLIST (run before starting ANY slice)

These are non-negotiable. Violating any of these will cause bugs that are expensive to fix later.

```
□ Read BUILD-ORDER.md — know which files to read before coding
□ Read FRONTEND-DECISIONS.md — all 20 locked rules
□ Run: pnpm tsc --noEmit → must be 0 errors before you start
□ Run: npx vitest run → must be 70 passing before you start
□ Never hardcode entity labels ("Lead", "Contact") — use useEntityLabels(orgId)
□ Never hardcode route slugs ("/leads") — use labels[slot].slug
□ Never use directional CSS (ml-*, mr-*, pl-*, pr-*) — use ms-*, me-*, ps-*, pe-*
□ Never hardcode border-radius — use rounded-[--radius]
□ Never hardcode app name — use APP_CONFIG.name
□ Every list query must use .take(n) — never .collect()
□ Every mutation must call logActivity() with personCode when person-related
□ Every mutation must call sendNotification() when assignedTo changes
□ Permission gates on every section — client portal ready from day one
□ After finishing: pnpm tsc --noEmit → 0 errors, tests → 70 passing
```

---

### Slice 0 — Shared Primitives ⬜

**Build first. Every other slice depends on these.**

**Pre-build checklist for Slice 0:**
```
□ Read: core/shell/ directory structure (understand existing layout)
□ Read: components/ui/ (understand available shadcn components)
□ Read: convex/schema.ts (understand all table shapes)
□ Confirm: @dnd-kit/core, @tanstack/react-table installed
```

**Files to build:**

| File | Purpose | Notes |
|---|---|---|
| `core/datatable/DataTable.tsx` | TanStack Table: toolbar, search, column visibility, pagination | |
| `core/datatable/DataTableToolbar.tsx` | Filter bar + view toggle + add button slot | |
| `core/kanban/KanbanBoard.tsx` | @dnd-kit board: columns + drag between columns | |
| `core/kanban/KanbanColumn.tsx` | Single column: header + card list + drop zone | |
| `core/kanban/KanbanCard.tsx` | Base draggable card: personCode badge, name, assignee, stale indicator | |
| `core/entities/scaffolds/EntityListPage.tsx` | Assembles DataTable + toolbar + empty state + skeleton | |
| `core/entities/scaffolds/EntityDetailPage.tsx` | Sticky header + tabs + content area | |
| `core/entities/scaffolds/EntityFormDialog.tsx` | react-hook-form + zod + dynamic fields + dedup banner | |
| `core/entities/shared/DedupBanner.tsx` | Shows duplicate candidates with confidence badges | |
| `core/entities/shared/AssigneeSelect.tsx` | User picker dropdown | |
| `core/entities/shared/TagPicker.tsx` | Multi-select tag input | |
| `core/entities/shared/StaleIndicator.tsx` | Color-coded stale border/badge — reads from `stage.staleColor` | Never hardcode colors |
| `core/entities/shared/DynamicFieldRenderer.tsx` | Renders fieldDefinitions + fieldValues for any entity | |

**Rules for Slice 0:**
- `KanbanCard` stale border color from `stage.staleColor` — never hardcoded
- `PersonCodeBadge` already built at `core/entities/shared/PersonCodeBadge.tsx` — import it
- `EntityListPage` handles loading skeleton, empty state, view toggle — entity components ≤ 30 lines
- `StaleIndicator` accepts `daysInStage`, `staleAfterDays`, `staleColor`, `warningAfterDays`, `warningColor` as props

---

### Slice 1 — Entity List Views ⬜

**Route:** `/{locale}/{orgSlug}/[entitySlug]` → `EntitySlugView` resolves slug → entity type

**Pre-build checklist for Slice 1:**
```
□ Slice 0 complete
□ Read: convex/crm/entities/leads/queries.ts (understand list args)
□ Read: convex/crm/entities/contacts/queries.ts
□ Read: convex/crm/entities/deals/queries.ts
□ Read: convex/crm/entities/companies/queries.ts
□ Read: core/shell/hooks/useEntityLabels.ts (understand label system)
□ Confirm: npx convex dev run to regenerate api.ts (getEntityLabels must be typed)
□ Confirm: [entitySlug]/page.tsx stub exists at app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx
```

**Files to build:**

| File | Purpose |
|---|---|
| `core/entities/views/EntitySlugView.tsx` | Resolves slug → entity type → renders correct list view |
| `core/entities/leads/views/LeadsView.tsx` | Replaces stub — list + board toggle |
| `core/entities/leads/hooks/useLeads.ts` | `useQuery(api.crm.entities.leads.list)` + filter state |
| `core/entities/leads/hooks/useLeadColumns.ts` | TanStack columns: personCode, name, status, source, assignee |
| `core/entities/leads/components/LeadCard.tsx` | Extends KanbanCard: status badge, source |
| `core/entities/leads/components/AddLeadDialog.tsx` | EntityFormDialog config for leads |
| `core/entities/contacts/views/ContactsView.tsx` | Replaces stub |
| `core/entities/contacts/hooks/useContacts.ts` | list with companyId/assignedTo filters |
| `core/entities/contacts/hooks/useContactColumns.ts` | personCode, name, company, email, phone, assignee |
| `core/entities/contacts/components/AddContactDialog.tsx` | EntityFormDialog config for contacts |
| `core/entities/companies/views/CompaniesView.tsx` | Replaces stub |
| `core/entities/companies/hooks/useCompanies.ts` | list with assignedTo filter |
| `core/entities/deals/views/DealsView.tsx` | Replaces stub — kanban default + list toggle |
| `core/entities/deals/hooks/useDeals.ts` | listGroupedByStage for kanban, list for table |
| `core/entities/deals/components/DealCard.tsx` | Extends KanbanCard: value (permission-gated), stale border |
| `core/entities/deals/components/AddDealDialog.tsx` | EntityFormDialog + pipeline/stage picker |

**Rules for Slice 1:**
- Converted leads hidden by default — "Show Converted" toggle
- Deal value hidden from `member` role — `hasPermission(role, "deals.viewValues")` gate
- `EntitySlugView` does DB lookup: `useEntityLabels(orgId)` → find matching slug → render view
- If slug doesn't match any entity → render 404 component
- Kanban is primary for deals, list is secondary (`?view=list` query param)

---

### Slice 2 — ProfileView (Unified Person Hub) ⬜

**Route:** `/{locale}/{orgSlug}/profile/[personCode]`

**Pre-build checklist for Slice 2:**
```
□ Slice 0 + Slice 1 complete
□ Read: convex/crm/people/queries.ts (getByPersonCode — resolves to lead or contact)
□ Read: convex/crm/shared/notes/queries.ts (listForPerson)
□ Read: convex/crm/shared/reminders/queries.ts (listForPerson)
□ Read: convex/crm/entities/deals/queries.ts (list with personCode filter)
□ Read: FRONTEND-DECISIONS.md Rules 1 and 2 (profile page tabs + notes/messages distinction)
□ Confirm: notes.isActivityChat field exists in schema (it does — added this session)
□ Confirm: all logActivity() calls in leads/contacts mutations pass personCode
```

**⚠️ BEFORE BUILDING SLICE 2 — add personCode to all logActivity calls:**
```typescript
// In leads/mutations.ts create():
await logActivity(ctx, { ..., personCode });

// In leads/mutations.ts convertToContact():
await logActivity(ctx, { ..., personCode: lead.personCode });

// In contacts/mutations.ts create():
await logActivity(ctx, { ..., personCode: args.personCode ?? personCode });

// In deals/mutations.ts moveToStage():
await logActivity(ctx, { ..., personCode: deal.personCode });
```
Without this, the Timeline tab will be empty for all existing records.

**Files to build:**

| File | Purpose |
|---|---|
| `core/entities/people/views/ProfileView.tsx` | Main view — resolves personCode → lead or contact |
| `core/entities/people/components/ProfileHeader.tsx` | Sticky: personCode badge, name, status/stage badge, quick actions |
| `core/entities/people/components/OverviewTab.tsx` | Contact info, assignee, company, tags, custom fields, quick actions |
| `core/entities/people/components/MessagesTab.tsx` | Chat bubble UI — notes where `isActivityChat === true` |
| `core/entities/people/components/TimelineTab.tsx` | Feed UI — activityLogs + notes + reminders (UnifiedTimeline from Slice 5) |
| `core/entities/people/components/NotesTab.tsx` | Editable notes — `isActivityChat !== true`. AI briefing at top. |
| `core/entities/people/components/DealsTab.tsx` | All deals linked via personCode |
| `core/entities/people/components/RemindersTab.tsx` | All reminders for this person |
| `core/entities/people/components/ConvertLeadDialog.tsx` | Convert lead → contact + optional deal |
| `core/entities/people/components/PersonCard.tsx` | Compact popover version of OverviewTab (for deal cards) |

**Tab structure (LOCKED — do not change):**

| Tab | Data source | Permission gate |
|---|---|---|
| Overview | lead/contact fields + fieldValues | contacts.view |
| Messages | notes where `isActivityChat === true` | contacts.view |
| Timeline | activityLogs + notes + reminders via `getForPerson` | contacts.view (internal filtered) |
| Notes | notes where `isActivityChat !== true` | notes.view |
| Deals | deals where `personCode === P-001` | deals.view |
| Reminders | reminders where `personCode === P-001` | reminders.view |
| Files | Phase 3 placeholder | files.view |

**Rules for Slice 2:**
- Messages tab: filter notes by `isActivityChat === true`
- Notes tab: filter notes by `isActivityChat !== true` (or undefined)
- Timeline tab: uses `getForPerson` query — already indexed by personCode
- Internal notes (`isInternal: true`) only shown if `hasPermission(role, "notes.viewInternal")`
- `PersonCard` = compact version of OverviewTab — same data, different container (popover)
- `ConvertLeadDialog` must call `leads.convertToContact` — NOT a generic update

---

### Slice 3 — Company Detail ⬜

**Route:** `/{locale}/{orgSlug}/companies/[id]`

**Pre-build checklist for Slice 3:**
```
□ Slice 0 complete
□ Read: convex/crm/entities/companies/queries.ts
□ Read: convex/crm/entities/contacts/queries.ts (list with companyId filter)
□ Read: convex/crm/entities/deals/queries.ts (list with companyCode filter — add if missing)
□ Confirm: companies/[id]/page.tsx stub exists
```

**Files to build:**

| File | Purpose |
|---|---|
| `core/entities/companies/views/CompanyDetailView.tsx` | Main view |
| `core/entities/companies/components/CompanyHeader.tsx` | companyCode badge, name, industry, website |
| `core/entities/companies/components/CompanyContactsTab.tsx` | All contacts at this company |
| `core/entities/companies/components/CompanyDealsTab.tsx` | All deals linked to this company |
| `core/entities/companies/components/CompanyTimelineTab.tsx` | Timeline for company entity |

**Tabs:** Overview | Contacts | Deals | Timeline

---

### Slice 4 — Deal Detail ⬜

**Route:** `/{locale}/{orgSlug}/deals/[id]`

**Pre-build checklist for Slice 4:**
```
□ Slice 0 + Slice 1 complete
□ Read: convex/crm/entities/deals/mutations.ts (moveToStage, closeAsDone)
□ Read: convex/crm/fields/pipelines/queries.ts (getById — need stages for stage picker)
□ Confirm: deals/[id]/page.tsx stub exists
```

**Files to build:**

| File | Purpose |
|---|---|
| `core/entities/deals/views/DealDetailView.tsx` | Main view |
| `core/entities/deals/components/DealHeader.tsx` | dealCode badge, title, value (permission-gated), stage badge |
| `core/entities/deals/components/DealStageSelector.tsx` | Stage picker — calls moveToStage() |
| `core/entities/deals/components/CloseAsDoneDialog.tsx` | finalType picker + outcomeReason — calls closeAsDone() |
| `core/entities/deals/components/DealTimelineTab.tsx` | Timeline for deal entity |

**Rules for Slice 4:**
- Stage changes MUST call `moveToStage()` — never generic `update()`
- Won/lost MUST call `closeAsDone()` — never generic `update()`
- Deal value hidden from `member` role — `hasPermission(role, "deals.viewValues")`
- Won deal → confetti: `canvas-confetti` client-side only, after `closeAsDone` resolves with `finalType: "positive"`

---

### Slice 5 — Unified Timeline Component ⬜

**Pre-build checklist for Slice 5:**
```
□ Slice 2 complete (ProfileView uses this)
□ Read: convex/crm/shared/timeline/queries.ts (getForPerson, getForOrg)
□ Read: FRONTEND-DECISIONS.md — Timeline UI spec (colors, layout)
□ Confirm: activityLogs.personCode field exists in schema (it does — added this session)
□ Confirm: all mutations pass personCode to logActivity() (do this before Slice 5)
```

**Files to build:**

| File | Purpose |
|---|---|
| `core/timelines/hooks/usePersonTimeline.ts` | `useQuery(api.crm.shared.timeline.getForPerson, { orgId, personCode })` |
| `core/timelines/components/UnifiedTimeline.tsx` | Vertical feed: newest first, colored icons, connector lines |
| `core/timelines/components/TimelineEntry.tsx` | Activity log entry renderer |
| `core/timelines/components/NoteEntry.tsx` | Note bubble: author badge, isInternal badge |
| `core/timelines/components/ReminderEntry.tsx` | Reminder card with complete button |
| `core/timelines/components/NoteComposer.tsx` | Add note input at bottom |
| `core/timelines/components/TimelineFilters.tsx` | Filter chips: All / Activity / Notes / Reminders |

**Timeline UI spec (LOCKED):**
```
Layout:   Vertical feed, newest first
Left:     Colored icon circle → vertical connector line → next entry
Center:   Event description + actor name + metadata
Right:    Relative timestamp ("2h ago", "Yesterday")

Colors (from stage config or these defaults):
  created      → #3b82f6  (blue)
  stage_change → #8b5cf6  (purple)
  note         → #eab308  (yellow)
  reminder     → #f97316  (orange)
  ai_action    → #6366f1  (indigo)
  whatsapp     → #22c55e  (green)
  system       → #6b7280  (gray)
```

---

### Slice 6 — Settings Pages ⬜

**Pre-build checklist for Slice 6:**
```
□ Read: convex/orgs/mutations.ts (update, updateMemberRole, removeMember)
□ Read: convex/orgRoles/ (role CRUD)
□ Read: convex/crm/fields/pipelines/ (pipeline CRUD)
□ Read: convex/_shared/permissions.ts (all permission keys — for role editor checkboxes)
□ Confirm: all settings routes exist under app/[locale]/(private)/[orgSlug]/settings/
□ Every settings page MUST be wrapped in PermissionGate — role-gated, never plan-gated
```

**Files to build:**

| File | Purpose | Permission gate |
|---|---|---|
| `core/settings/views/GeneralSettingsView.tsx` | Org name, slug, timezone, currency, entity labels | org.editSettings |
| `core/settings/views/MembersSettingsView.tsx` | Member list + invite + role change | members.view |
| `core/settings/views/RolesSettingsView.tsx` | Role CRUD + permission checkboxes | org.viewSettings |
| `core/settings/views/BillingSettingsView.tsx` | Plan + usage + upgrade | org.viewBilling |
| `core/settings/views/PipelinesSettingsView.tsx` | Pipeline CRUD + stage drag-reorder + stale config | pipelines.manage |
| `core/settings/views/AppearanceSettingsView.tsx` | Theme preset + radius + mode | members.view (all) |

**Rules for Slice 6:**
- `PipelinesSettingsView`: each stage has `staleAfterDays` + `staleColor` + `warningAfterDays` + `warningColor` inputs
- `GeneralSettingsView`: entity label rename (singular, plural, slug) — validate slug against reserved list
- `RolesSettingsView`: permission checkboxes use keys from `PERMISSIONS` map — import from `convex/_shared/permissions.ts`
- Entity label slug validation: must not match `profile`, `settings`, `notifications`, `companies`, `deals`, `join`, `dashboard`, `app`, `help`, `support`, `docs`, `status`, `platform`, `api`, `admin`, `billing`, `auth`, `onboarding`, `signin`, `signup`, `pricing`, `portal`

---

### Slice 7 — Dashboard Real Metrics ⬜

**Pre-build checklist for Slice 7:**
```
□ All other slices complete
□ Read: convex/orgs/queries.ts (getDashboardStats — currently returns memberCount only)
□ Confirm: leads, contacts, deals, reminders tables all have data
```

**Backend to update:**
```typescript
// convex/orgs/queries.ts — getDashboardStats
// Add: leadCount, contactCount, dealCount, pipelineValue, staleDeals, remindersDueToday
// Use Promise.all() — single parallel query, no N+1
```

**Files to build:**

| File | Purpose |
|---|---|
| `core/shell/views/DashboardHomeView.tsx` | Replace placeholder with real metric cards |

**Rules for Slice 7:**
- Single `Promise.all()` for all stats — no N+1 queries
- Metric cards link to pre-filtered list views (e.g., "Stale Deals" → `/deals?filter=stale`)
- "Get Started" card dismissible per-user (`users.dismissedCards[]`)
- AI Morning Briefing slot = Phase 3 placeholder card

---

## Backend Score: 100/100

All issues resolved. The backend is production-ready.

**What was done to reach 100:**
- RBAC refactor: `roleId` is now the single source of truth. `requireOrgMember` and `getOrgMember` both resolve role from `roleId`. `updateMemberRole` takes `roleId` directly. `role` string kept as optional for legacy test compat.
- `useEntityLabels` now uses the correct `api.orgs.queries.getEntityLabels` path (no more `as any`).
- All 85 tests passing.

---

## Architecture Decisions (Locked — See FRONTEND-DECISIONS.md)

| # | Decision |
|---|---|
| 1 | Entity labels always from `orgSettings.entityLabels` — never hardcoded |
| 2 | Route slugs always from `orgSettings.entityLabels[slot].slug` — never hardcoded |
| 3 | Person detail page: one page for lead + contact, slug = personCode (`/profile/P-001`) |
| 4 | Notes tab = editable notes (`isActivityChat !== true`). Messages tab = chat bubbles (`isActivityChat === true`) |
| 5 | Timeline = system log (activityLogs + reminders). AI scans this. Feed UI. |
| 6 | Staleness colors configurable per stage (`stage.staleColor`, `stage.warningColor`) |
| 7 | Client portal ready — permission gates on every section from day one |
| 8 | Kanban is primary for deals; list is secondary toggle |
| 9 | Won deal → confetti (canvas-confetti, client-side only) |
| 10 | Vertical slices — complete one module before starting the next |
| 11 | `[entitySlug]` dynamic route handles ALL entity lists including org-renamed slugs |
| 12 | `profile/`, `settings/`, `notifications/` are static — win over `[entitySlug]` |