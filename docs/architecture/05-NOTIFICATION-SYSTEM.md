# 05 — Notification System

> How notifications are created, stored, delivered, and consumed. Features call one function and the system handles the rest.

---

## What "Workflows" Mean In Our App

Before diving into notifications, let's clarify **what "workflow" means** since this applies to notifications, activity logs, and every other base system:

A **workflow** in our app is a **sequence of backend steps triggered by a single user action or system event**. For example:

> Admin assigns a partner to a connection. This is one mutation. But the **workflow** that unfolds is:
> 1. Update the connection record (set `partnerId`, change `status` to `active`)
> 2. Create an activity log entry ("Admin X assigned Partner Y to Connection Z")
> 3. Send an in-app notification to the partner ("You've been assigned to project ABC")
> 4. Send an in-app notification to the client ("A partner has been assigned to your project")
> 5. Send an email to the partner via background job
> 6. Fire a PostHog event for analytics

The **feature mutation handles step 1 and then calls base system helpers for steps 2-6**. The feature doesn't build a notification system — it calls `.notify()`. The feature doesn't build a logging system — it calls `.logActivity()`. That's the architectural principle: **features compose base systems, they don't rebuild them.**

---

## Understanding `entityType`, `entityId`, and `metadata`

These three fields appear in both notifications and activity logs. Here's exactly what they mean and why they exist:

### `entityType: string`
The **type of business entity** the notification is about. Examples: `"connection"`, `"invoice"`, `"member"`, `"payment"`.

**Why it exists:**
- Groups notifications by entity in the UI ("All notifications about this connection")
- Used to build the action URL (e.g. `/dashboard/connections/[id]`)
- Lets you filter notifications by feature: "show me all connection notifications"
- Used for analytics: "which entity types generate the most notifications?"

### `entityId: string`
The **specific document ID** of the entity. Combined with `entityType`, this uniquely identifies exactly what the notification is about.

**Why it exists:**
- Navigation: clicking a notification navigates to `/dashboard/connections/[entityId]`
- Fetching context: the notification bell can pre-fetch the entity to show a preview
- Deduplication: prevents sending duplicate notifications for the same entity event

### `metadata: Record<string, any>`
A **free-form object** for any extra data that doesn't fit in template variables. Think of it as an escape hatch.

**When to use it:**
- Storing data needed for rendering that isn't in the template (`metadata: { avatarUrl, commentText }`)
- Feature-specific context that doesn't belong in a shared template
- Debugging: attach raw event data for support purposes

**In most cases, you won't need metadata.** Template variables cover 90% of notification content.

### Example putting it together:
```ts
// What this tells the system:
// "User was notified about CONNECTION entity with ID 'abc123',
//  which they can navigate to, and we're storing extra context in metadata"
await sendNotification(ctx, {
  templateKey: "connection.assigned",
  to: args.partnerId,
  vars: { projectTitle: connection.title, role: "partner" },
  // These three together:
  entityType: "connection",           // ← What kind of thing?
  entityId: args.connectionId,        // ← Which specific one?
  metadata: { estimatedValue: 5000 }, // ← Any extra data needed?
});
```

---

## Architecture

```
Feature Mutation
    │
    ├── 1. Business logic (update connection)
    │
    ├── 2. logActivity(ctx, { ... })          ← calls activityLogs helper
    │
    ├── 3. sendNotification(ctx, { ... })     ← calls notifications helper
    │       │
    │       ├── Insert into notifications table (in-app)
    │       └── Schedule email via ctx.scheduler (optional)
    │
    └── 4. Return result to client
```

---

## Compact `sendNotification` — Auto-Injected Context

The helper automatically infers `orgId` and `actorId` (the person who triggered the action) from `ctx`. You only pass what changes per call:

```ts
// convex/notifications/helpers.ts

/**
 * Sends an in-app notification (and optionally an email) to a user.
 *
 * orgId  — automatically inferred from ctx.org._id (no need to pass)
 * actor  — automatically inferred from ctx.user._id (the logged-in user who triggered the action)
 *
 * Use for:
 *   - Notifying a user about something that happened to them (partner assigned, invoice sent)
 *   - Notifying an admin about something a user did (new project submitted)
 *   - System alerts about entity state changes (status changed to review)
 */
export async function sendNotification(
  ctx: MutationCtx,
  params: {
    templateKey: string;                     // "connection.assigned" — resolves title, body, email
    to: Id<"users">;                         // Recipient. The logged-in user is ctx.user, NOT the recipient.
    vars: Record<string, string>;            // Variables for the template: { projectTitle, role, ... }
    entityType?: string;                     // "connection" (default) — what kind of entity is this about?
    entityId?: string;                       // The specific document ID for navigation
    metadata?: Record<string, any>;          // Extra context (rarely needed)
  },
) {
  // orgId and actorId come from the authenticated context automatically
  const orgId = ctx.org._id;

  const template = NOTIFICATION_TEMPLATES[params.templateKey];
  if (!template) throw new Error(`Unknown notification template: ${params.templateKey}`);

  const now = Date.now();

  const notificationId = await ctx.db.insert("notifications", {
    orgId,
    userId: params.to,
    type: template.type,
    title: template.title(params.vars),
    body: template.body?.(params.vars) ?? null,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl: template.actionUrl?.(params.vars),
    read: false,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  });

  if (template.sendEmail && template.emailSubject) {
    await ctx.scheduler.runAfter(0, internal.email.actions.sendNotificationEmail, {
      notificationId,
      userId: params.to,
      subject: template.emailSubject(params.vars),
      template: template.emailTemplate ?? "default",
      variables: params.vars,
    });
  }

  return notificationId;
}
```

