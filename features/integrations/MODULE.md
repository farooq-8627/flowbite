# features/integrations — MODULE.md
## External Integrations
> **Phase**: 6 · **Status**: Future — locked behind individual integration feature flags
> **Gate**: Plan-gated (`Starter` plan minimum for most, `Pro` for advanced). Role-gated (`integrations.manage` permission).
> **Depends on**: Phase 2 (all entity modules), Phase 3 (AI tools for integration-aware prompts)

---

## Purpose

This module connects Orbitly to the external tools teams already use. It does NOT build new functionality — it extends existing canonical Convex mutations with a new `source` value and adds new Convex tables to track connection state and sync logs.

**The core constraint**: Every integration write goes through the **canonical mutation**. A Gmail sync creating a contact calls `contacts.create` with `source: "gmail"`. A Zapier webhook creating a lead calls `leads.create` with `source: "zapier"`. No integration-specific create logic. Ever.

---

## Priority Order

| Integration | Priority | Why |
|---|---|---|
| **Zapier/Make** | P2 | Covers 80% of integration needs before building custom ones. Webhook in + webhook out. |
| **Email (Gmail/Outlook)** | P1 | CRM without email tracking is incomplete. Log sent/received emails against contacts. |
| **WhatsApp Business API** | P1 | Gulf market primary channel. Already planned in AI module. |
| **Usage Analytics Dashboard** | P2 | Show managers their team's activity. Reduces churn. |
| **Google Calendar** | P2 | Sync reminders/follow-ups to calendar. |
| **Slack** | P3 | Notifications to Slack channels. |

---

## Email Integration (P1)

Minimum viable: log sent emails against contacts. No full email client needed.

```
What it does:
1. User connects Gmail/Outlook via OAuth
2. BCC orbitly@inbound.orbitly.app on any email to a contact
3. Trigger.dev webhook receives the email
4. Matches sender/recipient to orgMembers + contacts by email address
5. Creates a note on the contact: type="email", content=email body, subject=subject
6. Activity log entry: "Email sent to John Smith"

No email sending from Orbitly (Phase 1). Just logging.
```

```typescript
// convex/integrations/email/mutations.ts
export const logInboundEmail = internalMutation({
  args: { from: v.string(), to: v.string(), subject: v.string(), body: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    // Find contact by email
    const contact = await ctx.db.query("contacts")
      .withIndex("by_orgId_and_email", q => q.eq("orgId", args.orgId).eq("email", args.to))
      .first();
    if (!contact) return; // unknown contact — ignore

    // Create note
    await ctx.db.insert("notes", {
      orgId: args.orgId,
      entityType: "contact",
      entityId: contact._id,
      content: args.body,
      type: "email",
      metadata: { subject: args.subject, from: args.from },
      source: "email",
      createdAt: Date.now(),
    });
  },
});
```

---

## Zapier/Make Integration (P2)

Expose webhook endpoints + outbound webhooks. Covers 80% of integration needs.

```
Inbound (Zapier → Orbitly):
  POST /{orgId}/webhooks/inbound?secret={webhookSecret}
  Body: { trigger: "lead.created", data: { name, email, phone, source } }
  → Calls leads.create with source: "zapier"

Outbound (Orbitly → Zapier):
  When lead created → POST to registered webhook URL
  When deal stage changed → POST to registered webhook URL
  When reminder due → POST to registered webhook URL
```

```typescript
// convex/integrations/webhooks/schema additions
webhookEndpoints: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),
  url: v.string(),           // outbound: where to POST
  secret: v.string(),        // inbound: validates incoming requests
  triggers: v.array(v.string()), // ["lead.created", "deal.stageChanged"]
  isActive: v.boolean(),
  ...softDelete,
})
```

---

## Folder Structure

