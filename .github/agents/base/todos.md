# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-22

---

## Phase 3A — Workspace Polish & Industry Coverage (next)

| # | Task | Priority |
|---|---|---|
| 1 | Extend `IndustryTemplate` type with `mockData?` slot | HIGH |
| 2 | `seedMockEntities()` in seeder (idempotent, tagged `source:"template_seed"`) | HIGH |
| 3 | Add mock data to 4 target templates (real-estate-dubai, b2b_saas, freelancer, productivity) | HIGH |
| 4 | Build `productivity.ts` template | HIGH |
| 5 | Rebuild `freelancer.ts` as lean solo template | HIGH |
| 6 | Add `real-estate-saudi.ts` template | HIGH |
| 7 | Rename template ids + migration | MEDIUM |
| 8 | Sub-niche picker UI in onboarding (Step 2b) | HIGH |
| 9 | Standardise note categories (semantic, not color names) | HIGH |
| 10 | Honor `entityVisibility` in sidebar | HIGH |
| 11 | Backfill semantic note categories for existing orgs | MEDIUM |
| 12 | Settings → "Switch template" UI | MEDIUM |

## Phase 3A Blocker

Add `dashboardMetrics` to `orgs.settings` schema + copy from template on seed.

---

## Phase 2 — Deferred

| # | Task | Priority |
|---|---|---|
| 1 | Mount `FollowUpsPanel` in Profile, Deal, Company detail views | HIGH |
| 2 | `FillMissingFieldsDialog` (auto-opens on block-policy error) | HIGH |
| 3 | Warn-mode banner on deal detail | MEDIUM |
| 4 | Per-stage advanced settings UI (staleAfterDays, isFinal, finalType) | MEDIUM |

---

## Production Hardening (before public launch)

| # | Task | Effort | Priority |
|---|---|---|---|
| 1 | Email send (Resend + invitation + password-reset templates) | 1.5d | P0 |
| 2 | Soft-delete recovery (undelete mutations + Trash UI) | 1d | P0 |
| 3 | GDPR: user data export + delete cascade | 2d | P0 |
| 4 | Billing (Stripe webhook + checkout + plan gating) | 3d | P0 |
| 5 | Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options) | 0.5d | P0 |
| 6 | `activityLogs` archive cron (rows > 90 days) | 0.5d | P1 |
| 7 | Bulk operations (`leads.bulkUpdate` etc.) | 3d | P1 |
| 8 | Cmd+K search using schema `searchIndex` | 2d | P1 |

---

## Phase 3B — AI Assistant

| # | Task | Priority |
|---|---|---|
| 1 | `systemPrompt.ts` — 3-layer builder | HIGH |
| 2 | `toolRegistry.ts` — role → tool mapping | HIGH |
| 3 | 11 tools in `convex/ai/tools/` | HIGH |
| 4 | `rebuildEntityContext` body filled | HIGH |
| 5 | `app/api/ai/chat/route.ts` streaming proxy | HIGH |
| 6 | ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation | HIGH |
| 7 | `useAIChat.ts` + `useRouteContext.ts` | HIGH |

---

## Phase 3C — WhatsApp / Voice

| # | Task | Priority |
|---|---|---|
| 1 | 360dialog webhook | MEDIUM |
| 2 | Whisper → Claude → `fieldValues.bulkSet` | MEDIUM |
| 3 | Channel registration UI in Settings → Integrations | MEDIUM |
