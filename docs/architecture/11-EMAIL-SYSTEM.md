# 11 — Email System

> All email goes through Resend. Emails are sent from background jobs, never from the request path. Every send is logged.

---

## Architecture

```
Mutation (business logic)
  │
  ├── ctx.scheduler.runAfter(0, internal.email.actions.send, { ... })
  │
  └── (returns immediately to user)

Background:
  internal.email.actions.send
    ├── Render template → HTML
    ├── Call Resend API
    ├── Log result in emailLogs table
    └── Handle errors (retry or log failure)
```

**Why background?** Email APIs can be slow (500ms+). Sending in-band makes mutations feel sluggish. Background sending keeps the UI snappy.

---

## Email Action

```ts
// convex/email/actions.ts
"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const send = internalAction({
  args: {
    orgId: v.id("orgs"),
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    template: v.string(),
  },
  handler: async (ctx, args) => {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "noreply@yourdomain.com",
        to: args.to,
        subject: args.subject,
        html: args.html,
      });

      // Log success
      await ctx.runMutation(internal.email.mutations.logEmail, {
        orgId: args.orgId,
        to: args.to,
        subject: args.subject,
        template: args.template,
        status: "sent",
        resendId: result.data?.id,
      });
    } catch (error) {
      // Log failure
      await ctx.runMutation(internal.email.mutations.logEmail, {
        orgId: args.orgId,
        to: args.to,
        subject: args.subject,
        template: args.template,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

export const sendNotificationEmail = internalAction({
  args: {
    notificationId: v.id("notifications"),
    userId: v.id("users"),
    subject: v.string(),
    template: v.string(),
    variables: v.any(),
  },
  handler: async (ctx, args) => {
    // 1. Look up user email
    const user = await ctx.runQuery(internal.users.queries.getInternal, {
      userId: args.userId,
    });
    if (!user?.email) return;

    // 2. Render template
    const html = renderEmailTemplate(args.template, args.variables);

    // 3. Send via Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "noreply@yourdomain.com",
      to: user.email,
      subject: args.subject,
      html,
    });
  },
});
```

---

## Email Templates

```ts
// convex/email/templates.ts
export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  const templates: Record<string, (v: Record<string, string>) => string> = {
    invitation: (v) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're invited to join ${v.orgName}</h2>
        <p>${v.inviterName} has invited you to join ${v.orgName} as a ${v.role}.</p>
        <a href="${v.inviteLink}" style="background: #0F172A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept Invitation
        </a>
      </div>
    `,
    connectionAssigned: (v) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Project Assignment</h2>
        <p>You've been assigned to project "${v.projectTitle}".</p>
        <a href="${v.actionUrl}" style="background: #0F172A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Project
        </a>
      </div>
    `,
    default: (v) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${v.title ?? "Notification"}</h2>
        <p>${v.body ?? ""}</p>
      </div>
    `,
  };

  const renderer = templates[template] ?? templates.default;
  return renderer(variables);
}
```

**Adding a new email template**: Add one function to this object. Used automatically when the matching template key is passed.

---

## For Heavy Email: Trigger.dev

For bulk sending (100+ emails), use a Trigger.dev task instead of Convex scheduler to handle rate limits and retries:

```ts
// trigger/email/sendBulk.ts — see 08-BACKGROUND-JOBS.md
```
