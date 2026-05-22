# PHASE-2-PROGRESS.md
> Updated: 2026-05-22 | Trimmed to locked-decisions-only (build log removed — work is shipped)
> Full Phase 3 plan: **PHASE-3-PLAN.md**
> Read order every session: AGENTS.md → **this file** → PHASE-3-PLAN.md → relevant STATE.md

---

## Current Status

| Layer | Status |
|---|---|
| Phase 0 (Auth, RBAC, shell primitives) | ✅ 100% |
| Phase 1 (Shell, sidebar, nav, onboarding, dashboard) | ✅ 100% |
| Phase 2 Backend (all CRM tables, mutations, queries) | ✅ 100% |
| Phase 2 Frontend — Slices 0–7 | ✅ 100% |
| Pipelines (multi-pipeline + stage-aware fields + transition policy) | ✅ 100% |
| Phase 3 (AI, WhatsApp) | ⬜ Next — see PHASE-3-PLAN.md |

### Last verification
- `pnpm typecheck` → 0 errors
- `pnpm exec biome check .` → 0 issues
- `pnpm test` → 113 pass + 1 pre-existing unrelated failure
- `pnpm build` → all 18 routes

---

## ✅ What Was Completed

### Backend (100%)
28 tables across 7 schema files. All mutations follow the canonical 7-step pattern (steps 1–7, step 7 no-op until Phase 3).

**Tables**: leads, contacts, companies, deals, notes, reminders, messages, conversations, conversationParticipants, tags, entityTags, fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters, orbitLinks, companyMembers, aiConversations, aiMessages, notifications, activityLogs, files, users, orgs, orgRoles, orgMembers, invitations, platformTemplates, featureFlags, rateLimits.

### Frontend Slices (All Complete)

| Slice | Key files |
|---|---|
| 0 — Shared primitives | `core/data-display/`, `core/entities/scaffolds/` |
| 1 — Leads, Contacts, Companies, Deals list/board | `core/entities/_entities/*/views/` |
| 2 — Profile detail (unified by personCode) | `core/platform/profile/views/ProfileView.tsx` |
| 3 — Company detail | `core/entities/_entities/companies/views/CompanyDetailView.tsx` |
| 4 — Deal detail + kanban + drag-drop | `core/entities/_entities/deals/views/DealDetailView.tsx` |
| 5a — Messages | `core/comms/messages/` |
| 5b — Notes (category kanban + drag-drop) | `core/comms/notes/` |
| 5c — Calendar (month/week/day/list) | `core/scheduling/calendar/` |
| 5d — Reminders (DataTable + modes + widgets) | `core/scheduling/reminders/` |
| 5e — Follow-ups (org cadence view + panel) | `core/scheduling/followups/` |
| 5f — Timeline (person + entity + org-wide) | `core/comms/timeline/` |
| 6 — Settings (all groups, dynamic labels, RBAC, pipelines, fields) | `core/platform/settings/` |
| 7 — Dashboard (dense grid, real metrics, widgets) | `core/shell/shell/views/dashboard/` |

---

## ⬜ Pending (Phase 2 deferred items)

### 1. Mount FollowUpsPanel in detail views — HIGH

Panel complete at `core/scheduling/followups/panels/FollowUpsPanel.tsx`. Only mounting needed.

| View | File | What to add |
|---|---|---|
| Person profile | `core/platform/profile/views/ProfileContent.tsx` | `<FollowUpsPanel personCode={personCode} />` beside `<RemindersPanel>` |
| Deal detail | `core/entities/_entities/deals/views/DealDetailView.tsx` | `<FollowUpsPanel entityType="deal" entityId={deal.dealCode} />` |
| Company detail | `core/entities/_entities/companies/views/CompanyDetailView.tsx` | Add both `<RemindersPanel>` and `<FollowUpsPanel>` |

### 2. FillMissingFieldsDialog — HIGH (pipelines)

Auto-opens on `MISSING_REQUIRED_FIELDS` block-policy error. User fills via `fieldValues.bulkSet`, then auto-retries `moveToStage`. Today we surface a rich toast instead.

### 3. Warn-mode banner on deal detail — MEDIUM

Amber pill + missing-field list + CTA. Schema supports it; UI doesn't.

### 4. Per-stage advanced settings UI — MEDIUM

