# convex/reminders — MODULE.md

**Ownership:** `convex/reminders/` | Phase 2  
**Purpose:** Follow-up reminders. Has followUpCode (FU-001). Always linked to personCode. Optionally linked to dealCode. AI can suggest but NEVER auto-create without user approval.

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| orgId | Id<"orgs"> | Required |
| followUpCode | string | Auto-generated (FU-001, FU-002…) |
| personCode | string | Required — always linked to a person |
| dealCode | string \| undefined | Optional link to a deal |
| title | string | Short reminder title |
| note | string | Additional context |
| dueAt | number | Timestamp when reminder is due |
| assignedTo | Id<"users"> | Who is responsible |
| status | "pending" \| "completed" \| "overdue" | Current state |
| completedAt | number \| undefined | Set when status → completed |
| source | "manual" \| "ai" \| "automation" | How the reminder was created |
| createdAt | number | Timestamp |

---

## Indexes

| Name | Fields |
|------|--------|
| by_org_and_person | orgId, personCode |
| by_org_and_due | orgId, dueAt |
| by_org_and_status | orgId, status |

---

## Queries

| Function | Description |
|----------|-------------|
| `listForPerson(personCode)` | All reminders for a person within an org |
| `getDueToday()` | Reminders due today for the current org |
| `getOverdue()` | Reminders past due that are still pending |
| `listOpen(personCode)` | All pending reminders for a person |

---

## Mutations

| Function | Description |
|----------|-------------|
| `create()` | Creates reminder, auto-generates followUpCode (FU-XXX) |
| `complete()` | Sets status to "completed", sets completedAt |
| `update()` | Updates reminder fields (title, note, dueAt, assignedTo) |
| `delete()` | Removes a reminder |

---

## RBAC

| Permission | Minimum Role |
|------------|--------------|
| reminders.create | member+ |
| reminders.manage | admin+ |

---

## Rules

- Every reminder MUST have a personCode — no orphan reminders
- followUpCode is auto-generated sequentially per org (FU-001, FU-002…)
- `getDueToday()` and `getOverdue()` filter by assignedTo for the current user unless admin
- Status transitions: pending → completed, pending → overdue (via cron), no reverse
- `source` field must accurately reflect origin — never override after creation
- Overdue status is set by a scheduled job, not by client mutations

---

## Avoids

- Do NOT allow reminders without a personCode
- Do NOT allow duplicate followUpCodes within the same org
- Do NOT let non-admin users manage (update/delete) other users' reminders
- Do NOT set completedAt without also setting status to "completed"

---

## Never-Do

- ❌ NEVER let AI auto-create reminders without explicit user approval
- ❌ NEVER allow status to go from "completed" back to "pending"
- ❌ NEVER generate followUpCode on the client — always server-side
- ❌ NEVER delete reminders that are already completed — archive only
- ❌ NEVER skip org membership verification on any query or mutation