---

## Notification Templates

### Base Templates (global, live in `convex/notifications/templates.ts`)

These cover system-level events (member invites, role changes, billing). They are always available.

```ts
// convex/notifications/templates.ts

export type NotificationTemplate = {
  type: string;
  title: (vars: Record<string, string>) => string;
  body?: (vars: Record<string, string>) => string;
  actionUrl?: (vars: Record<string, string>) => string;
  emailSubject?: (vars: Record<string, string>) => string;
  emailTemplate?: string;
  sendEmail: boolean;
};

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  "member.invited": {
    type: "member.invited",
    title: (v) => `You've been invited to ${v.orgName}`,
    body: (v) => `${v.inviterName} invited you to join ${v.orgName} as ${v.role}.`,
    actionUrl: () => `/dashboard/settings/organization`,
    emailSubject: (v) => `Invitation to join ${v.orgName}`,
    emailTemplate: "invitation",
    sendEmail: true,
  },
  "member.roleChanged": {
    type: "member.roleChanged",
    title: () => `Your role has been updated`,
    body: (v) => `Your role in ${v.orgName} has been changed to ${v.newRole}.`,
    sendEmail: false,
  },
};
```

### Feature Templates (live inside the feature folder)

Feature-specific templates go in `convex/[feature]/notifications.ts` and are **registered** into the global map. This keeps the feature self-contained — you add, update, or remove feature templates without touching the base system.

```ts
// convex/connections/notifications.ts
import { NOTIFICATION_TEMPLATES } from "../notifications/templates";

/**
 * Registers all notification templates for the connections feature.
 * Called once at startup. Safe to call multiple times (idempotent).
 *
 * Add new templates here when the connections feature needs a new notification type.
 * Remove this whole file when the connections feature is deleted.
 */
export function registerConnectionNotifications() {
  Object.assign(NOTIFICATION_TEMPLATES, {

    // Sent to the client when admin creates a new connection for them
    "connection.created": {
      type: "connection.created",
      title: (v: Record<string, string>) => `New project created: ${v.projectTitle}`,
      body: (v: Record<string, string>) => `A new project "${v.projectTitle}" has been set up for you.`,
      actionUrl: (v: Record<string, string>) => `/dashboard/connections/${v.connectionId}`,
      sendEmail: false,
    },

    // Sent to the partner when assigned, and to client when a partner is confirmed
    "connection.assigned": {
      type: "connection.assigned",
      title: (v: Record<string, string>) => `Assigned to project: ${v.projectTitle}`,
      body: (v: Record<string, string>) => `You've been assigned as ${v.role} on "${v.projectTitle}".`,
      actionUrl: (v: Record<string, string>) => `/dashboard/connections/${v.connectionId}`,
      emailSubject: (v: Record<string, string>) => `New project assignment: ${v.projectTitle}`,
      emailTemplate: "connectionAssigned",
      sendEmail: true,
    },

    // Sent to all parties when connection status changes
    "connection.statusChanged": {
      type: "connection.statusChanged",
      title: (v: Record<string, string>) => `Project update: ${v.projectTitle}`,
      body: (v: Record<string, string>) => `"${v.projectTitle}" status changed to ${v.newStatus}.`,
      actionUrl: (v: Record<string, string>) => `/dashboard/connections/${v.connectionId}`,
      sendEmail: false,
    },

  });
}
```

Call `registerConnectionNotifications()` at the top of `convex/connections/mutations.ts` — once — before any mutation is defined.

---

## Compact Calling Pattern — Per-Frequency Rule

Not every notification needs a dedicated template. Apply this rule:

| Called how often? | Pattern |
|---|---|
| **Used in 3+ places or across features** | Define a named template in the feature's `notifications.ts` |
| **Used in 1–2 places within the same mutation** | Inline with `sendNotification()` directly |

### Example: Two notifications, same mutation — no template needed

```ts
// One-off notifications don't need templates — just use sendNotification() inline
await sendNotification(ctx, {
  templateKey: "connection.assigned",
  to: args.partnerId,
  vars: { projectTitle: connection.title, role: "partner", connectionId: args.connectionId },
  entityType: "connection",
  entityId: args.connectionId,
});