`staleAfterDays`, `warningAfterDays`, `isFinal`/`finalType` — schema supports them; the pipeline editor UI doesn't expose them yet.

---

## Architecture Decisions — Locked

### Canonical Mutation Pattern (7 steps, every mutation)

```typescript
// 1. RBAC + rate limit
const { member, userId } = await requireOrgMember(ctx, args.orgId);
requireRole(member.permissions, "leads.create");
await enforceRateLimit(ctx, { scope: "leads.create", key: `${userId}:${args.orgId}`, ...RATE_LIMITS.write });

// 2. Dedup (leads + contacts only)
// 3. Record code
const personCode = await generatePersonCode(ctx, args.orgId);

// 4. DB insert
const id = await ctx.db.insert("leads", { ...args, personCode, createdAt: now, updatedAt: now });

// 5. logActivity (always pass personCode for person-related)
await logActivity(ctx, { orgId, userId, action: "created", entityType: "lead", entityId: id, personCode });

// 6. sendNotification (when assignedTo is set)
if (args.assignedTo && args.assignedTo !== userId) {
  await sendNotification(ctx, { orgId, userId: args.assignedTo, type: "lead.assigned", ... });
}

// 7. AI context rebuild — no-op until Phase 3
await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, { orgId, entityType: "lead", entityId: id, personCode });
```

### Route Structure (Locked)

```
/{locale}/{orgSlug}/                         dashboard home
/{locale}/{orgSlug}/profile/P-001            person detail (lead OR contact)
/{locale}/{orgSlug}/[entitySlug]             entity lists (slugs from DB, renamable)
/{locale}/{orgSlug}/messages
/{locale}/{orgSlug}/reminders
/{locale}/{orgSlug}/followups
/{locale}/{orgSlug}/notes
/{locale}/{orgSlug}/timeline
/{locale}/{orgSlug}/notifications
/{locale}/{orgSlug}/settings/...
```

### personCode Rules (Immutable)

```
Generated:    ONLY in leads.create via generatePersonCode()
On contact:   PASSED from lead.personCode on convertToContact() — NEVER regenerated
On deals:     PASSED from the person at deal creation
Profile URL:  /profile/P-001 — never /leads/{id} or /contacts/{id}
```

### Six Tables Doctrine (Decision #11)

| Concept | Table | Note |
|---|---|---|
| Notes | `notes` | Editable, pinnable |
| Messages | `messages` | Append-mostly, status, reply, voice |
| Notifications | `notifications` | Per-user alerts |
| Activity Logs | `activityLogs` | Immutable audit trail |
| Reminders | `reminders` | Date-tied; `source` discriminates follow-ups |
| Timeline | NO TABLE | Read-merge: activityLogs + notes + reminders |
| Calendar | NO TABLE | Read-merge: reminders + activityLogs + deal close dates |

### Follow-ups Doctrine

Follow-ups = reminders with `source === "followup"`. No separate table. `createFollowup` mutation is production-ready for Phase 3 AI tool registration.

### Standard Import Paths

```typescript
// Convex backend
import { orgMutation, orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";
import { generatePersonCode, generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { internal } from "../../../_generated/api";

// Frontend
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { api } from "@/convex/_generated/api";
```

### Avoids / Anti-Patterns (Never Do)

```
❌ ml-*, mr-*, pl-*, pr-*              → ms-*, me-*, ps-*, pe-*
❌ rounded-md/lg/xl                    → rounded-[var(--radius)]
❌ "Lead"/"Contact" hardcoded in UI    → useEntityLabels()
❌ "/leads" hardcoded in nav           → labels[slot].slug
❌ .collect() in Convex queries        → .withIndex() + .take(n)
❌ useQuery(listMembers) in component  → useOrgMembers() from context
❌ Per-row useQuery in list views      → batch at parent
❌ companies.list always-on            → scope to groupBy === "companyId"
❌ flatDeals in board view             → scope to view === "list"
❌ 3 file subscriptions per panel      → files.queries.listForEntity
❌ Mutations on drag onValueChange     → only on onCommit/onDragEnd
❌ scrollIntoView() in nested shell    → scrollToSection()
❌ Logic in app/ pages                 → app/ = thin wrappers only
❌ Schema change without migration     → same-message migration always
❌ useEffect deps include hook return  → destructure stable method or use ref
```
