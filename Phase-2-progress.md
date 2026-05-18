# PHASE-2-PROGRESS.md
> Updated: 2026-05-19 | Replaces: Phase-2-progress.md, BUILD-ORDER.md, FRONTEND-DECISIONS.md, SCHEDULING-IMPLEMENTATION.md, CORE-FEATURES-ARCHITECTURE.md, CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md, DYNAMIC_FIELDS_BLUEPRINT.md, INDUSTRY_ADAPTABILITY_ANALYSIS.md, PRODUCTION-READINESS-AUDIT.md, PERFORMANCE-AUDIT-2026-05-19.md
>
> **Read order every session**: AGENTS.md → this file → PHASE-3-NEXT.md → relevant module STATE.md

---

## Current Status

| Layer | Status |
|---|---|
| Phase 0 (Auth, RBAC, shell primitives) | ✅ 100% Complete |
| Phase 1 (Shell, sidebar, nav, onboarding, dashboard) | ✅ 100% Complete |
| Phase 2 Backend (all CRM tables, mutations, queries) | ✅ 100% Complete |
| Phase 2 Frontend — Slices 0–7 | ✅ 100% Complete |
| Phase 3 (AI, WhatsApp) | ⬜ Next phase |

### Last verification (2026-05-19)
- `pnpm typecheck` → 0 errors
- `pnpm exec biome check .` → 0 issues (474 files)
- `pnpm test` → 100 pass + 1 skipped

---

## ✅ Phase 2 — What Was Completed

### Backend (100% Complete)
28 tables across 7 schema files. All mutations follow the canonical pattern (steps 1–7, step 7 no-op wired for Phase 3).

**Tables**: leads, contacts, companies, deals, notes, reminders, messages, conversations, conversationParticipants, tags, entityTags, fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters, orbitLinks, companyMembers, aiConversations, aiMessages, notifications, activityLogs, files, users, orgs, orgRoles, orgMembers, invitations, platformTemplates, featureFlags, rateLimits.

**Key backend decisions locked:**
- RBAC SSOT: `convex/_shared/permissions/catalog.ts` — propagates to seed, backfill, UI, runtime
- Schema split: 7 domain files under `convex/schema/`
- `companyMembers` join table for O(1) company-person lookup
- All `.filter()` migrated to `.withIndex()` — no full-table scans
- Rate limits on all user-triggered mutations
- `messages` table added (separate from `notes`)
- `reminders` extended: `source` closed-union + `priority` + `by_org_and_source_and_due` index
- Follow-ups backend: `createFollowup`, `listFollowupsForOrg/Person/Entity` queries
- Files backend: `listForEntity` added (server-side merge — replaces 3-subscription pattern)
- Sentry/PostHog via env vars, no-op if unset

### Frontend Slices (All Complete)

| Slice | What | Key files |
|---|---|---|
| 0 | Shared primitives: DataTable, KanbanBoard, EntityListPage, EntityDetailPage, EntityCard | `core/data-display/`, `core/entities/scaffolds/` |
| 1 | Leads + Contacts + Companies + Deals list/board views | `core/entities/_entities/*/views/` |
| 2 | Profile detail page (unified lead+contact by personCode) | `core/platform/profile/views/ProfileView.tsx` |
| 3 | Company detail view | `core/entities/_entities/companies/views/CompanyDetailView.tsx` |
| 4 | Deal detail view + kanban with drag-drop | `core/entities/_entities/deals/views/DealDetailView.tsx` |
| 5a | Messages UI: thread + sidebar + composer + voice + lightbox | `core/comms/messages/` |
| 5b | Notes UI: category kanban + drag-drop + set-reminder | `core/comms/notes/` |
| 5c | Calendar: month/week/day/list + create from grid | `core/scheduling/calendar/` |
| 5d | Reminders: DataTable + Today/Calendar/List modes + widgets | `core/scheduling/reminders/` |
| 5e | Follow-ups: org-wide cadence view + panel (all built, panel mounting deferred) | `core/scheduling/followups/` |
| 5f | Timeline: person + entity + org-wide feed | `core/comms/timeline/` |
| 6 | Settings: all groups, dynamic labels, RBAC, pipelines, fields | `core/platform/settings/` |
| 7 | Dashboard: dense grid, real metrics, widgets | `core/shell/shell/views/dashboard/` |

### Performance Optimizations Applied (2026-05-18/19)

| # | Fix | Impact |
|---|---|---|
| P1 | `companies.list` in ContactsView — scoped to `groupBy === "companyId"` only | Kills full-table sub on every contacts view mount |
| P2 | `flatDeals` in DealDetailView — scoped to `view === "list"` only | Kills full-table sub when kanban is active |
| P3 | `EntityFilesPanel` 3 subs → 1 `listForEntity` (server-side merge) | 66% reduction in file subscriptions per detail page |
| P4 | Tags: `prefetchedTags` from `useEntityTagsMap` on all list parents | Eliminates per-row `getTagsForEntity` subscriptions |
| P5 | Members: `useOrgMembers()` context, no per-component `listMembers` | ~20% reduction in identity queries |
| P6 | Optimistic updates on all list-affecting mutations | Zero flash on mutations |
| P7 | Drag: one mutation per drop only (`onCommit`, not `onValueChange`) | 50+ mutations → 1 per drag |

