# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-07
> Status: **Phase 1 COMPLETE ✅ — Ready for Phase 2**

---

## Phase 1 — COMPLETE ✅

`pnpm tsc --noEmit` → 0 errors  
`npx vitest run --config vitest.convex.config.ts` → 102 passing, 1 skipped

| Area | Status |
|---|---|
| Auth flows (signin, signup, verify, reset, join) | ✅ |
| Onboarding wizard (3 steps, pipeline seeding) | ✅ |
| Shell (sidebar, TopNav, WorkspaceSwitcher, NavUser) | ✅ |
| RBAC (orgRoles, requirePermission DB-backed, PermissionGate) | ✅ |
| invitations.accept assigns roleId | ✅ |
| useOrgPermission loads from DB | ✅ |
| Schema: entityCodeCounters, orbitLinks, platformTemplates, pipelines | ✅ |
| recordCodes.ts: generatePersonCode, generateEntityCode | ✅ |
| notifications/queries.ts + mutations.ts | ✅ |
| featureFlags/queries.ts + useModuleEnabled wired | ✅ |
| Dashboard home page (Get Started + metrics + activity) | ✅ |
| Dead code cleanup (7 files removed) | ✅ |
| 102 tests passing | ✅ |
| vitest.convex.config.ts created | ✅ |

---

## Phase 1 — Low Priority Deferred Items

| ID | Task | Notes |
|---|---|---|
| DEFER-01 | Route group restructure `(private)/` | middleware.ts works; restructure when adding landing page |
| DEFER-02 | `platformOrgIdCounter` table (sequential ORB-001) | Current ORB-XXXXX works; switch in Phase 4 platform admin |
| DEFER-03 | Record code prefix rename background job | Needed for Settings → Record Codes page |
| DEFER-04 | PostHog events (user_signed_up, onboarding_completed) | Add in Phase 2 alongside CRM events |
| DEFER-05 | E2E Playwright tests | Add in Phase 2 |

---

## Phase 2 — CRM Core (NEXT — START HERE)

### Backend First (Convex)

| ID | Task | Priority | Notes |
|---|---|---|---|
| CRM-01 | `convex/crm/entities/leads/mutations.ts` + `queries.ts` | HIGH | list, get, create, update, delete, qualify, convert. Use generatePersonCode(). Follow "One Function, Three Callers" pattern. |
| CRM-02 | `convex/crm/entities/contacts/mutations.ts` + `queries.ts` | HIGH | list, get, create (personCode passed from lead), update, delete |
| CRM-03 | `convex/crm/entities/companies/mutations.ts` + `queries.ts` | HIGH | list, get, create (generateEntityCode "company"), update, delete |
| CRM-04 | `convex/crm/entities/deals/mutations.ts` + `queries.ts` | HIGH | list, get, create (generateEntityCode "deal"), update, changeStage, closeAsWon/Lost |
| CRM-05 | `convex/crm/fields/pipelines/queries.ts` | HIGH | listByOrg, getDefault, getById |
| CRM-06 | `convex/crm/shared/notes/mutations.ts` + `queries.ts` | MEDIUM | create (authorType: "user"|"ai"), list by entity, pin, delete |
| CRM-07 | `convex/crm/shared/reminders/mutations.ts` + `queries.ts` | MEDIUM | create (generateEntityCode "followup"), list, markDone |
| CRM-08 | `convex/crm/shared/tags/mutations.ts` + `queries.ts` | LOW | create, list, attach to entity |
| CRM-09 | `convex/orgs/queries.ts` getDashboardStats | HIGH | Add leadCount, dealCount, pipelineValue when CRM tables exist |

### Schema Additions for Phase 2

| Table | Fields | Notes |
|---|---|---|
| `leads` | personCode, aiContext, pipelineId (optional), currentStageId (optional), status, source, displayName, email, assignedTo | personCode from generatePersonCode() |
| `contacts` | personCode (from lead), aiContext, companyId, displayName, email, assignedTo | personCode PASSED from lead, never regenerated |
| `companies` | companyCode, aiContext, name, industry, website | companyCode from generateEntityCode("company") |
| `deals` | dealCode, personCode, companyCode, aiContext, pipelineId, currentStageId, title, value, assignedTo | dealCode from generateEntityCode("deal") |
| `notes` | entityType, entityId, content, authorId, authorType, isInternal, isPinned | |
| `reminders` | followUpCode, personCode, dealCode, entityType, entityId, dueAt, assignedTo, completedAt | |
| `tags` + `entityTags` | org-wide tags, junction table | |

### Frontend (Next.js)

| ID | Task | Priority | Notes |
|---|---|---|---|
| UI-01 | `core/entities/scaffolds/` — EntityListPage, EntityDetailPage, EntityFormDialog, EntityCard | HIGH | Build once, use 4x |
| UI-02 | Leads list + detail pages | HIGH | First entity, sets pattern |
| UI-03 | Contacts list + detail pages | HIGH | |
| UI-04 | Companies list page | MEDIUM | List only in Phase 2 |
| UI-05 | Deals kanban | HIGH | shadboard UI + dnd-kit logic from shadcn-dashboard-2 |
| UI-06 | Dashboard home page — real CRM metrics | HIGH | Update getDashboardStats with leadCount/dealCount |
| UI-07 | TopNav: NotificationBell (real data) | MEDIUM | From shadboard notification-dropdown.tsx |
| UI-08 | TopNav: LanguageSwitcher | MEDIUM | From shadboard language-dropdown.tsx |
| UI-09 | TopNav: FullscreenToggle | LOW | From shadboard full-screen-toggle.tsx |

### Infrastructure

| ID | Task | Priority | Notes |
|---|---|---|---|
| INFRA-01 | Install @dnd-kit/core + @dnd-kit/sortable | HIGH | For deals kanban |
| INFRA-02 | Install @tanstack/react-table | HIGH | For entity list pages |
| INFRA-03 | `core/kanban/` — KanbanBoard, KanbanColumn, KanbanCard | HIGH | shadboard UI + dnd-kit logic |
| INFRA-04 | `core/datatable/` — DataTable, DataTableToolbar | HIGH | TanStack Table wrapper |

---

## Phase 3 — AI + WhatsApp (PENDING)

See checklist.md for full Phase 3 breakdown.

Key items:
- Vercel AI SDK + Anthropic
- convex/ai/processChat.ts (internalAction)
- 11 AI tools (all call canonical Convex mutations)
- 360dialog WhatsApp webhook
- Trigger.dev voice processor (Whisper → Claude → fieldValues)
- Dubai RE template seeded

---

## Architecture Decisions (Locked — Do Not Change)

| Decision | Value |
|---|---|
| Record codes | personCode on leads/contacts (P-001), entityCodes per type |
| personCode generation | ONLY at lead creation. Passed to contact on conversion. Never regenerated. |
| AI context | 3 layers: platformContext (global) + orgAIContext (org) + entityAIContext (per-entity) |
| OrbitLinks | Lateral connections. personCode handles vertical. |
| Kanban | shadboard UI + dnd-kit logic from shadcn-dashboard-2 |
| One Function Three Callers | Every mutation works for UI + AI + WhatsApp + MCP |
| platformTemplates | In DB, not TypeScript config files |
| RBAC | DB-backed orgRoles, requirePermission() loads from DB |
