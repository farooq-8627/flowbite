# PENDING.md — Single source of truth for everything still to ship

> **Generated:** 2026-05-27 by consolidating SPRINT-PLAN.md, Future-Enhancements.md, Phase-2-progress.md, the 6 audit docs, the 2 stage-3A planning docs, and a fresh code scan.
>
> **How to use this file.** Anything in here is genuinely pending — verified against the codebase, not just claimed in a doc. Anything shipped lives in `SHIPPED.md`. The two files don't overlap.
>
> **Order of work.** Sections are listed by priority — P0 must ship before public launch, P1 ships in the next sprint window, P2/P3 are backlog with full context preserved so any session can pick them up cold.
>
> **Cross-references kept (not deleted):** `LANDING-PAGE.md` (marketing-site spec), `AGENTS.md` (rules), `core/*/MODULE.md` and `convex/**/MODULE.md` (per-module architecture decisions), `docs/architecture/*` (durable architecture). Per-module STATE.md files were retired on 2026-05-27 and their pending items consolidated into `Future-Enhancements.md` §H. The `PLATFORM-OWNER-PANEL.md` and `INDUSTRY-TEMPLATES-DB-MIGRATION.md` spec docs were deleted on 2026-05-27 once their stages all shipped — pending Tier B/C / v2 items live as cards in `Future-Enhancements.md` §B (B.27–B.31).

---

# ✅ AI-TOOLING-BUILD-STAGES.md — ALL 18 STAGES SHIPPED 2026-06-03 → 2026-06-05

S0–S17 complete — see `SHIPPED.md` for one-line per-stage rows. Source of truth is now historical: `AI-TOOLING-BUILD-STAGES.md` carries collapsed ✅ summaries; `AI-TOOLING-LAYER-PLAN.md` carries the locked architecture/"why" doc. New AI work tracks under `Future-Enhancements.md §B` (e.g. B.40 WhatsApp Templates Admin UI; B.41 Mode C external prerequisites; new MCP/REST card slots when an external integration surfaces a need).

---

# 🔴 P0 — DASHBOARD-V2-PLAN.md (active sprint, opened 2026-05-28)

