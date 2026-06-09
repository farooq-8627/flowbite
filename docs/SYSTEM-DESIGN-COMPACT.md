# Orbitly — Project Context

> Token-dense reference for AI agents. The *what*, not the *why*. Full details in `docs/SYSTEM-DESIGN.md`.

## What Orbitly is

- Multi-tenant, AI-native CRM.
- Owner picks an industry → seeded workspace in <2 min.
- Operate via chat, WhatsApp (per-agent Twilio numbers), MCP, REST, Slack — all under the member's real RBAC.
- One Capability Registry powers every channel.
- AI reads the live workspace (`fieldDefinitions`, `pipelines`, `org.entityLabels`, `org.settings.activeModules`) — never templates or hardcoded prompts.
- Every AI action returns one of 10 outcomes: `ok`, `partial`, `needs_repair`, `not_found`, `ambiguous`, `denied`, `channel_blocked`, `needs_step_up`, `business_error`, `infra_retry`.

## Stack

- Next.js 16 App Router + React 19
- Convex (DB + actions + scheduling + reactive subs)
- Convex Auth + Resend OTP (email-only)
- AI SDK v6 + Anthropic / Google / Groq / Mistral / OpenAI / xAI / OpenRouter (BYOK + platform fallback)
- Trigger.dev v4 (>30s jobs)
- Zustand (UI-only state), nuqs (URL state)
- TanStack Table v8, dnd-kit, React Hook Form + Zod
- Tailwind v4 + shadcn/ui, next-intl (en/ar with RTL)
- Resend (email), Sentry (errors), PostHog (analytics)
- Biome (lint+format), Vitest + convex-test, Playwright
- pnpm 10
- LemonSqueezy + Razorpay (billing), Twilio (WhatsApp, S13), Firecrawl (web scraping)

## Folder structure

```
app/                  Next.js routes (THIN wrappers)
  (root)/             public marketing
  [locale]/
    (auth)/           signin/signup/join
    (private)/[orgSlug]/   org-scoped routes
    api/              webhooks, OG images
  xowner/             owner panel (rewritten from OWNER_PANEL_SLUG)

core/                 11 modules
  ai/                 AI panel, components, model picker, briefings UI
  comms/              timeline + notes + messages
  data-display/       kanban, datatable, command-palette
  data-io/            csv-import, file uploads
  entities/           CRM entity scaffolds
  inbox/              notifications + AI inbox
  landing/            marketing components
  platform/           settings + profile
  scheduling/         calendar + tasks
  shell/              auth, onboarding, layout, sidebar/topnav

convex/
  _arch.md            backend architecture map
  _functions/         orgQuery, orgMutation, requireOrgMember
  _generated/         codegen
  _migrations/        ~40 idempotent migrations
  _platform/          super-admin (fail-closed, append-only audit)
  _shared/            permissions catalog, validators, dedup, rateLimit, errors,
                      record codes, reserved slugs, notification keys, sanitisers
  _test/              test helpers
  activityLogs/       audit trail
  ai/
    registry/         types, coerce, result, define, wrapper, gate, drive,
                      catalog, router, projectors, coverage
    runtime/          host, coreTools, autonomous
    channels/         whatsappInbound, persona
    orchestrator/     streaming chat (slimming to thin caller of runtime/host)
    insights/         deal scoring, anomaly detection
    standingOrders/   recurring AI jobs
    briefings*.ts     daily + weekly (platform-billed)
    messages.ts, conversations.ts, models.ts, keys*.ts
  billing/            LemonSqueezy webhooks + plan tier enforcement
  crm/
    entities/         leads, contacts, deals, companies, entity5/6, codeCounters
    fields/           pipelines, fieldDefinitions, fieldValues, dedup, templates
    people/           personCode resolver
    shared/           notes, messages, tasks, tags, savedViews, timeline,
                      calendar, noteCategories, conversations, orbitLinks
  dashboard/          ephemeralCells, annotations, dealScores
  files/              universal file storage
  gdpr/               per-user export + delete
  invitations/        invite create/accept/decline/cancel
  notifications/      in-app
  orgs/               CRUD, onboarding, settings, members, templates
  orgRoles/           custom roles + permission CRUD
  schema/             identity, ai, platform, crmFields, crmShared, crmEntities, system
  trash/              soft-delete recovery (30 days)
  users/              profile, prefs, soft-delete, dismissed-cards
  auth.ts             Convex Auth + Resend OTP
  crons.ts            briefings, scoring, anomaly, OTP GC, trial sweep
  http.ts             auth callbacks, Twilio, LemonSqueezy

components/           shared shadcn-based UI
features/             reserved for industry add-ons
lib/                  datetime, format, normalizeError, logger, posthog, sentry
hooks/                use-mobile, use-tablet
stores/               Zustand stores
i18n/                 next-intl routing
messages/             en/ar translations
proxy.ts              auth + locale + owner-panel rewrite
trigger/              Trigger.dev jobs
owner/                owner-panel UI
```

