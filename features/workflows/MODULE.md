# Workflows — User-facing Automation Builder (Gap 3)

> **Status**: PLACEHOLDER — schema + UI not yet built.
> **Unlocks**: every vertical's "when X happens, do Y" rules (HubSpot Workflows, Dubsado Workflows, ClickUp Automations parity).
> **Source**: `core/entities/INDUSTRY_ADAPTABILITY_ANALYSIS.md` Gap 3.
> **Depends on**: Phase 3 AI core (tool registry functions are reused as workflow action kinds).

## Purpose

Different from our AI chat (conversational, probabilistic). Workflows are **deterministic rules** the admin configures once and that run reliably every time the trigger fires. Examples:

- When a lead is created → send welcome email + schedule 3-day follow-up reminder
- When a deal moves to "Won" stage → send internal notification + create project
- When a reminder is overdue by 48h → notify the assignee's manager
- When a document is paid → tag the deal "paid" and advance project to "start"

## Planned schema (add to `convex/schema.ts` when module starts)

```ts
workflows: defineTable({
  ...orgScoped,
  name: v.string(),
  description: v.optional(v.string()),
  isActive: v.boolean(),

  // One trigger per workflow
  trigger: v.object({
    event: v.string(),                  // "lead.created" | "deal.stage_changed" | "reminder.due" | ...
    filters: v.optional(v.array(v.object({
      field: v.string(),
      op: v.string(),                   // "eq" | "neq" | "in" | "contains" | ...
      value: v.any(),
    }))),
  }),

  // Ordered action chain
  actions: v.array(v.object({
    kind: v.string(),                   // "email.send" | "reminder.create" | "note.add" |
                                        // "field.update" | "tag.add" | "notification.send" | "wait"
    args: v.any(),                      // shape depends on `kind`
  })),

  // Limits — prevent runaway executions
  maxRunsPerDay: v.optional(v.number()),
  lastRunAt: v.optional(v.number()),

  ...timestamps,
  ...softDelete,
}).index("by_org", ["orgId"])
  .index("by_org_and_trigger", ["orgId", "trigger.event"])
  .index("by_org_and_active", ["orgId", "isActive"]),

workflowRuns: defineTable({
  ...orgScoped,
  workflowId: v.id("workflows"),
  status: v.union(
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  triggerPayload: v.any(),
  executedActions: v.array(v.object({
    kind: v.string(),
    status: v.string(),                 // "ok" | "error" | "skipped"
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    executedAt: v.number(),
  })),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
}).index("by_org_and_workflow", ["orgId", "workflowId"])
  .index("by_org_and_status", ["orgId", "status"]),
```

## Action kinds — reuse AI tool registry

Each `kind` maps to a function that already exists (or will exist) in the AI tool registry:

| kind | Wraps |
|---|---|
| `email.send` | AI tool for sending email (once integrations module ships) |
| `reminder.create` | `api.crm.shared.reminders.mutations.create` |
| `note.add` | `api.crm.shared.notes.mutations.create` (with `isInternal=true`) |
| `field.update` | `api.crm.fields.fieldValues.mutations.set` |
| `tag.add` | `api.crm.shared.tags.mutations.addToEntity` |
| `notification.send` | `api.notifications.helpers.sendNotification` |
| `wait` | Scheduler delay (reuses Convex scheduler) |

This reuse means: build the AI tools correctly once, and both the AI (conversational) AND workflows (deterministic) share the same validated action layer.

## UI (planned)

- `core/workflows/views/WorkflowsView.tsx` — list view of all workflows
- `core/workflows/components/WorkflowBuilder.tsx` — visual node-based editor (similar to Zapier/n8n)
- `core/workflows/components/WorkflowRunsTab.tsx` — run history per workflow
- Reuses `FormDrawer` for the action configuration side-panel

## Target phase

**Phase 7** — after AI core is stable. Cannot ship until the action kinds have a reliable AI tool equivalent.