> **Source of truth.** `DASHBOARD-V2-PLAN.md` carries the full multi-stage scope (production references, verified findings, locked decisions, per-stage acceptance criteria). The rows below are pointers — they exist so anyone scanning `PENDING.md` sees the active dashboard work without flipping files. **Stage 0 (file-attach silent-drop hotfix), Stage 0.5 (auto-approve commit shim), Stage 1 (surface polish — AI Cockpit rename, Sparkles unification, weekly Generate-now, drop duplicated AI briefing KPI, currency-agnostic icon), Stage 2 (Sales Pipeline Panel rewrite — full-width tabbed Summary/Velocity/Forecast surface with HubSpot weighted forecast + 12-week sparkline + coverage-ratio dial; legacy `PipelineCard` + `PipelineVelocityCard` retired), Stage 3 (LiveTasksWidget + RecentActivityWidget — `<TasksDataTable>` extracted with a compact prop; legacy `<TasksCard>` 8-row capped list and `<TimelineActivityWidget>` retired from the dashboard renderer), Stage 4 (per-industry `dashboardLayout` slot — additive optional + new `<DashboardLayoutRenderer>` + 3 new analytical widgets `<InvoiceAgingWidget>` / `<PropertyFunnelWidget>` / `<ARRCohortWidget>` + 4 templates flipped: b2b-saas, freelancer, real-estate-global, productivity), Stage 6 (user-requested batch — bulk ops made free, generic `bulk_create_entities` + `bulk_create_tasks` with one approval card, approval cards render the real `<EntityCard>` via `EntityPreviewCard`, Today's-focus folded into the metric strip + `TodaySummaryCard` retired, motivating `DashboardEmptyState` on the pipeline panel, and a system-prompt explicitness block for limitations + completion summaries)**, and **Stage 7 (revenue hero + always-on pipeline + AI empty states + configurable activity/messages limits — `<RevenueEstimateHero>` consolidates the 4 deal KPI tiles into one bold weighted-revenue headline; `<SalesPipelinePanel>` renders unconditionally for every workspace via the panel's own empty state — gate dropped; `<AIPulseRibbon>` stuck-on-spinner bug fixed + strong "Your AI co-pilot is ready" empty card; `<DailyBriefingCard>` + `<WeeklyInsightCard>` empty states upgraded to value-prop + 3 bullets; `getDashboardStats` accepts `recentActivityLimit` (clamped [1,50], default 10) + `<RecentActivityWidget>` honours a `limit` prop)** all shipped — see `SHIPPED.md`.
>
> **Locked decisions** (per user, 2026-05-28; full table in `DASHBOARD-V2-PLAN.md §5`):
> 1. Section rename = **AI Cockpit** ✅ shipped Stage 1.
> 2. Auto-approve fix shape = **Stage 0 + Stage 0.5 both** ✅ shipped (Stage 0 + Stage 0.5).
> 3. Forecast category thresholds = **HubSpot defaults** (Commit ≥75 / Best Case 50–74 / Pipeline <50). ✅ shipped Stage 2.
> 4. Coverage-ratio bands = **industry-tunable per template** (default 3:1 / 2:1; per-template override). ✅ shipped Stage 4 — every layout-opted template (`b2b-saas {3,2}`, `freelancer {2,1}`, `real-estate-global {5,3}`) sets its own band; the default kicks in for templates that don't.
> 5. Stage 4 first three industries = **Real-estate, Freelancer, B2B SaaS**. ✅ shipped Stage 4 (productivity also flipped as the v1 plan's 4th).
> 6. Stage 5 scope = **Ship all 5 capabilities** (`render_widget`, `annotate_widget`, `revise_forecast`, anomaly detection, predictive deal scoring). ✅ shipped Stage 5 — render_widget, annotate_widget, score_deal, explain_deal_score, list_anomalies. revise_forecast deferred per scope realism (covered by analyze_metric in the analytics layer).
> 7. Stage 0 → 1 timing = **Pause after each stage** — wait for explicit user go-ahead before kicking the next.

## P0-DV2.6 — Widget editor (deferred)

Attio-style report builder. Out of scope for this plan; will be its own card under `Future-Enhancements.md §B` when prioritised.

---

# ✅ P0 — All previous P0 wave items shipped 2026-05-27

P0.1 (LemonSqueezy upgrade flow) and P0.2 (re-enable all 5 testing-phase restrictions) are LIVE end-to-end: trial + 3-day past_due grace in `quotaGate.ts`; per-variant `PricingCard.tsx` + `TrialBanner.tsx` reading new public `_platform.tiers.queries.listPublicTiers`; webhook lifecycle smoke-tested (12 contract tests in `convex/billing-webhooks.test.ts`); production runbook at `docs/runbooks/lemonsqueezy-rotation.md`. Plan-tier gate restored in `getModel()` with BYOK bypass; premium tool gate restored in `toolRegistry.isToolExposed`; tier-aware `STEP_CAP_BY_TIER` in `streamLoop.ts`; `systemPrompt.ts` capability notice rewritten to match the now-enforced gate; `PlanLimits` extended with `maxLeads` + `aiMessageCreditsPerMonth`, Free tightened to 100/50/5/0, Pro 50,000-credit pool. Owner panel `TiersView` is the SSOT for every plan-config knob (displayName, description, features, highlight, prices, trial days, LemonSqueezy variant ids monthly/yearly, all 8 limits) — edits propagate to runtime gates AND the same `PricingCard` the marketing /pricing page will consume. Idempotent migration `_migrations/2026_05_27_seedPlanLimitsExtensions.ts` backfills the new fields on existing rows. `variantToPlan()` rewritten DB-first with env-var fallback. See `SHIPPED.md` for the full row.

---

# 🟡 P1 — Next sprint window

## ✅ P1.1 — Stage 3-A session 3 (Proactive UX polish closeout) — SHIPPED 2026-05-27

`<FirstTimeTour id="chat-landing-v1">` mounted in `ChatLandingPane.tsx` with 3 steps tagged via `data-tour="landing-pulse" / "landing-actions" / "landing-chips"`; new shared `core/ai/lib/uploadAttachments.ts` (`useUploadAttachments` hook) — `ChatAttachButton.tsx` refactored to consume it; `AIQuickComposerCard.tsx` gained `isDragging` state + `dragDepthRef` + drag handlers + dashed-border "Drop to attach" overlay so click-attach + drag-drop share one upload pipeline; cross-template smoke pass clean (9/9 industry templates use only canonical `WIDGET_KEYS`). Closes the whole Stage 3-A as ✅ — see `SHIPPED.md`.

---

## ✅ P1.2 — Phase 2 deferred polish — SHIPPED 2026-05-27

`WarnModeBanner.tsx` (NEW) mounted in `DealDetailShell.tsx` between the header and tab body — renders an amber pill + missing-field list + 'Fill now' CTA when the pipeline policy is `warn` and the deal's current stage has unfilled required fields; CTA opens the existing `FillMissingFieldsDialog`. PipelineEditor `StageRow` gained an 'Advanced settings…' menu item that opens `StageAdvancedSettingsDialog` (4 inputs: stale-days, warning-days, isFinal switch, finalType select); `updateStage` mutation + ForAI twin extended to accept `warningAfterDays` / `isFinal` / `finalType` (clears finalType when isFinal flips off).

---

## ✅ P1.3 — P3 AI tool gaps G-1..G-7 — SHIPPED 2026-05-27

All 7 tools shipped + system-prompt verb routes + ForAI twins. **G-1** `change_pipeline` + `commit_change_pipeline` (twoStep, layers/pipelines.ts; `changePipelineForAI` twin extracts `changePipelineImpl`). **G-2** `reorder_field_definitions` (atomic, layers/fields.ts; `reorderForAI` twin). **G-3** `start_dm` (atomic, messaging/; `ensureDirectMessageForAI` twin). **G-4** `manage_conversation` (atomic with `mode: rename|archive|unarchive`, messaging/; conversations gained `renameForAI` / `archiveForAI` / `unarchiveForAI` twins). **G-5** `delete_note_category` + `commit_delete_note_category` (twoStep, layers/categories.ts; `removeForAI` twin). **G-6** `move_note_to_entity` (atomic, notes/; `setEntityForAI` twin). **G-7** `mark_all_notifications_read` (atomic, notifications/; tenant-scoped `markAllReadForAI` twin returns `{ updated: count }`). System prompt heuristic + verb-routing blocks updated for messaging / notes / pipelines / notifications.

---

## P1.4 — Capability roadmap deferrals (residual)

> **Source:** `AI-AGENT-CAPABILITY-AUDIT.md §6` final scorecard. The original 7-item list has been worked down. **D-5 (stage-template tool), `set_default_note_category` (atomic flip)** shipped 2026-05-27 — see `SHIPPED.md`. The 5 items below remain backlog because each carries a real blocker (UX decision, embedding-store infra, Resend digest scoping, streaming-patch protocol).

| ID | What | Why deferred |
|---|---|---|
| D-4 | Auto-note from file (after `analyze_file`, write a structured note to the right entity) | Needs UX decision on "which entity" when ambiguous. |
| W-3 | Auto-tag classifier (when a note is added, auto-suggest tags via embedding similarity) | Needs embedding store. **Design freeze: `docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md` §6.1** — ships as stage E.2. |
| W-5 | Weekly digest email (per-org Monday morning summary) | Resend wired (used for OTP); digest body + per-org opt-in + template editor is a separate ~1-day ship with two open product questions. |
| P-5 | Similarity / pattern matching (find leads similar to my best closed deals) | Needs embedding store. **Design freeze: `docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md` §6.2** — ships as stage E.3. |
| Bulk-progress mid-flight chunked streaming | Stream `commit_bulk_*` progress as chunks while the loop runs | Needs streaming-patch protocol on `aiMessages` (architecture change to the patch shape). |

---

## P1.5 — Low-priority polish (residual)

> Originally 4 rows; **T12, C.4, C.5, and the custom-field BEFORE/AFTER diff** all shipped 2026-05-27 — see `SHIPPED.md`. Section retained as a placeholder; new low-priority polish rows land here when they surface.

_(no pending items)_

---

## ✅ P1.6 — TASKS-RENAME closeout sweep (G1–G21) — SHIPPED 2026-05-27

All 21 gaps closed across A+B+C: critical runtime gaps G1–G3 + G15 shipped 2026-05-27 (see `SHIPPED.md` "TASKS-RENAME-PLAN.md retired"); G4–G14 shipped 2026-05-27 as P1.6.A+B (`autoFollowupOnStageMove` → `autoTaskOnStageMove` + idempotent rename migration; notification keys `reminder_due/_overdue` → `task_due/_overdue` + idempotent migration; legacy `followupDefaults` fallback dropped; `convex/tasks-hardening.test.ts` 30 tests + `convex/tasks-tools.test.ts` 11 tests + 2 frontend test files); G16–G21 doc/cosmetic SSOT polish shipped 2026-05-27 as P1.6.C — see `SHIPPED.md` "P1.6.C (G16–G21) doc/cosmetic SSOT polish + P1.1". `aiNextActions.reasonCode` rename remains deferred → `Future-Enhancements §F.1`.

---

# 🟢 P2 — Backlog (full context preserved)

## P2.1 — AI architecture & memory backlog

### B.20 — Cross-conversation AI learning (embedding-based memory)

**What it does:** AI remembers latent patterns across conversations ("this user always asks for short replies", "this user tags every lead with `@hot`") without being explicitly told. Complements `aiPersonaContext` which captures explicit facts the model writes; this card captures observed behaviour.

**Why deferred:** real cross-chat learning needs an embedding store, a quarantined summarisation worker that runs after each conversation, and a careful safety review (we must NEVER store PII in the persona).

**Implementation sketch:**
1. New `aiObservations` table (orgId, userId, observation, confidence, ts) — capped at 200 rows / user via FIFO eviction.
2. After each chat completes, a quarantined LLM action reads the conversation + the current `aiPersonaContext` and emits either a `keyFacts` patch or an observation.
3. `buildSystemPrompt` reads top-N observations by confidence, includes them under `## Observed patterns` (clearly labelled "may be wrong, ask if you're unsure").
4. User-facing toggle in Settings → AI: "Let the AI learn from our conversations" (off by default; opt-in).

**Acceptance:** two-conversation scorer test where conversation 1 establishes "I prefer one-line replies", conversation 2 verifies the AI honours it without being re-told.

### B.21 — AI workflow integration (Inngest + activityLogs event bus)

**What it does:** AI is currently chat-only. This adds the asynchronous event side: when a deal moves stage, when a lead goes stale, when a reminder fires → AI suggests / summarises / acts.

**Files:** new `convex/workflows/` module, new `convex/ai/triggers.ts`, integration with Inngest (already provisioned).

**Implementation sketch:**
1. Define `workflows` schema (id, trigger, action, enabled, lastRanAt, …).
2. Inngest function listens for `activityLogs` inserts, dispatches matching workflows.
3. Workflow actions: "summarise to slack", "create AI insight row", "send notification", "schedule reminder".
4. Per-org cost cap (workflow actions count against the org's AI budget).

**Acceptance:** end-to-end test — insert an `activityLogs` row of type `deal.stage.moved` → workflow fires → an `aiInsights` row appears with the AI's analysis.

---

## P2.2 — Onboarding / data import backlog

### B.11 — Multi-entity CSV import (contact / company / deal twins)

**What it does:** Phase 1 shipped CSV import for `lead` only. The schema's `targetEntity` union already accepts `lead | contact | company | deal`. This card extends to all 4.

**Files:**
- `convex/crm/entities/{contacts,companies,deals}/mutations.ts` — add `bulkInsertFromCsvImpl/Import/ForAI` per entity.
- `convex/_shared/dedup.ts` — entity-specific candidate shapes (companies dedup by domain, deals by `(stage, value, personCode)`).
- `convex/ai/tools/layers/csvImport.ts` — widen `TARGET_ENTITY` enum from `["lead"]` to all 4.
- `convex/ai/quarantined/csvParser.ts` — drop the Phase-1 short-circuit.

**Acceptance:** 3 new scorer tests, one per entity. Manual: import a real contacts CSV → preview → commit → rows land in the right table.

### B.12 — CSV preview per-row dedup-decision override UI

**What it does:** today the parser's dedup decisions (insert/merge/skip) are read-only in the preview. This adds inline buttons to flip each row's decision before approval.

**Files:**
- `convex/ai/csvImports.ts` — new `patchRowDecision` orgMutation `{csvImportId, idemKey, decision}`.
- `core/ai/components/preview/CsvImportPreviewCard.tsx` — add inline `Skip` / `Insert` / `Merge` buttons; `withOptimisticUpdate` for instant flip.

**Acceptance:** vitest covering the click-flip flow. Manual: open a preview with a wrong dedup call, click to flip, approve, confirm row landed.

### B.13 — CSV mapping editor in the preview card

**What it does:** today the parser's `guessHeaderMap` heuristic catches ~85% of real-world CSVs. Misses require re-exporting the file. This adds an inline mapping editor.

**Files:**
- `convex/ai/csvImports.ts` — new `patchMapping` orgMutation; flips status back to `parsing`.
- `convex/ai/quarantined/csvParser.ts` — re-extract using user-edited mapping.
- `core/ai/components/preview/CsvImportPreviewCard.tsx` — "Edit mapping" toggle exposing per-column `<select>` of canonical fields.

**Acceptance:** scorer test where parser is fed a CSV with `surname` instead of `lastName` and the mapping editor fixes it.

---

## P2.3 — Productivity / UX backlog

### B.1 — Streak widget (Phase 4 deferred from Phase 3A)

**What it does:** daily-active retention lever (Duolingo / Linear / Notion pattern). Reserved slot in dashboard registry; renders "Coming soon" today.

**Implementation sketch:**
1. New table `userDailyActivity` with `(userId, orgId, date)` unique index and `count` field.
2. Increment from any user-driven mutation (note add, deal move, reminder complete) — debounced once per day per user.
3. Cron: nightly `computeStreaks` walks `userDailyActivity` for the last 60 days and updates `users.streak = { current, longest, lastActiveDate }`.
4. Widget in `WIDGET_REGISTRY` slot `users.streak` — already reserved in productivity template.

### B.2 — Cmd+K global command palette

**What it does:** power-user accelerator — index all routes + entities + slash commands; respect locale; reuse `useEntityLabels`.
**Files:** `core/data-display/command-palette/MODULE.md` already drafts the design. Use `cmdk` library.

### B.4 — Markdown chat renderer with Shiki highlighting

**What it does:** suppress incomplete syntax until closing tag arrives during streaming; smooth animation decoupled from network bursts. Reference: Attio engineering blog cited in audit §2.3.
**Files:** `core/ai/components/markdown/Markdown.tsx`.

### B.5 — Bulk-update modal for kanban (UI for existing AI tools)

**What it does:** today bulk-update is AI-only ("close all deals with no activity for 30+ days"). This adds a UI surface.
**Files:** new `core/data-display/kanban/components/BulkActionsBar.tsx`.

### B.24 — Dashboard industry-awareness pass (templates' default widget set)

**What it does:** the existing 9 industry templates have pairwise-different `dashboardMetrics` arrays but the differences are mechanical (KPI keys + section keys). A real persona-driven re-rank: real-estate workspace leads with `pipeline.velocity` + open-house reminders + messaging; productivity workspace leads with `tasks.thisWeek` + `today.focus` + no pipeline.

**Files:**
- 9× `convex/crm/fields/templates/definitions/<industry>.ts` — write a persona paragraph at the top + re-rank `dashboardMetrics`.
- `core/shell/shell/views/dashboard/DashboardHomeView.tsx` — order-aware section rendering. Today the layout is fixed Row 1 / Row 2 / Row 3; needs to honour the array ORDER.
- New migration `convex/_migrations/2026_05_28_personaDashboardDefaults.ts` — for orgs whose `dashboardMetrics` exactly matches the OLD generic-default array, swap to the new persona default; otherwise no-op.

**Acceptance:** 9 contract tests (one per persona) — round-trip through `validateDashboardLayout` + UNIQUE first-paint shape vs `generic`.

### B.25 — Per-widget action shortcuts ("mark complete" / "open record" / inline AI compose)

**What it does:** widgets need inline shortcuts on populated AND empty states. User feedback (we1.png + we2.png): "the widgets have no proper todo and also the shortcut buttons like for followups to mark complete like that for all other widgets as well."

**Per-widget grid:**
| Widget | Empty-state | Populated per-row |
|---|---|---|
| `RemindersCard` | already has CTA | already has `<ReminderQuickComplete>` + needs "Open record" + on-hover "Reschedule" |
| `TodaySummaryCard` | n/a | per-row "Ask AI for next move" inline shortcut |
| `MessagesPreviewWidget` | shipped Stage 1 | per-row "Reply" + "Open thread" on hover |
| `WeekAheadWidget` | shipped Stage 1 | per-event "Mark done" + "Reschedule" + "Open" |
| `MiniCalendarWidget` | shipped Stage 1 | per-event-dot tooltip + click → details popover |
| `TimelineActivityWidget` | shipped Stage 1 | per-row "Open record" + on-hover "Show me what changed" via `sendChatPrefill` |
| `PipelineCard` | n/a | header "What changed today?" `sendChatPrefill` shortcut |

**Frontend test infra dependency:** the project doesn't yet have a shared `convex/react` mock for component-render tests. Establish one at `core/test-utils/mockConvex.tsx` and use across the new widget tests.

### B.26 — `AIQuickComposerCard` file attach (lazy-create-on-attach UX)

> See P1.1.B above (Stage 3-A session 3 polish). Listed here for completeness.

---

## P2.4 — Audit / governance backlog

### C.1 — Tree-shaped conversations (Attio Problem 1)

`aiMessages` is a flat list keyed by `(conversationId, createdAt)`. Editing a previous turn forks the conversation logically but not in storage. Audit §2.3 notes Attio went to a tree model. Effort: schema change + history-dropdown UI rewrite. Defer until user feedback says they want branching.

### C.2 — Per-org AI eval suite (Attio "defineAgentTestSuite")

Week 1 baseline scorer (5 tests) is the kernel. Full version: per-variant sweeps (different models / prompts / tools), cost + latency reporting, regression alerts. Effort: ~1 week to build the variant matrix + reporter.

### C.3 — Multi-tenancy: cross-org platform-admin AI (Phase 4)

Reserved for super-admin operations (e.g. "show me churn risk across all paying orgs", "list orgs with > 80% plan usage"). Schema is multi-tenant from day 1; the AI layer hasn't yet been pointed at the multi-org view. Tier A of the owner panel intentionally has zero org-content access (locked decision L7); revisit only if a clear, GDPR-safe use case appears — see `Future-Enhancements.md §B.31` (Tier B/C deferrals card).

### D.1 — MODULE.md compliance audit (process)

**Process:** quarterly walk every `core/*/MODULE.md`, `features/*/MODULE.md`, `convex/**/MODULE.md`. Confirm cards still reflect reality. Delete stale items, mark missing ones.

### D.2 — Migrate context summary back into version control

**Open question:** keep architecture docs as long-lived files in `/docs/architecture/` (current pattern) OR snapshot final phases into `.github/agents/base/context.md` before deleting phase docs. Decide before next phase doc cleanup.

---

# 🌐 Separate tracks (own-spec docs, kept verbatim)

## Marketing site / landing page

**Spec:** `LANDING-PAGE.md` (refreshed 2026-05-27 to reflect current shipped state).

**Build order:**
- M1-M3: Set up `app/(marketing)/` route group + host-routing middleware + write the homepage at `/`.
- M4-M6: `/pricing`, `/for-real-estate`, `/for-solopreneurs`, `/vs/{competitor}` (3-5 competitor pages).
- M7-M8: Blog (5-10 anchor MDX posts) + changelog.
- M9: SEO/AEO/GEO surface — `app/sitemap.ts` + `public/llms.txt` + `public/robots.txt` + JSON-LD per page.
- M10: Free Pro mechanic — `orgs.earlyAccessGrant` field + plan resolver + 4-email lifecycle.
- M11-M12: Real screenshots + Search Console + Plausible/PostHog.

**Effort:** 2-3 weeks for one developer (parallel track).

## Platform Owner Panel

**Status:** ✅ **ALL Stages 0–7 SHIPPED 2026-05-27.** No pending owner-panel work. See `SHIPPED.md` for the rollup; the per-stage spec doc was deleted on 2026-05-27 since every section is live in the codebase.

**Mount path:** `/${OWNER_PANEL_SLUG}/<section>` — env-configured slug rewritten to `/xowner/<section>` by middleware. The literal segment `xowner` is added to `RESERVED_SLUGS` so no org can grab it as a workspace slug.

**Five-layer gate (all live):** middleware slug match → `convexAuthNextjsToken()` → `fetchQuery(getOwnerProfile)` (super_admin role + `PLATFORM_OWNER_EMAILS` allow-list) → email-OTP cookie (HMAC-signed, 15-minute TTL) → `requirePlatformOwner(ctx)` on every Convex handler.

**Surfaces (Tier A v1 — all live):** Overview, Users, Tiers, Industries, Reserved slugs, Billing settings, Feature flags, AI context, AI keys, Audit log, Owner profile/settings (with Active OTP sessions + Recent logins). **Locked decision L7 — NO org-content access**, NO org list, NO impersonation.

**Tier B / Tier C deferrals** (10 items) live as one consolidated card in `Future-Enhancements.md §B.31` — tool runbook overrides editor, Convex env-vars editor, LemonSqueezy / Razorpay webhook console, waitlist viewer, DB-backed owner allow-list + invite flow, TOTP / WebAuthn for owner login, cross-org analytics, Convex / Sentry insight feed inside the panel, per-user tier (subscription decoupled from org). None block public launch.

---

# How to use this file

1. **Anything in here is verified pending** as of 2026-05-27. If you ship a section, move its 1-line summary to `SHIPPED.md` and DELETE the section here in the SAME edit (per AGENTS.md → "RULE: Doc cleanup at every commit").
2. **Anything not in here is shipped or out of scope.** Don't re-track work already in `SHIPPED.md`. Don't add work that contradicts a locked decision in `AGENTS.md`.
3. **When in doubt, scan the codebase.** This file is grounded by a code-scan; if the codebase says one thing and a doc says another, trust the codebase and update the doc. The 2 docs-drift items found during this consolidation (FollowUpsPanel mounted as EntityFollowups; FillMissingFieldsDialog already at `core/entities/_entities/deals/components/`) were already silently shipped.
4. **Cross-references retained:** `LANDING-PAGE.md`, `AGENTS.md`, `SHIPPED.md`, every `core/*/MODULE.md`, every `convex/**/MODULE.md`, every `docs/architecture/*`. Everything else at the repo root that previously tracked progress has been collapsed into this file. Per-module STATE.md files were retired on 2026-05-27 — their pending items live in `Future-Enhancements.md` §H. The `PLATFORM-OWNER-PANEL.md` + `INDUSTRY-TEMPLATES-DB-MIGRATION.md` spec docs were deleted on 2026-05-27 once their stages shipped.