## Key concepts

**Multi-tenancy** — Every dashboard route nested under `/[locale]/[orgSlug]/`. `orgQuery` / `orgMutation` enforce membership server-side. Every org-scoped table indexed by `by_org` and `by_org_and_<field>`. `.collect()` banned on org-scoped tables. AI capabilities read `principal.orgId`, never `args.orgId`.

**`personCode`** — Stable identity (`P-001`). Generated at lead creation; preserved through `convertToContact`; carried by every related row (deals, tasks, notes, messages, files, activityLogs). `/profile/P-001` aggregates everything across entity boundaries.

**RBAC** — `convex/_shared/permissions/catalog.ts` is the SSOT. ~80 keys (`leads.create`, `deals.delete`, `ai.use`…). 4 system roles (Owner / Admin / Member / Viewer) + custom roles. Catalog drives runtime checks, role-editor UI, seed defaults, AI tool filtering, backfill.

**Row-level visibility** — Single `records.viewAll` capability gated per role. Presence = full visibility; absence = `assignedTo === own userId`. One key gates leads/contacts/companies/deals together. Enforced via `convex/_shared/permissions/recordScope.ts`.

**Live schema as SSOT** — AI knowledge of fields/types/options/labels/pipelines/stages comes only from `fieldDefinitions`, `pipelines`, `org.entityLabels`, `org.settings.activeModules`. Industry templates seed initial rows at onboarding only.

**Entity labels** — `org.settings.entityLabels` (e.g. `{ lead: { singular: "Inquiry", plural: "Inquiries" } }`). `useEntityLabels()` is the canonical hook.

## AI Capability Registry v2

Three layers:
- **Channel adapters** (`convex/ai/channels/`) — chat, WhatsApp, MCP, REST, Slack. Each authenticates a Principal (member), builds context, hands to runtime.
- **Agent runtime** (`convex/ai/runtime/`) — `runAgent({ principal, channel, trigger, conversation, message })` using AI SDK v6 `ToolLoopAgent` + `prepareStep`. Progressive disclosure: small core + on-demand load.
- **Capability Registry** (`convex/ai/registry/`) — single source of truth. Capabilities co-located with backend in `crm/**/capabilities.ts` next to the `*Impl` mutation body.

Capability shape:
```ts
{ name, module, group, permission, risk, channels, spec, input (Zod + field.*), drive, run }
```

Execution path — `runCapability(cap, rawArgs, ctx)` (`registry/wrapper.ts`):
1. Coerce + parse via `cap.input` → else `repair`
2. Resolve refs (`P-007` → `_id`) → else `not_found` / `ambiguous`
3. RBAC check → else `denied`
4. Channel allowed → else `channel_blocked`
5. Risk gate (irreversible without 2FA) → `needs_step_up`
6. `cap.run(ctx, args)` → `ok` / `partial` / `business_error` / `infra_retry`

