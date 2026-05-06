# features/client-portal — MODULE.md
## Client & Partner Portal
> **Phase**: 9 · **Status**: Future — locked behind `client_portal` feature flag
> **Gate**: Plan-gated (`Pro` plan minimum). Role-gated — portal access managed by org admin.
> **Depends on**: Phase 2 (all entity modules), Phase 8 (projects, milestones), Phase 3 (AI tools)

---

## Purpose

The client portal gives **external parties** (clients, partners, suppliers) a purpose-built view into the data that's relevant to them — without ever seeing the full CRM. It is a **completely separate application layer** with its own layout, its own auth system, its own permission scope, and its own URL structure (`/portal/[orgSlug]/...`).

**What the portal is**:
- A read-only (or limited write) dashboard for a specific person (`personCode`)
- Shows: their deals, project progress, milestones, documents, invoices (Phase 9)
- Branded with the org's logo and colours
- Accessed via a **magic link** sent by the org — no password needed

**What the portal is NOT**:
- A full CRM view (clients never see pipeline, other contacts, or internal notes)
- A replacement for the main dashboard
- Accessible without explicit invitation from the org

---

## Folder Structure

```
features/client-portal/
├── MODULE.md                           # this file
├── index.ts                            # barrel export
│
└── components/
    ├── PortalInviteFlow.tsx            # "Send Portal Access" button on contact/lead detail
    ├── PortalAccessManager.tsx         # Settings page: who has portal access, revoke links
    └── PortalPreview.tsx              # Admin preview of what client will see
```

```
app/[locale]/portal/
└── [orgSlug]/
    ├── layout.tsx                      # PortalLayout — branded header, no internal nav
    ├── page.tsx                        # Portal home — overview for this person
    ├── deals/
    │   └── [dealCode]/page.tsx         # Deal detail — filtered view
    ├── projects/
    │   └── [projectCode]/page.tsx      # Project progress view
    └── documents/page.tsx             # Document library for this person
```

```
convex/
├── portal/
│   ├── queries.ts                      # Portal-scoped queries — personCode-filtered only
│   ├── mutations.ts                    # portalComment(), requestUpdate()
│   └── auth.ts                         # Magic link generation + session management
│
└── schema.ts (additions)
    ├── portalSessions table
    └── portalAccessLinks table
```

---

## Security Model — Completely Separate from Org Auth

The portal uses a **different authentication system** from the main dashboard. There is a hard separation at every layer:

```
Main Dashboard Auth:          Portal Auth:
@convex-dev/auth              Magic link → portalSessions table
jwt in cookies                session token in cookie (different cookie name)
org member check              personCode ownership check
ctx.org._id                   ctx.portalPersonCode
orgMutation / orgQuery        portalMutation / portalQuery
```

Portal sessions are short-lived (7 days) and scoped strictly to one `personCode` within one org.

### Magic Link Flow

```typescript
// convex/portal/auth.ts

// Step 1: Org admin sends a portal invitation
export const sendPortalInvite = orgMutation({
  args: {
    personCode: v.string(),    // "P-001"
    email:      v.string(),    // where to send the magic link
    expiresInDays: v.optional(v.number()),  // default: 30
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "portal.invite");

    // Generate a secure random token
    const token    = generateSecureToken(); // 32-byte hex
    const expiresAt = Date.now() + ((args.expiresInDays ?? 30) * 86400000);

    await ctx.db.insert("portalAccessLinks", {
      orgId:      ctx.org._id,
      personCode: args.personCode,
      email:      args.email,
      token,
      expiresAt,
      usedAt:     undefined,
      revokedAt:  undefined,
      createdBy:  ctx.user._id,
      createdAt:  Date.now(),
    });

    // Send magic link via Resend
    await ctx.scheduler.runAfter(0, internal.emails.sendPortalInvite, {
      to:     args.email,
      orgId:  ctx.org._id,
      token,
      link:   `${process.env.NEXT_PUBLIC_APP_URL}/portal/${ctx.org.slug}/auth?token=${token}`,
    });

    await logActivity(ctx, {
      action:     "portal.invite_sent",
      entityType: "contact",
      entityId:   args.personCode,   // record by personCode
      description: `Portal invitation sent to ${args.email}`,
    });
  },
});

// Step 2: Client clicks magic link → /portal/[orgSlug]/auth?token=xxx
// app/[locale]/portal/[orgSlug]/auth/route.ts

export async function GET(req: Request) {
  const token   = new URL(req.url).searchParams.get("token");
  const orgSlug = req.nextUrl.pathname.split("/")[3];

  const link = await convex.query(api.portal.validateToken, { token, orgSlug });

  if (!link || link.expiresAt < Date.now() || link.revokedAt) {
    return redirect(`/portal/${orgSlug}/expired`);
  }

  // Create a portal session
  const sessionToken = generateSecureToken();
  await convex.mutation(api.portal.createSession, {
    orgId:      link.orgId,
    personCode: link.personCode,
    email:      link.email,
    token:      sessionToken,
    linkId:     link._id,
    expiresAt:  Date.now() + 7 * 86400000,  // 7-day session
  });

  // Mark link as used
  await convex.mutation(api.portal.markLinkUsed, { linkId: link._id });

  // Set session cookie and redirect to portal home
  const response = redirect(`/portal/${orgSlug}`);
  response.cookies.set("orbitly-portal-session", sessionToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   7 * 86400,
    path:     `/portal/${orgSlug}`,  // scoped to this org's portal only
  });
  return response;
}
```

