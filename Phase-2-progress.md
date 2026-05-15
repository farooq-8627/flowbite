# Phase 2 — CRM Core Progress

> Updated: 2026-05-15
> Status: **Backend 100% COMPLETE · Frontend Slice 1 COMPLETE · All Audit Fixes COMPLETE**

---

## Verification

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm exec biome check .` | ✅ 0 issues across 442 files |
| `pnpm exec vitest run --config vitest.convex.config.ts` | ✅ 85 pass + 1 skipped |
| `npx convex codegen` | ✅ succeeds |

---

## ✅ Backend — 100% Complete

All CRM tables, mutations, queries, and canonical pattern steps 1-6 are implemented.

### Tables (28 total, split across 7 domain files in `convex/schema/`)

leads, contacts, companies, deals, notes, reminders, tags, entityTags, fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters, orbitLinks, companyMembers, aiConversations, aiMessages, notifications, activityLogs, files, users, orgs, orgRoles, orgMembers, invitations, platformTemplates, featureFlags, rateLimits.

### Key Architecture Decisions

| Decision | Outcome |
|---|---|
| Permission SSOT | `convex/_shared/permissions/catalog.ts` — one file to edit, propagates to seed, backfill, UI, runtime checks |
| Schema split | 7 domain files under `convex/schema/` (identity, platform, crmEntities, crmFields, crmShared, system, ai). `schema.ts` is a 73-LOC barrel. |
| Company membership | `companyMembers` join table for O(1) indexed lookup. `getByPersonCode` no longer scans all companies. |
| Indexed queries | 6 new compound indexes added. 10 `.filter()` callsites migrated to `withIndex`. |
| Auth env validation | `convex/auth.ts` warns at boot if OAuth env vars are missing. |
| `teamMembers` removed | Dropped deprecated field from schema + mutations + frontend. `assignees[]` is the only multi-assignee field. |

### Canonical Pattern Compliance

| Step | Status |
|---|---|
| 1. RBAC: requireOrgMember() + requireRole() | ✅ All mutations |
| 2. Dedup: runDedup() via indexes | ✅ leads.create, contacts.create |
| 3. Record codes: generatePersonCode() / generateEntityCode() | ✅ All entities |
| 4. DB insert/patch with updatedAt | ✅ All mutations |
| 5. logActivity() with personCode | ✅ All mutations |
| 6. sendNotification() on assignment/stage change | ✅ |
| 7. AI context rebuild | ⬜ Phase 3 (no-op wired) |

---

## ✅ Frontend Slice 1 — Complete

All 4 entity list views (Leads, Contacts, Deals, Companies) are implemented with:
- Board + list view toggle (persisted per-user)
- Dynamic board grouping (status/assignee/stage/source)
- Inline field editing
- Tag cells with popover picker
- Custom field columns via `useEntityColumns`
- View options menu (card fields, group-by, revealed statuses)
- Add/Edit drawers with file buffer support
- Lead conversion flow (ConvertLeadDrawer)
- Deal kanban with drag-drop (`moveToStage` + optimistic update)
- Stale indicators (configurable per pipeline stage)
- First-time coachmark tours

### Performance Optimizations Applied

| Optimization | Status |
|---|---|
| L1: Removed `prefetch={false}` from 5 dashboard Links | ✅ |
| L2: RouteProgress (2px top progress bar) | ✅ |
| L3: DelayedFallback component (delay=300ms) | ✅ |
| L4: Optimistic updates on deals.moveToStage + leads.update | ✅ |
| R2: ShellLayout toolbar memoized via useMemo | ✅ |
| R56: PermissionGate defense-in-depth on settings groups | ✅ |
| D2: companyMembers indexed join table | ✅ |
| D1: listPersonsWithoutCompany uses companyMembers (no 3x collect) | ✅ |
| useCurrentOrg hook + OrgProvider context | ✅ |
| Max-update-depth bugs fixed (useFileBuffer stabilized) | ✅ |
| R3: Root page redirect uses render-time redirect() (no useEffect) | ✅ |
| S4: convex/auth.ts warns at boot if OAuth env vars missing | ✅ |
| Doc: core/datatable/MODULE.md updated to reflect actual files | ✅ |

---

## ⬜ Frontend — Remaining Slices

### Slice 2 — Person Detail Page

Route: `/{locale}/{orgSlug}/profile/[personCode]`

Tabs: Overview | Messages | Timeline | Notes | Deals | Reminders | Files

Key files:
- `core/entities/people/views/PersonDetailView.tsx`
- `core/entities/people/components/PersonHeader.tsx`
- `core/entities/people/components/ActivityChatTab.tsx`
- `core/entities/people/components/ConvertLeadDialog.tsx`

### Slice 3 — Company Detail

Route: `/{locale}/{orgSlug}/companies/[id]`

Tabs: Overview | Contacts | Deals | Timeline

### Slice 4 — Deal Detail

Route: `/{locale}/{orgSlug}/deals/[id]`

Key: Stage selector calls `moveToStage()`, won/lost calls `closeAsDone()` + confetti.

### Slice 5 — Unified Timeline Component

Files: `core/timelines/` — UnifiedTimeline, TimelineEntry, NoteEntry, ReminderEntry, NoteComposer, TimelineFilters.

### Slice 6 — Settings Pages (already functional, needs code-split)

Convert each group import to `next/dynamic` for chunk splitting. Internal split of WorkspaceGroup (627 LOC) and TeamGroup (612 LOC) into per-section files.

**C3 split complete (2026-05-15):**
- `WorkspaceGroup.tsx` 627 LOC → 21-line barrel + 5 section files under `workspace/`
- `TeamGroup.tsx` 612 LOC → 29-line barrel + 4 section files under `team/`
- `FieldEditor.tsx` 753 LOC → 55-line orchestrator + 3 files under `crm/` (CreateFieldDialog, EditFieldDialog, SortableFieldsTable)

### Slice 7 — Dashboard Home (real metrics)

Replace placeholder with real metric cards from `getDashboardStats` query.

---

## ⬜ Phase 3 — AI + WhatsApp (next major phase)

- `convex/ai/processChat.ts` — internalAction
- `convex/ai/systemPrompt.ts` — 3-layer prompt builder
- `convex/ai/tools/` — 11 core tools
- WhatsApp webhook + Trigger.dev voice processor
- AI context rebuild (step 7 of canonical pattern)

---

## References

- `FRONTEND-DECISIONS.md` — 20 locked frontend rules
- `CONVEX-ARCHITECTURE.md` — Convex patterns, caching, realtime
- `.github/agents/base/` — agent instruction files