Risk tiers:
- `safe` — search/read/list/draft → always auto
- `reversible` — create/update/soft-delete → auto-execute (30-day trash)
- `irreversible` — bulk delete, hard delete, settings/schema, members/roles → permission + 2FA + channel allow-list (never WhatsApp)

Core tools always on: `search_crm`, `describe_entity`, `describe_workspace`, `read_conversation`, `discover_capabilities`, `ask_user`, `escalate_to_agent`.

Coercion helpers (`registry/coerce.ts`):
- `field.timestamp(orgTz)` — epoch ms / ISO 8601 / "next Tuesday" → epoch ms
- `field.codeArray()` — array / CSV / JSON-string / single → string[]
- `field.int()`, `field.str()` (stripEmpty)

3-tier driving: PROJECT (cached) → GROUP (loaded on activation) → TOOL (per-outcome).

Projectors turn one capability into AI-SDK tool / MCP tool / REST handler.

`coverage.ts` reports which `*Impl` are AI-reachable + which capabilities lack examples/playbooks.

Autonomous engine (`runtime/autonomous.ts`, S11) — fires from inbound events. Customer text = content; agent (member) = principal. Unknown sender → no principal → no writes.

Stages: S0–S2 shipped. S3–S17 in flight (port domains, autonomy, channel adapters, MCP/REST projectors, cutover).

AI tools NEVER call public `orgQuery` / `orgMutation`. Capabilities call `*Impl` directly with principal `userId` injected by wrapper.

## Canonical mutation pattern (every public write)

7 steps:
1. `requireOrgMember` + `requireRole` + `enforceRateLimit`
2. Dedup (leads + contacts only, by email/phone/displayName)
3. Generate record code (`P-001`, `D-007`, `T-021`)
4. `ctx.db.insert` with `createdAt` + `updatedAt`
5. `logActivity` with `personCode` for person-related
6. `sendNotification` if `assignedTo` set
7. `ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, …)`

Soft-delete (`deletedAt: number?`) is the convention. Hard delete reserved for join tables + auth artifacts. 30-day recovery in `convex/trash/`.

## 6 cross-cutting tables

Each independent (own indexes / RBAC / schema):
- `notes`
- `messages`
- `notifications`
- `activityLogs`
- `tasks` (absorbed `reminders`)
- `files`

`Timeline` and `Calendar` are read-merge views — no third table.

## Schema split (`convex/schema/`)

`schema.ts` is barrel re-export.

- `identity.ts` — users, orgs, orgMembers, orgRoles, invitations
- `system.ts` — notifications, activityLogs, files, featureFlags
- `ai.ts` — aiConversations, aiMessages, aiBriefings, orgAiKeys, aiStandingOrders, dealScores, ephemeralDashboardCells, dashboardAnnotations
- `platform.ts` — platformContext, platformAuditLogs, platformTiers, platformOtps, platformFlags
- `crmFields.ts` — pipelines, fieldDefinitions, fieldValues
- `crmShared.ts` — notes, messages, tasks, tags, savedViews, noteCategories, conversations, orbitLinks
- `crmEntities.ts` — leads, contacts, deals, companies, entity5, entity6, entityCodeCounters

## `convex/_shared/` infra

- `permissions/catalog.ts` — RBAC SSOT
- `permissions/helpers.ts` — `requireRole`, `hasPermission`, `getDefaultPermissionsForRole`
- `permissions/recordScope.ts` — row-level visibility (`resolveRecordScope`, `rowInScope`, `resolveAssigneeFilter`, `scopeAssignee`)
- `validators.ts` — reusable Zod/Convex validators
- `errors.ts` — typed `ERRORS` catalog
- `rateLimit.ts` — `enforceRateLimit({ scope, key, max, periodMs, orgId })`
- `recordCodes.ts` — `generatePersonCode`, `generateEntityCode` (atomic per-org counters in `entityCodeCounters`)
- `reservedSlugs.ts` — `RESERVED_SLUGS` set, `validateSlug()`
- `notificationKeys.ts` — `NOTIFICATION_PREFERENCE_KEYS`
- `dedup.ts` — fuzzy match for leads/contacts
- `aiEntityPatch.ts` — apply field patches against live `fieldDefinitions`
- `synonyms.ts` — field-name normalisation
- `csvEncodingDetect.ts` — UTF-8 / UTF-16
- `bulkProgress.ts` — CSV import + bulk progress
- `sanitiseExtractedText.ts` — strip prompt injection
- `orgStats.ts` — cached aggregates