---

## Portal Queries — Scoped to personCode Only

All portal queries use a different function builder — `portalQuery` — that derives the person from the session cookie instead of `ctx.user`:

```typescript
// convex/_functions/portal.ts
export const portalQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    // Validate portal session from Authorization header
    const sessionToken = ctx.auth.getUserIdentity()?.tokenIdentifier;
    if (!sessionToken) throw new ConvexError("Not authenticated as portal user");

    const session = await ctx.db.query("portalSessions")
      .withIndex("by_token", q => q.eq("token", sessionToken))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Portal session expired");
    }

    return {
      ctx: {
        ...ctx,
        portalPersonCode: session.personCode,
        portalOrgId:      session.orgId,
        portalEmail:      session.email,
      },
    };
  },
});

// Usage — portal query can ONLY see data for its personCode:
export const getMyDeals = portalQuery({
  handler: async (ctx) => {
    // ctx.portalPersonCode is guaranteed — cannot be spoofed
    return ctx.db.query("deals")
      .withIndex("by_org_and_person", q =>
        q.eq("orgId", ctx.portalOrgId).eq("personCode", ctx.portalPersonCode))
      .filter(q => q.neq(q.field("currentStageId"), "lost"))  // don't show lost deals
      .collect();
    // No other deals are ever accessible — orgId + personCode double-filter
  },
});

export const getMyProjectProgress = portalQuery({
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects")
      .withIndex("by_org_and_person", q =>
        q.eq("orgId", ctx.portalOrgId).eq("personCode", ctx.portalPersonCode))
      .filter(q => q.neq(q.field("status"), "cancelled"))
      .collect();

    // For each project: return milestones and completion % — NO internal notes or team comments
    return Promise.all(projects.map(async p => ({
      ...p,
      milestones:  await getMilestonesForPortal(ctx, p._id),
      tasks:       await getPublicTasksForPortal(ctx, p._id),  // only non-internal tasks
      completionPct: computeCompletionPct(p),
    })));
  },
});
```

---

## Portal Layout — Branded, Minimal

```typescript
// app/[locale]/portal/[orgSlug]/layout.tsx
// This layout is COMPLETELY separate from DashboardLayout
// No sidebar, no AI panel, no internal nav

export default async function PortalLayout({ children, params }) {
  // Validate portal session server-side
  const session = await getPortalSession(params.orgSlug);
  if (!session) redirect(`/portal/${params.orgSlug}/expired`);

  // Load org branding (logo, primary colour, org name)
  const org = await convex.query(api.portal.getOrgBranding, { orgSlug: params.orgSlug });

  return (
    <div className="min-h-screen flex flex-col" style={{ "--portal-primary": org.brandColor }}>
      {/* Minimal branded header */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        {org.logoUrl
          ? <img src={org.logoUrl} alt={org.name} className="h-8" />
          : <span className="font-semibold">{org.name}</span>
        }
        <div className="text-sm text-muted-foreground">
          Logged in as {session.email}
          <Button variant="ghost" size="sm" className="ms-2" onClick={signOutPortal}>
            Sign out
          </Button>
        </div>
      </header>

      {/* Portal content — no sidebar */}
      <main className="flex-1 container max-w-4xl mx-auto py-8 px-4">
        {children}
      </main>

      {/* Minimal footer */}
      <footer className="border-t px-6 py-3 text-center text-xs text-muted-foreground">
        Powered by Orbitly · {org.name}
      </footer>
    </div>
  );
}
```