```
features/integrations/
├── MODULE.md                           # this file
├── index.ts                            # barrel export
├── _registry.ts                        # registers integration feature flags
│
├── components/
│   ├── IntegrationsHub.tsx             # Settings → Integrations page
│   ├── IntegrationCard.tsx             # One integration tile (connected/disconnected state)
│   ├── IntegrationConnectFlow.tsx      # OAuth or API key connection wizard
│   ├── IntegrationSyncLog.tsx          # Shows last N sync events for an integration
│   ├── ZapierWebhookSetup.tsx          # Copy webhook URL + secret
│   └── RestAPISettings.tsx             # API key management
│
└── docs/
    └── webhook-payload-schema.md       # External docs for Zapier/REST API partners
```

```
convex/
├── integrations/
│   ├── queries.ts                      # listByOrg(), getByKey(), getSyncLog()
│   ├── mutations.ts                    # connect(), disconnect(), updateSettings()
│   └── helpers.ts                      # verifyWebhookSignature(), mapExternalFields()
│
└── schema.ts (additions)
    ├── orgIntegrations table
    └── integrationSyncLogs table
```

```
app/api/integrations/
├── gmail/
│   ├── oauth/route.ts                  # OAuth callback — exchanges code for tokens
│   └── webhook/route.ts                # Push notification receiver (Gmail watch)
├── outlook/
│   ├── oauth/route.ts
│   └── webhook/route.ts
├── google-calendar/
│   ├── oauth/route.ts
│   └── sync/route.ts                   # Pull sync (polling every 15 min via Trigger.dev)
├── zapier/
│   └── webhook/route.ts                # Zapier → Orbitly inbound webhook
└── rest/
    └── v1/
        ├── leads/route.ts              # REST API endpoint — thin wrapper over Convex mutations
        ├── contacts/route.ts
        ├── deals/route.ts
        └── webhook-events/route.ts     # Orbitly → external outbound webhooks
```

---

## Schema Additions

```typescript
// convex/schema.ts

orgIntegrations: defineTable({
  orgId:            v.id("orgs"),
  integrationKey:   v.string(),     // "gmail" | "outlook" | "google_calendar" | "zapier" | "rest_api"
  status:           v.string(),     // "connected" | "disconnected" | "error" | "syncing"

  // OAuth tokens — stored encrypted
  accessToken:      v.optional(v.string()),
  refreshToken:     v.optional(v.string()),
  tokenExpiresAt:   v.optional(v.number()),

  // Integration-specific settings (varies by integration)
  settings:         v.optional(v.any()),
  // e.g. gmail: { syncContacts: true, syncEmails: true, labelFilter: "CRM" }
  // e.g. google_calendar: { calendarId: "primary", syncReminders: true }

  lastSyncAt:       v.optional(v.number()),
  lastSyncStatus:   v.optional(v.string()),   // "success" | "partial" | "error"
  lastSyncCount:    v.optional(v.number()),   // records synced in last run
  connectedAt:      v.number(),
  connectedBy:      v.id("users"),
  updatedAt:        v.number(),
})
.index("by_org",         ["orgId"])
.index("by_org_and_key", ["orgId", "integrationKey"]),

integrationSyncLogs: defineTable({
  orgId:            v.id("orgs"),
  integrationKey:   v.string(),
  direction:        v.string(),     // "inbound" (external → Orbitly) | "outbound" (Orbitly → external)
  status:           v.string(),     // "success" | "error" | "skipped"
  entityType:       v.optional(v.string()),
  entityId:         v.optional(v.string()),
  externalId:       v.optional(v.string()),  // the ID in the external system
  recordCode:       v.optional(v.string()),  // personCode or entityCode
  summary:          v.string(),              // human-readable: "Created contact P-023 from Gmail"
  errorMessage:     v.optional(v.string()),
  createdAt:        v.number(),
})
.index("by_org_and_integration", ["orgId", "integrationKey"])
.index("by_org_and_status",      ["orgId", "status"]),
```

---

## Integration 1 — Gmail / Outlook (Email Sync)

### What It Does
- Syncs contacts from Google Contacts / Outlook People → creates leads/contacts in Orbitly
- Logs emails sent/received to the entity's unified timeline
- Does NOT read email body content by default (privacy) — logs subject + participants only
- Optional: AI can summarise email threads if user grants access

### OAuth Flow