## Module conventions (one-liners)

- Sidebar items declared in `core/shell/config/navigation.ts` (id, icon, href, permission, featureFlag, entitySlot, badgeKey).
- Identity / membership / labels loaded once at layout via `<OrgProvider>`. Components read from `useCurrentOrg()` — never subscribe directly.
- `core/entities` provides 4 scaffolds: `EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`. Used for leads, contacts, deals, companies, entity5, entity6.
- `core/data-display/datatable` — TanStack v8 + URL state via nuqs.
- `core/data-display/kanban` — config-driven; powers Deals + Leads + Notes board. One mutation per drop. Gap-based fractional `sortOrder`.
- `core/data-display/command-palette` — `cmdk`, `Cmd+K`, debounced 200ms search to `api.search.global`.
- `core/comms` — Timeline (read-merge over `activityLogs + notes + tasks`), Notes (sticky-note kanban), Messages (cursor-paginated 30/page).
- `core/scheduling` — single `tasks` table; three view modes (`list / calendar / today`) URL-persisted via `?view=`.
- `core/data-io/csv-import` — AI maps columns; Trigger.dev processes batches of 50; calls same canonical mutation as UI.
- `core/inbox/notifications` — Convex reactive subscription on `by_userId_and_read`; ~25 notification types.
- `core/platform/settings` — single `/settings` route, `?group=` query, per-section save. Two queries hydrate: `getFullSettings` + `getMyPermissions`.
- `core/platform/profile` — `/profile/[personCode]` resolves leads + contacts via `crm.people.queries.getByPersonCode`.
- `core/shell/onboarding` — single-route 3-step wizard at `/onboarding`. Industry pick seeds initial fields + pipelines.

## Auth + billing + owner panel

- Email-only OTP via `@convex-dev/auth` + `convex/ResendOTP.ts`. No passwords.
- Owner panel uses second OTP layer (`convex/_platform/otp/`) with cookie sessions.
- Owner URL hidden via `OWNER_PANEL_SLUG` env rewrite. Direct `/xowner` = 404.
- `requirePlatformOwner(ctx)` first line of every owner-panel function.
- Owner audit log table is APPEND-ONLY. Never reads org-scoped content. Never adds `*ForAI` twins.
- LemonSqueezy webhooks (HMAC verified) update `org.plan`, `org.billing.status`, trial dates.
- Plan tier limits at `_platform/limits.ts`. `-1` = unlimited, `0` = disabled.

## Index conventions

- `by_org` first in every compound key.
- `by_org_and_<field>` for filter within org (e.g. `leads.by_org_and_personCode`).
- `by_<unique>` for global lookup (e.g. `users.by_email`).
- `by_userId_and_<field>` for per-user state (e.g. `notifications.by_userId_and_read`).

## Locked decisions

