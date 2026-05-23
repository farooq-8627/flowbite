# Platform Owner Panel — Architecture & Implementation Plan

> Generated: 2026-05-23
> Status: Specification — implementation planned for a dedicated sprint
> Cross-references: [AI-MODULE-PLAN.md](./AI-MODULE-PLAN.md), [TOOL-RESULT-RENDERING.md](./TOOL-RESULT-RENDERING.md)

A super-admin-only control surface mounted at `/{locale}/platform-owner`. Lets
the platform owner manage tiers, billing, AI context, tool runbooks, feature
flags, the org list, and the audit log **from the live UI** — no Convex
dashboard round-trips, no code deploys for non-code changes (prompts, runbook
overrides, feature flag toggles, plan limits).

The panel **reuses** the existing settings shell, sidebar, sections, save
buttons, and danger zones. We don't build new UI primitives. We swap in
super-admin-scoped mutations and wire them into the existing `<SettingsView>`
shell.

---

## 1. Goals & non-goals

### 1.1 Goals

| # | Goal |
|---|---|
| 1 | One canonical place to edit platform-level config without a deploy |
| 2 | Reuse the entire settings UI stack (sidebar, sections, save button, danger zone) |
| 3 | Hard-gated access: only users with `platformRole === "super_admin"` can reach it |
| 4 | Hard-gated visibility: not linked from anywhere in the regular app shell |
| 5 | Editable surfaces: AI context, runbook overrides, tiers, plan limits, feature flags, model registry, billing test webhook URLs |
| 6 | Read-only surfaces with action buttons: org list, audit log, AI usage breakdown, billing reconciliation |
| 7 | Every mutation logs to a separate `platformAuditLogs` table (different from per-org `activityLogs`) |
| 8 | Secrets edited via the existing Convex envGet/envSet pattern, not stored in the DB |

### 1.2 Non-goals

| # | Non-goal | Why |
|---|---|---|
| 1 | Multi-tenant super-admin (org-scoped admins) | That's just role.editSettings — already exists |
| 2 | Cross-org data viewer | We log into individual orgs as the owner if support is needed |
| 3 | Custom UI primitives different from settings | Drift; doubles maintenance |
| 4 | Live database editor | Convex dashboard already does this |
| 5 | Public-facing analytics | This is internal only |

---

## 2. URL & access control

### 2.1 The slug

Mount path: **`/{locale}/platform-owner`**

| Variant | Why |
|---|---|
| `platformOwner` (camelCase) | Inconsistent with the rest of the app's kebab-case URLs |
| `platform-owner` (kebab) ✅ | Matches `/sign-in`, `/forgot-password` style |
| `superadmin` | Already in `RESERVED_SLUGS` (line 84-89 of `convex/_shared/reservedSlugs.ts`) — keeps it shielded from org slugs but is too obvious as a URL |
| `platform` (alone) | Already reserved; used internally |
| Random hash (e.g. `/admin-7x8k2`) | Security through obscurity — not a real defence and breaks bookmarking |

**Decision: `/{locale}/platform-owner`.** Uses the locale prefix to match the
rest of the app, doesn't collide with reserved slugs, and is unguessable
enough that nobody hits it accidentally without breaking on shareability.

### 2.2 Reserved slugs — already covered

`convex/_shared/reservedSlugs.ts` already includes `platform`, `superadmin`,
`super-admin`, and `staff`. We need to add **`platform-owner`** to the set in
the same migration that ships the panel:

```ts
// convex/_shared/reservedSlugs.ts (add)
"platform-owner",
```

If any existing org happens to have slug `platform-owner`, the migration must
detect and force-rename it (rare but possible). Pattern: query `orgs` by slug,
if found, append a numeric suffix.

### 2.3 Middleware gate (Next.js layer)