```typescript
// app/api/integrations/gmail/oauth/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");   // contains orgId + userId (HMAC-verified)

  // Exchange code for tokens
  const { access_token, refresh_token, expiry_date } = await exchangeGmailCode(code!);

  // Store tokens in Convex (encrypted at rest via Convex Vault or env-encrypted)
  await convex.mutation(api.integrations.connect, {
    integrationKey: "gmail",
    accessToken:   encrypt(access_token),
    refreshToken:  encrypt(refresh_token),
    tokenExpiresAt: expiry_date,
  });

  // Setup Gmail push notifications (watch API)
  await setupGmailWatch(access_token, orgId);

  return redirect(`/dashboard/${orgSlug}/settings/integrations?connected=gmail`);
}
```

### Inbound Sync — Creates Entities via Canonical Mutations

```typescript
// app/api/integrations/gmail/webhook/route.ts
// Receives Gmail push notifications when new emails arrive

export async function POST(req: Request) {
  const payload    = await req.json();
  const orgId      = resolveOrgFromGmailHistoryId(payload.historyId);
  const newEmails  = await fetchNewGmailMessages(payload, orgId);

  for (const email of newEmails) {
    // Check if sender exists in Orbitly as a lead or contact
    const existing = await convex.query(api.search.byEmail, { email: email.from, orgId });

    if (!existing) {
      // NEW: create as lead — SAME canonical mutation
      await convex.mutation(api.leads.create, {
        displayName: email.fromName ?? email.from,
        email:       email.from,
        source:      "gmail",           // ← only difference
        pipelineId:  await getDefaultPipelineId(orgId),
      });
    }

    // Log email activity on the entity's timeline — NOT storing email body
    await convex.mutation(api.activityLogs.log, {
      orgId,
      actorType:   "integration",
      action:      "email.received",
      entityType:  existing ? existing.type : "lead",
      entityId:    existing?._id ?? newLeadId,
      description: `Email from ${email.from}: "${email.subject}"`,
      metadata:    { subject: email.subject, gmailId: email.id, threadId: email.threadId },
    });
  }
}
```

---

## Integration 2 — Google Calendar

### What It Does
- Syncs Google Calendar events → creates reminders/follow-ups in Orbitly
- Optionally creates Google Calendar events from Orbitly reminders
- Meetings with known contacts are auto-tagged to the contact's timeline

### Sync Strategy

```typescript
// trigger/integrations/googleCalendarSync.ts
// Runs every 15 minutes via Trigger.dev scheduled task

export const googleCalendarSync = schedules.task({
  id: "google-calendar-sync",
  cron: "*/15 * * * *",
  run: async () => {
    const connectedOrgs = await convex.query(api.integrations.getConnectedOrgs, {
      integrationKey: "google_calendar",
    });

    for (const { orgId, accessToken } of connectedOrgs) {
      const events = await fetchCalendarEventsSince(accessToken, lastSyncAt);

      for (const event of events) {
        // Match attendees to existing contacts/leads
        for (const attendee of event.attendees ?? []) {
          const match = await convex.query(api.search.byEmail, { email: attendee.email, orgId });
          if (!match) continue;

          // Log meeting on the contact/lead timeline
          await convex.mutation(api.activityLogs.log, {
            orgId,
            actorType:   "integration",
            action:      "meeting.scheduled",
            entityType:  match.type,
            entityId:    match._id,
            description: `Meeting: "${event.summary}" on ${formatDate(event.start)}`,
            metadata:    { calendarEventId: event.id, attendees: event.attendees },
          });

          // Create a follow-up reminder for the day after the meeting
          if (event.end < Date.now() && !event.followUpCreated) {
            // Suggest follow-up — don't auto-create
            await convex.mutation(api.notifications.create, {
              orgId,
              to:          match.assignedTo,
              templateKey: "integration.post_meeting_followup",
              vars:        { personCode: match.personCode, meetingTitle: event.summary },
              action: {
                type: "suggestion",
                cta:  "Schedule Follow-up",
                ctaMutation: "reminders.create",
                ctaArgs:     { personCode: match.personCode, dueAt: Date.now() + 86400000 },
              },
            });
          }
        }
      }
    }
  },
});
```