if (connection.clientId) {
  await sendNotification(ctx, {
    templateKey: "connection.statusChanged",
    to: connection.clientId,
    vars: { projectTitle: connection.title, newStatus: "active", connectionId: args.connectionId },
    entityType: "connection",
    entityId: args.connectionId,
  });
}
```

Notice that `orgId` is **gone** — it's inferred from `ctx` automatically. That's the compact version.

---

## How a Feature Calls Notifications (Clean Version)

```ts
// convex/connections/mutations.ts
import { orgMutation } from "../_functions/authenticated";
import { sendNotification } from "../notifications/helpers";
import { logActivity } from "../activityLogs/helpers";
import { v } from "convex/values";
import { registerConnectionNotifications } from "./notifications";

// Register feature templates once, at module load time
registerConnectionNotifications();

export const assignPartner = orgMutation({
  args: {
    connectionId: v.id("connections"),
    partnerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.orgId !== ctx.org._id) throw new Error("Connection not found");

    await ctx.db.patch(args.connectionId, {
      partnerId: args.partnerId,
      status: "active",
      updatedAt: Date.now(),
    });

    // Activity log — compact: orgId and userId come from ctx automatically
    await logActivity(ctx, {
      action: "assigned",
      entityType: "connection",
      entityId: args.connectionId,
      description: `Assigned partner to "${connection.title}"`,
    });

    // Notify partner
    await sendNotification(ctx, {
      templateKey: "connection.assigned",
      to: args.partnerId,
      vars: { projectTitle: connection.title, role: "partner", connectionId: args.connectionId },
      entityType: "connection",
      entityId: args.connectionId,
    });

    // Notify client
    if (connection.clientId) {
      await sendNotification(ctx, {
        templateKey: "connection.statusChanged",
        to: connection.clientId,
        vars: { projectTitle: connection.title, newStatus: "active", connectionId: args.connectionId },
        entityType: "connection",
        entityId: args.connectionId,
      });
    }
  },
});
```

**Compared to before:** Every `sendNotification` call dropped `orgId: ctx.org._id` and `userId: ctx.user._id` (for actor). That's 2 lines removed per call. `logActivity` also dropped those fields.

---

## Functions in the Notification System — Where Each Is Used

| Function | File | Used When |
|---|---|---|
| `sendNotification(ctx, params)` | `convex/notifications/helpers.ts` | **Inside any feature mutation** that needs to tell a user something happened. The primary entry point for all features. |
| `registerXNotifications()` | `convex/[feature]/notifications.ts` | **In the feature's mutations.ts** (once, at top) to register that feature's template keys before the first mutation runs. |
| `list` query | `convex/notifications/queries.ts` | **Frontend bell component** — fetches the current user's notifications for the dropdown. |
| `unreadCount` query | `convex/notifications/queries.ts` | **Frontend bell badge** — shows the red number badge. |
| `markAsRead` mutation | `convex/notifications/mutations.ts` | **Frontend** — when user clicks a notification to dismiss it. |
| `markAllAsRead` mutation | `convex/notifications/mutations.ts` | **Frontend** — "Mark all read" button. |
| `sendNotificationEmail` action | `convex/email/actions.ts` | **Internal** — scheduled by `sendNotification()` automatically when `template.sendEmail = true`. Never called directly by features. |
| `archiveOld` internal mutation | `convex/notifications/mutations.ts` | **Cron job** — runs daily to archive notifications older than 30 days. Never called by features. |

---

## Notification Queries (Frontend)

```ts
// convex/notifications/queries.ts
import { orgQuery } from "../_functions/authenticated";
import { v } from "convex/values";

export const list = orgQuery({
  args: {
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("notifications")
      .withIndex("by_orgId_and_userId", qb =>
        qb.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .order("desc")
      .take(50);

    if (args.unreadOnly) return results.filter(n => !n.read);
    return results;
  },
});

export const unreadCount = orgQuery({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_read", q =>
        q.eq("userId", ctx.user._id).eq("read", false)
      )
      .take(100);
    return unread.length;
  },
});
```

### Frontend Hook

```ts
// lib/hooks/useNotifications.ts
export function useNotifications() {
  const { orgId } = useCurrentUser();
  const notifications = useQuery(
    api.notifications.queries.list,
    orgId ? { orgId } : "skip",
  );
  const unreadCount = useQuery(
    api.notifications.queries.unreadCount,
    orgId ? { orgId } : "skip",
  );
  const markAsRead = useMutation(api.notifications.mutations.markAsRead);
  const markAllAsRead = useMutation(api.notifications.mutations.markAllAsRead);

  return { notifications, unreadCount, markAsRead, markAllAsRead };
}
```

---

## Notification Lifecycle

```
created → displayed (real-time via Convex subscription) → read → archived
                                                                    │
                                                         (cron: auto-archive after 30 days)
```

---

## Extending: Adding a New Notification Type

1. Add a template entry to your **feature's** `convex/[feature]/notifications.ts`
2. Call `sendNotification()` from your feature mutation with the new template key
3. Optionally, add an email template in `convex/email/templates.ts`

That's it. No new components, no new tables, no new routes.

---

## Removing a Feature's Notifications

When removing a feature:
1. Delete `convex/[feature]/notifications.ts` — templates disappear with the file
2. Delete any `sendNotification()` calls in the feature mutations
3. Done — the base notification system is untouched