```ts
// middleware.ts (add a new matcher)
const isPlatformOwnerRoute = createRouteMatcher([
  "/platform-owner",
  "/platform-owner/(.*)",
  "/:locale/platform-owner",
  "/:locale/platform-owner/(.*)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const token = await convexAuth.getToken();

  // Existing rules...

  if (isPlatformOwnerRoute(request)) {
    if (!token) {
      const target = request.nextUrl.pathname + request.nextUrl.search;
      return nextjsMiddlewareRedirect(request, `/signin?redirect=${encodeURIComponent(target)}`);
    }
    // Defer the role check to the page itself — we'd need a Convex round-trip
    // to verify platformRole here, and middleware should stay fast.
  }

  return intlMiddleware(request);
});
```

### 2.4 Page-level gate (server component)

```tsx
// app/[locale]/platform-owner/layout.tsx
import { redirect } from "next/navigation";
import { getAuthToken } from "@/lib/auth/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function PlatformOwnerLayout({ children, params }) {
  const { locale } = await params;
  const token = await getAuthToken();
  if (!token) redirect(`/${locale}/signin`);

  const me = await fetchQuery(api.users.queries.me, {}, { token });
  if (me?.platformRole !== "super_admin") {
    redirect(`/${locale}/`); // silent redirect to home — no error message,
                              // we don't even confirm the route exists
  }

  return <PlatformOwnerShell>{children}</PlatformOwnerShell>;
}
```

### 2.5 Convex layer — `requirePlatformOwner` helper

```ts
// convex/_shared/platformOwner.ts (NEW)
import { ConvexError } from "convex/values";
import { ERRORS } from "./errors";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

export async function requirePlatformOwner(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<{ userId: Id<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError(ERRORS.UNAUTHENTICATED);
  const user = await ctx.db.get(userId);
  if (user?.platformRole !== "super_admin") {
    // Use FORBIDDEN, not NOT_FOUND — we don't pretend the resource doesn't exist;
    // we just say the user can't have it.
    throw new ConvexError(ERRORS.FORBIDDEN);
  }
  return { userId };
}
```

Every mutation in the platform-owner namespace begins with this call.

### 2.6 Email allow-list (defence in depth)

`platformRole` is a DB field. We add a **Convex env var** allow-list as a
second gate so even a compromised DB row can't grant super-admin access
without changing the env:

```ts
// convex/_shared/platformOwner.ts (extend)
const ALLOWED_EMAILS = (process.env.PLATFORM_OWNER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// In requirePlatformOwner, after the platformRole check:
if (ALLOWED_EMAILS.length > 0) {
  const email = (user.email ?? "").toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) {
    throw new ConvexError(ERRORS.FORBIDDEN);
  }
}
```

If the env var isn't set, the email check is skipped (single-developer
deployments). When set on prod, it adds the second factor.

### 2.7 No links from anywhere

The panel has **zero entry points** from the regular app:
- Not in `Sidebar.tsx`
- Not in user dropdown
- Not in settings nav
- Not in command palette
- Not in any `<Link>` tag anywhere

Access is by typing the URL directly or via a bookmarked link. This is the
"unlisted" property — combined with the role/email check, it makes the panel
invisible to all users who aren't supposed to see it.

---

## 3. Folder layout