---

## Integration 3 — Zapier Webhook

### What It Does
- Orbitly becomes a Zapier trigger (send events OUT to Zapier zaps)
- Orbitly becomes a Zapier action (receive data IN from Zapier to create/update entities)
- Outbound: `lead.created`, `deal.won`, `contact.updated` events published to a webhook URL
- Inbound: Zapier posts data → parsed → canonical mutation called

### Inbound (Zapier → Orbitly)

```typescript
// app/api/integrations/zapier/webhook/route.ts
export async function POST(req: Request) {
  // Verify Zapier secret (HMAC-SHA256)
  const signature = req.headers.get("X-Zapier-Signature");
  const body      = await req.text();
  const orgId     = req.headers.get("X-Org-Id")!;

  const integration = await convex.query(api.integrations.getByKey, {
    orgId, integrationKey: "zapier",
  });
  if (!verifyHMAC(body, integration.settings.webhookSecret, signature!)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(body);
  // payload.action = "create_lead" | "create_contact" | "update_deal" | etc.
  // payload.data   = the field values

  // Map Zapier field names → Orbitly field names using org's field definitions
  const mapped = await convex.query(api.integrations.mapZapierFields, {
    orgId, action: payload.action, data: payload.data,
  });

  // Execute via CANONICAL mutation — no special Zapier logic
  switch (payload.action) {
    case "create_lead":
      return await convex.mutation(api.leads.create, { ...mapped, source: "zapier" });
    case "create_contact":
      return await convex.mutation(api.contacts.create, { ...mapped, source: "zapier" });
    case "update_deal":
      return await convex.mutation(api.deals.update, { ...mapped, source: "zapier" });
  }
}
```

### Outbound (Orbitly → Zapier)

```typescript
// convex/integrations/helpers.ts
// Called from logActivity() when an event matches a configured outbound trigger

export async function fireOutboundWebhooks(
  ctx: MutationCtx,
  event: { action: string; entityType: string; entityId: string; orgId: Id<"orgs"> }
) {
  const integration = await ctx.db.query("orgIntegrations")
    .withIndex("by_org_and_key", q => q.eq("orgId", event.orgId).eq("integrationKey", "zapier"))
    .first();

  if (!integration?.settings?.outboundWebhookUrl) return;

  const triggers = integration.settings.triggers ?? [];
  if (!triggers.includes(event.action)) return;

  // Schedule the HTTP call — non-blocking, with retry
  await ctx.scheduler.runAfter(0, internal.integrations.sendOutboundWebhook, {
    webhookUrl: integration.settings.outboundWebhookUrl,
    secret:     integration.settings.webhookSecret,
    payload:    { event: event.action, entityType: event.entityType, entityId: event.entityId },
  });
}
```

---

## Integration 4 — REST API

### What It Does
- A documented REST API for developers and enterprise customers to build custom integrations
- API key-based auth (no OAuth needed for the API itself)
- Rate-limited per org based on plan tier
- Thin HTTP wrappers over the same Convex queries/mutations

### API Design Principles

```typescript
// app/api/rest/v1/leads/route.ts
// This is the thinnest possible wrapper — all logic lives in Convex

export async function GET(req: Request) {
  const apiKey = req.headers.get("X-API-Key");
  const orgId  = await verifyAPIKey(apiKey);   // looks up key in convex
  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const result = await convex.query(api.leads.list, {
    pipelineId:  searchParams.get("pipelineId") ?? undefined,
    stageId:     searchParams.get("stageId")    ?? undefined,
    take:        Number(searchParams.get("limit") ?? 50),
    cursor:      searchParams.get("cursor")      ?? undefined,
  });

  return Response.json({
    data:       result.page,
    nextCursor: result.continueCursor,
    hasMore:    !result.isDone,
  });
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("X-API-Key");
  const orgId  = await verifyAPIKey(apiKey);
  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();

  // Same canonical mutation — source: "rest_api"
  const result = await convex.mutation(api.leads.create, {
    ...body,
    source: "rest_api",
  });

  return Response.json({ data: result }, { status: 201 });
}
```

