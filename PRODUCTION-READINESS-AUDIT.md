# Production Readiness Audit

> **Scope**: Every gap I can identify between the current backend and a
> production-grade SaaS application that will be sold and scaled. Each gap
> is graded **P0** (blocker before public launch), **P1** (must fix before
> the first 100 paying customers), **P2** (must fix before scaling beyond
> 1000 customers), or **P3** (long-term polish).
>
> **Updated**: 2026-05-16 after the conversations + counters + cascades pass.
>
> **What's NOT in this doc**: things already done. See `Phase-2-progress.md`
> for the completed-work record.

---

## Status snapshot

| Verification | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm exec biome check .` | ✅ 0 issues |
| `pnpm test` | ✅ 103 pass + 1 skipped (5 test files) |
| `npx convex codegen` | ✅ succeeds |

---

## P0 — blockers before public launch

These ship security, data-integrity, or compliance bugs into production.
Must be done before the marketing page goes live.

| # | Issue | Where | Effort |
|---|---|---|---|
| P0-1 | **No backup / disaster-recovery procedure**. Convex's snapshot export is documented but no scheduled job + S3 archival is wired. | infrastructure | 1 day |
| P0-2 | **Stripe / billing webhook + checkout endpoint**. Plan tiers are defined (`PLAN_FEATURES` constant), but `app/api/billing/*` routes don't exist. Current code has no plan-upgrade path. | new module | 3 days |
| P0-3 | **No CSRF protection on `/api/billing/*` once it ships**. Webhook signature verification + state-token checks need to be wired. | when P0-2 lands | 0.5 day |
| P0-4 | **Soft-delete recovery**. Every entity's `softDelete` mutation has no symmetric `undelete`. Once a record is deleted, support has to use the Convex dashboard to flip `deletedAt: undefined` manually. Production support needs a one-click restore. | every CRM entity + files + notes + reminders + messages | 1 day |
| P0-5 | **Server-side error context for Sentry**. Convex errors thrown in mutations don't include orgId/userId tags. Sentry breadcrumbs are flat. | `_shared/errors.ts` + a sentry helper | 1 day |
| P0-6 | **Email send infrastructure**. Resend is installed, but no template + no `sendEmail` helper. Invitations send no email. Password resets send no email. | new module `convex/_shared/email.ts` | 1.5 days |
| P0-7 | **Production logging**. `lib/logger.ts` exists but Convex functions don't use it — they use `console.log`. Need a `convexLogger` wrapper that pipes to Sentry/Datadog in prod. | `convex/_shared/logger.ts` | 1 day |
| P0-8 | **Privacy + GDPR**. No user-data-export mutation. No "delete my account" cascade — `users.deleteAccount` only soft-deletes the user row, leaving notes, messages, files orphaned with their authorId. | new internal mutations | 2 days |
| P0-9 | **Audit log retention**. `activityLogs` grows unboundedly. Need an archive cron (e.g. archive entries older than 90 days to a `archivedActivityLogs` table). Without this, the table eventually exceeds Convex's per-table limits. | new cron + table | 1 day |
| P0-10 | **CORS / security headers**. `next.config.ts` ships with the default Next CORS (any origin). Production needs strict CSP, Strict-Transport-Security, X-Frame-Options, Permissions-Policy. | `next.config.ts` + middleware | 0.5 day |
| P0-11 | **Rate-limit cleanup cron**. The `rateLimits` table grows linearly with unique (scope, key) pairs. Stale rows past their `resetAt + 24h` are dead weight. Cron sweep needed. | new internal action | 0.5 day |

**Total P0 effort: ~13 days.**

---

## P1 — must fix before first 100 customers

These don't break the product but they degrade quality, scale, or support
experience as load increases.

| # | Issue | Where | Effort |
|---|---|---|---|
| P1-1 | **Cursor-based pagination on messages, notes, activityLogs**. Currently `.take(N)` with hard caps. At 10,000 messages in a thread the user can only see the newest 100. | `messages/queries.ts`, `notes/queries.ts`, `timeline/queries.ts` | 2 days |
| P1-2 | **Bulk operations**. No `leads.bulkUpdate`, `deals.bulkAssign`, etc. Production CRMs need this for sales-team workflows. | new mutations across CRM entities | 3 days |
| P1-3 | **Search APIs**. Schema has `searchIndex`es on displayName/title but no public `search*` queries that use them. Production needs typeahead + global Cmd+K search. | new `search` queries per entity | 2 days |
| P1-4 | **Webhook outbound**. No way to push events to external systems (Zapier-style integrations are explicitly Phase 6 — but at minimum a "deal.won" webhook for Slack/Discord is table-stakes for 50+ customer orgs). | new module `convex/webhooks/` | 2 days |
| P1-5 | **Saved-view + starred-records query speed**. Current `savedViews` table has indexes but no caching. At >50 saved views per user the inbox sidebar gets slow. | add `by_user_pinned` index + cache | 1 day |
| P1-6 | **N+1 reads in `listMembers` and `listAll` people**. Each row triggers `ctx.db.get(userId)`. At 100 members this is 100 reads. | batched user lookup helper | 1 day |
| P1-7 | **`userMutations.deleteAccount` cascade**. Doesn't unlink notes, messages, conversation memberships, file ownership. Account deletion leaves dangling references. | `users/mutations.ts::deleteAccount` rewrite | 2 days |
| P1-8 | **Notification digest emails**. Per-user "you have 5 unread mentions" daily/weekly email. No backend support. | new cron + email template | 2 days |
| P1-9 | **AI context staleness**. `aiContext` is stored on entities but only a no-op stub rebuilds it (Phase 3). Without periodic rebuild the AI gives stale answers. | activate the rebuild stub + cron | 2 days |
| P1-10 | **Frontend memo audit**. `useOrgPermission`, `useEntityLabels`, `useEntityFields` hooks recompute on every render. Should be wrapped in `useMemo` with stable deps. | `core/shell/shared/hooks/*.ts` | 1 day |
| P1-11 | **PostHog server events**. `posthog-node` is installed but no server events fire on key business moments (org_created, lead_created, deal_won, member_invited). | `convex/_shared/telemetry.ts` + hooks | 1 day |
| P1-12 | **Internal-mutation rate limiting**. `internalMutation` doesn't go through the rate limiter. AI tool calls (Phase 3) would bypass entirely. Need a separate `internalRateLimit`. | `_shared/rateLimit.ts` extension | 0.5 day |
| P1-13 | **Feature-flag plan-gate enforcement**. `requirePlanFeature` exists in `_shared/permissions/helpers.ts` but isn't called by any mutation. Plans are defined but never enforced. | sprinkle across feature mutations | 2 days |

**Total P1 effort: ~22 days.**

---

## P2 — must fix before scaling beyond 1000 customers

| # | Issue | Where | Effort |
|---|---|---|---|
| P2-1 | **Convex function size limits**. Some mutations are now > 300 LOC (orgs/mutations.ts, leads/mutations.ts). Convex has implicit size limits per function. Refactor into smaller composed handlers. | every mutation file | 3 days |
| P2-2 | **OpenAI / Claude budget tracking**. AI usage per org per day with hard caps. Needed before Phase 3 because runaway prompts can rack up bills. | new `aiUsage` table + helper | 2 days |
| P2-3 | **Multi-region / data residency**. Convex deployments are single-region by default. EU customers may require EU data residency (GDPR). | Convex deployment work | 2 days |
| P2-4 | **Storage / file deduplication**. If two users upload the same file (hash match), we store twice. At scale this is wasteful. SHA-256 dedup at upload time. | `files/mutations.ts::record` | 1 day |
| P2-5 | **CSV import resumability**. Phase 2 plan mentions CSV import but no Trigger.dev job exists. For 100k-row imports we need chunked, resumable processing. | `trigger/imports/processCSVImport.ts` | 3 days |
| P2-6 | **Index hot-spotting on `activityLogs`**. Every mutation writes one activity row. At 100 mutations/sec across the platform we'll start hot-spotting on `by_orgId_and_createdAt`. Need partitioning or a write-behind buffer. | `activityLogs` schema + helper | 2 days |
| P2-7 | **Materialised search indexes**. Convex `searchIndex` is single-shard. For multi-tenant search across leads + contacts + deals + companies + notes we need a unified search table. | new `searchIndex` table | 3 days |
| P2-8 | **Frontend bundle size**. No bundle analyzer wired. Some shadcn imports pull in entire libraries. | `next-bundle-analyzer` + audit | 1 day |

**Total P2 effort: ~17 days.**

---

## P3 — long-term polish

| # | Issue | Effort |
|---|---|---|
| P3-1 | **Dark-mode contrast audit (WCAG AA)** | 1 day |
| P3-2 | **i18n: Arabic translations for every string** | 3 days |
| P3-3 | **Keyboard navigation: Cmd+K palette, Cmd+/ chat, Cmd+. assist** | 2 days |
| P3-4 | **A11y axe-core sweep + fixes** | 2 days |
| P3-5 | **Mobile PWA + bottom-nav for < 768px** | 3 days |
| P3-6 | **Performance: virtualised scrollers in tables + kanban + chat** | 2 days |
| P3-7 | **Onboarding: progressive checklist completion → AI prompts** | 2 days |
| P3-8 | **SEO: sitemap + structured data on landing pages** | 1 day |
| P3-9 | **Content-security-policy nonce-based for inline scripts** | 1 day |

---

## Architectural concerns (no concrete fix yet)

These are "things to think about", not assignable tickets:

1. **Multi-tenancy at the row level**. Convex's tenant isolation is by query
   pattern, not by row-level security. A bug in `requireOrgMember` would
   leak. Consider a Convex middleware that asserts every read includes the
   org filter — currently we trust the developer to remember.

2. **Eventual-consistency drift on counters**. `orgStats` is updated in the
   same transaction as the mutation, so it's strongly consistent today. But
   if any future mutation forgets to call `applyOrgStat`, drift accumulates
   silently. The recompute action (P1-ish) should be wired and run weekly
   in production.

3. **AI guardrails (Phase 3)**. When the AI starts invoking mutations, every
   tool call must be logged, every destructive action must require user
   confirmation in the UI (not just in the prompt), and every "free-form"
   AI output must be sanitised against prompt injection. The 4-layer model
   in `FRONTEND-DECISIONS.md` Rule 7 covers the design — implementation is
   Phase 3.

4. **"Stop the world" backups**. Convex export takes a consistent snapshot
   but the snapshot writer competes with live traffic. For large
   deployments (>1M rows) we need a read-replica or off-hours export.

5. **PII redaction in logs**. `pino` and Sentry both ship every error
   payload to their respective backends. If a mutation throws with a user's
   email or PII in the metadata, it leaks to Sentry. We need a redactor.

6. **Cross-org references**. Today every table is org-scoped. Future
   features (cross-org partner workspace, merge-and-acquire) will need a
   "shared object" concept. Don't build until needed but document the
   constraint.

7. **Real-time presence**. Convex's reactive queries handle "data has
   changed" but not "is Alice typing right now?". Phase 4 will need a
   presence layer — Liveblocks is the lowest-friction option.

8. **Data model versioning**. Every schema change today is a hot-deploy.
   For destructive changes (rename a field, drop a table), we need the
   widen → migrate → narrow pattern documented in
   `.kiro/skills/convex-migration-helper/`. Practice this pattern at least
   once with a non-trivial change before the first 100 customers.

---

## Acceptance criteria for "production-grade" claim

You can credibly call this "production-grade SaaS" when ALL of the
following are true:

- [ ] Every P0 item closed.
- [ ] Stripe checkout flow works end-to-end.
- [ ] Email delivery works (invitations + password reset + magic link).
- [ ] Sentry / PostHog wired for both client + server with PII redaction.
- [ ] At least one external SOC 2 / pen-test review passed.
- [ ] On-call runbook documented (who gets paged when).
- [ ] Database backups + restore drill validated.
- [ ] Rate limit + audit log retention crons running on schedule.
- [ ] Privacy policy + terms of service live, GDPR data-export tested.
- [ ] At least one paying customer onboarded successfully.

Until then, this is a **production-grade-architecture** product (the code
will scale; the operational layer is incomplete).