```
app/[locale]/platform-owner/
├── layout.tsx                     ← server component, role gate, mounts <PlatformOwnerShell>
├── page.tsx                       ← redirects to /platform-owner/overview
├── overview/page.tsx              ← thin wrapper around <OverviewView />
├── orgs/page.tsx                  ← <OrgListView />
├── orgs/[orgId]/page.tsx          ← <OrgDetailView />
├── ai/page.tsx                    ← <AIContextView /> — edit platformContext
├── tools/page.tsx                 ← <ToolCatalogueView /> — view/edit runbooks
├── tiers/page.tsx                 ← <TiersView /> — edit plan limits
├── billing/page.tsx               ← <BillingView /> — webhook URLs, plans, reconciliation
├── flags/page.tsx                 ← <FeatureFlagsView />
├── audit/page.tsx                 ← <AuditLogView /> — read-only
└── env/page.tsx                   ← <EnvVarsView /> — set Convex env vars from UI

core/platform-owner/
├── MODULE.md
├── STATE.md
├── components/
│   ├── PlatformOwnerShell.tsx     ← reuses Sidebar primitive, swaps nav config
│   ├── PlatformOwnerSidebar.tsx   ← thin wrapper around <Sidebar /> with platform-owner-nav config
│   └── PlatformOwnerHeader.tsx    ← topbar with "Platform Owner" badge + user menu
├── views/
│   ├── OverviewView.tsx           ← landing dashboard
│   ├── OrgListView.tsx            ← search + paginated table
│   ├── OrgDetailView.tsx          ← single org: members, plan, AI usage, danger zone
│   ├── AIContextView.tsx          ← edit platformContext.main with version bumping
│   ├── ToolCatalogueView.tsx      ← list every registered tool + its runbook
│   ├── TiersView.tsx              ← edit plan limits (max users, AI quota, etc.)
│   ├── BillingView.tsx            ← LemonSqueezy webhooks, reconciliation
│   ├── FeatureFlagsView.tsx       ← toggle flags
│   ├── AuditLogView.tsx           ← read-only platformAuditLogs viewer
│   └── EnvVarsView.tsx            ← read/write Convex env vars
├── config/
│   ├── platform-owner-nav.ts      ← sidebar groups + items
│   └── platform-owner-sections.ts ← section IDs (mirrors settings-sections.ts)
└── hooks/
    └── usePlatformOwnerAccess.ts  ← redirect-or-render hook for client components

convex/_platform/
├── MODULE.md
├── platformContext/
│   ├── queries.ts                 ← get, list versions
│   └── mutations.ts               ← create, update, bump version
├── tools/
│   ├── queries.ts                 ← listAllTools (mirrors registry from server)
│   └── mutations.ts               ← saveRunbookOverride (per-tool, per-org optional)
├── tiers/
│   ├── queries.ts                 ← listTiers, getTier
│   └── mutations.ts               ← updateTier (limits, prices)
├── flags/
│   ├── queries.ts                 ← listFlags, isEnabled
│   └── mutations.ts               ← toggleFlag, createFlag
├── audit/
│   ├── queries.ts                 ← listAuditLogs (with cursor pagination)
│   └── helpers.ts                 ← logPlatformAction()
└── env/
    └── actions.ts                 ← getEnvVar, setEnvVar (Node action calling Convex admin API)
```

---

## 4. Schema additions

### 4.1 `platformContext` (already exists — confirm shape)

```ts
defineTable({
  key: v.string(),                  // "main" today; could be "billing-help" tomorrow
  version: v.string(),              // e.g. "v1.1.0"
  content: v.string(),              // markdown body injected into system prompt
  rules: v.array(v.string()),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_key", ["key"]);
```

Already in `convex/schema/platform.ts`. Edit-from-UI flow uses `updatePlatformContext` mutation (already exists per `convex/platform/MODULE.md`).

### 4.2 `tiers` (NEW)

```ts
defineTable({
  key: v.union(v.literal("free"), v.literal("starter"), v.literal("pro"), v.literal("business")),
  displayName: v.string(),
  monthlyPriceUSD: v.number(),
  yearlyPriceUSD: v.number(),
  limits: v.object({
    maxUsers: v.number(),
    maxLeads: v.number(),
    maxDeals: v.number(),
    maxStorageGB: v.number(),
    aiMessagesPerMonth: v.number(),
    customFields: v.boolean(),
    customPipelines: v.boolean(),
    bulkOperations: v.boolean(),
    apiAccess: v.boolean(),
  }),
  lemonSqueezyVariantId: v.optional(v.string()),
  active: v.boolean(),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
}).index("by_key", ["key"]);
```

Today plan limits live as constants in code. Moving them into a table lets the
platform owner adjust them without a deploy.

### 4.3 `featureFlags` (NEW)

