# BUILD-ORDER.md
# The Single Source of Truth — What to Read, When, and Why

> This file replaces the confusion of having 10+ docs. Read this first every session.
> It tells you exactly which files matter, which are stale, and in what order to read them.

---

## THE ONLY FILES THAT MATTER

There are exactly **5 files** you need to read before writing any code. Everything else is reference.

```
1. BUILD-ORDER.md          ← this file — read first, every session
2. FRONTEND-DECISIONS.md   ← 20 locked rules — read before any frontend work
3. PHASE2-PROGRESS.md      ← current status + per-slice checklists
4. convex/schema.ts        ← source of truth for all table shapes and indexes
5. convex/_shared/permissions.ts  ← all permission keys
```

That's it. Everything else is supplementary.

---

## WHAT EACH FILE IS FOR

| File | Read when | Contains |
|---|---|---|
| `BUILD-ORDER.md` | Every session, first | This file. Navigation guide. |
| `FRONTEND-DECISIONS.md` | Before any frontend work | 20 locked rules: routes, tabs, labels, RTL, etc. |
| `PHASE2-PROGRESS.md` | Before starting a slice | Backend status, per-slice checklists, rules per slice |
| `convex/schema.ts` | Before writing any Convex function | All table shapes, indexes, validators |
| `convex/_shared/permissions.ts` | Before any RBAC work | All permission keys and which roles have them |
| `ARCHITECTURE-ANALYSIS.md` | When making architecture decisions | Gaps, resolved issues, audit results |
| `CONVEX-ARCHITECTURE.md` | When writing Convex functions | Convex patterns, caching, realtime, logActivity, timeline |
| `.github/agents/base/context.md` | When resuming after a break | Current build state summary |
| `AGENTS.md` | When starting a new session | Global coding rules (RTL, no hardcoded strings, etc.) |

---

## FILES YOU DO NOT NEED TO READ

These files exist but are not part of the active build workflow:

| File | Why you can skip it |
|---|---|
| `PHASE1-PROGRESS.md` | Phase 1 is complete. Historical record only. |
| `.kiro/code-architecture-v.md` | 196KB architecture bible. Too large for daily use. Consult only for deep architecture questions. |
| `.kiro/code-architecture.md` | Older version. Superseded by code-architecture-v.md. |
| `.kiro/AI-INTEGRATION-ARCHITECTURE.md` | Phase 3 reference. Not needed until Phase 3 starts. |
| `.kiro/dashboard-template-mapping.md` | Template mapping. Not needed for CRM build. |
| `.kiro/PLAN.md` | Early planning doc. Superseded by PHASE2-PROGRESS.md. |
| `.github/agents/base/todos.md` | Maintained by agents. Read if you need the active task list. |
| `.github/agents/base/checklist.md` | Phase checklists. Superseded by PHASE2-PROGRESS.md per-slice checklists. |
| `.github/agents/base/schema.md` | Older schema doc. Use `convex/schema.ts` directly — it's the source of truth. |
| `.github/agents/base/folder-structure.md` | Target folder tree. Useful for orientation but not required reading. |
| `.github/agents/base/tech-stack.md` | Library versions. Check `package.json` instead. |
| `.github/agents/base/rules.md` | Superseded by `AGENTS.md` global rules. |

---

## SESSION START PROTOCOL

Every session, in this order:

```
1. Read BUILD-ORDER.md (this file) — 2 min
2. Read PHASE2-PROGRESS.md — know where you are — 5 min
3. If doing frontend: read FRONTEND-DECISIONS.md — 5 min
4. Run: pnpm tsc --noEmit → must be 0 errors
5. Run: npx vitest run → must be 70 passing
6. Start the next incomplete slice
```

---

## MODULE BUILD PROTOCOL

When building any module (slice), in this order:

```
1. Read the pre-build checklist in PHASE2-PROGRESS.md for that slice
2. Read the specific Convex query/mutation files the slice depends on
3. Read any existing core/ files in the same module (don't duplicate)
4. Write the code
5. Run: pnpm tsc --noEmit → fix all errors before moving on
6. Run: npx vitest run → must still be 70 passing
7. Mark the slice complete in PHASE2-PROGRESS.md
```

---

## NON-NEGOTIABLE RULES (apply to every file, every session)

These are in `AGENTS.md` but repeated here for visibility:

```
RTL:        Never ml-*, mr-*, pl-*, pr-* → use ms-*, me-*, ps-*, pe-*
Radius:     Never rounded-md/lg/xl → use rounded-[--radius]
Strings:    Never "Orbitly" in JSX → use APP_CONFIG.name
Labels:     Never "Lead", "Contact" hardcoded → use useEntityLabels(orgId)
Slugs:      Never "/leads" hardcoded → use labels[slot].slug
Queries:    Never .collect() → use .take(n) with proper index
Mutations:  Always logActivity() with personCode when person-related
Mutations:  Always sendNotification() when assignedTo changes
RBAC:       Always requireOrgMember() + requireRole() at top of every mutation
App pages:  Thin wrappers only — all logic in core/*/views/
```

---

## CONVEX CANONICAL MUTATION PATTERN

Every mutation must follow these 7 steps in order:

```typescript
// 1. RBAC
const { member, userId } = await requireOrgMember(ctx, args.orgId);
requireRole(member.role ?? "viewer", "leads.create");

// 2. Dedup (leads + contacts only)
const dupes = await runDedup(ctx, args.orgId, args.email, args.phone, args.displayName);
if (dupes.length > 0) return { id: null, duplicates: dupes };

// 3. Record code
const personCode = await generatePersonCode(ctx, args.orgId);

// 4. DB insert
const id = await ctx.db.insert("leads", { ...args, personCode, createdAt: now, updatedAt: now });

// 5. logActivity — ALWAYS pass personCode for person-related mutations
await logActivity(ctx, { orgId, userId, action: "created", entityType: "lead", entityId: id, personCode });

// 6. sendNotification — ALWAYS when assignedTo is set
if (args.assignedTo && args.assignedTo !== userId) {
  await sendNotification(ctx, { orgId, userId: args.assignedTo, type: "lead.assigned", ... });
}

// 7. AI context rebuild — wired up, no-op until Phase 3
await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, { orgId, entityType: "lead", entityId: id, personCode });

return { id, personCode, duplicates: [] };
```

---

## STANDARD IMPORT PATHS

```typescript
// Convex backend
import { orgMutation, orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole, hasPermission } from "../../../_shared/permissions";
import { generatePersonCode, generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { ERRORS } from "../../../_shared/errors";
import { internal } from "../../../_generated/api";

// Frontend hooks
import { useEntityLabels } from "@/core/shell/hooks/useEntityLabels";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";
import { api } from "@/convex/_generated/api";
```

---

## ROUTE STRUCTURE (LOCKED)

```
/{locale}/{orgSlug}/                        ← dashboard home
/{locale}/{orgSlug}/profile/P-001           ← person detail (lead OR contact)
/{locale}/{orgSlug}/profile                 ← all profiles list
/{locale}/{orgSlug}/[entitySlug]            ← ALL entity lists (leads, contacts, deals, companies + renamed)
/{locale}/{orgSlug}/companies/[id]          ← company detail
/{locale}/{orgSlug}/deals/[id]              ← deal detail
/{locale}/{orgSlug}/notifications           ← notifications
/{locale}/{orgSlug}/settings/...            ← settings pages
```

Static segments (`profile`, `settings`, `notifications`, `companies`, `deals`) win over `[entitySlug]`.

---

## PERSONCODE RULES (LOCKED — NEVER VIOLATE)

```
personCode generated:  ONLY in leads.create via generatePersonCode()
personCode on contact: PASSED from lead.personCode on convertToContact() — never regenerated
personCode on deals:   PASSED from the person when creating a deal
searchByCode("P-001"): convex/crm/people/queries.ts::searchByCode — resolves any code to entity
```

---

## SCHEMA INDEX NAMES (quick reference)

```
leads:        by_org, by_org_and_status, by_org_and_assignee, by_org_and_personCode,
              by_org_and_email, by_org_and_normalizedPhone
contacts:     by_org, by_org_and_personCode, by_org_and_company, by_org_and_assignee,
              by_org_and_email, by_org_and_normalizedPhone
companies:    by_org, by_org_and_companyCode, by_org_and_assignee
deals:        by_org, by_org_and_pipeline, by_org_and_stage, by_org_and_personCode,
              by_org_and_dealCode, by_org_and_assignee
notes:        by_entity, by_org_and_author, by_org_and_created
reminders:    by_org_and_person, by_org_and_due, by_org_and_status, by_user_and_due
activityLogs: by_orgId_and_createdAt, by_entityType_and_entityId, by_userId_and_createdAt,
              by_orgId_and_actorType_and_createdAt, by_org_and_personCode
```