---

## Integrations Hub UI

```typescript
// features/integrations/components/IntegrationsHub.tsx
// Accessible at Settings → Integrations

const AVAILABLE_INTEGRATIONS = [
  {
    key:         "gmail",
    name:        "Gmail",
    description: "Sync contacts and log emails",
    icon:        GmailIcon,
    minPlan:     "starter",
    connectUrl:  "/api/integrations/gmail/oauth",
  },
  {
    key:         "outlook",
    name:        "Microsoft Outlook",
    description: "Sync contacts and log emails",
    icon:        OutlookIcon,
    minPlan:     "starter",
    connectUrl:  "/api/integrations/outlook/oauth",
  },
  {
    key:         "google_calendar",
    name:        "Google Calendar",
    description: "Sync meetings and schedule follow-ups",
    icon:        CalendarIcon,
    minPlan:     "starter",
    connectUrl:  "/api/integrations/google-calendar/oauth",
  },
  {
    key:         "zapier",
    name:        "Zapier",
    description: "Connect Orbitly to 5,000+ apps",
    icon:        ZapierIcon,
    minPlan:     "pro",
    manualSetup: true,  // No OAuth — show webhook URL + instructions
  },
  {
    key:         "rest_api",
    name:        "REST API",
    description: "Build custom integrations for your team",
    icon:        Code2Icon,
    minPlan:     "starter",
    manualSetup: true,  // API key management UI
  },
];

export function IntegrationsHub() {
  const connections = useQuery(api.integrations.listByOrg);

  return (
    <PermissionGate permission="integrations.manage">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AVAILABLE_INTEGRATIONS.map(integration => (
          <IntegrationCard
            key={integration.key}
            integration={integration}
            connection={connections?.find(c => c.integrationKey === integration.key)}
          />
        ))}
      </div>
    </PermissionGate>
  );
}
```

---

## Sync Log Viewer

```typescript
// features/integrations/components/IntegrationSyncLog.tsx
// Shown below each connected integration card
// Displays last 20 sync events: success (green), error (red), skipped (grey)
// Each row: direction icon, entity code, summary, timestamp
// Example: "← Gmail | P-047 | Created contact from john@company.com | 2h ago"
```

---

## Source Tracking — Complete List

With integrations added, the `source` field on all entity mutations becomes:

| Source | Description |
|---|---|
| `manual` | Created by user via UI |
| `ai` | Created by AI assistant |
| `whatsapp` | Created via WhatsApp voice/message |
| `csv` | Created via CSV import |
| `gmail` | Created via Gmail sync |
| `outlook` | Created via Outlook sync |
| `zapier` | Created via Zapier webhook |
| `rest_api` | Created via REST API |
| `mcp` | Created via MCP server (future) |
| `google_calendar` | Created via Google Calendar sync |

---

## Feature Flag Registration

```typescript
// features/_registry.ts — add:
{ key: "integrations_email",    name: "Email Integrations",  minPlan: "starter", phase: 6 },
{ key: "integrations_calendar", name: "Calendar Sync",       minPlan: "starter", phase: 6 },
{ key: "integrations_zapier",   name: "Zapier",              minPlan: "pro",     phase: 6 },
{ key: "integrations_api",      name: "REST API Access",     minPlan: "starter", phase: 6 },
```

---

## Never-Do List for This Module

```typescript
// ❌ Never write integration-specific create logic — always call canonical mutation with source:
// ❌ Never store raw access tokens in plain text — encrypt before storing in Convex
// ❌ Never process webhook payloads without signature verification first
// ❌ Never call external APIs from inside Convex mutations — use Trigger.dev tasks
// ❌ Never fire outbound webhooks synchronously — always ctx.scheduler.runAfter(0, ...)
// ❌ Never sync email body content by default — log subject + participants only (privacy)
// ❌ Never allow integrations.manage without org owner/admin role
// ❌ Never skip logging to integrationSyncLogs — audit trail is required
// ❌ Never remove the source field from any mutation call — it must always be set
```