```ts
defineTable({
  key: v.string(),                          // "ai.suggestions", "billing.lemonsqueezy"
  description: v.string(),
  enabled: v.boolean(),                     // global default
  enabledForOrgs: v.optional(v.array(v.id("orgs"))), // override per org
  enabledForUsers: v.optional(v.array(v.id("users"))), // override per user (testing)
  updatedBy: v.id("users"),
  updatedAt: v.number(),
}).index("by_key", ["key"]);
```

### 4.4 `toolRunbookOverrides` (NEW)

```ts
defineTable({
  toolName: v.string(),
  scope: v.union(v.literal("global"), v.literal("org")),
  orgId: v.optional(v.id("orgs")),
  override: v.object({
    onSuccess: v.optional(v.string()),
    onValidationError: v.optional(v.string()),
    onEmpty: v.optional(v.string()),
    onPermissionDenied: v.optional(v.string()),
    onPartialSuccess: v.optional(v.string()),
    suggestNext: v.optional(v.string()),
  }),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
}).index("by_tool_scope", ["toolName", "scope"]);
```

Lets the platform owner override a runbook without a code change. Code remains
the source of truth; overrides merge on top (Sprint 4 — see AI-MODULE-PLAN
§7.6).

### 4.5 `platformAuditLogs` (NEW)

```ts
defineTable({
  actorUserId: v.id("users"),
  actorEmail: v.string(),
  action: v.string(),                       // "platform.ai-context.update"
  targetType: v.optional(v.string()),       // "platformContext" | "tier" | "flag" | "org"
  targetId: v.optional(v.string()),
  before: v.optional(v.any()),
  after: v.optional(v.any()),
  reason: v.optional(v.string()),
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_actor", ["actorUserId"])
  .index("by_action", ["action"])
  .index("by_created", ["createdAt"]);
```

Separate from per-org `activityLogs`. Records every platform-owner mutation
for compliance.

---

## 5. Section-by-section UX

### 5.1 Overview (`/platform-owner/overview`)

Landing dashboard. Read-only stats:
- Total orgs (active / suspended / trial)
- Total users
- AI messages last 7 days (platform vs. BYOK split)
- Total revenue this month (from billing)
- Recent audit log entries (last 10)

Reuses `<DashboardCard>`, `<StatTile>` primitives from `core/shell/shell/views/dashboard/cards/`. No new UI.

### 5.2 Orgs list (`/platform-owner/orgs`)

Reuses the existing `core/data-display/table/` primitives:
- Search bar (org name, owner email, slug)
- Filterable columns: plan, status, created at, last activity
- Per-row actions: View, Suspend, Impersonate (logs in as owner)
- Pagination via cursor

Backend query: `_platform/orgs/queries:listAll`.

### 5.3 Org detail (`/platform-owner/orgs/[orgId]`)

Single org dashboard. Sections (each is a reused `<SettingsSection>`):
- **Overview** — name, slug, plan, owner email
- **Members** — list with role and last-active
- **AI usage** — messages this month, BYOK vs. platform split
- **Billing** — plan, next renewal, overdue amount
- **Danger zone** — Suspend, Force-delete, Force-restore

The danger zone reuses `core/platform/settings/components/shared/DangerZone.tsx`.

### 5.4 AI context editor (`/platform-owner/ai`)

This is the heart of the panel. UI:

```
┌─────────────────────────────────────────────────┐
│ Platform Context                                 │
│ Version: v1.1.0          Last edited: 2 days ago │
├─────────────────────────────────────────────────┤
│ ┌─ Markdown editor (full height) ──────────────┐│
│ │ # FlowBite — AI Assistant Context             ││
│ │                                                ││
│ │ You are the AI assistant for FlowBite, ...    ││
│ │ ...                                            ││
│ └────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────┤
│ Rules (hard constraints, surfaced separately)    │
│ • Respond in the user's language        [×]      │
│ • Never access cross-org data           [×]      │
│ • [+ Add rule]                                   │
├─────────────────────────────────────────────────┤
│ Bump to version: [v1.2.0    ]   [ Save changes ] │
└─────────────────────────────────────────────────┘
```