---

## Portal Home — What the Client Sees

```typescript
// app/[locale]/portal/[orgSlug]/page.tsx
export default function PortalHome() {
  const deals    = useQuery(api.portal.getMyDeals);
  const projects = useQuery(api.portal.getMyProjectProgress);
  const docs     = useQuery(api.portal.getMyDocuments);

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground">Here's your current status with {orgName}.</p>
      </div>

      {/* Active deals */}
      {deals && deals.length > 0 && (
        <Section title="Your Deals">
          {deals.map(deal => (
            <PortalDealCard key={deal._id} deal={deal} />
          ))}
        </Section>
      )}

      {/* Projects (Phase 8+) */}
      {projects && projects.length > 0 && (
        <Section title="Your Projects">
          {projects.map(project => (
            <PortalProjectCard key={project._id} project={project} />
          ))}
        </Section>
      )}

      {/* Documents */}
      {docs && docs.length > 0 && (
        <Section title="Your Documents">
          {docs.map(doc => (
            <PortalDocumentRow key={doc._id} doc={doc} />
          ))}
        </Section>
      )}
    </div>
  );
}
```

---

## Portal Deal Card — Filtered View

```typescript
// The portal deal card NEVER shows:
// - Internal stage names the client shouldn't know ("Stale", "Qualified")
// - Assigned agent names (unless org enables this in portal settings)
// - Deal value (hidden by default)
// - Other contacts' personCodes
// - Internal notes or activity logs

// The portal deal card ALWAYS shows:
// - Deal title (public-facing)
// - Current stage display name (org can set a "portal-friendly" name per stage)
// - Key dates (start date, expected completion)
// - Documents attached to this deal
// - A "Request Update" button → fires portalMutation that notifies the assigned agent

export function PortalDealCard({ deal }: { deal: PortalDeal }) {
  const requestUpdate = useMutation(api.portal.requestUpdate);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{deal.title}</CardTitle>
        <Badge>{deal.portalStageLabel ?? deal.currentStageName}</Badge>
      </CardHeader>
      <CardContent>
        {deal.expectedCompletionDate && (
          <p className="text-sm text-muted-foreground">
            Expected: {formatDate(deal.expectedCompletionDate)}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => requestUpdate({ dealCode: deal.dealCode })}
        >
          Request Update
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## Portal Limited Write Actions

The portal allows limited write actions — all go through `portalMutation` builder which enforces personCode scope:

```typescript
// convex/portal/mutations.ts

// Client can leave a comment on their deal or project
export const leaveComment = portalMutation({
  args: { entityType: v.string(), entityCode: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    // Verify entity belongs to this portalPersonCode
    await verifyEntityOwnership(ctx, args.entityCode, ctx.portalPersonCode);

    // Create a note with authorType: "portal_client" — visible to agents but flagged
    await ctx.db.insert("notes", {
      orgId:      ctx.portalOrgId,
      entityType: args.entityType,
      entityId:   args.entityCode,
      content:    args.content,
      authorId:   undefined,   // no internal user
      authorEmail: ctx.portalEmail,
      authorType: "portal_client",
      isInternal: false,
      isPinned:   false,
      createdAt:  Date.now(),
      updatedAt:  Date.now(),
    });

    // Notify the assigned agent
    await sendNotification(ctx, {
      to:          await getAssignedAgent(ctx, args.entityCode, ctx.portalOrgId),
      templateKey: "portal.client_comment",
      vars:        { personCode: ctx.portalPersonCode, entityCode: args.entityCode },
    });
  },
});

