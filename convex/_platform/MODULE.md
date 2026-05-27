# `_platform/` — Platform-Owner Concerns

> **Phase**: cross-cutting · **Status**: SHIPPED — owner-panel backend (Stages 0–7 2026-05-27, including Stage 1 OTP)
> **Read order**: this MODULE.md first, then `ownerAuth.ts`, then any per-feature folder you're touching.

## Purpose

Convex backend for the platform-owner panel (`PLATFORM-OWNER-PANEL.md`). Every public function in this folder calls `requirePlatformOwner(ctx)` as its first line — defence-in-depth on top of the middleware + layout gate. AI tools NEVER call into `_platform/*` (no `*ForAI` twins); these handlers are owner-panel only.

## Files

| File | Purpose | Stage |
|---|---|---|
| `ownerAuth.ts` | `requirePlatformOwner(ctx)` + `isPlatformOwner(ctx)` predicate. Wraps `requireSuperAdmin` + `PLATFORM_OWNER_EMAILS` env allow-list. Fail-closed if env unset. | 0 |
| `auth/queries.ts` | `getOwnerProfile` server-callable query the layout uses to validate the gate. | 0 |
| `limits.ts` | Plan-tier limits SSOT. Sync `getPlanLimits(tier)` returns in-code constants (kept for back-compat). Async `getPlanLimitsFromDb(ctx, tier)` reads `platformTiers` with constant fallback. | 4 |
| `audit/helpers.ts` | `logPlatformAction(ctx, input)` writes to `platformAuditLogs`. Append-only — no update/delete exposed. | 4 |
| `audit/queries.ts` | `listAuditLogs` (paginated + optional action filter, `desc` order) + `listRecent` (top-N capped at 25). | 4 |
| `tiers/queries.ts` | `listTiers` (4 canonical tiers with `seeded` flag) + `getTier`. | 4 |
| `tiers/mutations.ts` | `updateTier` (auto-creates row on first edit) + `changeUserTier` (mutates org `plan` field with full audit trail). Both follow the §8 4-step pattern. | 4 + 5 |
| `users/queries.ts` | `listAllUsers` (cursor paginated, post-page email/name search) + `getUserSummary` (user + their org memberships + plan/role per org — NEVER reads org content). | 5 |
| `flags/queries.ts` | `listFlags` (sorted by key) + `getFlag`. | 6 |
| `flags/mutations.ts` | `setFlagEnabled` (auto-creates row) + `setOrgOverride` (`enabled: boolean \| null` removes override). | 6 |
| `platformContext/queries.ts` | `getMain` reads singleton `key='main'` row. | 6 |
| `platformContext/mutations.ts` | `update` patches content/rules/version with full diff in audit row; auto-creates if missing. | 6 |
| `overview/queries.ts` | `getCounts` returns aggregated `{totalUsers, activeUsers, superAdmins, totalOrgs, activeOrgs, tierCounts}`. NO org content. | 6 |
| `billing/queries.ts` | `getProviderConfig` returns `{key, present}` per env var for LemonSqueezy + Razorpay + Resend. NEVER returns values. | 6 |
| `otp/mutations.ts` | `requestOtp` (rate-limited 5/15 min, code hashed with per-row salt + invalidates prior unconsumed rows), `verifyOtp` (constant-time hash compare, single-use, emits `owner.session.start` audit), `revoke` (force-expires + emits `owner.session.revoke`), internal `deleteExpired` (cron-driven GC). | 1 |
| `otp/queries.ts` | `listActiveSessions` (consumed-but-unexpired rows for the calling user — drives the OwnerSettings revoke UI), `getRecentLogins` (`owner.session.{start,revoke}` from audit log), internal `getOwnerOtpRow`. | 1 |
| `otp/actions.ts` | `"use node"` `sendOwnerOtpEmail` action — Resend wrapper using `renderOwnerOtpEmail` template. | 1 |

## Rules

| # | Rule | Outcome |
|---|---|---|
| 1 | Every public function calls `requirePlatformOwner(ctx)` as its first line. | Defence-in-depth even if the layout gate is bypassed. |
| 2 | Every mutation follows the 4-step pattern (auth → rate-limit → before-snapshot + write → `logPlatformAction`). | Immutable audit trail for every state change. |
| 3 | Audit-log table is APPEND-ONLY. No update/delete mutations exposed. | Forensic integrity. |
| 4 | NEVER read org-scoped content from this folder (locked decision L7). | The panel is platform-wide only — the operator joins an org as a regular member if they need to inspect it. |
| 5 | NEVER add `*ForAI` twins to `_platform/*`. | These handlers are owner-panel only — AI tools never call them. |
| 6 | Use `-1` for "unlimited" and `0` for "feature disabled" in any tier limits. | Matches the convention used everywhere else in the codebase. |
| 7 | Adding a new owner-panel mutation: extend `audit/helpers.ts` action verb table, NOT free-form strings. The verb is `owner.<subject>.<verb>`. | Keeps the audit trail searchable. |

## Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | `_platform/` lives at the Convex root (sibling of `_shared/`, `_migrations/`). | Signals "platform owner concerns", not domain-specific. |
| 2 | Owner-panel mutations share rate-limit scope `owner.write`. | Frantic operator can't bypass by alternating verbs. |
| 3 | Tier limits moved to `platformTiers` table (Stage 4) BUT sync `getPlanLimits` kept for back-compat. | Zero behavioural regression for 7 existing call sites; new consumers opt in to DB-aware via `getPlanLimitsFromDb`. |
| 4 | `setFlagEnabled` and `updateTier` auto-create their row on first edit. | Operators don't need to remember to run the seed migration before the editor works. |
| 5 | `setOrgOverride` accepts `enabled: boolean \| null`. `null` removes the override entirely (org falls back to global default). | Cleaner UX than a separate `removeOrgOverride` mutation. |
| 6 | `getProviderConfig` returns presence booleans only — NEVER env values. | The owner panel is rendered server-side; we still treat secrets as out-of-bounds for any panel response. |