Markdown editor: a simple `<Textarea>` with monospace font + a side preview
panel (Streamdown). No fancy toolbar — the platform owner is technical.

Save flow:
1. Validates that version string isn't already used.
2. Inserts a new row in `platformContext` (we keep history; never overwrite).
3. Updates the lookup index so the `key: "main"` query returns the latest
   version.
4. Logs `platform.ai-context.update` to `platformAuditLogs` with before/after.

The key UX win: **the platform owner can iterate on the AI's behaviour
without a deploy**. They edit the markdown, save, then send a chat message —
the next request uses the new prompt.

### 5.5 Tool catalogue (`/platform-owner/tools`)

Shows every registered tool — read from the live registry via a Convex
internal query that mirrors `getToolsForRequest({ permissions: ALL, ... })`.

Per-tool entry:
- Name + layer + permission required
- Description (read-only — comes from code)
- Schema (rendered as a tree)
- **Runbook editor** — six text fields (onSuccess, onValidationError, onEmpty,
  onPermissionDenied, onPartialSuccess, suggestNext)
- Reset to code default
- Override scope: global vs. specific org

Save → writes to `toolRunbookOverrides`. Audit-logged.

Where the runtime reads the override:
```ts
// convex/ai/prompts/builder.ts (Sprint 4 work)
const defaults = tool.runbook ?? {};
const override = await getRunbookOverride(ctx, { toolName: tool.name, orgId });
const effective = { ...defaults, ...override };
// Inject `effective` into the prompt block
```

### 5.6 Tiers (`/platform-owner/tiers`)

Card per tier, each card edits one row of `tiers` table. Reuses
`<SettingsFormRow>` + `<FloatingLabelInput>`. Save button per card.

### 5.7 Billing (`/platform-owner/billing`)

- LemonSqueezy webhook URL (read-only, from env)
- Webhook signing secret (mask all but last 4 chars; "rotate" button)
- Recent webhook events (paginated table)
- Failed webhooks (replay button)
- Revenue stats per plan

The webhook URL display + secret rotation are key support tools — when
LemonSqueezy support asks for the webhook URL, the owner can read it off the
panel instead of digging through Vercel.

### 5.8 Feature flags (`/platform-owner/flags`)

Table of flags with a toggle column. Each row: key, description, global
enabled, count of org overrides, count of user overrides.

Click a row → drawer opens, lists per-org and per-user overrides with add/remove.

### 5.9 Audit log (`/platform-owner/audit`)

Read-only paginated table of `platformAuditLogs`. Filter by action type,
actor, date range. Click a row → side panel with full before/after JSON
diffed using the existing `<EntityDiffCard>`.

### 5.10 Env vars (`/platform-owner/env`)

Read/write proxy for Convex env vars (LEMONSQUEEZY_WEBHOOK_SECRET, etc.).
Read masks the value; write is logged with `before === "<masked>"` for
security.

This uses Convex's admin API via a Node action, since `process.env` mutations
need to land on the deployment. The action uses an admin token from a
separate sealed env var (`CONVEX_ADMIN_TOKEN`).

---

## 6. Reusing the existing settings shell

The settings module at `core/platform/settings/` is the model. We reuse:

| Reuse | What |
|---|---|
| `<SettingsView>` shell layout | Top bar + sidebar + content area |
| `<SettingsSection>` | Box with title, body, save button |
| `<SettingsSaveButton>` | Per-section save with dirty-state |
| `<SettingsFormRow>` + `<FloatingLabelInput>` | Form primitives |
| `<DangerZone>` | Red-bordered destructive actions |
| `useSettingsForm` hook | Per-section dirty state + reset |
| Section-id scrolling | Already RTL-safe via `scrollToSection` |

