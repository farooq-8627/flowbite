# `_platform/` — Platform-Owner Concerns (SSOT for future dashboard)

> **Phase**: cross-cutting (Phase 2 Final + future) · **Status**: SHIPPED (single-file form)
> **Read order**: this MODULE.md first, then `limits.ts`.

## Purpose

A holding area for everything that should eventually move into a **platform-owner dashboard** (a separate UI for the SaaS operator). Until that dashboard exists, decisions live in code as a single source of truth so:

- Every consumer (mutations, UI gates, billing checks) imports from here.
- When the dashboard ships, only the lookup function bodies change — no consumer rewrite.

## Files

| File | Purpose |
|---|---|
| `limits.ts` | Plan-tier limits (max pipelines, deals, members, storage, AI tokens). Hard-coded today; lookup-via-table later. |

## Migration path (when the platform dashboard ships)

1. Create a `platformLimits` table that mirrors `PLAN_LIMITS`.
2. Seed the table with the current code values.
3. Replace `getPlanLimits()` body with a `ctx.db.query("platformLimits").withIndex("by_tier", q => q.eq("tier", tier)).first()` lookup.
4. No consumer changes needed — the function signature stays the same.

## Rules

| # | Rule | Outcome |
|---|---|---|
| 1 | Never hardcode plan limits anywhere else. Always import from `_platform/limits.ts`. | A single change here updates the entire app. |
| 2 | Use `-1` for "unlimited" (matches deep-plan convention). | `0` is reserved for "disabled" (e.g. AI on free tier). |
| 3 | Adding a new limit key requires updating `PlanLimits` + every plan tier in `PLAN_LIMITS`. | TypeScript catches missing tiers at compile time. |
| 4 | Plan-tier checks happen server-side in mutations, **never** in UI alone. | Defence in depth — UI hints, server enforces. |

## Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | `_platform/` lives at the Convex root (sibling of `_shared/`, `_migrations/`). | Signals "platform owner concerns", not domain-specific. |
| 2 | First file is `limits.ts`. Other future files: `featureFlags.ts`, `industryCatalog.ts`, `releaseChannel.ts`. | Each platform concern gets its own file inside this folder. |
| 3 | Free tier disables AI by setting `aiTokensPerMonth: 0`, not by feature flag. | Single dimension — `0 = disabled`, `>0 = quota`, `-1 = unlimited`. |
