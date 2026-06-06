# Orbitly — System Design

> A working reference for what the project is, why it's built the way it is, and how every layer is engineered to scale. Written so a recruiter, a senior engineer, or an LLM can read top‑to‑bottom and understand both the *what* and the *why*.

---

## 0. Elevator pitch (the 30‑second version)

**Orbitly is a multi‑tenant, AI‑native CRM platform** that lets a workspace owner pick an industry (real‑estate, B2B SaaS, freelancer, recruiter, productivity, etc.), get a fully seeded workspace in under two minutes, and then **operate the entire CRM by talking to it** — through chat, WhatsApp (per‑agent Twilio numbers), MCP, REST, or Slack — under each member's real RBAC.

Three claims separate it from every CRM template you've seen:

1. **One brain, many doors.** Every channel (chat / WhatsApp / MCP / REST / Slack / Cal.com) talks to **one Capability Registry** sitting on the canonical Convex mutations. Adding a channel is writing a thin adapter, not re‑tooling 150 functions.
2. **The AI's worldview equals the live workspace.** Pipelines off → pipeline tools and pipeline prompt context disappear in one switch. Custom field renamed → next AI write respects it. The AI never reads templates or hardcoded prompt copies; it reads `fieldDefinitions`, `pipelines`, `org.entityLabels`, `org.settings.activeModules` directly.
3. **Correct by construction.** Every AI action goes through one wrapper that classifies every failure into a closed 10‑outcome taxonomy (`ok`, `partial`, `needs_repair`, `not_found`, `ambiguous`, `denied`, `channel_blocked`, `needs_step_up`, `business_error`, `infra_retry`). Coercion is centralised; result envelopes are mandatory and typed. "Done." with no detail is structurally impossible.

The system is built **module‑first** (`core/*`, `convex/*` — every module owns its own `MODULE.md` decision log), **migration‑in‑same‑message** (no schema drift), and **fail‑closed** on every security gate (super‑admin auth, BYOK encryption, RBAC, soft‑delete trash). It runs on Convex (real‑time DB + actions), Next.js 16, React 19, AI SDK v6 multi‑provider, and a deliberately small surface of best‑in‑class libraries.

---

## 1. Why this matters (the market framing)

| Industry pain | Orbitly's answer |
|---|---|
| CRMs ship one schema; users contort their business to fit it | Industry templates seed pipelines + custom fields at onboarding; AI reads the live schema, not the template |
| AI features are bolted on as "ask the assistant" — no real autonomy | Risk‑tiered autonomy: safe/reversible auto‑execute; irreversible → RBAC + 2FA step‑up + channel fence |
| Adding WhatsApp / Slack / Cal.com means re‑implementing every integration | One Capability Registry, thin per‑channel adapters; new integration = 1 file, 0 capability rewrites |
| LLM tools fail silently with "Done." or undebuggable type errors | Mandatory `CapabilityResult` envelope; closed‑taxonomy `runCapability` wrapper; self‑correcting `repair` loop |
| 80k tokens per AI turn, $0.40 per message | Progressive disclosure + Anthropic prompt caching → ~3–6k effective input/turn (~10× cheaper) |
| Multi‑tenant CRMs leak data across orgs | Org scope is enforced at the wrapper level (`orgQuery`/`orgMutation`); `.collect()` is **banned** on org‑scoped tables; every index begins with `by_org` |
| "Just talk to the database" tools have no audit trail | Every AI action writes to one `activityLogs` feed: principal, capability, args, result, channel, source |

---

## 2. Project anatomy at a glance

```
orbitly/
├── app/                      Next.js 16 App Router — THIN wrappers only (rule R-APP-01)
│   ├── (root)/               Public marketing site (/, /pricing, /contact)
│   ├── [locale]/             Authenticated dashboard, settings, entity pages
│   │   ├── (auth)/           signin / signup / join — no shell
│   │   ├── (private)/        auth-guarded layout
│   │   │   └── [orgSlug]/    org-scoped routes (resolves Convex org by slug)
│   │   └── api/              Next.js API routes (webhooks, OG images)
│   └── xowner/               Internal owner-panel literal route (rewritten from OWNER_PANEL_SLUG)
│
├── core/                     Modular feature root — 11 first-class modules
│   ├── ai/                       AI chat panel, components, hooks, model picker, briefings UI
│   ├── comms/                    Cross-cutting: timeline + notes + messages
│   ├── data-display/             Generic engines: kanban, datatable, command-palette
│   ├── data-io/                  csv-import wizard + universal file uploads
│   ├── entities/                 CRM entity scaffolds + lead/contact/deal/company/entity5/6
│   ├── inbox/                    Notification bell + AI inbox
│   ├── landing/                  Marketing-site components
│   ├── platform/                 Settings + profile pages
│   ├── scheduling/               Calendar + tasks (one table, three view modes)
│   └── shell/                    Auth, onboarding wizard, dashboard layout, sidebar/topnav
│
├── convex/                   Backend — everything reactive, type-safe, end-to-end
│   ├── _arch.md                  Logical group map (Infrastructure / Identity / System / CRM / AI)
│   ├── _functions/               Auth wrappers (orgQuery, orgMutation, requireOrgMember)
│   ├── _generated/               Convex codegen output (api.d.ts, server.d.ts)
│   ├── _migrations/              ~40 idempotent migrations (in-same-message rule)
│   ├── _platform/                Super-admin "owner panel" — fail-closed, append-only audit
│   ├── _shared/                  Permission catalog SSOT, validators, dedup, rateLimit, errors,
│   │                             record codes, reserved slugs, notification keys, sanitisers
│   ├── _test/                    Test helpers (seedOrgMember, etc.)
│   ├── activityLogs/             Audit trail (logActivity helper)
│   ├── ai/                       The biggest module — chat layer + new Capability Registry v2
│   │   ├── registry/             NEW: types, coerce, result, define, wrapper, gate,
│   │   │                         drive, catalog, router, projectors, coverage
│   │   ├── runtime/              NEW: host (ToolLoopAgent + prepareStep), coreTools, autonomous
│   │   ├── channels/             NEW: whatsappInbound, persona (Twilio-bound principals)
│   │   ├── orchestrator/         Streaming chat orchestrator (run.ts, streamLoop.ts — being slimmed)
│   │   ├── insights/             Deal scoring + anomaly detection (cron-driven)
│   │   ├── standingOrders/       Recurring AI jobs (per-org cron-like rules)
│   │   ├── briefings*.ts         Daily + weekly briefings (platform-billed)
│   │   └── messages.ts, conversations.ts, models.ts, keys*.ts (chat layer — kept)
│   ├── billing/                  LemonSqueezy webhooks, plan tier enforcement
│   ├── crm/                      The product domain
│   │   ├── entities/             leads, contacts, deals, companies, entity5/6, codeCounters
│   │   ├── fields/               pipelines, fieldDefinitions, fieldValues, dedup, templates
│   │   ├── people/               personCode resolver (one identity, all surfaces)
│   │   └── shared/               notes, messages, tasks, tags, savedViews, timeline (read-merge),
│   │                             calendar (read-merge), noteCategories, conversations, orbitLinks
│   ├── dashboard/                ephemeralCells, annotations, dealScores
│   ├── files/                    Universal file storage (org/person/user/field scopes)
│   ├── gdpr/                     Per-user data export + delete (right to be forgotten)
│   ├── invitations/              Invite create/accept/decline/cancel
│   ├── notifications/            In-app notifications (helper + queries + mutations)
│   ├── orgs/                     Org CRUD, onboarding, settings, member ops, templates
│   ├── orgRoles/                 Custom org roles, role permission CRUD
│   ├── schema/                   Split: identity, ai, platform, crmFields, crmShared,
│   │                             crmEntities, system
│   ├── trash/                    Soft-delete recovery (30-day retention)
│   ├── users/                    Profile, preferences, soft-delete, dismissed-cards
│   ├── auth.ts                   Convex Auth config + Resend OTP + createOrUpdateUser
│   ├── crons.ts                  Scheduled jobs (briefings, deal scoring, anomaly sweep)
│   └── http.ts                   HTTP routes (auth callbacks, Twilio webhook, LemonSqueezy)
│
├── components/               Shared UI primitives (shadcn/ui based, themed)
├── features/                 Reserved slots for future industry-specific add-ons
├── lib/                      datetime, format, normalizeError, logger, posthog, sentry helpers
├── hooks/                    use-mobile, use-tablet (cross-cutting)
├── stores/                   Zustand stores — UI-only state (locked decision #1)
├── i18n/                     next-intl routing + request config (en, ar)
├── messages/                 Translation JSON
├── proxy.ts                  Auth guard + locale routing + owner-panel rewrite (formerly middleware.ts)
├── trigger/                  Trigger.dev background jobs (CSV import processor, drip emails)
├── docs/                     Architecture deep-dives + runbooks
├── owner/                    Owner-panel UI (super-admin)
├── AGENTS.md                 The project constitution — locked rules + decisions
├── PENDING.md / SHIPPED.md   Two-file work tracking system
├── Future-Enhancements.md    Deferral cards (every disabled guardrail logged)
├── AI-TOOLING-LAYER-PLAN.md  The v2 AI architecture blueprint
└── AI-TOOLING-BUILD-STAGES.md S0–S17 self-contained stage prompts
```

---

## 3. Tech stack — what, and why each one

