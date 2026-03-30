# 08 — Background Jobs

> Heavy work runs off the main request path. Convex crons for light recurring tasks. Trigger.dev for long-running jobs. Convex workflows for durable multi-step processes.

---

## Three Job Systems — When To Use Which

| System | Max Duration | Use When | Examples |
|---|---|---|---|
| **Convex `scheduler.runAfter`** | Same as mutations (~30s) | Fire-and-forget from a mutation, runs in seconds | Send notification email, update a counter |
| **Convex Cron Jobs** | ~30s per execution | Recurring lightweight tasks | Archive old notifications, sync counters, cleanup soft-deleted rows |
| **Trigger.dev Tasks** | Up to 60 minutes | Long-running, CPU-heavy, or external API work | PDF generation, bulk email, data import/export, image processing |
| **Convex Workflows** (`@convex-dev/workflow`) | Hours/days (durable) | Multi-step processes that must survive restarts | Onboarding flow, approval chains, payment + fulfillment |

---

## Convex Scheduler (Fire-and-Forget)

Use `ctx.scheduler.runAfter()` inside mutations to schedule another function:

```ts
// Inside a mutation handler:
await ctx.scheduler.runAfter(0, internal.email.actions.sendNotificationEmail, {
  notificationId,
  userId: args.partnerId,
  subject: "New project assignment",
  template: "connectionAssigned",
  variables: { projectTitle: connection.title },
});
```

- Runs immediately (0ms delay) or after a delay.
- Cannot exceed Convex function limits (~30s execution, ~8MB read).
- Use for: sending emails, creating follow-up notifications, updating denormalized counts.

---

## Convex Cron Jobs

Defined in `convex/crons.ts`. Runs on a schedule.

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Archive read notifications older than 30 days
crons.interval(
  "archive-old-notifications",
  { hours: 24 },
  internal.notifications.mutations.archiveOld,
  {},
);

// Clean up expired invitations
crons.interval(
  "cleanup-expired-invitations",
  { hours: 12 },
  internal.invitations.mutations.cleanupExpired,
  {},
);

// Sync denormalized counters (safety net)
crons.interval(
  "sync-counters",
  { hours: 6 },
  internal.orgs.mutations.syncCounters,
  {},
);

export default crons;
```

---

## Trigger.dev Tasks

For work that exceeds Convex limits or needs external APIs with retries.

### File Structure

```
trigger/
├── email/
│   ├── sendTransactional.ts
│   └── sendBulk.ts
├── files/
│   └── processUpload.ts
├── data/
│   ├── importCsv.ts
│   └── exportReport.ts
└── sync/
    └── syncExternal.ts
```

### Example: Bulk Email Task

```ts
// trigger/email/sendBulk.ts
import { task } from "@trigger.dev/sdk";

export const sendBulkEmail = task({
  id: "send-bulk-email",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: {
    recipients: { email: string; name: string; variables: Record<string, string> }[];
    template: string;
    subject: string;
  }) => {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    let sent = 0;
    for (const recipient of payload.recipients) {
      await resend.emails.send({
        from: "notifications@yourdomain.com",
        to: recipient.email,
        subject: payload.subject,
        // Use template rendering here
        html: `<p>Hello ${recipient.name}</p>`,
      });
      sent++;
    }

    return { sent, total: payload.recipients.length };
  },
});
```

### Triggering from Convex

Convex actions can trigger Trigger.dev tasks via HTTP:

```ts
// convex/email/actions.ts
"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { tasks } from "@trigger.dev/sdk/v3";
import type { sendBulkEmail } from "../../trigger/email/sendBulk";

export const triggerBulkEmail = internalAction({
  args: {
    recipients: v.array(v.object({
      email: v.string(),
      name: v.string(),
      variables: v.any(),
    })),
    template: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    const handle = await tasks.trigger<typeof sendBulkEmail>("send-bulk-email", {
      recipients: args.recipients,
      template: args.template,
      subject: args.subject,
    });
    return handle.id;
  },
});
```

---

## Convex Durable Workflows

For multi-step processes that must complete even if the server restarts. Requires `@convex-dev/workflow`.

### Example: Connection Onboarding Workflow

When a connection is created, the workflow handles the full lifecycle:

```ts
// convex/connections/workflows.ts
import { v } from "convex/values";
import { workflow } from "../_workflow";  // Shared WorkflowManager instance
import { internal } from "../_generated/api";

export const connectionOnboarding = workflow.define({
  args: {
    connectionId: v.id("connections"),
    orgId: v.id("orgs"),
  },
  handler: async (step, args): Promise<{ status: string }> => {
    // Step 1: Notify admin of new project
    await step.runMutation(internal.notifications.mutations.sendSystem, {
      orgId: args.orgId,
      templateKey: "connection.created",
      connectionId: args.connectionId,
    });

    // Step 2: Wait for partner assignment (could take hours/days)
    // In production, this would use step.awaitEvent
    const connection = await step.runQuery(
      internal.connections.queries.getInternal,
      { connectionId: args.connectionId },
    );

    if (connection.status === "pending_partner") {
      // Step 3: Send reminder after 24 hours if still pending
      await step.runMutation(
        internal.notifications.mutations.sendSystem,
        {
          orgId: args.orgId,
          templateKey: "connection.pending_reminder",
          connectionId: args.connectionId,
        },
        { runAfter: 24 * 60 * 60 * 1000 },
      );
    }

    return { status: "onboarding_complete" };
  },
});
```

---

## Summary: Decision Tree

```
Need to do extra work after a mutation?
  └── Is it < 30 seconds and doesn't call external APIs?
      ├── YES → ctx.scheduler.runAfter(0, internalMutation, args)
      └── NO → Is it a multi-step process that must survive restarts?
          ├── YES → Convex Workflow
          └── NO → Trigger.dev Task

Need recurring work?
  └── Is it lightweight (< 30s)?
      ├── YES → Convex Cron Job
      └── NO → Trigger.dev Scheduled Task
```