---

## ⬜ Pending — Phase 2 (deferred, agreed 2026-05-19)

### 1. Mount FollowUpsPanel in detail views — **HIGH** (next tabs turn)

Panel is complete at `core/scheduling/followups/panels/FollowUpsPanel.tsx`. Only wiring needed.

| View | File | What to add |
|---|---|---|
| Person profile | `core/platform/profile/views/ProfileContent.tsx` | `<FollowUpsPanel personCode={personCode} />` beside `<RemindersPanel>` (~line 218) |
| Deal detail | `core/entities/_entities/deals/views/DealDetailView.tsx` | `<FollowUpsPanel entityType="deal" entityId={deal.dealCode} defaults={{ personCode: deal.personCode }} />` beside `<RemindersPanel>` (~line 1015) |
| Company detail | `core/entities/_entities/companies/views/CompanyDetailView.tsx` | Add both `<RemindersPanel>` and `<FollowUpsPanel entityType="company" entityId={company.companyCode} />` (currently neither exists there) |

### 2. Auto-close stale follow-ups cron — **MEDIUM** (Phase B)

Setting `org.settings.followupDefaults.autoCloseAfterDays` is in schema + UI but not enforced. Implementation details in `PHASE-3-NEXT.md § Auto-Close Follow-ups Cron`.

### 3. Production hardening items — **MEDIUM**

Email send (Resend), soft-delete recovery, GDPR export, Stripe billing, security headers. Full list in `PHASE-3-NEXT.md § Production Hardening`.

---

## Architecture Decisions — Locked

> Keep all of these when starting a new session. Full rules also in AGENTS.md.

### Canonical Mutation Pattern (all 7 steps, every mutation)

```typescript
// 1. RBAC
const { member, userId } = await requireOrgMember(ctx, args.orgId);
requireRole(member.permissions, "leads.create");

// 2. Dedup (leads + contacts only)
const dupes = await runDedup(ctx, args.orgId, args.email, args.phone, args.displayName);
if (dupes.length > 0) return { id: null, duplicates: dupes };

// 3. Record code
const personCode = await generatePersonCode(ctx, args.orgId);

// 4. DB insert
const id = await ctx.db.insert("leads", { ...args, personCode, createdAt: now, updatedAt: now });

// 5. logActivity — ALWAYS pass personCode for person-related mutations
await logActivity(ctx, { orgId, userId, action: "created", entityType: "lead", entityId: id, personCode });

// 6. sendNotification — when assignedTo is set
if (args.assignedTo && args.assignedTo !== userId) {
  await sendNotification(ctx, { orgId, userId: args.assignedTo, type: "lead.assigned", ... });
}

// 7. AI context rebuild — no-op until Phase 3
await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, { orgId, entityType: "lead", entityId: id, personCode });
```

### Route Structure (Locked)

```
/{locale}/{orgSlug}/                         dashboard home
/{locale}/{orgSlug}/profile/P-001            person detail (lead OR contact)
/{locale}/{orgSlug}/[entitySlug]             entity lists (slugs from DB, renamable)
/{locale}/{orgSlug}/messages                 org-wide chat inbox
/{locale}/{orgSlug}/reminders                reminders (list/calendar/today views)
/{locale}/{orgSlug}/followups                CRM cadence surface
/{locale}/{orgSlug}/notes                    notes workspace
/{locale}/{orgSlug}/timeline                 org-wide activity feed
/{locale}/{orgSlug}/notifications
/{locale}/{orgSlug}/settings/...             single /settings, ?group= param
```

### personCode Rules (Immutable — Never Violate)

```
personCode generated:  ONLY in leads.create via generatePersonCode()
personCode on contact: PASSED from lead.personCode on convertToContact() — NEVER regenerated
personCode on deals:   PASSED from the person at deal creation
Profile URL:           /profile/P-001 — never /leads/{id} or /contacts/{id}
personCode on reminders/messages/activityLogs: always present for person-related records
```

### Six Tables Doctrine (AGENTS.md Decision #11)

| Concept | Table | Note |
|---|---|---|
| Notes | `notes` | Editable, pinnable |
| Messages | `messages` | Append-mostly, status, reply, voice |
| Notifications | `notifications` | Per-user alerts |
| Activity Logs | `activityLogs` | Immutable audit trail |
| Reminders | `reminders` | Date-tied; `source` discriminates follow-ups |
| Timeline | NO TABLE | Read-merge: activityLogs + notes + reminders |
| Calendar | NO TABLE | Read-merge: reminders + activityLogs + deal close dates |

### Follow-ups Doctrine (Locked 2026-05-19)

