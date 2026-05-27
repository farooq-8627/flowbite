# convex/crm/shared/tasks — MODULE.md

**Ownership:** `convex/crm/shared/tasks/` | Stage 4 (TASKS-RENAME-PLAN.md)
**Purpose:** The single canonical scheduling table. Replaces the legacy
`reminders` + `followups` surface with one `tasks` shape that has a `type`
discriminator (`todo / call / email / meeting / followup`) and a public
`taskCode` (T-001) that flows through every AI tool, activity log,
notification, and timeline narrative.

> **Status (Stage 4A — 2026-05-27):** backend foundations shipped. The
> `reminders` table + `convex/crm/shared/reminders/` folder are kept dormant
> until Stage 4B (frontend) and 4C (AI tools) re-route their callers. Stage
> 4D removes the legacy surface entirely.

---

## Decision pointers

Every architectural choice below is locked in `TASKS-RENAME-PLAN.md §2`.
Cross-references in brackets — do not revisit these without the user's
explicit say-so.

- The `type` field replaces `source`. Closed union: `"todo" | "call" | "email" | "meeting" | "followup"`. The "followup" type carries the CRM cadence semantics. [Decision #3]
- The `taskCode` prefix is `T-` (was `FU-`). Default lives in `_shared/recordCodes.ts::DEFAULT_PREFIXES.task`. [Decision #4]
- Activity log actions: `task_created` / `task_completed` / `task_updated` / `task_deleted`. ONE verb family — no more `reminder_*` / `followup_*` split. [Decision #5]
- Permission keys: `tasks.view` / `tasks.create` / `tasks.manage`. [Decision #6]
- AI tool surface (Stage 4C): `create_task`, `complete_task`,
  `complete_task_by_code`, `cancel_task_by_code`, `update_task`, `list_tasks`,
  `list_tasks_for_person`, `get_task_by_code`, `delete_entity({entityType:"task"})`. [Decision #10]

---

## Schema (convex/schema/crmShared.ts::tasks)

| Field | Type | Notes |
|---|---|---|
| orgId | Id<"orgs"> | Required |
| taskCode | string | Auto-generated (T-001, T-002…). Stable for the task's lifetime. |
| type | closed union | `"todo" \| "call" \| "email" \| "meeting" \| "followup"` |
| personCode | string \| undefined | Optional. REQUIRED when `type === "followup"` (cadence semantic). Pure todos can be person-less. |
| dealCode | string \| undefined | Optional deal context for the timeline narrative. |
| entityType | string | Anchor entity type. Defaults to `"person"` when personCode is set, else `"user"` (self-anchored). |
| entityId | string | Code (P-001 / D-001 / CO-001) for CRM entities, or the assignee userId for self-anchored todos. |
| title | string | Short label. |
| note | string \| undefined | Free-form description. |
| dueAt | number | Required. Followup type computes a default if unset; other types must pass an explicit value. |
| assignedTo | Id<"users"> | Defaults to caller. |
| status | closed union | `"pending" \| "completed"`. Tightened from the legacy free `v.string()`. |
| completedAt | number \| undefined | Stamped on completion. |
| priority | closed union \| undefined | `"low" \| "normal" \| "high" \| "urgent"`. Optional. |
| createdAt | number | Stamped at insert. |
| updatedAt | number | Required. Every mutation server-stamps it. |
| excludeFromAI | boolean \| undefined | Standard `aiExcluded` validator. |

---

## Indexes

| Name | Fields | Use case |
|---|---|---|
| by_org_and_person | orgId, personCode | Profile tab, person-anchored lists |
| by_org_and_due | orgId, dueAt | Calendar / dashboard widgets |
| by_org_and_status | orgId, status | Open vs. closed counts |
| by_org_and_status_and_due | orgId, status, dueAt | Due-today / overdue queries |
| by_org_and_type_and_due | orgId, type, dueAt | "Next call" / "Next followup" filtered scans (replaces `by_org_and_source_and_due`) |
| by_org_and_taskCode | orgId, taskCode | Lookup by public code (FU-004 fix carryover) |
| by_user_and_due | assignedTo, dueAt | "My tasks" sidebar |

---

## Queries (queries.ts)

| Function | Description |
|---|---|
| `listForPerson(personCode, type?)` | All tasks for a person, optionally filtered by type. Powers the profile-page Tasks tab. |
| `listForPersonForAI` | AI-callable twin of `listForPerson`. |
| `listAllForOrg` | Every task for the org (Today / Open / Completed bucketing happens client-side). Filters to assignee for non-managers. |
| `listForOrg(type?, status?)` | Status-filterable variant. Powers the org-wide Tasks list. |
| `listForOrgForAI` | AI-callable twin of `listForOrg`. |
| `getDueToday()` | Pending tasks due in today's 00:00–23:59 window. |
| `getDueAndOverdue(lookbackDays?)` | Pending tasks with `dueAt <= endOfDay(today)` AND `>= now - lookbackDays` (default 90). |
| `getNextUpcoming(limit?, horizonDays?)` | Next N pending tasks strictly after today (default 3 / 30 days). |
| `listOpen(personCode)` | Pending tasks for a single person (entity detail badge). |
| `getById(taskId)` | Single-task lookup for the calendar Edit popover. |
| `getByTaskCode(taskCode)` | Lookup by public code ("T-003"). |
| `getByTaskCodeForAI` | AI-callable twin. Drives `get_entity_detail({entityType:"task"})` per Decision #11. |

---

## Mutations (mutations.ts)

| Function | Description |
|---|---|
| `create({type, ...})` | Generic creator. Type-aware default resolution — followup types pull `dueAt` + `priority` defaults from `org.settings.taskDefaults` (with legacy `followupDefaults` fallback during Stage 4 transition). |
| `createForAI` | AI-callable twin (per AGENTS.md "AI tools call *ForAI" rule). |
| `complete(taskId)` | Marks `status: "completed"` + stamps `completedAt`. Idempotent on already-completed tasks. |
| `completeForAI` | AI-callable twin. |
| `update(taskId, ...)` | Patch any field. Server-stamps `updatedAt`. |
| `updateForAI` | AI-callable twin. |
| `remove(taskId)` | Hard delete (tasks are not soft-deleted). |
| `removeForAI` | AI-callable twin. |
| `completeByCodeForAI(taskCode)` | AI lookup + complete by `T-003`. Wraps `completeImpl`. |
| `cancelByCodeForAI(taskCode)` | AI lookup + delete by `T-003`. |

---

## RBAC

| Permission | Default roles | Notes |
|---|---|---|
| tasks.view | Owner, Admin, Member, Viewer | Read-only access to the listing surface. |
| tasks.create | Owner, Admin, Member | Required to call `create` / `createForAI`. |
| tasks.manage | Owner, Admin, Member | Required to act on someone else's task. Assignees can always act on their own. |

The seed defaults match the legacy `reminders.*` keys exactly so no role
behaviour shifts during the transition.

---

## Rate-limit scopes

| Scope | Limit | Mutations |
|---|---|---|
| `tasks.create` | RATE_LIMITS.write (60/min/user-org) | `create`, `createForAI` |
| `tasks.write` | RATE_LIMITS.write (60/min/user-org) | `complete`, `update`, `remove`, `cancelByCodeForAI` |

The two scopes share the `write` preset but partition by lifecycle phase so
the gate accurately reports whether the user is creating or mutating
existing rows.

---

## Activity log emissions

Every mutation calls `logActivity(...)` with one of:

- `task_created` (insert) — metadata: `{ taskCode, taskId, type, priority }`
- `task_completed` (lifecycle) — metadata: `{ taskCode, taskId }`
- `task_updated` (patch) — metadata: `{ taskCode, taskId }`
- `task_deleted` (hard delete / cancel-by-code) — metadata: `{ taskCode, taskId }`

These are the single verb family per Decision #5. Stage 4B updates the
frontend timeline (`core/comms/timeline/components/action-theme.ts`) to
recognise them; until then the legacy `reminder_*` / `followup_*` actions
written by the dormant `convex/crm/shared/reminders/mutations.ts` continue to
render.

---

## Notification types

- `task.created` — emitted to the assignee when someone else creates a task for them.
- `task.completed` — emitted to the assignee when someone else closes their task.

The notification *preference* keys are `task_due` / `task_overdue` (under
category `"tasks"`) per Decision #5 of TASKS-RENAME-PLAN.md (ONE verb family
— `task_*`). Migration `2026_05_27_renameReminderNotificationKeys.ts` flipped
the legacy `reminder_*` keys to the new shape in users' preference rows.

---

## Rules

- Every task MUST have an anchor entity (entityType + entityId). The mutation
  derives one when the caller leaves them unset (person-anchored when
  `personCode` is set, else self-anchored to the user).
- `taskCode` is server-generated only; the client never invents one.
- Status transitions are unidirectional: `pending → completed`. There is no
  reverse path. (Re-opening a task = create a new one.)
- The `type === "followup"` path requires `personCode` — enforced inside the
  mutation, not the schema.
- Mutations gate on the assignee + `tasks.manage` axis. UI components must
  respect the same axis when deciding whether to render edit/complete buttons.

---

## Avoids

- Do NOT add new reads or writes against the legacy `reminders` table — it is
  being phased out. Use `tasks` instead.
- Do NOT write a value to `excludeFromAI` based on a task being "private" —
  that flag is for AI-runtime exclusion, not user privacy. Use the
  permission gate instead.
- Do NOT generate a task on the client. Always go through `create` /
  `createForAI`.

---

## Never-Do

- ❌ NEVER let a task transition `completed → pending`.
- ❌ NEVER let an AI tool call `create` directly. Always `createForAI` (the
  ForAI twin's path is rewritten by `_shared.ts` automatically when the
  tool calls `crm/shared/tasks/mutations:create`).
- ❌ NEVER read `org.settings.followupDefaults` from new code. Use
  `org.settings.taskDefaults` — the mutation falls back to the legacy block
  during the Stage 4 transition only.