We do NOT reuse:
- `settings-nav.ts` — platform-owner has its own nav config
- `permissions-catalog.ts` — platform-owner uses platformRole, not the per-org permissions catalog

**Implementation approach**: introduce a `<PlatformOwnerShell>` that renders
the same `<Sidebar>` + content layout but with a different nav config. Each
section view (`AIContextView`, `TiersView`, etc.) is a thin wrapper around
existing `<SettingsSection>` primitives.

```tsx
// core/platform-owner/views/AIContextView.tsx
export function AIContextView() {
  const ctx = useQuery(api.platform.platformContext.queries.getMain);
  const update = useMutation(api.platform.platformContext.mutations.update);
  const { dirty, setField, save, reset } = useSettingsForm(ctx, update);

  return (
    <SettingsSection
      id="ai-context"
      title="Platform AI Context"
      description="The system prompt prepended to every AI request across all orgs."
    >
      <SettingsFormRow label="Version">
        <FloatingLabelInput value={dirty.version} onChange={(v) => setField("version", v)} />
      </SettingsFormRow>
      <SettingsFormRow label="Content (markdown)">
        <Textarea
          value={dirty.content}
          onChange={(e) => setField("content", e.target.value)}
          rows={30}
          className="font-mono text-xs"
        />
      </SettingsFormRow>
      <SettingsSaveButton onSave={save} onReset={reset} dirty={!!dirty.changed} />
    </SettingsSection>
  );
}
```

That's it. ~50 LOC per view because all the heavy lifting is in the existing
settings primitives.

---

## 7. Mutations & audit logging

Every platform-owner mutation follows this template:

```ts
// convex/_platform/platformContext/mutations.ts
import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { requirePlatformOwner } from "../../_shared/platformOwner";
import { logPlatformAction } from "../audit/helpers";

export const update = mutation({
  args: {
    content: v.string(),
    rules: v.array(v.string()),
    version: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePlatformOwner(ctx);

    const existing = await ctx.db.query("platformContext")
      .withIndex("by_key", q => q.eq("key", "main"))
      .unique();

    const before = existing ?? null;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        version: args.version,
        content: args.content,
        rules: args.rules,
        updatedBy: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("platformContext", {
        key: "main",
        version: args.version,
        content: args.content,
        rules: args.rules,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await logPlatformAction(ctx, {
      actorUserId: userId,
      action: "platform.ai-context.update",
      targetType: "platformContext",
      targetId: "main",
      before,
      after: { version: args.version, content: args.content, rules: args.rules },
      reason: args.reason,
    });

    return { ok: true };
  },
});
```

Three guarantees:
1. Caller is super-admin (also email-allowlisted on prod).
2. Before/after captured for the audit log.
3. Mutation is atomic.

---

## 8. Why the panel doesn't break the settings module

The existing settings module is per-org. Every mutation gates on
`requireOrgMember` + per-org permissions. The platform-owner module gates on
`requirePlatformOwner` + email allow-list. **They don't share mutations.**

We do share UI primitives. That sharing is one-way — settings primitives are
built generically; platform-owner uses them. If we ever need to fork, we copy
the primitive into `core/platform-owner/components/shared/`.

The `_platform/` Convex namespace is already used (per `convex/_arch.md`).
Platform-owner mutations live under `convex/_platform/`, separate from the
`platform/` per-user-profile namespace at `convex/platform/`. (Yes the naming
is unfortunate — `_platform` for super-admin, `platform` for per-user
profile.)

---

## 9. Implementation order