Follow-ups = reminders with `source === "followup"`. No separate table.
- Reminders surface (`/reminders`) = operational queue (DataTable + tabs)
- Follow-ups surface (`/followups`) = CRM cadence lens (priority cards + buckets)
- **No "Follow-up" badge on ReminderCard** — surface IS the discriminator
- `createFollowup` mutation is production-ready for Phase 3 AI tool registration
- See `core/scheduling/followups/MODULE.md` decision #9 for full rationale

### 20 Frontend Rules (from FRONTEND-DECISIONS.md — never delete these)

| # | Rule |
|---|---|
| 0 | Never hardcode entity labels/slugs — always from `orgSettings.entityLabels` (DB) |
| 1 | One profile page — `/profile/[personCode]`, not separate detail pages per entity type |
| 2 | Six separate tables — `messages` and `notes` are distinct, never share via flag |
| 3 | Timeline has two scopes — per-person and org-wide, same component |
| 4 | Staleness is configurable per-stage — never hardcode thresholds or colors |
| 5 | AI can do everything the user can — capabilities = user permissions, filtered at tool registry |
| 6 | DB-backed navigation — hrefs derived from `orgSettings.entityLabels[slot].slug` |
| 7 | Four-layer AI security — prompt → org scope → tool registry → confirmation for destructive |
| 8 | One mutation, many callers — UI / AI / WhatsApp / CSV all call same mutation, `source` tracks origin |
| 9 | Client portal readiness — profile components check permissions from day one |
| 10 | Visual indicators are configurable — colors from DB (stages, tags, status), never hardcoded |
| 11 | Vertical slice build order — one slice: backend → hooks → view → route → done |
| 12 | Route structure locked — see above |
| 13 | Profile page tabs — Overview, Messages, Timeline, Notes, Deals, Reminders, Calendar, Files |
| 14 | Notes is a separate tab — editable; also appears read-only in Timeline |
| 15 | Deals list + kanban — primary is kanban; `moveToStage()` not generic `update()` for stage changes |
| 16 | Reminders/Follow-ups — on profile + dashboard + org page; AI suggests, never auto-creates |
| 17 | Settings pages are role-gated, never plan-gated |
| 18 | Dynamic field definitions — `fieldDefinitions` table is SSOT, `DynamicFieldRenderer` renders what backend returns |
| 19 | `personCode` is stable identifier everywhere — URL, AI, WhatsApp, activity logs, deals, reminders |
| 20 | AI capabilities — CRM CRUD, pipeline/field mgmt, workspace setup, analytics, bulk ops, search, role/member mgmt |

### Standard Import Paths

```typescript
// Convex backend
import { orgMutation, orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole, hasPermission } from "../../../_shared/permissions";
import { generatePersonCode, generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { internal } from "../../../_generated/api";

// Frontend
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { api } from "@/convex/_generated/api";
```

### Schema Index Quick Reference

```
leads:        by_org, by_org_and_status, by_org_and_assignee, by_org_and_personCode
contacts:     by_org, by_org_and_personCode, by_org_and_company, by_org_and_assignee
companies:    by_org, by_org_and_companyCode, by_org_and_assignee
deals:        by_org, by_org_and_pipeline, by_org_and_stage, by_org_and_personCode, by_org_and_dealCode
reminders:    by_org_and_person, by_org_and_due, by_org_and_status,
              by_org_and_status_and_due, by_org_and_source_and_due, by_user_and_due
files:        by_org_and_scope, by_org_scope_field
activityLogs: by_orgId_and_createdAt, by_entityType_and_entityId,
              by_userId_and_createdAt, by_org_and_personCode
```

### Avoids / Anti-Patterns (Never Do)

```
❌ ml-*, mr-*, pl-*, pr-*              → ms-*, me-*, ps-*, pe-* (RTL-safe)
❌ rounded-md/lg/xl                    → rounded-[var(--radius)]
❌ "Orbitly" hardcoded in JSX          → APP_CONFIG.name
❌ "Lead", "Contact" hardcoded in UI   → useEntityLabels()
❌ "/leads" hardcoded in nav           → labels[slot].slug
❌ .collect() in Convex queries        → .withIndex() + .take(n)
❌ useQuery(listMembers) in component  → useOrgMembers() from context
❌ useQuery(getMyMembership) anywhere  → useCurrentOrg().membership
❌ useQuery(getEntityLabels) anywhere  → useEntityLabels()
❌ Per-row useQuery in list views      → batch at parent (useEntityTagsMap, etc.)
❌ companies.list always-on            → scope to groupBy === "companyId"
❌ flatDeals in board view             → scope to view === "list"
❌ 3 file subscriptions per panel      → use files.queries.listForEntity
❌ Mutations on drag onValueChange     → mutations only on onCommit/onDragEnd
❌ scrollIntoView() in nested shell    → scrollToSection() from useSettingsSearch
❌ Logic/components in app/ pages      → app/ = thin wrappers only
❌ Schema change without migration     → same-message migration always
❌ Hardcode Sentry/PostHog DSNs        → env vars (SENTRY_DSN, NEXT_PUBLIC_POSTHOG_*)
❌ useEffect deps include hook return  → destructure stable method or use ref
```