// Client can request an update — fires a notification to the assigned agent
export const requestUpdate = portalMutation({
  args: { dealCode: v.string() },
  handler: async (ctx, args) => {
    await verifyEntityOwnership(ctx, args.dealCode, ctx.portalPersonCode);

    await sendNotification(ctx, {
      to:          await getAssignedAgent(ctx, args.dealCode, ctx.portalOrgId),
      templateKey: "portal.update_requested",
      vars:        { dealCode: args.dealCode, personCode: ctx.portalPersonCode, email: ctx.portalEmail },
    });

    await logActivity(ctx, {
      orgId:      ctx.portalOrgId,
      actorType:  "integration",
      action:     "portal.update_requested",
      entityType: "deal",
      entityId:   args.dealCode,
      description: `${ctx.portalEmail} requested a status update on ${args.dealCode}`,
    });
  },
});
```

---

## Access Management — Org Admin UI

```typescript
// features/client-portal/components/PortalAccessManager.tsx
// Accessible at Settings → Portal Access

export function PortalAccessManager() {
  const links = useQuery(api.portal.listAccessLinks);
  const revoke = useMutation(api.portal.revokeLink);

  return (
    <PermissionGate permission="portal.manage">
      <div className="space-y-4">
        {/* Existing access links */}
        {links?.map(link => (
          <div key={link._id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">{link.email}</p>
              <p className="text-xs text-muted-foreground">
                Person: {link.personCode} ·
                {link.usedAt ? ` Last used ${relativeTime(link.usedAt)}` : " Not yet accessed"} ·
                {link.revokedAt ? " Revoked" : ` Expires ${formatDate(link.expiresAt)}`}
              </p>
            </div>
            {!link.revokedAt && (
              <Button variant="ghost" size="sm" onClick={() => revoke({ linkId: link._id })}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </PermissionGate>
  );
}
```

---

## Portal Settings (org configures what clients see)

```typescript
// Settings → Portal (sub-page, only when feature_flag is enabled)

orgPortalSettings: {
  enabled:               boolean,   // master switch
  showDealValue:         boolean,   // default: false
  showAgentName:         boolean,   // default: false
  showProjectTasks:      boolean,   // show task list or just milestone progress
  allowClientComments:   boolean,   // default: true
  brandColor:            string,    // hex, default: org primary colour
  portalWelcomeMessage:  string,    // shown on portal home
  stageDisplayNames: Record<string, string>, // "internal stage id" → "client-friendly name"
}
// e.g. stageDisplayNames: { "offer_mou": "Under Review", "form_f": "Documentation", "ejari": "Processing" }
// Agents see "Form F", clients see "Documentation"
```

---

## Schema Additions

```typescript
// convex/schema.ts

portalAccessLinks: defineTable({
  orgId:        v.id("orgs"),
  personCode:   v.string(),           // "P-001" — which person gets access
  email:        v.string(),           // where the link was sent
  token:        v.string(),           // secure random token (hashed in DB)
  expiresAt:    v.number(),
  usedAt:       v.optional(v.number()),
  revokedAt:    v.optional(v.number()),
  createdBy:    v.id("users"),
  createdAt:    v.number(),
})
.index("by_org",   ["orgId"])
.index("by_token", ["token"]),

portalSessions: defineTable({
  orgId:        v.id("orgs"),
  personCode:   v.string(),
  email:        v.string(),
  token:        v.string(),           // session token (hashed in DB)
  linkId:       v.id("portalAccessLinks"),
  expiresAt:    v.number(),
  createdAt:    v.number(),
  lastActiveAt: v.optional(v.number()),
})
.index("by_token", ["token"])
.index("by_org_and_person", ["orgId", "personCode"]),
```

---

## Feature Flag Registration

```typescript
// features/_registry.ts:
{
  key:         "client_portal",
  name:        "Client Portal",
  description: "Give clients and partners a branded portal to track their deals and projects",
  minPlan:     "pro",
  phase:       9,
  navSlot:     null,    // No nav item — managed from Settings → Portal
}
```

---

## Never-Do List for This Module

```typescript
// ❌ Never share portal auth cookies with the main dashboard — completely separate
// ❌ Never let portal queries return data from any personCode other than the session's
// ❌ Never show internal notes (isInternal: true) to portal users — ever
// ❌ Never show other contacts' personCodes or names to the portal user
// ❌ Never use orgMutation/orgQuery in portal routes — use portalMutation/portalQuery
// ❌ Never skip verifyEntityOwnership in portal mutations — it's the key security check
// ❌ Never show deal value by default — opt-in via portal settings
// ❌ Never show internal stage names without the stageDisplayNames mapping
// ❌ Never allow portal users to call ai.processChat — portal has no AI panel
// ❌ Never expose the main dashboard layout or components in the portal route tree
```