| # | Step | Files | Effort |
|---|---|---|---|
| 1 | Schema additions: `tiers`, `featureFlags`, `toolRunbookOverrides`, `platformAuditLogs` | `convex/schema/*.ts` + migration | 1 hour |
| 2 | Reserved slug: add `platform-owner` + migration that detects/renames colliding orgs | `convex/_shared/reservedSlugs.ts` + migration | 30 min |
| 3 | `requirePlatformOwner` helper + email allow-list | `convex/_shared/platformOwner.ts` | 30 min |
| 4 | `_platform/audit/helpers.ts::logPlatformAction` + queries | `convex/_platform/audit/*` | 30 min |
| 5 | Middleware route matcher | `middleware.ts` | 15 min |
| 6 | Server-side gate layout | `app/[locale]/platform-owner/layout.tsx` | 30 min |
| 7 | `<PlatformOwnerShell>` + nav config | `core/platform-owner/components/*` + `config/*` | 1 hour |
| 8 | Overview view (read-only stats) | `core/platform-owner/views/OverviewView.tsx` | 1 hour |
| 9 | AI Context view + mutations | `core/platform-owner/views/AIContextView.tsx` + `convex/_platform/platformContext/*` | 2 hours |
| 10 | Tool catalogue view (read-only) | `core/platform-owner/views/ToolCatalogueView.tsx` + `convex/_platform/tools/queries.ts` | 1.5 hours |
| 11 | Runbook overrides — depends on Sprint 4 of AI module | + Sprint 4 of AI module | 2 hours after Sprint 4 |
| 12 | Tiers view + mutations | `core/platform-owner/views/TiersView.tsx` + `convex/_platform/tiers/*` | 2 hours |
| 13 | Feature flags view + mutations | `core/platform-owner/views/FeatureFlagsView.tsx` + `convex/_platform/flags/*` | 2 hours |
| 14 | Audit log view (read-only paginated) | `core/platform-owner/views/AuditLogView.tsx` + queries | 1.5 hours |
| 15 | Org list + detail | `core/platform-owner/views/OrgListView.tsx` + `OrgDetailView.tsx` | 3 hours |
| 16 | Billing view (LemonSqueezy panel) | `core/platform-owner/views/BillingView.tsx` | 3 hours |
| 17 | Env vars view + Convex admin action | `core/platform-owner/views/EnvVarsView.tsx` + `_platform/env/actions.ts` | 2 hours |
| 18 | E2E test: log in as super_admin, edit AI context, send chat → verify new prompt landed | Playwright | 1 hour |

**Total: ~24 hours of focused work.** Realistic two-week part-time sprint
for one person, including testing and iteration.

---

## 10. Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | URL slug: `platform-owner` | Unguessable, kebab-case, doesn't collide with existing reserved slugs |
| 2 | Triple gate: middleware → page server check → Convex `requirePlatformOwner` | Defence in depth |
| 3 | Email allow-list via env var, optional | Second factor on prod, no friction in dev |
| 4 | Reuse settings primitives, don't fork | One source of truth for form/section/save UX |
| 5 | Separate `platformAuditLogs` table | Compliance: super-admin actions are not co-mingled with org activity |
| 6 | Schema-driven config (tiers, flags) instead of constants | Edit without deploy; deploys remain code-only |
| 7 | Runbook overrides merge on top of code defaults | Code is source of truth; overrides are tactical patches |
| 8 | No links to the panel from anywhere in the app | "Unlisted by design" — discoverability requires explicit knowledge |
| 9 | Org list reuses table + impersonate flow already used by support tools | No duplicated UX |
| 10 | Webhook + env management lives here, not in code | Removes the last reason to SSH into Convex dashboard |

---

## 11. Open questions

- **Impersonation flow**: when the owner clicks "Impersonate" on an org,
  do we issue a temporary token that scopes them to that org, or do we use
  a "viewing as" banner with read-only access? Recommend: read-only banner
  for v1, full impersonation later.
- **Versioned platform context**: do we keep history of every save, or only
  the current row? Recommend: keep history (cheap, useful for rollback).
- **Multi-region deploy**: if FlowBite is deployed to multiple Convex
  regions, the platform-owner panel needs to pick which region to operate
  on. Defer until multi-region is on the roadmap.
- **Org-scoped runbook overrides**: do they need approval? Probably not for
  now — the platform owner is the only one who can set them.

Update this section as questions resolve.