1. Convex for server state; Zustand UI-only.
2. Entity labels never hardcoded — `org.settings.entityLabels`.
3. `useEntityLabels()` is the canonical hook.
4. Single `/settings` route with `?group=`.
5. Per-section save in settings, no global save.
6. Appearance prefs per-user via cookies.
7. Org-wide activity log at `/{locale}/{orgSlug}/timeline`.
8. Person detail at `/profile/P-001` resolves lead + contact via `getByPersonCode`.
9. 4 entity scaffolds handle all entities including entity5/6.
10. `Element.scrollIntoView()` banned in dashboard shell — use `scrollToSection`.
11. Six independent cross-cutting tables; Timeline + Calendar are read-merge views.
12. `personCode` is the stable identity, never regenerated.
13. Permission catalog SSOT at `convex/_shared/permissions/catalog.ts`.
14. Reserved slugs SSOT at `convex/_shared/reservedSlugs.ts`.
15. Notification preference keys SSOT at `convex/_shared/notificationKeys.ts`.
16. No hardcoded permission lists — use `getDefaultPermissionsForRole` / `requireRole`.
17. Canonical 7-step mutation pattern.
18. File upload limits from `org.settings.fileUpload`, not hardcoded.
19. Convex top-level layout flat; CRM grouped under `crm/{entities,fields,people,shared}`.
20. Sentry/PostHog DSNs from env, no-op if unset.
21. Reminders + Calendar UI uses donor pattern from shadcnstore template.
22. Calendar grid (`<CalendarMain>`) is pure renderer — accepts `events` prop, never `useQuery`.
23. EventForm = thin wrapper around ReminderForm.
24. All scheduling writes gate on `RATE_LIMITS.write` shared scope.
25. Embedded calendar panels clamp date range to ±45 days.
26. AI autonomy = risk-tier model + 2FA on irreversible (replaces hard-locked propose/commit).
27. AIQuickComposerCard auto-sends on Enter; reuses persisted thread.
28. Row-level visibility = single `records.viewAll` capability per role; enforced via `recordScope.ts`.

## Coding conventions

- `pnpm` only (npm/yarn forbidden).
- Biome lint+format. Goal: 0/0 on `pnpm typecheck` + `pnpm exec biome check .`.
- RTL: `ms-*` / `me-*` / `ps-*` / `pe-*` / `start-*` / `end-*` / `border-s` / `text-start` only. Directional `ml-*` / `mr-*` etc. banned.
- `border-radius` always `rounded-[var(--radius)]` (`rounded-full` exception).
- App identity (`name`, `description`, `url`, `platformPrefix`) read from `APP_CONFIG` (`config/app-config.ts`).
- One mutation per drag drop. List-affecting mutations use `withOptimisticUpdate`.
- Drag rate limit: 120/min `(userId, orgId)` shared scope.
- Components must not subscribe to identity queries directly — read from context (`useCurrentOrg`, `useOrgMembers`, `useOrgPermissions`, `useEntityLabels`).
- Migrations in `convex/_migrations/` ship in same edit as schema change. Idempotent.
- Convex MCP / `npx convex run` hangs in agent runtime — emit command for user to paste.
- Webhook handlers verify HMAC signature first.
- Soft-delete tables: filter `!doc.deletedAt` on every read.

## Integrations

- Convex (DB + actions + scheduling)
- Convex Auth + Resend OTP
- AI SDK v6 + Anthropic / Google / Groq / Mistral / OpenAI / xAI / OpenRouter (BYOK + platform fallback)
- Trigger.dev v4 (>30s jobs)
- Sentry, PostHog
- LemonSqueezy + Razorpay
- Twilio (WhatsApp inbound + outbound, S13)
- Firecrawl (web scraping for AI)
- next-intl (en/ar)
- shadcn/ui + radix-ui + base-ui
- Onborda (product tour)
- MCP (S16 — registry projects to MCP)

## Env vars

Backend secrets (Convex dashboard, NOT `.env.local`):
`LEMONSQUEEZY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `OWNER_PANEL_SLUG`, `PLATFORM_OWNER_EMAILS`, BYOK platform fallbacks (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …).

Frontend public:
`NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PLATFORM_PREFIX`.

## Key files

- `AGENTS.md` — project constitution (locked rules)
- `PENDING.md` / `SHIPPED.md` — work tracking
- `Future-Enhancements.md` — deferral cards
- `AI-TOOLING-LAYER-PLAN.md` + `AI-TOOLING-BUILD-STAGES.md` — Capability Registry v2 + S0–S17
- `convex/_arch.md` — Convex architecture map
- `core/*/MODULE.md` + `convex/**/MODULE.md` — per-module decision logs
- `docs/SYSTEM-DESIGN.md` — full system design (uncompressed)