| Layer | Choice | Why this and not the obvious alternative |
|---|---|---|
| **Frontend framework** | Next.js 16 (App Router) | RSC + streaming + middleware for auth/i18n/owner-panel rewrite all in one runtime; Turbopack dev cycle. Alternatives (Remix, Vite SPA) lose the middleware story or the SSR/RSC story. |
| **UI runtime** | React 19 | `useOptimistic`, `useTransition`, `useDeferredValue` are first‑class — used in messages, calendar, drag‑and‑drop. |
| **Backend** | Convex | Reactive subscriptions kill client polling, end‑to‑end TypeScript types, transactional mutations + scheduled actions in one platform, V8/Node split when Node modules are needed. Replaces Postgres + Hasura + Pusher + a queue + a scheduler. |
| **Auth** | `@convex-dev/auth` + Resend OTP | OTP via email beats password storage; convex‑auth integrates with Convex's own session model so `getAuthUserId(ctx)` is the same on web, on the WhatsApp adapter, and on tests. |
| **AI SDK** | `ai` (Vercel) v6 + multi‑provider (`@ai-sdk/anthropic`, `google`, `groq`, `mistral`, `openai`, `xai`, `@openrouter/ai-sdk-provider`) | One `streamText` API, swappable providers, real `prepareStep` for progressive disclosure (which is what makes the v2 Capability Registry possible — see §6). BYOK is a feature, not a workaround. |
| **Background jobs** | Trigger.dev v4 + Convex `crons` + `ctx.scheduler` | Trigger.dev for long jobs (CSV imports, drip emails); Convex cron for nightly briefings + deal scoring; `ctx.scheduler.runAfter(0,…)` for "fire and continue in‑transaction" patterns. |
| **State (server)** | Convex `useQuery` everywhere | Locked decision #1: never use Zustand for server data. |
| **State (UI‑only)** | Zustand | Sidebar collapse, keyboard‑shortcut panes, theme — never anything that lives in the DB. |
| **URL state** | nuqs | Filter state, view toggle (`?view=list|board`), datatable sort/page. SSR‑safe and shareable — locked decision in `core/data-display/datatable/MODULE.md`. |
| **Tables** | TanStack Table v8 + custom DataTable engine | Headless, fully typed; the DataTable engine wraps it once; used by all 6 entity list views, members page, activity log, tasks. |
| **Drag & drop** | `@dnd-kit/core` + `@dnd-kit/sortable` | Touch + keyboard sensors (mobile agents in the field); pluggable strategies; we built kanban + sticky‑note + sortable‑lists on it once. |
| **Forms** | React Hook Form + Zod resolvers | Single source of truth for form schemas; same Zod schemas back the Capability Registry's input validation. |
| **Charts** | Recharts (heavy) + custom inline SVG sparklines (light) | Sparkline (`components/ui/sparkline.tsx`) is 30 lines of pure SVG so a sparkline doesn't pull 80kb of recharts. Heavy charts opt into recharts. |
| **Styles** | Tailwind v4 + shadcn/ui + custom theme presets | RTL‑safe logical properties enforced by lint rule (`ms-*`/`me-*` only); border radius is `var(--radius)` everywhere — theming swap is one CSS variable change. |
| **i18n** | next‑intl | `app/[locale]` segment + middleware locale negotiation; `dir="rtl"` cascades through Tailwind logical classes for Arabic. |
| **Email** | Resend | Both transactional (OTPs, invites, owner‑panel codes) and marketing (drip onboarding sequence). React Email templates. |
| **Observability** | Sentry (errors) + PostHog (product analytics) + Convex logs | DSNs from env vars (locked decision #20); providers no‑op gracefully if unset — every dev runs without paid telemetry by default. |
| **Linter / formatter** | Biome | One tool replaces ESLint + Prettier; CI gate is `pnpm exec biome check .` (0 errors / 0 warnings). |
| **Tests** | Vitest (unit + Convex via `convex-test`) + Playwright (E2E) | Convex‑test runs Convex modules in isolation (no live deployment); Playwright covers the auth + theme + nav flows. |
| **Package manager** | pnpm 10 | Disk‑space efficient, deterministic, supports the workspace layout. Locked rule — `npm`/`yarn` are explicitly forbidden. |
| **MCP / tooling** | `@payloadcms/plugin-mcp` (planned), Convex MCP, Firecrawl MCP | The v2 Capability Registry projects to MCP, so external agents can drive the CRM through the same registry — see §6.10. |

The pattern across the stack: **one tool per concern, picked because it composes cleanly with Convex's reactive model**. Nothing here is fashion; every dependency earned its slot or got removed (we removed Cloudinary in favour of Convex `_storage`, ESLint in favour of Biome, the standalone `reminders` module in favour of `tasks`).

---

## 4. Multi‑tenancy — the foundation everything else stands on

A multi‑tenant CRM that leaks one row across orgs is dead on arrival. We engineered tenancy as a **structural property of the codebase**, not as defensive checks sprinkled in handlers.

### 4.1 The tenancy contract

| Layer | Enforcement |
|---|---|
| **URL** | Every dashboard route is nested under `/[locale]/[orgSlug]/…`. Slugs are unique, validated against `RESERVED_SLUGS` SSOT (`convex/_shared/reservedSlugs.ts`), and resolved server‑side at layout level. |
| **Auth wrappers** | `orgQuery`/`orgMutation` (in `convex/_functions/authenticated.ts`) call `requireOrgMember(ctx, orgId)` as their first line. The `orgId` comes from `args`, but the membership lookup is server‑driven — clients can't spoof it. |
| **Indexes** | Every org‑scoped table has `by_org` and `by_org_and_<field>` indexes. Lookups always start with `q.eq("orgId", orgId)` — never a global scan. |
| **`.collect()` is banned** on org‑scoped tables that can grow past ~500 rows (`_arch.md`). Pagination or `.take(N)` only. |
| **AI principal** | The Capability Registry's `Principal.orgId` is set by the channel adapter at request boundary. Capabilities can never read `args.orgId` for routing — they read `principal.orgId`. |
| **Owner panel** | The super‑admin panel at `/xowner` (rewritten from `OWNER_PANEL_SLUG` env) has its own `requirePlatformOwner` gate and **never reads org‑scoped content** (locked decision L7 in `_platform/MODULE.md`). |

### 4.2 The `personCode` invariant — one identity, every surface

Locked decision #12: every person enters as a `Lead`, gets `personCode` (`P‑001`) generated once, and that code travels through every related record forever.

```
Lead    → personCode "P-001"  (generated here, never regenerated)
Contact → personCode "P-001"  (inherited on convertToContact)
Deal    → personCode "P-001"  (direct field)
Task / Note / Message / File / Reminder / activityLog → personCode "P-001"
```

Why this is a marketing weapon, not just an ID:
- The unified profile page at `/profile/P-001` aggregates **every** record across the entity boundary — leads, contacts, deals, follow‑ups, files, messages — without joins or denormalisation.
- AI tools resolve `"P-001"` to a row in O(1) via the `by_org_and_personCode` index across every table.
- WhatsApp threads, audit logs, briefings, and exports all share one stable handle even after a Lead is converted to a Contact.

### 4.3 Org settings — the live source of truth

`org.settings` is a typed sub‑document holding everything the workspace can configure: entity labels (`{ lead: { singular: "Inquiry", plural: "Inquiries" } }`), file upload limits, code prefixes, dashboard layout, autonomy policy, active modules, currency. **No hardcoded business rule in the codebase reads from a constant** — every UI label, every field render, every AI prompt context block reads `org.settings` (or downstream tables like `fieldDefinitions`/`pipelines`) live, per request.

This is what makes the AI's worldview equal the workspace's reality (§6.5).

---

## 5. RBAC — one catalog, every consumer

Locked decision #13: **the Permission Catalog SSOT** lives at `convex/_shared/permissions/catalog.ts`. Add a permission once and it propagates automatically.

### 5.1 The catalog

```ts
// convex/_shared/permissions/catalog.ts (excerpt)
export const PERMISSION_CATALOG: PermissionEntry[] = [
  { key: "leads.create",  module: "leads", label: "Create {leads}",
    defaultRoles: ["Owner", "Admin", "Member"] },
  { key: "leads.update",  module: "leads", label: "Update {leads}",
    defaultRoles: ["Owner", "Admin", "Member"] },
  { key: "leads.delete",  module: "leads", label: "Delete {leads}",
    defaultRoles: ["Owner", "Admin"] },
  { key: "ai.use",        module: "ai",    label: "Use the AI assistant",
    defaultRoles: ["Owner", "Admin", "Member", "Viewer"] },
  // ~80 more keys across leads, contacts, deals, companies, notes, messages,
  // tasks, tags, savedViews, pipelines, fields, ai, activityLogs, files, data, members, org
];
```

One file drives:

| Consumer | What it derives |
|---|---|
| Server-side `requireRole(member.permissions, "leads.create")` | Runtime checks on every public mutation |
| Default permissions for the 4 system roles (Owner / Admin / Member / Viewer) | Seeded via `getDefaultPermissionsForRole(role)` on org creation |
| Role-editor UI | Renders module-grouped permission tree with `{Leads}` placeholders interpolated to live entity labels |
| Backfill migration | When a new key lands, existing role docs get the new permission seeded |
| AI Capability Registry | `cap.permission` is one of these keys; the gate checks `principal.permissions.includes(permission)` |
| Tests | Test fixtures use the same `getDefaultPermissionsForRole` so the test world matches production exactly |

### 5.2 Why this is structurally safer than the standard "`if (role === 'admin')`" pattern

- **No magic strings.** Every consumer imports a typed key — typos become compile errors.
- **Custom roles** are first‑class — owners create roles in Settings → Members → Roles and pick from the same catalog the system roles use.
- **AI tool filtering happens before tokens are spent.** Locked rule: forbidden tools are filtered out of the registry before `streamText` is invoked. A viewer's AI never sees a `delete_lead` capability — zero tokens wasted on tools the user can't use.

### 5.3 Dynamic entity labels

Locked decision #2: entity labels are **never hardcoded**. The Owner can rename "Lead" to "Inquiry" or "Buyer" in Settings; `useEntityLabels()` (one canonical hook, decision #3) reactively pushes the new label through every component. Permission labels (`"Create {leads}"`) interpolate `{Leads}` at render time so the role‑editor UI also rephrases for the workspace's vocabulary.


---

## 6. The AI architecture — Capability Registry v2

> This is the most differentiated part of the system and the part being rebuilt right now (S0–S2 shipped 2026‑06‑03/04; S3–S17 in flight). It replaces a hand‑written 150‑tool layer that hit 80k tokens per turn, broke on date coercion, and welded tools to the chat runtime.

### 6.1 The mental model — three separated layers

```
┌───────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — CHANNEL ADAPTERS  (how a request arrives & who is asking)    │
│                                                                        │
│   Chat panel · Twilio WhatsApp · MCP server · REST · Slack · Cal.com   │
│   each one: (a) authenticates a PRINCIPAL (a member),                  │
│             (b) builds the agent context, (c) streams/returns a reply  │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ LAYER 2 — AGENT RUNTIME  (the brain; one, channel-agnostic)           │
│                                                                        │
│   • ToolLoopAgent host (AI SDK v6 native loop)                         │
│   • Progressive disclosure: starts with a tiny core set, discovers &   │
│     loads more on demand via prepareStep                               │
│   • 3-tier driving layers assembled here: PROJECT → GROUP → TOOL       │
│   • Stable cached prefix → ~10% billed input on Anthropic cache hits   │
│   • Writes every action to ONE audit log                               │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ LAYER 1 — CAPABILITY REGISTRY  (the single source of truth)            │
│                                                                        │
│   A capability = { schema(+coercion), module, group, permission,       │
│                    risk, drive(instructions), run(ctx,args)→Result }   │
│   run() calls the EXISTING canonical *Impl mutation/query body.        │
│   ONE projector renders a capability as: AI-SDK tool | MCP tool |      │
│   REST handler | WhatsApp intent. Define once → available everywhere.  │
└───────────────────────────────────────────────────────────────────────┘
```

The capability registry is the only place a "thing the AI can do" is defined. Everything else is a projection of it.

### 6.2 The atomic unit — a Capability

Co‑located with its backend (your `crm/entities/leads/capabilities.ts` sits next to `mutations.ts`):

```ts
type Capability = {
  name: "create_lead";                  // stable id, used by every channel
  module: "leads";                      // for module-gating + adaptive context
  group: "leads";                       // for routing + group playbook
  permission: "leads.create" | null;    // RBAC key from the catalog
  risk: "safe" | "reversible" | "irreversible";
  channels: ("chat" | "whatsapp" | "mcp" | "rest")[];

  // Model-facing contract built from a structured spec — not free text.
  spec: {
    whenToCall: string;
    whenNotToCall?: string;
    requiredClarifications?: string[];
    goodExample: object;
    badExample?: { args: object; why: string };
  };

  // STRICT input schema — every field uses field.* helpers so coercion is baked in.
  // Dates accept epoch | ISO | natural language. Arrays accept array | CSV | JSON-string.
  input: ZodSchema;

  // 3rd-tier driving layer: how to behave per outcome.
  drive: {
    onSuccess: string;
    onValidationError?: string;
    onEmpty?: string;
    onPartial?: string;
    onDenied?: string;
    suggestNext?: string;
  };

  // The single execution path. Calls the canonical *Impl body.
  // MUST return CapabilityResult — the type forbids "return 'done'".
  run: (ctx: CapabilityCtx, args: Infer<input>) => Promise<CapabilityResult>;
};
```

Key wins over the old `ToolDef`:

1. **No `tool()` wrapping, no module‑global `_toolCtx`.** `ctx` is passed in explicitly. That alone makes the same capability reusable on WhatsApp / MCP.
2. **One schema, one execution path.** No propose schema + commit schema + persisted‑payload re‑parse (the old setup had 3 boundaries where types could drift).
3. **Coercion is not optional.** `field.timestamp(orgTz)`, `field.codeArray()`, `field.int()` bake `z.preprocess` into the schema — a tool author *cannot* forget it.
4. **`run` must return a `CapabilityResult`.** The TypeScript type forbids a bare string. "Done." is structurally impossible.

### 6.3 The CorrectnessWrapper — one execution path, one taxonomy

Every capability call goes through `runCapability(cap, rawArgs, ctx)` (`convex/ai/registry/wrapper.ts`):

```
runCapability(cap, rawArgs, ctx) → CapabilityResult  (NEVER throws)
   1. coerce + parse via cap.input             → ZodError → repair(field, expected, …)
   2. resolve refs (P-007 → _id, name → row)   → none → not_found · many → ambiguous
   3. RBAC: principal.permissions ∋ cap.permission   → else denied
   4. channel: cap.channels.includes(principal.channel) → else channel_blocked
   5. risk: irreversible && !ctx.stepUpToken    → needs_step_up
   6. cap.run(ctx, args)
        ConvexError    → business_error (carries the real message)
        arg-validator  → repair (extra/missing field)
        5xx/429/timeout → infra_retry
        success        → ok | partial
```

The closed taxonomy of 10 outcomes:

| Outcome | Cause | What the model does next |
|---|---|---|
| `ok` | success | Narrate the envelope |
| `partial` | bulk: some rows failed | Report N ok / M failed + per‑row reasons + retry‑failed chip |
| `needs_repair` | coercion / parse / arg‑validator mismatch | Re‑call with the repair hint (bounded retries — usually 2) |
| `not_found` | code/name didn't resolve | `search_crm` first, then plain message |
| `ambiguous` | name matched >1 record | `ask_user` with the candidates |
| `denied` | RBAC | "You lack `<permission>`; suggest who can" |
| `channel_blocked` | e.g. bulk delete over WhatsApp | "Do this in the web app." |
| `needs_step_up` | irreversible + no 2FA token | Trigger 2FA confirm‑twice flow |
| `business_error` | ConvexError from the mutation (dedup, invalid stage…) | Surface the real reason + the fix |
| `infra_retry` | provider 5xx / timeout / rate‑limit | Transparent retry / failover |

Because classification + per‑outcome behaviour live in **one place** (the wrapper + the PROJECT driving layer), fixing a class of error fixes it for **every capability at once**. You never again chase a date bug tool‑by‑tool.

### 6.4 Self‑correcting validation — why the AI doesn't fail twice on the same arg

The old layer threw `TypeValidationError` *before* `execute` ran, so the model never saw a usable error inside the loop. The new layer:

1. **AI‑SDK schema is permissive** (`z.object().passthrough()`). The SDK never rejects.
2. **Strict parse + coercion happens inside the wrapper.** Failures return a structured `repair` envelope as the tool result:

```jsonc
{
  "status": "needs_repair",
  "field": "dueAt",
  "expected": "timestamp (epoch ms, ISO date, or natural language)",
  "received": "\"2024-06-05T09:00:00.000Z\" (string)",
  "fix": "Pass dueAt as 1717578000000 or \"2024-06-05\".",
  "example": { "type": "followup", "personCode": "P-007", "dueAt": "2024-06-05" }
}
```

3. **The model reads the repair and self‑corrects on the next step**, bounded by a retry budget. With central coercion (§6.6) in place, this path rarely triggers — it's the safety net.


### 6.5 Live schema is the single source of truth (NON‑NEGOTIABLE)

The AI's knowledge of fields/types/options/labels/pipelines/stages/modules comes **only from the org's live database**, read at the moment it's needed — never from templates, never hardcoded, never a stale prompt copy.

| Concern | Live source | How the AI reaches it |
|---|---|---|
| Entity labels | `org.entityLabels` | Auto‑injected into the active‑module context |
| Fields / types / options / required / sensitive | `fieldDefinitions` table | `describe_entity(entityType)` core tool |
| Pipelines + stages | `pipelines` table | `describe_workspace` core tool |
| Enabled modules | `org.settings.activeModules` | Filters the available capability set per request |

Two mechanisms make this airtight:

1. **`describe_entity` / `describe_workspace`** — on‑demand live reads so the AI *sees* the exact current fields/options before writing. On‑demand keeps tokens tiny vs. dumping the whole schema every turn (the old system's bloat), but it's just as live — every call hits the DB.
2. **Server‑side validation at write time** — `create_*`/`update_entity` fetch the live `fieldDefinitions` *inside `run()`* and coerce/validate the AI's values against them, returning per‑field `repair` for anything that doesn't fit. **The authority is always the live row at the moment of write** — even if the AI's view were stale, the write is validated against current truth. The owner can rename/retype/remove a field and the very next AI write respects it.

This is what makes **vertical adaptation** work without forking capabilities. Industry definitions (in `convex/_platform/industries/**`) are **seed‑only** — they create the org's initial `fieldDefinitions`/`pipelines` rows at onboarding and are NEVER read at AI runtime. After onboarding, the owner's edits live in the DB, and the DB is what the AI reads.

### 6.6 Central coercion — kills the bug class

One set of field builders every capability uses (`convex/ai/registry/coerce.ts`):

```ts
field.timestamp(orgTz)   // accepts epoch ms, ISO 8601, "next Tuesday", "in 3 days"
                         // → epoch ms in the workspace timezone
field.codeArray()        // array | CSV | JSON-string | single value → string[]
field.int()              // numeric string | number → integer
field.str()              // null/""/whitespace → undefined (stripEmpty)
```

Because these live in the shared builders, **a new capability is correct by default**. You cannot ship a date field that rejects ISO strings. The two reported production bugs (`dueAt wanted number, got ISO string`; `entityIds wanted array, got string`) become impossible by construction.

### 6.7 Three‑tier driving layer — token cost scales with what's active

```
SYSTEM PROMPT (assembled per request, but the top is STABLE → cacheable)

  ── PROJECT DRIVE ─────────────────────────────  (constant, cached at ~10%)
     Global doctrine for ALL capabilities:
       • Act, don't just answer; never invent codes
       • Output contract (always narrate the result envelope)
       • Retry policy (read repair envelope; fix args; never repeat same call)
       • Autonomy policy (you may execute RBAC-allowed reversible actions)
       • Safety (never expose other orgs' data; respect `sensitive` fields)

  ── CAPABILITY CATALOG ─────────────────────────  (stable, cached)
     Names + 1-line specs of every capability the principal can use.
     Generated from the registry — can never drift from what exists.

  ── ACTIVE MODULE CONTEXT ──────────────────────  (per org, semi-stable)
     Only enabled modules' context (entity labels, pipelines, fields…)

  ── GROUP DRIVE (only for activated groups) ────  (loaded on demand)
     e.g. group "scheduling":
       • Dates: resolve relative dates to the workspace timezone.
       • followup type REQUIRES a personCode; resolve via search first.

  ── TOOL DRIVE (only for in-scope tools) ───────  (loaded on demand)
     e.g. create_task.drive.onValidationError, .onSuccess, .suggestNext…

  ── PER-REQUEST TAIL ───────────────────────────  (dynamic, never cached)
     Route/page context, conversation facts, the user's message
```

Why three tiers matter:

- **Token cost scales with what's active**, not with the registry size. A "create a follow‑up" request loads PROJECT + the `scheduling` group + 2–3 tools in scope — a few hundred tokens of guidance, not thousands.
- **Behaviour is consistent and centralised.** Cross‑cutting rules (retry, output format) live in PROJECT, written once. You don't update prompts for every tool.
- **The stable top is cacheable.** PROJECT + the catalog form a stable prefix → Anthropic prompt caching bills cached input at ~10%, OpenAI auto‑caches at ~50%.

### 6.8 Progressive disclosure — the "right tools at the right step"

The runtime exposes a **small always‑on core** + a **discovery tool**, and grows the active set per step using AI SDK v6's `prepareStep`:

```
Turn starts. Active tools = CORE:
   • search_crm            (find people/deals/companies by name/code)
   • describe_entity       (live field types/options for an entity)
   • describe_workspace    (live pipelines/stages/labels/modules)
   • read_conversation     (recent transcript context for a personCode)
   • discover_capabilities (returns capability specs matching a query/group)
   • ask_user              (clarify)
   • escalate_to_agent     (hand off; persona-only on WhatsApp)

Model: user wants to "follow up with P-007 next Tuesday and update budget"
   → adaptiveRouter preloads: scheduling + leads groups
   → core tools + scheduling group's capabilities are active
   → model calls update_entity + create_task with correct args
   → if it needed something else, it could call discover_capabilities
     and the runtime injects more tools into the next step
```

**Token math (typical turn, before vs after):**

| | Old (all 17 layers force‑loaded) | New (core + 1 group, cached prefix) |
|---|---|---|
| Tool schemas in prompt | ~24k | ~2–4k |
| Driving guidance | every runbook | PROJECT + 1 group + a few tools |
| System/org context | full, rebuilt each turn, uncached | active modules only, cached prefix |
| Extra model calls/turn | router + suggestions + title | 0–1 (suggestions optional) |
| **Effective billed input/turn** | **~80k** | **~3–6k, most of it cached** |

### 6.9 Risk‑tiered autonomy — replaces locked decision #26

The old hard‑lock model (bulk/settings/members always confirm via propose/commit cards) is being replaced with a per‑capability `risk` field + per‑channel policy. Every capability declares one of three risk tiers; the runtime gates accordingly.

| Risk tier | Examples | Default autonomy |
|---|---|---|
| `safe` | search, read, list, draft | Always auto |
| `reversible` | create lead/task, update field, add note, convert lead, **soft‑delete** (30‑day trash exists) | **Auto‑execute** (no confirmation) |
| `irreversible` | bulk delete, hard delete, settings/schema edits, member/role changes | **RBAC + 2FA double‑confirm + channel allow‑list** (never WhatsApp) |

Decision matrix:

```
canRun(principal, cap)              ── else → denied (RBAC)
channel.allows(cap.risk)            ── else → channel_blocked
risk == irreversible && !stepUpToken ── then → needs_step_up (confirm twice)
else                                ── auto-execute, audited
```

So: **destructive tools are protected exactly as you'd expect** — only trusted roles hold the permission, they're unavailable over WhatsApp, and even in the web app they demand a double confirm. **Everything else the agent is allowed to do happens autonomously** — no propose/commit dance, no friction on the 95% of operations that are reversible (and have a 30‑day soft‑delete safety net anyway).

This is a deliberate reversal of locked decision #26, made with explicit user sign‑off and recorded in `Future-Enhancements.md` per the AGENTS.md deferral rule.

### 6.10 Channel adapters — one registry, every door

Adding a channel = writing one adapter file. **Zero capability changes.**

| Channel | Principal source | Inbound text is… |
|---|---|---|
| Chat panel | the logged‑in member | n/a (member is typing) |
| WhatsApp (Twilio per‑agent) | the member who owns that number | data to act on, never authority |
| MCP | member resolved from API token | data |
| REST | member resolved from API key | data |
| Slack (planned) | member resolved from Slack OAuth | data |
| Cal.com (planned) | webhook → member who owns the integration | data |

The same registry projects to:

- `projectors/aiSdk.ts` — AI‑SDK tools for chat (permissive input schema; strict parse inside the wrapper)
- `projectors/mcp.ts` — MCP tools for external agents (a customer's own LLM can drive the CRM through MCP)
- `projectors/rest.ts` — typed REST endpoints

**Why this is production‑ready and not a slogan:**

- One failure model → a finite, tested set of outcomes; no silent "Done.", no unclassified throw.
- Coverage is computable → the registry tells you exactly which backend functions are AI‑reachable and which capabilities are complete (`coverage.ts`).
- Tokens bounded → per‑request group loading + cached prefix → ~3–6k effective input.
- Adapts to the product → module registry means CRM, productivity, or freelancer configs each get a correct, minimal AI surface automatically.
- Secure by construction → members‑only principals, RBAC‑gated availability, destructive ops fenced by permission + 2FA + channel.
- One definition, every channel → chat, Twilio/WhatsApp, MCP, Slack reuse the same capabilities; new integrations are adapters, not rewrites.

### 6.11 Autonomous engine — acting from a conversation, not from a command

The `autonomousTurn()` runtime (S11 stage) loads recent conversation, checks `org.settings.aiAutonomy.autoActFromConversations`, and runs the same `runAgent` with `trigger: "autonomous"` and a PROJECT‑drive variant ("observe; perform implied CRM actions; ask the AGENT — never the customer — only for missing required fields").

Real example trace:

```
Lead messages on WhatsApp: "Hi, I'm Sara, looking for a 2BR in JVC,
                            budget 120k, can you send options Tuesday?"

Twilio webhook → verify signature → map agent's number → principal = Agent A
  → persist inbound message (source="whatsapp") → schedule autonomousTurn

autonomousTurn (registry, trigger="autonomous", Agent A's RBAC):
  PROJECT-autonomous drive: "Observe; perform implied CRM actions; never message the customer."
  step 1: search_crm("Sara" + phone) → no match
  step 2: describe_entity("lead") → field types
  step 3: create_lead{ displayName:"Sara", phone, source:"whatsapp",
                       fields:{ budget:120000, propertyType:"2BR", area:"JVC" } }  [dedup→none→create]
  step 4: create_task{ type:"followup", ref:newLead, dueAt:"next Tue",
                       title:"Send 2BR JVC options" }
  step 5: add_note(newLead, "Inbound WhatsApp: wants 2BR JVC ~120k, options Tue")
  audit: 3 actions by Agent A via whatsapp.
```

The customer's text is **content**; the agent (a member) is the principal. An unknown sender → no principal → the agent may read/extract/suggest, but can execute nothing. This closes the obvious "anonymous WhatsApp number triggers CRM writes" hole.

### 6.12 Stages shipped vs in flight

- ✅ **S0** — Registry scaffold (types, coerce, result, define) — 27/27 tests
- ✅ **S1** — Correctness machine (wrapper + gate + 10‑outcome taxonomy) — 52/52 tests
- ✅ **S2** — Agent host + 5 core tools + AI‑SDK projector + prompt caching + `AI_V2` flag — 85/85 tests, full repo green
- 🔵 **S3–S7** — Port leads / tasks / deals + companies / notes + timeline + notifications / pipelines + fields + tags + views (one stage per domain)
- 🔵 **S8** — Approvals → Autonomy migration (schema + UI in same change)
- 🔵 **S9** — Module + Vertical registry (adaptivity)
- 🔵 **S10** — Members + Settings + Bulk/destructive + 2FA step‑up + channel fence
- 🔵 **S11** — Autonomous engine (event‑driven)
- 🔵 **S12** — Audit feed + coverage report + token measurement
- 🔵 **S13** — Twilio inbound (per‑agent, RBAC from day 1)
- 🔵 **S14** — Outbound send (24h window: session vs template)
- 🔵 **S15** — WhatsApp Agent Profile (Mode C autonomous customer replies, off by default)
- 🔵 **S16** — MCP + REST projectors
- 🔵 **S17** — Cutover (delete old layer, flip `AI_V2` on, slim `run.ts` to a host caller)


---

## 7. The canonical mutation — every public write follows this 7‑step shape

Locked decision #17. Every public mutation that creates or mutates org data follows this exact pattern (`AGENTS.md` + `convex/_arch.md`):

```ts
export const create = orgMutation({
  args: { orgId: v.id("orgs"), /* ... */ },
  handler: async (ctx, args) => {
    // 1. RBAC + rate limit
    const { member, userId } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.permissions, "leads.create");
    await enforceRateLimit(ctx, {
      scope: "leads.create",
      key: `${userId}:${args.orgId}`,
      ...RATE_LIMITS.write,
    });

    // 2. Dedup (leads + contacts only — by email, phone, displayName)
    const dupes = await runDedup(ctx, args.orgId, args.email, args.phone, args.displayName);
    if (dupes.length > 0) return { id: null, duplicates: dupes };

    // 3. Record code (P-001, D-007, T-021, …)
    const personCode = await generatePersonCode(ctx, args.orgId);

    // 4. DB insert (always include createdAt + updatedAt)
    const id = await ctx.db.insert("leads", {
      ...args, personCode, createdAt: now, updatedAt: now,
    });

    // 5. logActivity — ALWAYS pass personCode for person-related mutations
    await logActivity(ctx, {
      orgId: args.orgId, userId, action: "created",
      entityType: "lead", entityId: id, personCode,
      description: "Lead created",
    });

    // 6. sendNotification — ALWAYS when assignedTo is set
    if (args.assignedTo && args.assignedTo !== userId) {
      await sendNotification(ctx, {
        orgId: args.orgId, userId: args.assignedTo,
        type: "lead.assigned", entityType: "lead", entityId: id, personCode,
      });
    }

    // 7. AI context rebuild — wired but no-op until live
    await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
      orgId: args.orgId, entityType: "lead", entityId: id, personCode,
    });

    return { id, personCode, duplicates: [] };
  },
});
```

**Why this is a marketing weapon:** every CRM in this market has half a dozen places where assignments don't notify, audit logs miss the actor, dedup runs in some files and not others, and rate limits exist for the API but not the UI. Here, **every public write is guaranteed** to RBAC‑check, rate‑limit, dedup (where applicable), generate stable codes, log to the audit trail with `personCode`, notify the assignee, and trigger AI context rebuild — because the convention is the canonical pattern in `AGENTS.md` and the test suite (`convex/crm-hardening.test.ts`, `tasks-hardening.test.ts`, `stage1`–`stage10.test.ts`) asserts on every step.

### 7.1 Soft‑delete is the convention

Every table that supports recovery uses `softDelete` (`deletedAt: number?`). Mutations that "delete" call `ctx.db.patch(id, { deletedAt: now })`. Queries filter on `!doc.deletedAt`. The `convex/trash/` module surfaces a 30‑day recovery UI. Hard delete is reserved for join tables and authentication artifacts.

### 7.2 Six independent cross‑cutting tables (locked decision #11)

`notes`, `messages`, `notifications`, `activityLogs`, `tasks` (which absorbed `reminders` per the 2026‑05‑27 rename), and `files` are **separate tables**, each with its own indexes / RBAC / schema. The previous "shove everything into `notes` with a `kind` flag" approach was dropped because:

- Independent indexing per concern (notes search ≠ messages thread reads ≠ activity feed)
- AI tool 1:1 mapping is cleaner — one capability per concept
- Permissions are fine‑grained (`messages.send` ≠ `notes.create`)
- `Timeline` and `Calendar` are **read‑merge views** over these tables — no third table

### 7.3 Migrations — same message, never deferred (NON‑NEGOTIABLE)

Locked rule (`AGENTS.md`). When a schema change breaks existing data, the migration is shipped in the same edit:

- ~40 idempotent migrations live in `convex/_migrations/` (each named with date + intent: `2026_05_30_clearMockDataDismissedAt.ts`).
- Every migration is safe to run twice (skip already‑migrated rows).
- A schema rename ships with: (a) the schema change, (b) the migration that backfills + clears, (c) every reader/writer updated in the same diff.
- The runtime rule (`Convex MCP / npx convex run hangs in this agent runtime`) means the agent emits the exact `npx convex run` command for the user to paste; nothing happens silently.

### 7.4 Indexes — naming convention enforces tenancy

| Pattern | Example | Why |
|---|---|---|
| `by_org` | scope all reads by orgId | First in every compound key |
| `by_org_and_<field>` | filter within an org | `leads.by_org_and_personCode` |
| `by_<unique_field>` | global lookup | `users.by_email`, `invitations.by_token` |
| `by_userId_and_<field>` | per‑user state | `notifications.by_userId_and_read` |

`.collect()` is **banned** on org‑scoped tables that can grow beyond ~500 rows. Pagination or `.take(N)` only.


---

## 8. Module deep‑dive — what each `core/*` does and why it's engineered the way it is

### 8.1 `core/shell` — the config‑driven app scaffold

> One layout, every module's routes render inside it. Sidebar, topnav, AI panel, keyboard shortcuts.

**Marketing claim:** "Add a new top‑level feature → one row in `navigation.ts`. RBAC, plan‑gating, badge counts, dynamic entity labels, and feature flags all wire up automatically."

**The engineering that makes that claim real:**

- `core/shell/config/navigation.ts` is the **single source of truth** for sidebar items. Every nav item declares: `id`, `icon`, `href`, optional `permission` (RBAC key), optional `featureFlag` (wraps in `<ModuleGuard>`), optional `entitySlot` (label from `org.entityLabels`), optional `badgeKey` (for unread counts).
- One batched query (`api.orgs.getNavBadgeCounts`) returns every badge count in a single subscription — locked Performance Rule: "Badge counts loaded from ONE query, not N separate queries".
- Identity / membership / labels are loaded **once at the layout level** (`<OrgProvider>`) and provided via React context. Locked Performance Rule: components MUST NOT call `useQuery(api.orgs.getMyMembership)` directly — they read from `useCurrentOrg()`. Auth/identity overhead dropped from ~20% of all Convex calls to ~3% after this rule landed.
- Layout preferences (sidebar variant, content layout, navbar style, theme mode, theme preset, font) are stored in **cookies** (SSR‑safe), never localStorage. Each value has a typed enum and a default in `lib/preferences/preferences-config.ts`.
- The dashboard shell explicitly bans `Element.scrollIntoView()` (locked decision #10) — scrollable ancestors in nested shells cascade scroll up the DOM and shift the entire layout. Use `scrollToSection` with explicit container targeting.

### 8.2 `core/shell/onboarding` — under‑2‑minute, single‑route wizard

> Three steps. One `useState`. No sub‑routes. Industry pick seeds the workspace.

- All 3 steps live at `/onboarding` (decision O1). Back/forward freely without losing data.
- `org.onboardingStep` (0/1/2) lets future versions resume mid‑wizard.
- Industry selection seeds default fields + pipeline stages from the templates in `convex/orgs/templates/` and `convex/_platform/industries/builtIns/`. **Templates are seed‑only** — once seeded, the AI reads the live `fieldDefinitions`/`pipelines` rows, never the template (§6.5).
- `platformOrgId` (`ORB-XXXXX`) is generated from the `PLATFORM_PREFIX` env var — never hardcoded. White‑label deployments just change the env.
- Slug uniqueness is GitHub‑style: `acme-corp` → `acme-corp-2` → `acme-corp-3` via `ensureUniqueSlug()` in `orgs/helpers.ts`. Reserved slugs (`api`, `app`, `admin`, `xowner`, …) live in `convex/_shared/reservedSlugs.ts` SSOT.
- Post‑onboarding: optional Onborda product tour walks the user through sidebar / search / AI panel / settings. Tour completion stored in `users.dismissedCards` (versioned: `product_tour_v1` so we can re‑trigger on UI changes).

### 8.3 `core/entities` — 4 scaffolds power every entity, including industry slots

> "Add a new entity type → ~5 files, 1–2 days." `EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard` are the only entity‑shaped components.

- **The 4 scaffolds** (`scaffolds/EntityListPage.tsx` etc.) handle leads, contacts, deals, companies AND the 2 optional vertical slots `entity5` / `entity6`. Locked decision #9.
- **`useEntityFields(slot)`** is the single source of field metadata; `useEntityColumns()` builds TanStack column defs; `useModuleDisplay()` resolves board groupBy. Decision #1 of 2026‑05‑21: tables flow through one factory; the hand‑rolled per‑entity `useMemo<ColumnDef>` blocks were deleted in favour of `useEntityColumns`.
- **Card highlight slot for "important" custom fields** — `EntityCard.highlightFieldDefs` filtered by per‑user `cardFields`. Per‑user view toggles write to `users.preferences` (locked Decision: per‑user board layouts via cookies/localStorage; org‑wide layouts via the server).
- **Single‑click instant convert + double‑click for options** — `data-tour="convert-shortcut"` triggers a `<FirstTimeTour>` once‑per‑device coachmark.
- **Per‑user persisted column order** via `usePersistedColumnOrder(slot, columns)` — the slot key includes the active `groupBy` (`lead:status` vs `lead:assignedTo` vs `lead:tag`) so swapping groupings doesn't carry stale orderings.
- **Stage‑aware deal tables** (decision 2026‑05‑21): when the toolbar `StageFilter` is set, the table narrows to *Default‑stage pinned* fields + the *active stage's* pinned fields. The Default stage is the SSOT for "always‑on" deal fields — admin‑driven, not hardcoded.

### 8.4 `core/data-display/datatable` — TanStack v8, one engine, used everywhere

> Every list view, members page, activity log full‑page, tasks list, AI tool result tables.

- Headless TanStack Table v8; pagination is **manual** (Convex paginates server‑side, never client).
- State (sorting, filters, column visibility, page) URL‑synced via **nuqs** — locked decision: filter state and column visibility live in URL search params, not in localStorage. Deep links share the active view; refresh keeps it.
- Optional row selection → bulk‑action bar; faceted filters (multi‑select), date‑range filters, slider filters all built once in `components/`.
- `DataTableSkeleton` matches the column count so the loading state has the same dimensions — no layout shift.

### 8.5 `core/data-display/kanban` — config‑driven, generic engine

> Same engine powers Deals (pipeline stages), Leads (status board), Notes (sticky‑note category board), and the future Projects board.

- **Zero entity knowledge inside `KanbanBoard`** — props in, events out. Columns come from pipeline stages or category records (DB), never hardcoded.
- **Drag persistence is one mutation per drop** (locked Performance Rule). Visual feedback in `onDragOver` / `onValueChange`; persistence in `onCommit`. Dragging across N cards in a column otherwise fires N+1 mutations and 5N+ list re‑subscriptions. With the rule applied: 1 drag = 1 mutation = 1 optimistic patch = 0 list re‑subscriptions.
- **Free‑position drag‑and‑drop with persisted `sortOrder`** — gap‑based fractional positioning (top = `min - 1024`, bottom = `max + 1024`, between = `(a+b)/2`). When neighbours get tight (`< 1`), `rebalanceCategoryIfTight()` renumbers the column with 1024‑step gaps. Idempotent.
- **Mobile** — columns render as a horizontal swipe carousel; drag is replaced by a stage‑selector dropdown on tap. The same `moveToStage` mutation backs both gestures.

### 8.6 `core/data-display/command-palette` — `Cmd+K` everywhere

> Universal entry point: search any entity, jump to any saved view, fire any quick action.

- Built on `cmdk`. Debounced 200ms search query to Convex (`api.search.global`).
- Result resolution by code is direct: typing `P-001` calls `crm.people.queries.getByPersonCode` and surfaces a "Record Match" group above the fuzzy results.
- Context‑aware page actions: the current pathname feeds `usePageActions()` — on a deal detail page, the palette suggests "Move to Won", "Add note", "Set follow‑up".

### 8.7 `core/comms` — timeline + notes + messages, three concepts, three tables

| Surface | Backed by | Why separate |
|---|---|---|
| **Timeline** | Read‑merge over `activityLogs + notes + tasks` | One audit‑style continuous rail. Three entry shapes (bare line / card / ring node) tagged server‑side via `_kind`. Newest at the bottom; cursor‑paginated via top sentinel + IntersectionObserver. |
| **Notes** | `notes` table + `noteCategories` | Sticky‑note kanban grouped by user‑managed category. Free drag with gap‑based `sortOrder`. Per‑category bg/text colour with luminance‑derived fallback. |
| **Messages** | `messages` table | Chat threads (text + images + files + voice via `MediaRecorder`). 6 indexes including `by_replyTo` for threading. WhatsApp messages also write here when the v2 inbound adapter ships. |

Notable engineering wins:

- **Cursor pagination** in `messages.listForConversationPaginated` — 30 messages per page, position‑preserving prepend on `loadOlder()`.
- **`useLayoutEffect` scroll‑to‑bottom + `ResizeObserver`** to handle async media load (images / videos / audio finishing decode after the React commit).
- **Continuation grouping** — sender‑change detection collapses consecutive messages from the same author on the same day; matches Telegram/iMessage UX.
- **Forwarding** — re‑references the same `Id<"files">[]` (org‑scoped, accessible to any thread member) instead of cloning storage; body prefixed with `↪ Forwarded` for provenance, no schema cost.

### 8.8 `core/scheduling` — one `tasks` table, three view modes

> The legacy `reminders` + `followups` modules merged into a single `tasks` module per `TASKS-RENAME-PLAN.md`. Industry CRMs (Salesforce, HubSpot, Pipedrive, Attio) all use one noun.

- `tasks.type` is the closed‑union discriminator: `todo / call / email / meeting / followup`. `followup` carries CRM cadence semantics.
- **Three view modes** (`list / calendar / today`) live inside `TasksView`, URL‑persisted via `?view=`. The calendar is a *view of tasks*, not a separate page.
- The dashboard `<LiveTasksWidget>` reuses the same `<TasksDataTable>` in compact mode (no URL state writes) — zero divergence between the dashboard widget and the /tasks page.
- Optimistic updates patch every cached list shape (7 query shapes: `getDueToday`, `getDueAndOverdue`, `getNextUpcoming`, `listAllForOrg`, `listForOrg`, `listForPerson`, `listOpen`). Locked Performance Rule applies: every list‑affecting mutation has `withOptimisticUpdate`.
- Calendar grid is a **pure renderer** — `<CalendarMain>` accepts an `events` prop and never calls `useQuery`. Bucketing runs once at the parent via `useMemo`. Date range is clamped to ±45 days (locked decision #25 — bounds the read set; prevents 5‑year scans).

### 8.9 `core/data-io/csv-import` — AI maps, user approves

> Traditional importers ask users to map every column manually. Our import wizard flips it: AI does the mapping.

- 5‑step wizard: Upload → AI mapping (with confidence %) → Preview → Dedup options → Progress.
- AI sees CSV headers + first 3 data rows + the org's live `fieldDefinitions`. Returns `{ csvHeader, fieldName, confidence, reason, action }` per column.
- Background processing via **Trigger.dev** — batches of 50 rows, real‑time progress via Convex reactive query.
- Calls the **same canonical mutation** as UI and AI tools. Source field tracks origin (`source: "csv"`).
- Failed rows downloadable as an Error CSV (with `reason` column) for the user to fix and re‑upload.

### 8.10 `core/inbox/notifications` — real‑time bell, no polling

- Convex reactive subscription on `notifications.by_userId_and_read` powers the unread badge.
- ~25 notification types (`LEAD_ASSIGNED`, `DEAL_WON`, `TASK_OVERDUE`, `MEMBER_INVITED`, `BILLING_TRIAL_ENDING`, `CSV_IMPORT_COMPLETE`, …).
- Notification preference keys are SSOT (`convex/_shared/notificationKeys.ts`, locked decision #15) — drives the schema validator, mutation validator, and the per‑user preferences UI.

### 8.11 `core/platform/settings` — single `/settings` route, no sub‑routes

- One page. Group switching via left nav + `?group=` query param (locked decision #4).
- **Per‑section save** — no global save button (locked decision #5). Each section is its own form + mutation.
- **Lazy load group data** — pipelines/fields/tags/members are only fetched when that group is active (locked decision #12).
- **Two queries load the entire page**: `getFullSettings` + `getMyPermissions`. O(1) regardless of org size.
- Activity Log is **NOT** in settings — lives at `/{orgSlug}/timeline` and `/{orgSlug}/settings/activity-log` (locked decision #7).

### 8.12 `core/platform/profile` — unified person page at `/profile/[personCode]`

> One page resolves both leads and contacts via `crm.people.queries.getByPersonCode`. Tabs aggregate every related record across the entity boundary.

- **Tabs**: Overview, Notes, Messages, Files, Timeline, Tasks. Each tab queries its own narrow read; `<TabsContent>` lazy‑renders so you don't pay for tabs you don't open.
- **`useEntityDisplay`** resolves the real entity name (and its `personCode` badge) for cross‑entity surfaces (timeline, conversation rows, notification rows). Always shows the human name first; the personCode lives in a small monospace badge for power users.


---

## 9. Backend deep‑dive — `convex/` engineering choices

### 9.1 The architecture map (`convex/_arch.md`)

Five logical groups; physical structure stays flat at the top level so public `api.X` paths don't break (locked decision #19):

| Group | Modules | Purpose |
|---|---|---|
| 🏗️ **Infrastructure** | `_generated`, `_shared`, `_functions`, `_test`, `_migrations`, `schema/` | Codegen, cross‑cutting helpers, auth wrappers, test seeds, migrations, schema files |
| 🪪 **Identity** | `users`, `orgs`, `orgRoles`, `invitations` | Workspace + people; the auth boundary |
| 🛰️ **System** | `notifications`, `activityLogs`, `files`, `featureFlags` | Generic infra fed by every feature |
| 🧭 **CRM** | `crm/entities/*`, `crm/fields/*`, `crm/people/`, `crm/shared/*` | The product domain |
| 🤖 **AI** | `ai/registry/`, `ai/runtime/`, `ai/orchestrator/` (slimming), `ai/insights/`, `ai/standingOrders/`, `ai/briefings*.ts`, `ai/messages.ts`, `ai/conversations.ts`, `ai/keys*.ts`, `ai/models.ts` | Capability Registry v2 (§6) + chat layer + insights + briefings |

A separate **🛡️ Platform Owner** group lives at `_platform/` (the super‑admin panel). Locked rule: the panel **never reads org‑scoped content**.

### 9.2 Schema split — 7 domain files

Locked at 2026‑05‑16. `convex/schema.ts` is a barrel re‑export; the real schemas live in:

- `schema/identity.ts` — `users`, `orgs`, `orgMembers`, `orgRoles`, `invitations` (~21k lines including indexes + nested validators)
- `schema/system.ts` — `notifications`, `activityLogs`, `files`, `featureFlags`
- `schema/ai.ts` — `aiConversations`, `aiMessages`, `aiBriefings`, `orgAiKeys`, `aiStandingOrders`, `dealScores`, `ephemeralDashboardCells`, `dashboardAnnotations` (~46k lines — the biggest)
- `schema/platform.ts` — `platformContext`, `platformAuditLogs`, `platformTiers`, `platformOtps`, `platformFlags`
- `schema/crmFields.ts` — `pipelines`, `fieldDefinitions`, `fieldValues`
- `schema/crmShared.ts` — `notes`, `messages`, `tasks`, `tags`, `savedViews`, `noteCategories`, `conversations`, `orbitLinks`
- `schema/crmEntities.ts` — `leads`, `contacts`, `deals`, `companies`, `entity5`, `entity6`, `entityCodeCounters`

**Why split:** one `schema.ts` would hit 100k+ lines and make code review impossible. Each file is independently reviewable; cross‑file references are typed.

### 9.3 Cross‑cutting infrastructure (`convex/_shared/`)

| Concern | File | Purpose |
|---|---|---|
| **RBAC SSOT** | `permissions/catalog.ts` | The 80+ permission entries, source for runtime checks + role‑editor UI + seed defaults |
| **Permission helpers** | `permissions/helpers.ts` | `requireRole(member.permissions, key)`, `hasPermission(...)`, `getDefaultPermissionsForRole(role)` |
| **Validators** | `validators.ts` | Reusable Zod/Convex validators (`orgScoped`, `timestamps`, `softDelete`, role types) |
| **Errors catalog** | `errors.ts` | Typed `ERRORS` constants — every thrown error is from this catalog |
| **Rate limit** | `rateLimit.ts` | `enforceRateLimit(ctx, { scope, key, max, periodMs, orgId })`. Per‑tenant overrides honoured. Drag operations gate on 120/min `(userId, orgId)` budget. |
| **Record codes** | `recordCodes.ts` | `generatePersonCode`, `generateEntityCode` — atomic per‑org counters in `entityCodeCounters` table |
| **Reserved slugs** | `reservedSlugs.ts` | `RESERVED_SLUGS` set, `validateSlug()`. Imported everywhere — never inlined. |
| **Notification keys** | `notificationKeys.ts` | `NOTIFICATION_PREFERENCE_KEYS` SSOT, drives schema + mutation + UI |
| **Dedup** | `dedup.ts` | Fuzzy match by email + phone + displayName for leads/contacts |
| **AI entity patch** | `aiEntityPatch.ts` | Apply field patches against live `fieldDefinitions` — server‑side validation for AI writes (§6.5) |
| **Synonyms** | `synonyms.ts` | Field‑name normalisation (e.g. `"phone_number"` → `"phone"`) |
| **CSV encoding detect** | `csvEncodingDetect.ts` | UTF‑8 vs UTF‑16 detection (handles Arabic CSVs) |
| **Bulk progress** | `bulkProgress.ts` | Progress tracking for CSV import + bulk operations |
| **Sanitiser** | `sanitiseExtractedText.ts` | Strip prompt‑injection attempts from AI‑extracted text |
| **logActivity** | `../activityLogs/helpers.ts` | The single audit‑log writer — every public mutation calls it |
| **sendNotification** | `../notifications/helpers.ts` | The single notification writer — assignee changes always notify |
| **Org stats** | `orgStats.ts` | Cached aggregates (lead/deal counts, pipeline value) — recomputed on cron |

### 9.4 Authentication

- **`@convex-dev/auth` + Resend OTP** (`convex/auth.ts`, `convex/ResendOTP.ts`). Email‑only OTP flow; no passwords.
- Owner panel uses a **second OTP layer** (`convex/_platform/otp/`) — even an authenticated super‑admin must complete OTP to access the owner panel; sessions live in cookies (`lib/owner-otp-cookie.ts`), tracked in the `platformOtps` table, force‑expired on logout.
- `auth.config.ts` declares JWT issuer/audience for cross‑service trust (matches the convex‑auth recipe).
- The `createOrUpdateUser` callback creates the `users` row on first sign‑in, applies onboarding defaults, and seeds default preferences.

### 9.5 Subscriptions & billing — `convex/billing/`

- **LemonSqueezy webhooks** (`billing/internal.ts`) — verified via HMAC; updates `org.plan`, `org.billing.status`, trial end dates.
- **Plan tier limits SSOT** at `_platform/limits.ts` — sync `getPlanLimits(tier)` returns in‑code constants (back‑compat); async `getPlanLimitsFromDb(ctx, tier)` reads `platformTiers` (owner‑editable). Convention: `-1` for unlimited, `0` for feature disabled.
- **Trial banner** (`core/billing/components/TrialBanner.tsx`) computes days remaining client‑side from the org's `trialEndsAt`; a Convex cron sweeps trials at end‑of‑day.

### 9.6 GDPR — `convex/gdpr/`

- **Right to be forgotten**: `gdpr.actions.exportUserData` packages every record about a user; `gdpr.actions.deleteUserData` soft‑deletes their personal data and rotates references in `activityLogs` to `[redacted]`.
- Per‑user export is a `"use node"` action so it can stream to a ZIP via `fflate` and upload to Convex storage.

### 9.7 The `_platform/` super‑admin panel — fail‑closed by construction

Locked rules in `_platform/MODULE.md`:

1. Every public function calls `requirePlatformOwner(ctx)` as its first line.
2. Every mutation follows a 4‑step pattern (auth → rate‑limit → before‑snapshot + write → `logPlatformAction`).
3. Audit‑log table is **APPEND‑ONLY**. No update/delete mutations exposed.
4. NEVER read org‑scoped content from this folder.
5. NEVER add `*ForAI` twins to `_platform/*` — these handlers are owner‑panel only; AI tools never call them.

The panel URL is rewritten from `OWNER_PANEL_SLUG` (server‑only env). Direct hits on `/xowner` are 404 — the literal route is unreachable except via the rewrite. A non‑secret `is_owner_panel=1` cookie lets client telemetry filter without ever reading the slug.

Modules under `_platform/`: industries (built‑in templates), users (paginated cross‑org listing), orgs (org‑level admin), tiers (plan limits editor), audit (append‑only log viewer), aiKeys (platform BYOK), reservedSlugs (slug allow‑list editor), flags (kill‑switch / rollout flags), platformContext (the AI's "platform rules" prompt), overview (dashboard counts), billing (provider config presence — never values), otp (owner session OTPs).

### 9.8 Background jobs

- **Convex `crons.ts`** — nightly daily briefings, weekly org briefings, deal scoring sweep, anomaly detection sweep, OTP garbage collection, trial sweep, mock‑data dismissal cleanup.
- **`ctx.scheduler.runAfter(0, …)`** — fire‑and‑continue from inside a mutation (AI context rebuild, post‑drag rebalance, post‑mutation activity logs that need a Node action).
- **Trigger.dev v4** — long‑running CSV imports + onboarding email drip sequence. Convex actions can't run >30s reliably; Trigger.dev fills that gap.


---

## 10. Tooling structure — how the new AI tooling is engineered (deep)

This is the layer the user specifically asked about. The structure isn't accidental — every directory in `convex/ai/registry/` and `convex/ai/runtime/` exists because it owns a single concern.

### 10.1 The on‑disk layout

```
convex/ai/registry/                ← Capability Registry v2 (the SSOT)
├── types.ts                       Capability, Principal, CapabilityCtx, CapabilityResult,
│                                  Outcome, RiskTier, Channel
├── coerce.ts                      coerceTimestamp / coerceStringArray / coerceInt /
│                                  stripEmpty + the field.* helpers (z.preprocess)
├── result.ts                      ok() / partial() / failed() / repair() / ask() / denied()
├── define.ts                      defineCapability() + REGISTRY Map + getCapability +
│                                  listCapabilities
├── wrapper.ts                     runCapability() — the ONE execution path (7 steps)
├── gate.ts                        canRun + channelAllows + needsStepUp (RBAC + 2FA + channels)
├── catalog.ts                     Deterministic, alphabetised capability catalog
│                                  for the cached prefix
├── drive.ts                       PROJECT_DRIVE doctrine + assembleSystemPrompt() +
│                                  Anthropic cache_control marker
├── router.ts                      adaptiveRouter(message, routeCtx) → group(s) to preload
├── modules.ts                     ModuleDef registry + activeModules(org) +
│                                  per-module context providers (S9)
├── vertical.ts                    VerticalProfile (industry persona — thin adapter, no fields)
├── groups.ts                      GroupDef: group → playbook text + member capability names
├── coverage.ts                    Registry-derived completeness/contract report
├── audit.ts                       writeAudit() — one feed for every AI action
├── projectors/
│   ├── aiSdk.ts                   Capability → AI-SDK tool (PERMISSIVE input schema)
│   ├── mcp.ts                     Capability → MCP tool (S16)
│   └── rest.ts                    Capability → REST handler (S16)
├── *.test.ts                      Per-file vitest unit suites (via convex-test)
└── (per-domain capabilities live next to their *Impl, not here)

convex/ai/runtime/                 ← The brain (channel-agnostic)
├── host.ts                        runAgent({ principal, channel, trigger, conversation,
│                                  message }) — ToolLoopAgent + prepareStep + caching
├── coreTools.ts                   search_crm, describe_entity, describe_workspace,
│                                  read_conversation, discover_capabilities, ask_user,
│                                  escalate_to_agent
├── autonomous.ts                  autonomousTurn() — event-driven engine (S11)
└── host.test.ts

convex/ai/channels/                ← Per-channel adapters (S13–S16)
├── whatsappInbound.ts             Twilio HMAC verify + per-agent number → principal
└── persona.ts                     WhatsApp Agent Profile config + constrained allow-list

convex/crm/**/capabilities.ts      ← Co-located with backend mutations
                                   (one capabilities.ts per domain — leads, tasks,
                                    deals, companies, notes, pipelines, fields, …)
```

**Key insight:** `convex/ai/registry/` doesn't contain any per‑domain code. The domain code (`create_lead`, `create_task`, …) lives **next to its `*Impl`** under `convex/crm/`. The registry just *collects* every domain's `capabilities.ts` into one map. When a backend function changes, its capability is right there — no drift, no hunt.

### 10.2 The `field.*` builders — coercion baked into Zod

```ts
// coerce.ts (excerpt)
export const field = {
  timestamp: (orgTz: string) => z.preprocess(coerceTimestamp(orgTz), z.number()),
  codeArray: () => z.preprocess(coerceStringArray, z.array(z.string())),
  int: () => z.preprocess(coerceInt, z.number().int()),
  str: () => z.preprocess(stripEmpty, z.string().optional()),
};
```

Tool authors use `field.timestamp(orgTz)` — they can't ship a date field that rejects ISO strings. This is the **structural fix** for the entire class of "wanted X, got Y" bugs.

### 10.3 How a capability is added (the actual workflow)

Adding `create_task` to the AI's reach is exactly this:

1. The canonical `tasks.create` `orgMutation` already exists. Its body is extracted into `createImpl(ctx, args)` (the `*Impl` helper).
2. `convex/crm/shared/tasks/capabilities.ts` declares:
   ```ts
   defineCapability({
     name: "create_task",
     module: "tasks",
     group: "scheduling",
     permission: "tasks.create",
     risk: "reversible",
     channels: ["chat", "whatsapp", "mcp", "rest"],
     spec: { whenToCall: "...", goodExample: { ... } },
     drive: { onSuccess: "...", onValidationError: "..." },
     input: z.object({
       type: z.enum(["todo","call","email","meeting","followup"]),
       personCode: field.str(),
       title: field.str(),
       dueAt: field.timestamp(orgTz),       // ← coercion baked in
       entityIds: field.codeArray(),         // ← coercion baked in
     }),
     run: async (ctx, args) => {
       const result = await createImpl(ctx.ctx, { ...args, orgId: ctx.principal.orgId,
                                                  userId: ctx.principal.userId });
       return ok({
         headline: `Created ${result.taskCode}: ${args.title ?? args.type}`,
         changes: [{ label: "Type", value: args.type, emphasis: "added" },
                   { label: "Due", value: formatChatDateTime(args.dueAt) }],
         suggestedNext: [{ label: "Add note", intent: "add_note" }],
       });
     },
   });
   ```
3. Done. The capability is now **available on every channel**, **type‑safe**, **RBAC‑gated**, **rate‑limited (via the `*Impl`)**, **audited (via the `writeAudit` in the wrapper)**, and **contract‑tested automatically** by `coverage.ts` (which generates a contract suite per capability: schema accepts its own `goodExample`, ISO date coerces, CSV array coerces, RBAC denies without the permission, `run` returns a valid envelope shape).

There is **no second file**, no manual prompt update, no per‑channel rewiring, no propose/commit twin. The audit/coverage report (`coverage.ts`) tells you exactly which `*Impl` functions are AI‑reachable and which capabilities are missing examples or playbooks.

### 10.4 What the runtime guarantees

| Concern | Old (force‑load) | New (registry + runtime) |
|---|---|---|
| Tool exposure | All 17 layers, every turn | Core + 1 router‑preloaded group; long‑tail via `discover_capabilities` |
| Field knowledge | Whole org schema dumped in prompt | `describe_entity` on demand (live read) |
| Arg validation | Per‑tool opt‑in coercion | Central `field.*` builders; permissive AI‑SDK schema; strict parse inside |
| Error handling | Ad‑hoc per tool; raw throws | One CorrectnessWrapper, 10‑outcome closed taxonomy |
| Confirmation | propose/commit two‑schema dance | Single execution path; one 2FA step‑up on the same schema |
| Result | `display`/`summary` optional → "Done." | Mandatory typed envelope — type forbids bare strings |
| Loop | Hand‑rolled `streamLoop.ts` (43 KB) | AI‑SDK `ToolLoopAgent` + `prepareStep` |
| Driving guidance | Per‑tool runbooks for every loaded tool | 3‑tier (PROJECT cached → GROUP on activation → TOOL in scope) |
| Channels | Tools welded to chat | One registry → projectors (AI‑SDK / MCP / REST) + adapters |
| Autonomy | Hard‑locked approvals (#26) | Risk‑tier + 2FA + channel allow‑list |
| Module changes | Prompt + tools hand‑maintained | Module registry gates tools AND context from one switch |
| Correctness proof | Lives in 150 files | Registry‑derived contract tests + coverage report |

### 10.5 The chat layer (kept)

Not everything in `convex/ai/` is being rewritten. The chat layer that already works stays:

- `messages.ts` — public mutation `sendMessage` schedules `processChat.run`; query `listForConversation` powers the UI
- `conversations.ts` — CRUD on `aiConversations`
- `models.ts` + `modelRegistry.ts` — multi‑provider model registry SSOT
- `keys*.ts` — BYOK with AES‑GCM encryption (Node action encrypts; V8 mutation only ever sees ciphertext; `encryptedKey` is stripped from every public read path)
- `briefings*.ts` — daily + weekly briefings (platform‑billed, never BYOK; cron + on‑demand)
- `insights/` — pure helpers for deal scoring + anomaly detection
- `standingOrders/` — recurring AI jobs (per‑org cron‑like rules)
- `core/ai/` (frontend) — chat panel, ChatComposer, ChatLandingPane, ChatModelPicker, AISuggestionsPanel, ChatConfirmation, the result/preview React components

The orchestrator `run.ts` and `streamLoop.ts` shrink to a thin caller of `runtime/host.ts` at the S17 cutover.


---

## 11. Integrations — what's wired and how

| Integration | Purpose | Where | How it's wired |
|---|---|---|---|
| **Convex** | Real‑time DB + actions + scheduling | `convex/` everything | Reactive subscriptions; `useQuery`/`useMutation` on the frontend |
| **Convex Auth** | Email‑OTP authentication | `convex/auth.ts` + `convex/ResendOTP.ts` | `getAuthUserId(ctx)` everywhere; `createOrUpdateUser` callback |
| **Resend** | Transactional + drip emails | `lib/email.ts` + `convex/ResendOTP.ts` + `core/shell/onboarding/` | React Email templates; rate‑limited per recipient |
| **AI SDK v6 (Vercel)** | Multi‑provider AI inference | `convex/ai/runtime/host.ts` + `models.ts` | `streamText` + `prepareStep`; one entrypoint, swappable providers |
| **Anthropic / Google / Groq / Mistral / OpenAI / xAI / OpenRouter** | LLM providers | `convex/ai/models.ts` factories | BYOK + platform fallback; tier‑gated via `MODEL_REGISTRY` |
| **Trigger.dev v4** | Long‑running background jobs | `trigger/` + `trigger.config.ts` | CSV imports, drip emails — anything >30s |
| **Sentry** | Error monitoring | `sentry.client/server/edge.config.ts` + `lib/sentry-context.ts` | DSN from env var — no‑ops if unset (locked decision #20) |
| **PostHog** | Product analytics + feature flags | `instrumentation-client.ts` + `lib/posthog-server.ts` + `@posthog/next` | DSN from env var — no‑ops if unset; events filter out `/xowner/*` |
| **LemonSqueezy** | Subscriptions + payments | `convex/billing/internal.ts` + `core/billing/` | Webhook HMAC verified; org plan + status updated transactionally |
| **Razorpay** | Subscriptions (India) | `convex/_platform/billing/queries.ts` shows provider config presence | Same pattern — webhook → org plan; provider keys never returned |
| **Twilio (planned S13)** | WhatsApp inbound + outbound | `convex/http.ts` + `convex/ai/channels/whatsappInbound.ts` | Per‑agent number → principal; HMAC signature verify; idempotency on `MessageSid` |
| **Cloudinary** | (REMOVED) | — | Replaced by Convex `_storage` (locked decision #10 in settings: no Cloudinary) |
| **Firecrawl** | Web scraping for AI tools | `convex/ai/quarantined/enrichmentProviders.ts` + `convex/ai/actions/webScrape.ts` | Server‑side only; sanitised through `_shared/sanitiseExtractedText.ts` |
| **MCP (planned S16)** | External agent tooling | `convex/ai/registry/projectors/mcp.ts` | One projector — every capability becomes an MCP tool automatically |
| **Slack / Cal.com (planned)** | Channel adapters | `convex/ai/channels/*.ts` (future) | Same pattern as Twilio: adapter resolves principal → `runAgent` |
| **next‑intl** | i18n routing + translations | `i18n/routing.ts` + `messages/{en,ar}.json` | Locale negotiated in middleware; Tailwind logical classes flip on `dir="rtl"` |
| **`@convex-dev/auth`** | Convex‑first auth | `convex/auth.config.ts` | JWT issuer/audience for cross‑service trust |
| **`@convex-dev/agent`** | Convex AI agent helpers | `convex/ai/orchestrator/` | Convex's official AI helpers (used selectively) |
| **shadcn/ui + radix‑ui + base‑ui** | UI primitives | `components/ui/` | Custom theme presets; RTL‑safe by construction |
| **Onborda** | Product tour (post‑onboarding) | `core/onboarding/tour/` | Triggered on first dashboard mount; completion in `users.dismissedCards` |
| **Playwright** | E2E tests | `e2e/` + `playwright.config.ts` | Auth, theme, navigation flows |
| **Vitest + convex‑test** | Unit + Convex tests | `convex/*.test.ts` + `vitest.convex.config.ts` | `convex-test` runs Convex modules in isolation — no live deployment touched |

### 11.1 Webhooks — verification pattern

Every inbound webhook (LemonSqueezy, Razorpay, Twilio, future Slack) follows this exact shape in `convex/http.ts`:

```ts
http.route({ path: "/webhook/lemonsqueezy", method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("x-signature") ?? "";
    if (!await verifyHmac(signature, body, process.env.LEMONSQUEEZY_WEBHOOK_SECRET!)) {
      return new Response("Invalid signature", { status: 401 });
    }
    await ctx.runMutation(internal.billing.handleWebhook, { event: JSON.parse(body) });
    return new Response("ok");
  }),
});
```

**Verification is non‑negotiable** — the `Future-Enhancements.md` deferral rule means a webhook handler shipping with the verify step skipped (even temporarily) requires a card explaining why and when it's re‑enabled.

### 11.2 Environment variables — single source of public/private split

- **Backend secrets** (`process.env.X` in Convex functions): set in the Convex dashboard, NOT `.env.local`. `LEMONSQUEEZY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `OWNER_PANEL_SLUG`, `PLATFORM_OWNER_EMAILS`, every BYOK platform fallback (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …).
- **Frontend public** (`NEXT_PUBLIC_X` in Next.js): `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PLATFORM_PREFIX`.
- **App identity** is read through `APP_CONFIG` (`config/app-config.ts`) which proxies the public env vars — locked rule R‑STRINGS: never hardcode the app name, URL, or platform prefix.


---

## 12. Cross‑cutting non‑functional engineering — the rules that ship at every layer

These are the rules that make the codebase **fast, accessible, multi‑lingual, observable, and safe by default**, every file, every commit. They're enforced through `AGENTS.md`, code review, and the test suite.

### 12.1 Performance‑critical rules (locked 2026‑05‑18 audit)

Driven by an audit that found a single drag firing 50+ Convex calls and 20% of all calls being identity overhead. Fixed:

| Rule | Result |
|---|---|
| **Drag persistence is one mutation per drop** | 1 drag = 1 mutation = 0 list re‑subscriptions |
| **Per‑row data on a list view comes from one batched query** | `useEntityTagsMap`, `useAttachmentDisplaysForOrg`, `useOrgMembers` — one subscription, N rows |
| **Identity/auth/labels via context, not subscriptions** | `useCurrentOrg`, `useOrgMembers`, `useOrgPermissions`, `useEntityLabels` mounted ONCE at layout level. Auth overhead 20% → 3% |
| **Every list‑affecting mutation has `withOptimisticUpdate`** | Eliminates the "fire mutation → wait → re‑render → flash" loop and the `listX` re‑subscription spam |
| **Rate‑limit drag mutations server‑side (120/min, scope shared across reorder + setCategory)** | Frantic users can't bypass by alternating verbs |

### 12.2 RTL + i18n rules

Locked rule R‑RTL: directional CSS classes are banned. `ml-*` / `mr-*` / `pl-*` / `pr-*` / `left-*` / `right-*` / `border-l` / `text-left` / `float-left` — every one has a logical equivalent (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `border-s`, `text-start`, `float-start`). Apply `dir="rtl"` on `<html>` for Arabic locale; every Tailwind logical property flips automatically. Sheet `side="start"`/`"end"` resolves to physical left/right based on `document.documentElement.dir` at mount.

### 12.3 Theming rules

Locked rule R‑RADIUS: every `border-radius` uses `rounded-[var(--radius)]`. Border‑radius is a theme variable; one preset switch in Settings → Appearance changes every UI element's roundness. `rounded-full` is the only exception (avatars, pills, dots).

### 12.4 No hardcoded app strings

Locked rule R‑STRINGS: `"Orbitly"`, the app description, the URL, the platform prefix — none appear in JSX. `APP_CONFIG.name` / `.description` / `.url` / `.platformPrefix` read from `process.env.NEXT_PUBLIC_*`. **White‑label deployments are an env var change**, not a fork.

### 12.5 React patterns — the bug class we eliminated

Locked rule (post 2026‑05 incident): "Maximum update depth exceeded" was the #1 recurring bug. Three structural rules killed the class:

1. **Never put a custom‑hook return value in `useEffect` deps.** Custom hooks return new object refs when their internal state changes; including the whole object in deps creates an infinite feedback loop. Destructure stable methods instead.
2. **If a `useCallback` needs to read state, use a ref.** `useCallback([state])` makes the callback unstable; instead, mirror state into a ref (`stateRef.current = state`) and read from `.current` inside the callback (which keeps `[]` deps).
3. **If `useEffect` must call a method from a hook, destructure the stable method.** The method is stable (`useCallback([], [])`); the hook's whole return is not.

### 12.6 Comments — concise, signal‑only

Locked rule R‑COMMENTS:

| Surface | Cap |
|---|---|
| File header | ≤ 6 lines |
| Function / type doc‑comment | ≤ 8 lines |
| Inline comment | ≤ 2 lines |
| Stage‑history references in source | 0 |
| Speculative future‑work mentions in source | 0 |

Comments state invariants and gotchas the code can't express. Build narrative belongs in `SHIPPED.md` and git history; future‑work belongs in `PENDING.md` or `Future-Enhancements.md`.

### 12.7 Side‑by‑side cleanup — delete legacy in the SAME edit

Locked rule (NON‑NEGOTIABLE): no staged build keeps two implementations of the same surface alive. When a port replaces legacy code, the legacy code is deleted in the same edit. No `*_V2` env flags carrying parallel implementations indefinitely; no parallel folders; no "we'll remove it at the cutover stage" without a recorded blocker. The S2 `AI_V2` flag is the explicit exception — it's a staged‑rollout flag for the 18‑stage rebuild, recorded as such in the build doc.

### 12.8 First‑time coachmarks — `<FirstTimeTour>`, never tooltips

Tooltips re‑fire on every hover. For power gestures (single‑click vs double‑click, drag‑and‑drop, hidden menus), use `<FirstTimeTour id="..." steps=[...]>` (`components/ui/first-time-tour.tsx`). Persists "user has seen this tour" in localStorage under `orbitly:tours:seen`. Bump the id (`v1` → `v2`) when steps change.

### 12.9 `Element.scrollIntoView()` is banned in nested shells

Locked decision #10. Three nested scroll containers (body → sidebar‑inset main → view main) cause `scrollIntoView` to walk up the DOM and shift the entire layout. Use `scrollToSection` (`core/platform/settings/hooks/useSettingsSearch.ts`) — finds the nearest scrollable ancestor and calls `container.scrollTo({top, behavior:"smooth"})` precisely.

### 12.10 Two‑file work tracking + per‑module decision logs

Locked rules:

- **`PENDING.md`** — every pending item, full context, grouped P0/P1/P2 + stage. Read BEFORE starting any new work.
- **`SHIPPED.md`** — one‑line changelog of every shipped scope. Read to confirm "is X already done?".
- **`Future-Enhancements.md`** — every disabled guardrail / restriction has a structured deferral card with: Section, Status, Category, Phase to ship, Owners, Risk if skipped, Files involved, Why deferred, Benefits when reinstated, Use cases, Implementation sketch, Verification.
- **`MODULE.md`** in every module — locked architectural decisions in a `| # | Decision | Outcome |` table. Decisions are append‑only.

Doc cleanup is enforced **at every commit**: shipped tasks collapse to one‑line ✅ summaries; pending tasks keep full context (sub‑bullets, file paths, code sketches, audit findings); shipped phases roll up into a single dated paragraph.

### 12.11 Verification gates

`pnpm typecheck` and `pnpm exec biome check .` must come back **0 errors / 0 warnings** before any change is "done". Before merging or ending a session that touched runtime code: also run `pnpm test`, `pnpm exec vitest run`, `pnpm build`. All green for the **whole repository**, not just the files you touched. The `scripts/guard-identity-subscriptions.mjs` script asserts that no component subscribes to identity queries directly (Performance Rule).

### 12.12 Convex‑specific gotchas (from the field)

- **`AI SDK v6 finishReason` is `{unified, raw}`, not a string** — caught in S2 testing.
- **`AI SDK v6 onChunk` shape is `{ chunk: TextStreamPart }`** — narrow on `event.chunk.type === "text-delta"`.
- **`LanguageModelUsage.cachedInputTokens` is deprecated** in favour of `inputTokenDetails.cacheReadTokens` — host reads new field first, falls back for older provider plugins.
- **AI tools can NEVER call public `orgQuery`/`orgMutation`** — Convex `ctx.scheduler.runAfter` does not propagate auth identity. Old layer used `*ForAI` internal twins (NON‑NEGOTIABLE rule). New layer's `Capability.run` calls the `*Impl` body directly with the principal's `userId` passed in by the wrapper, removing the twin's purpose entirely.
- **Convex MCP / `npx convex run` hangs in this agent runtime.** The agent emits the exact `npx convex run` command for the user to paste; nothing happens silently.


---

## 13. Feature → engineering map (LinkedIn / SEO / GEO / AEO‑ready bullets)

A condensed table you can lift directly into marketing copy. Each row is *the feature*, *the engineering decision*, and *the efficiency claim* it underwrites.

| Feature | Engineering decision | Why it's efficient / differentiating |
|---|---|---|
| **Multi‑tenancy** | Org scope enforced at wrapper level; every index begins with `by_org`; `.collect()` banned on org tables; AI principal carries `orgId`, capabilities never read it from args | Cross‑org data leakage is structurally impossible — not a runtime check, an architectural one |
| **RBAC** | One permission catalog SSOT (~80 keys) drives runtime checks, role‑editor UI, seed defaults, AI tool filtering, backfill migrations | Add a permission once; every consumer updates automatically. Custom roles are first‑class. |
| **Dynamic entity labels** | `org.entityLabels` + `useEntityLabels()` reactive hook; permission UI placeholders interpolate `{Leads}` to the workspace's vocabulary | One workspace can call them "Inquiries", another "Buyers" — without forking code |
| **personCode invariant** | Generated once at lead creation; preserved through convertToContact; carried by every related row | One identity, one URL (`/profile/P-001`), every surface aggregates by code |
| **Industry templates** | Seed‑only at onboarding (`convex/_platform/industries/builtIns/`); AI reads live `fieldDefinitions` afterwards | Pick an industry → working CRM in 2 min; owner edits in app → AI respects them on the next write |
| **AI Capability Registry v2** | One Capability per backend `*Impl`, declared in co‑located `capabilities.ts`; one wrapper, one closed taxonomy of 10 outcomes; mandatory typed result envelope | "Done." is structurally impossible; coverage report tells you exactly what's complete |
| **Progressive disclosure (AI tooling)** | AI‑SDK `prepareStep`; core tools always on; per‑step growth via `discover_capabilities` | ~80k tokens/turn → ~3–6k effective input/turn. ~10× cheaper inference. |
| **Prompt caching** | Stable PROJECT drive + capability catalog form a cacheable prefix; Anthropic `cache_control: ephemeral` marker; OpenAI auto‑cache | Cached input billed at ~10% (Anthropic) / ~50% (OpenAI). Across millions of turns this is the difference between viable and non‑viable AI economics. |
| **Self‑correcting AI** | Permissive AI‑SDK schema → strict parse inside the wrapper → `repair` envelope as tool result | Bad date → AI reads structured repair → fixes args → succeeds on the next step. No human pasting errors back. |
| **Risk‑tiered autonomy** | safe/reversible auto‑execute; irreversible → RBAC + 2FA double‑confirm + channel allow‑list (never WhatsApp) | 95% of operations happen frictionless; the 5% destructive ones are protected exactly the way ops/security expects |
| **Channel adapters** | One Capability Registry; thin adapters per channel (chat/Twilio/MCP/REST/Slack/Cal.com); every channel resolves a member principal | New integration = 1 adapter file + 0 capability rewrites. The customer's text is content, never authority. |
| **Live schema is SSOT** | AI reads `fieldDefinitions` / `pipelines` / `org.entityLabels` / `org.settings` directly via `describe_entity` / `describe_workspace`; write‑time validation against live rows | Owner renames a field → next AI write respects it. No template, no hardcoding, no stale prompt. |
| **Module‑awareness** | `ModuleDef` registry + `activeModules(org)`; capabilities filtered by enabled modules; prompt context filtered by enabled modules | Pipelines off → pipeline tools and pipeline context disappear in one switch. AI's worldview = workspace's reality. |
| **Vertical adaptivity** | `VerticalProfile.driveAddendum` is *persona only*; field definitions are seeded then read live | Add a new vertical = a `VerticalProfile` + an industry seed. **Zero capability forks**. |
| **Real‑time everything** | Convex reactive subscriptions everywhere | No polling. No WebSocket plumbing. Type‑safe end‑to‑end. |
| **Streaming chat** | DB‑streamed assistant message; ~50‑char batch patches via `patchAssistantBody`; UI re‑renders via `useQuery` | Native cancellation, replays, zero infrastructure. The stream survives a Vercel function timeout because it lives in Convex. |
| **BYOK (Bring Your Own Key)** | Node action encrypts with AES‑GCM; V8 mutation only ever sees ciphertext; `encryptedKey` stripped from public reads | Plaintext keys never touch the DB; clients only see the last‑4‑char hint |
| **Multi‑provider AI** | `MODEL_REGISTRY` SSOT + provider factories in `models.ts`; tier‑gated; NVIDIA/OpenRouter free options | Adding a provider is 3 file edits; users get 7 providers + free tiers for unbillable testing |
| **Daily + weekly briefings** | Cron‑driven; one table (`aiBriefings.scope = daily-user | weekly-org`); platform‑billed only | Cost predictability — users don't pay for cron‑generated work |
| **Onboarding < 2 min** | Single `/onboarding` route, three `useState` steps, industry seed in one mutation | No field setup at onboarding; AI Workspace Setup handles the rest after dashboard loads |
| **Settings = single page** | One `/settings` route, group switching via `?group=`; per‑section save; lazy‑loaded group data; 2 queries hydrate everything | No global save button confusion; deep‑linkable to any section |
| **CSV import** | AI maps columns (with confidence %); user approves; Trigger.dev processes in batches of 50; same canonical mutation as UI | "Any CSV from any business works in 30 seconds" — UTF‑8 + UTF‑16 (Arabic supported) |
| **Notes board (sticky‑note kanban)** | User‑managed categories with bg/text colour; free drag with gap‑based `sortOrder`; rebalance when neighbours get tight | Wall‑of‑sticky‑notes UX without a single fixed grid; per‑user persisted column order |
| **Messages module** | Six indexes including `by_replyTo`; cursor pagination 30/page; voice notes via `MediaRecorder`; image/video previews via `URL.createObjectURL`; forwarding by re‑reference (no storage clone) | iMessage/WhatsApp‑class chat in a CRM, with full RTL + per‑message status tracking |
| **Timeline** | Read‑merge over `activityLogs + notes + tasks`; one continuous rail; cursor pagination; client‑side filters | One source of truth for "what happened"; never drifts because there's no third table |
| **Tasks (rename of reminders + followups)** | One table, one form, one route, one AI tool family; type discriminator (`todo/call/email/meeting/followup`); three view modes inside one view | Operators can't confuse two surfaces; AI verb routing is unambiguous |
| **Calendar = pure renderer** | `<CalendarMain>` accepts `events` prop; bucketing in parent `useMemo`; date range clamped to ±45 days | Bounded read set; no 5‑year scans; embeds reuse the same component |
| **Kanban engine (config‑driven)** | Generic engine, zero entity knowledge; columns from DB; drag persistence is one mutation per drop; mobile horizontal carousel | Same engine powers Deals + Leads + Notes + (future) Projects |
| **DataTable engine** | TanStack v8; URL‑synced state via nuqs; manual pagination; one toolbar pattern | Every list view is the same engine — including the dashboard's `<LiveTasksWidget>` in compact mode |
| **Command palette** | `cmdk` + debounced 200ms global search; record code direct lookup; context‑aware page actions | `Cmd+K` from anywhere → any record → instant. P‑codes resolve in O(1) via index. |
| **Notifications bell** | Convex reactive subscription on `by_userId_and_read`; ~25 notification types; preference keys SSOT | Real‑time, zero polling; per‑user preferences live |
| **Soft‑delete + 30‑day trash** | Every recoverable table has `deletedAt`; `convex/trash/` surfaces a recovery UI | "Reversible" risk tier in the AI registry leverages this — no friction on AI deletes |
| **GDPR right to be forgotten** | `gdpr.exportUserData` + `gdpr.deleteUserData`; `"use node"` action streams a ZIP via `fflate` | Compliance feature ships in the same architectural style as everything else |
| **Owner panel** | Hidden URL via `OWNER_PANEL_SLUG` env rewrite; second OTP layer; append‑only audit; never reads org content | Forensic integrity by design; secret slug stays out of client bundle |
| **Plan tier limits SSOT** | `_platform/limits.ts`; `getPlanLimits` (sync) + `getPlanLimitsFromDb` (async); convention `-1` unlimited / `0` disabled | Tier editor edits live, no redeploy needed |
| **Soft theming + RTL** | Tailwind logical properties + `var(--radius)` everywhere; `dir="rtl"` on `<html>` | One CSS variable change → whole UI re‑skins; Arabic flips automatically |
| **Mobile PWA‑ready** | Bottom nav planned; touch sensors in dnd‑kit; min 44px tap targets; cookies for prefs (SSR safe) | Field agents (Gulf market real‑estate) can operate from a phone |
| **First‑time coachmarks** | `<FirstTimeTour>` with `data-tour=` targeting; localStorage persistence; bump id on step changes | Power gestures (single‑click convert, drag‑to‑status) taught once, never re‑shown |
| **Two‑file work tracking** | `PENDING.md` + `SHIPPED.md` + `Future-Enhancements.md` + per‑module `MODULE.md` | The next session always knows what shipped and what's left — no chat history loss |
| **AGENTS.md as project constitution** | ~70k char document of locked rules + decisions; non‑negotiable migration rule, deferral rule, comments rule, RBAC rule, no‑training‑data rule, doc‑cleanup rule | A multi‑agent / multi‑session codebase that doesn't drift |


---

## 14. Suggestions to improve the system design (honest critique)

The codebase is rigorous, but there are real opportunities to harden, simplify, or extend. Listed by impact.

### 14.1 High impact

1. **Finish the Capability Registry cutover (S17) on a deadline.** Today both architectures coexist behind `AI_V2`. The longer the dual path runs, the more divergence accumulates (despite the side‑by‑side cleanup rule). Set an explicit cutover date; fail the build if any capability is missing from the coverage report.
2. **Coverage report → CI gate.** `coverage.ts` (S12) tells you which `*Impl` are AI‑reachable. Make it block CI on regressions ("you removed a capability without removing its `*Impl`" or vice versa). Today it runs as a manual check.
3. **Token measurement → budget enforcement.** S2's per‑turn input/cached/output log is the right primitive. Roll it into a per‑org budget alarm (e.g. `org.usage.tokensIn7d > tier.aiTokenLimit * 0.8` → notification + dashboard widget). Without this, BYOK plus prompt caching could still drift into runaway cost on the platform side for free‑tier users.
4. **Add an AI redaction layer for `sensitive` fields.** `fieldDefinitions.sensitive: true` exists. The AI describe_entity already hides them from non‑admins, but the `read_conversation` core tool reads raw `messages` content. A sanitiser that masks PII patterns (emails, phone numbers, bank accounts) before passing to the model is a one‑file add and a major trust upgrade for regulated verticals.
5. **End‑to‑end test the autonomous engine before flipping the org default ON.** The S11 stage has a manual test entrypoint; build a 10‑scenario simulator (lead intake, dedup, missing required field, ambiguous match, RBAC denied, irreversible attempt over WhatsApp, multi‑message conversation) and run it on every PR. The cost of a wrong autonomous write is much higher than a wrong chat reply.
6. **MCP projector with per‑tool token budget.** When the registry projects to MCP, an external agent can call any capability the principal has access to. Add per‑request token budgets at the projector layer so a misconfigured external agent can't drain the org's AI quota.

### 14.2 Medium impact

7. **Add an "explain why" field to every `denied` / `business_error` / `channel_blocked` result.** The wrapper already classifies; the model already narrates. But the human reading the chat log later wants to see *which* permission was missing, *which* channel rule fired. Surface it on the audit row.
8. **Cache the live schema reads.** `describe_entity` is a live DB read every call — that's correct for safety, but a 30‑second per‑(org, entityType) cache (cleared by `fieldDefinitions` mutations) would cut DB pressure on hot orgs without losing freshness.
9. **First‑class observability for the AI loop.** Sentry captures exceptions; PostHog captures product events. The AI loop sits between them. Emit a structured trace per turn (`turn_id`, `principal`, `channel`, `groupsLoaded`, `toolCalls[]`, `outcome`, `tokensIn/Cached/Out`, `latencyMs`) into a `aiTraces` table or an observability sink (Honeycomb / Axiom). Today the only signal is the per‑turn console log.
10. **Promote the `tasks` view-mode unification to the entity scaffolds.** Tasks ships three views inside one view; entity list pages ship list + board separately. The same pattern (URL‑persisted view mode + shared toolbar) belongs in `EntityListPage` so every entity gets it for free.
11. **Per‑org rate limit audit trail.** `enforceRateLimit` increments counters but doesn't log. Add a small ring buffer (`rateLimitEvents`, last 100 hits) so the owner panel can show "this user hit the AI rate limit 4 times today".
12. **Standing orders → first‑class DSL.** Today `aiStandingOrders` is a `JSONB`‑ish payload + an evaluator. As the surface grows (cron rules, on‑event rules, conditional rules), this benefits from a small typed DSL with its own validator — the same pattern Capability Registry used to escape the `ToolDef` mess.

### 14.3 Lower impact / nice‑to‑have

13. **Per‑capability prompt caching breakpoints.** Today the cache prefix is one big block. Anthropic supports up to 4 cache breakpoints; placing them at PROJECT / catalog / module / vertical boundaries lets common module sets share cache hits across orgs.
14. **Move `core/landing/` to a separate Next.js app** (`apps/marketing` if you adopt a monorepo). The marketing site has different release cadence, different auth requirements (none), and different telemetry (no Convex). Same domain via Vercel routing or a reverse proxy.
15. **Generate the public REST + MCP docs from the registry.** Once `coverage.ts` exists, generating OpenAPI + MCP descriptors is mechanical. Free, accurate API docs that never drift.
16. **Per‑module `MODULE.md` audit script.** A small script that asserts every module has a `MODULE.md` with at least Decisions / Avoids / Cross‑Module Dependencies sections. The convention is locked but not yet enforced by tooling.
17. **`docs/architecture/` index.** There are deep‑dive docs (`PHASE‑*‑AUDIT.md`, `DASHBOARD‑V2‑PLAN.md`, `AI‑TOOLING‑LAYER‑PLAN.md`) but no index. A `docs/architecture/README.md` linking them by topic helps newcomers find ground truth fast.
18. **Convex `.collect()` ban → automated.** The locked rule is convention. A `pattern_search` lint rule that fails on `.collect()` in any file outside `_test/` would catch regressions in PR review.
19. **Frontend bundle audit.** `recharts` is heavy; the sparkline replacement was the right call. Audit `lucide-react`, `radix-ui` per‑component imports to ensure tree‑shaking is real, and consider a per‑route dynamic import for the AI panel (it's rendered everywhere but used by ~30% of users initially).
20. **Add an "ask the workspace" search agent.** A first‑class natural‑language search across leads/contacts/deals/notes/messages backed by Convex's vector index (`aiMessages.by_embedding` already exists; extend to entity‑level summaries). This would be a single capability projecting to every channel.

### 14.4 Strategic

- **Position the Capability Registry as a separate open‑source library.** The pattern (one Capability per backend mutation, one wrapper, one channel‑agnostic registry, prepareStep + prompt caching, mandatory result envelope) is genuinely novel work. Extracting it as an OSS package (`@orbitly/capability-registry`) is a defensible thought‑leadership move and a recruiting magnet — it's the layer the rest of the industry will converge on.
- **Productise the WhatsApp Agent Profile (Mode C).** Twilio + the registry + risk‑tiered autonomy + the agent persona is a *complete* product on its own — sell it to real‑estate / recruiting / clinics as "WhatsApp AI agent that respects your team's permissions". The CRM is the substrate.
- **Build a public Capability Catalog page.** `coverage.ts` outputs are content. A live page that shows which capabilities exist, in which modules, with example calls, doubles as marketing + developer relations + AEO content — every capability becomes a long‑tail SEO target.

---

## 15. Marketing‑ready summary (paste‑ready)

If you want a one‑paragraph pitch for LinkedIn / a cover letter / a job application:

> **Orbitly is a multi‑tenant, AI‑native CRM platform** built on Convex, Next.js 16, and AI SDK v6. I architected its backend around a **Capability Registry** that defines every AI‑callable action once and projects it to every channel — chat, Twilio WhatsApp, MCP, REST, Slack — with thin per‑channel adapters. One execution path classifies every failure into a closed 10‑outcome taxonomy (`ok`, `partial`, `needs_repair`, `not_found`, `ambiguous`, `denied`, `channel_blocked`, `needs_step_up`, `business_error`, `infra_retry`), with central coercion baked into Zod (`z.preprocess`) and mandatory typed result envelopes — making "Done." structurally impossible and the whole "wanted X, got Y" bug class extinct. Progressive disclosure via AI SDK `prepareStep` + Anthropic prompt caching cut effective input from ~80k tokens/turn to ~3–6k. Risk‑tiered autonomy (safe/reversible auto, irreversible → RBAC + 2FA + channel allow‑list) replaces a hard‑locked propose/commit dance with a model that respects every member's real permissions. The AI's worldview equals the live workspace by construction — `org.entityLabels`, `fieldDefinitions`, `pipelines`, and `org.settings.activeModules` are the single source of truth, never templates or hardcoded prompt copies. Multi‑tenancy is enforced structurally (org‑scoped indexes, banned `.collect()`, principal‑bound capabilities), GDPR is a one‑action export+delete, and a fail‑closed super‑admin panel with append‑only audit lives behind a hidden URL. The codebase ships with a project constitution (`AGENTS.md`), per‑module decision logs (`MODULE.md`), and a two‑file work tracking system that survives multi‑agent / multi‑session collaboration without drift.

### Three LinkedIn‑post candidates

**Post 1 — "Why our AI fixes its own type errors"**

> The most common bug in LLM tool calling: model emits an ISO date, schema expects epoch ms, the SDK throws *before* `execute` runs, and the model never sees the error. So it can't retry. We fixed it structurally:
> 1. The AI‑SDK schema is permissive (`z.object().passthrough()`) — the SDK never rejects.
> 2. Strict parse + coercion happens inside the wrapper.
> 3. On failure, we return a structured `repair` envelope as the tool result.
> 4. The model reads the repair on the next step and self‑corrects.
> Combined with central coercion (`field.timestamp(orgTz)` accepts epoch / ISO / "next Tuesday"), the "wanted X, got Y" bug class is extinct. No human pasting errors back. Bounded retries so it can't loop. This is the only sane way to ship LLM tools at scale.

**Post 2 — "How we cut AI input tokens 10×"**

> Our old AI loop force‑loaded all 17 tool layers + the full org schema every turn. ~80k input tokens. Per message. Replaced with:
> 1. **Progressive disclosure** via AI SDK `prepareStep` — tiny core toolset; per‑step growth via a `discover_capabilities` tool the model calls itself.
> 2. **Three‑tier driving layers** — PROJECT (cached) + GROUP playbook (loaded on activation) + TOOL drive (only for in‑scope tools).
> 3. **Anthropic prompt caching** on the stable prefix (PROJECT + capability catalog) — billed at ~10% of input.
> 4. **`describe_entity` on demand** instead of dumping the whole field schema in the prompt.
> Result: ~3–6k effective input/turn, most of it cached. The math went from "AI is too expensive" to "AI is the cheapest part of the request".

**Post 3 — "One brain, every channel"**

> Building a CRM with AI access on chat, WhatsApp, MCP, REST, Slack? Most teams write the tools five times. We wrote them once.
> Every AI‑callable action is a `Capability` declared in a `capabilities.ts` file co‑located next to its canonical Convex mutation. A single registry projects every capability to AI‑SDK tools, MCP tools, REST handlers — automatically. Per‑channel adapters do exactly one job: authenticate a member principal, set the channel context, and hand the runtime a message.
> The customer's WhatsApp text is **content**, never authority. The agent (a member) is the principal. Their RBAC is the AI's RBAC. An unknown sender → no principal → read/extract/suggest only.
> Adding a new channel is one adapter file. Adding a new capability is one `defineCapability()` next to the function it wraps. Zero rewrites, zero drift. **This is the architecture every multi‑channel AI product converges on. We just got there first.**

---

## 16. Quick reference — every doc that lives at the root

| File | Purpose |
|---|---|
| `AGENTS.md` | The project constitution — locked rules + 27 architectural decisions |
| `CLAUDE.md` | Behavioral guidelines for AI coding sessions |
| `PENDING.md` | Every pending item (P0/P1/P2 + stage), full context |
| `SHIPPED.md` | One‑line changelog of every shipped scope |
| `Future-Enhancements.md` | Deferral cards (every disabled guardrail recorded) |
| `AI-TOOLING-LAYER-PLAN.md` | Capability Registry v2 architecture blueprint |
| `AI-TOOLING-BUILD-STAGES.md` | S0–S17 self‑contained stage prompts |
| `LANDING-PAGE.md` | Marketing‑site spec |
| `DASHBOARD-V2-PLAN.md` | Dashboard rebuild plan (Stages 1–5 shipped) |
| `CLEANUP-CANDIDATES.md` | Files queued for deletion at the next cutover |
| `convex/_arch.md` | Convex backend architecture map |
| `convex/_generated/ai/guidelines.md` | Convex‑specific coding guidelines (overrides training data) |
| `core/*/MODULE.md` | Per‑module decision logs (one per core/* module) |
| `convex/**/MODULE.md` | Per‑module decision logs (key Convex modules) |
| `docs/architecture/*` | Architecture deep‑dives |
| `docs/runbooks/*` | Ops runbooks |

---

*This document is a living reference. As S3–S17 ship, the AI section should be updated with the actual ported‑capability counts and the final cutover date. The cross‑cutting rules in §12 are stable — they are the rails the codebase runs on.*
