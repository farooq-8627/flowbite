# SPRINT-PLAN.md — Audit-driven sprint, sized for single-session AI work

> **Generated:** 2026-05-26 from `AI-AUDIT-COMPLETE.md` (51 actionable gaps), `DASHBOARD-AUDIT.md` (3 stacked bugs + 4 missing widgets), `AI-AGENT-CAPABILITY-AUDIT.md` (5.8/10 → senior-CRM bar).
>
> **How to use this file.** Each stage below is a **drop-in prompt**. To start a stage, paste the block under "Prompt — copy from here" verbatim. Each stage is sized so an AI agent can execute it cleanly in a single session without context overflow. After each stage ends, you can compact / clear the chat and start the next stage fresh — the prompt is self-contained.
>
> **Order matters.** Stages 1 → 4 close the reactive parity gap (the user can't tell the AI from the UI). Stages 5 → 9 layer on proactive / analytical / autonomous / creative behaviours. Stage 10 is the hardening + docs pass that ships the whole sprint.
>
> **Status tracking.** Each stage exits with the doc-cleanup rule applied: shipped tasks → one-line `✅` summary, pending tasks → full context preserved. The phase-rollup happens only when ALL stages 1-10 ship.

---

## 🚦 Pre-sprint readiness — AI tool template confirmed production-grade (2026-05-26)

Before stage 1 starts, the AI tool / widget template was scanned end-to-end. **Verdict: ready.** New tools plug in with zero plumbing changes.

| Check | Status | Evidence |
|---|---|---|
| `ToolDef` shape supports structured `instruction` (whenToCall, whenNotToCall, preflight, requiredClarifications, synonyms, goodExample, badExample) | ✅ | `convex/ai/toolRegistry.ts:ToolInstruction` + `buildToolDescription` |
| `runbook` injected into system prompt only for active tools (token-cost scales with active layers, not total registry) | ✅ | `toolRegistry.ts:getActiveRunbooks` |
| Two-step approval — propose card + commit handler + zod-strip on resume | ✅ | `tools/crud/createLead.ts` (canonical reference) + `orchestrator/resume.ts` |
| `*ForAI` auth-bridge is automatic — `toolMutation` rewrites paths + injects trusted `userId` | ✅ | `tools/_shared.ts:aiPath` + `toolMutation` |
| `ToolSummary` envelope (headline + table + facts + **suggestedNext chips** + cardFields) for proactive UX | ✅ | `tools/_shared.ts:ToolSummary` — see Constraint F below |
| `ToolDisplay` discriminated union for live entity rendering | ✅ | `tools/_shared.ts:ToolDisplay` |
| Widget registry is pure-data and Convex-importable (no React deps) | ✅ | `convex/_shared/widgetRegistry.ts` + `WIDGETS` catalogue |
| `resume.ts` handles three branches: twoStep commit, ask_user_choice, ask_user_input — new tools route automatically | ✅ | `orchestrator/resume.ts` |
| Friendly error recovery via Zod-error formatter with auto-injected working examples | ✅ | `orchestrator/zodErrorFormatter.ts` + `wrapWithZodErrorFormatter` in registry |
| Telemetry on every tool call (start / result / error / finish) | ✅ | `orchestrator/streamLoop.ts:recordToolEvent` |

### Constraints that apply to EVERY stage prompt below

- **Constraint F — Every new write tool MUST populate `ToolSummary.suggestedNext`** with 2-4 stage-aware chips that prefill the chat composer. This is the **proactive surface** — `commit_create_lead` already does it ("Add follow-up", "Log call note", "Convert to contact"). Without `suggestedNext`, the user gets a green tick and nothing else, and the senior-CRM-specialist promise breaks. Add a registry test in Stage 10 that fails if any `commit_*` or atomic write tool returns no `suggestedNext`.
- **Constraint G — Every new tool MUST set `instruction` (the structured shape)**, NOT free-form `description`. `buildToolDescription` regenerates the description string deterministically. Free-form `description` is the back-compat fallback — new tools never rely on it.
- **Constraint H — Per-tool reliability is surfaced to the model on every turn (Stage 5 onwards).** When `getOrgUsage` exposes `perTool.successRate`, `systemPrompt.ts` injects "Reliability hint: tool X has been failing 50% of the time today — prefer Y if applicable" into the prompt. Reduces wasted retries.
- **Constraint I — Per-tool LLM cost ceiling (Stage 7+).** Tools that call subagents (`analyze_metric`, `cohort_analysis`, `draft_proposal`) declare a `costClass` ∈ `{cheap, normal, expensive}` on the `ToolDef`. The orchestrator's `quotaGate` enforces a per-class budget per org per day. Org gets a clear "Daily expensive-tool budget exhausted" message instead of silent failure.

These four constraints are reproduced in every stage prompt below.

---

## How every stage exits (universal exit criteria)

Every stage MUST end with these checks **green for the WHOLE repository, not just changed files**:

```
pnpm typecheck                 → 0 errors
pnpm exec biome check .        → 0 errors / 0 warnings / 0 infos
pnpm test                      → all pass (Convex tests)
pnpm exec vitest run           → all pass (frontend tests)
pnpm build                     → success on ALL routes
```

If any of these fail, the stage is NOT done — fix and re-verify before marking ✅. No "I'll clean it up later" — the cheapest fix is now.

**Doc cleanup contract** (per `AGENTS.md → "RULE: Doc cleanup at every commit"`):

- Every shipped task in this sprint plan collapses to a one-line ✅ summary in this file in the same edit.
- Pending tasks keep full context (sub-bullets, file paths, code sketches).
- `core/ai/STATE.md`, `PHASE-3-AI-AUDIT.md`, `Future-Enhancements.md` are updated in the same change.
- No backward-compat / stale-code residue. If a tool, type, or table field is replaced, the old version is **deleted**, not deprecated. Migrations run in the same edit.
- Migrations (when needed) live in `convex/_migrations/<YYYY_MM_DD>_<descriptive>.ts`, idempotent, run via Convex dashboard or `npx convex run` and verified. Verification line goes in the response.

**Source-of-truth contract** (per `AGENTS.md → "ABSOLUTE RULE — NO TRAINING DATA"`):

- Every code pattern is grounded in either (a) existing code in this repo (cite file:line), (b) Convex docs via Firecrawl, or (c) a real production codebase via GitHub MCP. Cite sources at the end of every response.
- Read `convex/_generated/ai/guidelines.md` BEFORE writing any Convex code (per the convex-ai-start block in AGENTS.md).
- Read `core/ai/STATE.md` + this file's previous-stage entries BEFORE starting a stage.

---

## ✅ Stage 1 — Dashboard fix wave — SHIPPED 2026-05-26

`convex/_shared/widgetRegistry.ts` extended from 12 KPI-only `WIDGET_KEYS` to 25 entries covering every section + KPI + placeholder key the industry templates legitimately reference. `LEGACY_KEY_RENAMES` collapses `calendar.miniWidget` → `calendar.mini`; idempotent migration `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` rewrites legacy aliases (dev run: scanned 1, patched 0 — already canonical). All 9 industry templates use only registered keys; `MessagesPreviewWidget` / `TimelineActivityWidget` / `WeekAheadWidget` now render CTA cards instead of `null` on empty (mirrors `<NextReminderFallback />` pattern); `MiniCalendarWidget` gained a "+ Schedule" header CTA; `TimelineFeed.emptyState` extended with optional `action.chatPrefillIntent`; `DashboardHomeView`'s `RemindersCard` gate widened to honour `reminders.list`. The user's "reminders not showing" bug is fixed end-to-end. 32 widget contract tests added at `convex/ai/queries/widgets.test.ts` — every template's `dashboardMetrics` is now asserted to round-trip through `validateDashboardLayout` with zero rejects. Full repo verification: `pnpm typecheck` 0 errors, `pnpm exec biome check .` 0/0/0, `pnpm test` 285 pass / 1 skipped, `pnpm exec vitest run` 140 pass, `pnpm build` success.

---

## ✅ Stage 2 — Messaging tool wave — SHIPPED 2026-05-26

5 new AI tools shipped in `convex/ai/tools/messaging/` (`send_message` + `commit_send_message`, `list_messages`, `mark_thread_read`, `add_participants` + commit, `remove_participant` + commit). Per AGENTS.md non-negotiable rule, every public mutation/query the tools call has a same-file `*ForAI` twin: `messages/mutations` (`sendForAI`, `updateForAI`, `removeForAI`, `toggleReactionForAI` — bodies extracted to `*Impl` helpers); `messages/queries` (`listForConversationForAI`, `listForEntityForAI`, `listForPersonForAI`, `listInboxForAI`); `conversations/mutations` (`ensureForEntityForAI`, `addParticipantsForAI`, `removeParticipantForAI`, `leaveForAI`, `updateNotificationLevelForAI`, `markReadForAI`); `conversations/queries` (`listForUserForAI`, `getUnreadCountForAI`, `getForEntityForAI`). `sendForAI` defaults `authorType` to `"ai"` so activity-log + notification fan-out attribute correctly. Layer wired into `LayerId` + `LAYER_DESCRIPTIONS` + `expand_tools` enum (`convex/ai/toolRegistry.ts`), `ALL_LAYERS` (run.ts + resume.ts + introspect.ts + systemPrompt.ts), heuristic tool-name → layer map for the runbook block, and `bindAllToolContexts` (toolContextBinder.ts). System prompt gained a `## Messaging` section with verb-based routing (send/message/tell → `send_message`; record/log/note → `add_note`; remind → `create_followup`) + targeting rules (one-of `personCode` / `dealCode` / `companyCode` / `conversationId`). 8 contract tests added at `convex/ai/tools/messaging/messaging.test.ts` exercising the ForAI auth gate + body parity + idempotency + member visibility. Closes the user's #1 reactive gap (the "AI calls add_note when I asked it to send a message" complaint). Full repo: typecheck 0 errors, biome 0/0/0, 293 backend tests pass / 1 skipped, 140 frontend tests pass, build green.

---

## ✅ Stage 3 — Reactive parity P1 wave — SHIPPED 2026-05-26

8 new AI tools shipped covering the P1 reactive gaps: `delete_entity` + `commit_delete_entity` (twoStep, universal — routes to the right `softDeleteForAI` for lead/contact/company/deal, or `removeForAI` for note/reminder); `update_reminder` + `commit_update_reminder` (twoStep, accepts `followUpCode` or raw `reminderId`); `update_note` + `commit_update_note`, `delete_note` + `commit_delete_note`, `pin_note` (atomic), `set_note_category` (atomic); `add_person_to_company` + commit, `remove_person_from_company` + commit (twoStep, idempotent). Per AGENTS.md non-negotiable rule, every backing public mutation got a same-file `*ForAI` twin: `leads/mutations` (`softDeleteForAI`), `contacts/mutations` (`softDeleteForAI`), `deals/mutations` (`softDeleteForAI`), `companies/mutations` (`softDeleteForAI`, `addPersonForAI`, `removePersonForAI`), `notes/mutations` (`updateForAI`, `togglePinForAI`, `setCategoryForAI`, `removeForAI`), `reminders/mutations` (`updateForAI`, `removeForAI`) — bodies extracted to `*Impl` helpers so public + ForAI cannot diverge. New internal query `convex/ai/queries/cascadeImpact.ts:getEntityCascadeImpact` powers the universal `delete_entity` propose card with cascade counts ("this will trash 3 deals + 2 notes + 1 reminder"). Layer load: tools ship in the `always` layer (these are everyday CRUD ops, not gated behind `expand_tools`); 3 new file-scoped contexts (`notes/_context.ts`, `scheduling/_context.ts`, `companies/_context.ts`) wired into `bindAllToolContexts`. System prompt gained Stage-3 verb-routing blocks for Notes / Reminders / Companies / universal deletion. 12 ForAI contract tests at `convex/ai/tools/stage3/stage3.test.ts`. `_shared/aiEntityPatch.ts` `resolveCodeToRecordForAI` widened to `QueryCtx | MutationCtx` so the cascade query can use it. Closes the user's "AI uses bulk_update_entities to delete things" + "AI can't push my reminder" + "AI can't add Sara to Acme" complaints. Full repo verification: typecheck 0 errors, biome 0/0/0, 305 backend tests pass / 1 skipped, 140 frontend tests pass, build success.

---

## ✅ Stage 4 — Reactive parity P2 wave — SHIPPED 2026-05-26

18 new AI tools shipped covering every P2/P3 reactive gap from `AI-AUDIT-COMPLETE.md §16`. Pipeline-stage edits via `update_pipeline_stage` + commit / `remove_pipeline_stage` + commit / `reorder_pipeline_stages` + commit / `set_default_pipeline` + commit (twoStep, all in `pipelines` layer; `update_pipeline_stage` propose surfaces deals-affected count). Lead status moves via atomic `move_lead_status` (mirrors `move_deal_stage`; in `pipelines` layer for verb-routing parity). Closed-deal recovery via `reopen_deal` + commit (twoStep — clears wonAt/lostAt, restores to default stage, rebalances org stats). Tag/view edits via atomic `update_tag` (in `tags` layer; rename + colour) and atomic `update_saved_view` (in `views` layer). New `files` layer with `list_files` (read; routes by personCode/dealCode/companyCode/raw scope) + `update_file_tags` + commit + `remove_file` + commit (twoStep, soft-delete). New `timeline` layer with `list_org_timeline` (read; org-wide activity feed, optional `actorType` filter for "what did the AI do today?"). New `notifications` layer with `list_notifications` + atomic `mark_notification_read` (folded P3 from §16 row 17). Custom-role CRUD added to existing `members` layer: `resend_invitation` + commit + `create_custom_role` + commit + `update_custom_role` + commit + `delete_custom_role` + commit (twoStep). Per AGENTS.md non-negotiable rule, every backing public mutation/query gained a same-file `*ForAI` twin: `pipelines/mutations` (`updateStageForAI`, `removeStageForAI`, `reorderStagesForAI`, `setDefaultStageForAI`, `updateForAI`, `deletePipelineForAI` — bodies extracted to `*Impl` helpers); `tags/mutations` (NEW public `update` + `updateForAI` — was missing entirely from the public API); `savedViews/mutations` (`updateForAI`); `files/queries` (`listByScopeForAI`, `listForEntityForAI`); `files/mutations` (`updateTagsForAI`, `removeForAI`); `orgRoles/mutations` (full rewrite with `createImpl`/`updateImpl`/`removeImpl` + 3 ForAI twins on the `authenticatedMutation` model — gated on `members.changeRole`); `orgRoles/queries` (`listForAI`); `timeline/queries` (`getForOrgForAI`, gated on `activityLogs.viewOrg`); `invitations/mutations` (NEW public `resend` + `resendForAI` — regenerates token, extends expiresAt, schedules sendInvitationEmail action); `deals/mutations` (NEW public `reopen` + `reopenForAI` — clears wonAt/lostAt, restores to default-or-first-non-final stage, rebalances `deals.open` / `deals.pipelineValue` / `deals.won` / `deals.lost` org stats); `notifications/queries` (`listMineForAI` — bridges per-user index with org filter for cross-tenant safety); `notifications/mutations` (`markReadForAI` — idempotent, refuses cross-tenant calls). Layer-load wiring extended through every enumeration site: `LayerId` union (toolRegistry.ts), `LAYER_DESCRIPTIONS`, `expand_tools` enum + description, `ALL_LAYERS` (run.ts + resume.ts + introspect.ts), `ALL_KNOWN_LAYERS` + heuristic tool→layer map (systemPrompt.ts), `bindAllToolContexts` (toolContextBinder.ts), and the layer barrel (`tools/layers/_index.ts`). System prompt gained a `## Pipelines / Files / Timeline / Roles / Notifications / Tag-view edits` block with verb-driven routing rules ("rename / recolour stage" → `update_pipeline_stage`; "qualify L-007" → `move_lead_status`; "what did the AI do today" → `list_org_timeline`; "resend invite" → `resend_invitation`; "delete role" → `delete_custom_role` with auto-reassignment caveat). 14 ForAI contract tests at `convex/ai/tools/stage4/stage4.test.ts` exercising the auth gate, body parity, and edge cases (refuse-on-already-open, refuse-stage-with-deals, dup-tag-name, cross-tenant-no-op for notifications). After this stage the AI's reactive surface is at parity with the UI for the entire app — coverage by usage frequency moves from ~70% to ~95%. Full repo verification: `pnpm typecheck` 0 errors, `pnpm exec biome check .` 0/0/0, `pnpm test` 319 pass / 1 skipped (was 305; +14 stage4 tests), `pnpm exec vitest run` 140 pass, `pnpm build` success.

---

## ✅ Stage 5 — AI dashboard surface — SHIPPED 2026-05-26

3 new dashboard / settings surfaces shipped under the new `ai.quickComposer` + `ai.pulseRibbon` widget keys. `AIQuickComposerCard` is a pinned mini chat textarea (3 suggested intents — "summarise what changed today", "which leads should I follow up first?", "draft a follow-up note") that dispatches the new `flowbite:ai-chat-open` window event then `flowbite:ai-chat-prefill` so the side sheet slides in with the prompt ready to send. `AIPulseRibbon` is a top-3 highest-severity ribbon rendered ABOVE the metric strip — same `convex.ai.suggestions.list` heuristic source as the existing AISuggestionsPanel (no new subscription cost) but with per-user dismiss state in `users.preferences.aiPulseDismissed` (cap 50, drops oldest) via the new `api.users.mutations.dismissAiPulseSuggestion` authenticated mutation. `AIReliabilityCard` renders in **Settings → AI** under the Usage section as a per-tool table (callCount / successRate / avgDuration / top error reason) over a 7d / 30d / 90d window — drives Constraint H (the Stage 6+ "low-reliability tool hint" injected into the system prompt). `convex/ai/queries/telemetry.ts:getOrgUsage` extended with a new `reliability.perTool[]` block (capped at 50 entries) tracking `{toolName, callCount, successCount, errorCount, successRate, avgDurationMs, topErrorReason, topErrorCount}` aggregated from the existing `aiToolEvents` `by_org_and_started` index. `convex/_shared/widgetRegistry.ts` extended with the two new keys (category `ai`, size `full`); all 9 industry templates updated to opt them in. Idempotent migration `convex/_migrations/2026_05_26_addAiDashboardWidgets.ts` runs on existing org rows — inserts the new keys after `ai.morningBriefing` if present, otherwise prepends them; ran on dev (1 org patched, idempotent re-run reported `unchanged=1`). Schema gained `users.preferences.aiPulseDismissed: v.optional(v.record(v.string(), v.number()))`. Frontend chat-prefill bridge gained `openChatPanel()` + `useChatPanelOpenListener` (custom event `flowbite:ai-chat-open`); `DashboardLayoutClient.tsx` listens + idempotently flips state + persists the cookie. 15 contract tests at `convex/stage5.test.ts` covering widget metadata, telemetry reliability aggregation (success/failure/unknown error reasons), migration idempotency / dryRun / leading-AI-block insert, and the dismiss-mutation cap behaviour. `widgets.test.ts` extended with a per-template assertion that every template opts the new keys in. Full repo: `pnpm typecheck` 0 errors, `pnpm exec biome check .` 0/0/0, `pnpm test` 308 pass / 1 skipped (was 293; +15 stage5 tests), `pnpm exec vitest run` 140 pass, `pnpm build` success.

---

## Stage 6 — Proactive layer (next-actions + stale detector + anomaly alerts + confidence labels)

**Goal:** Move from reactive to proactive. After this stage, the AI surfaces "what to do next" without being asked, and every suggestion carries a confidence label + rationale.

**New tables / files:**
- Schema: `aiNextActions` `{ orgId, userId, recordKind, recordCode, score, confidence: "high" | "medium" | "low", reasonCode, reasonText, expiresAt, createdAt }`, indexed by `(userId, score desc)`. The `confidence` field closes capability-audit gap T-4.
- `convex/ai/queries/nextActions.ts` — heuristic ranking, scheduled every 30 min.
- `convex/ai/queries/anomalies.ts` — WoW deltas on pipelineValue / leadCount / dealCloseCount.
- `convex/ai/suggestions.ts` — extend the existing heuristic engine to emit `confidence` on every suggestion + a one-line `rationale`.
- `convex/crons.ts` — register the new crons.
- `core/ai/views/AINextActionsView.tsx` — full-screen "what should I do next?" view with filter by confidence.
- Dashboard wiring — AIPulseRibbon now reads from `aiNextActions` rather than the suggestion engine; renders the confidence pill next to each suggestion.

---

### Prompt — copy from here ↓

```
Start Stage 6 of /SPRINT-PLAN.md — Proactive layer.

Pre-flight:
1. AGENTS.md — schema-migration rule.
2. /SPRINT-PLAN.md — Stage 6 entry. Stages 1-5 must be ✅.
3. /AI-AGENT-CAPABILITY-AUDIT.md §2.1 (P-1 / P-2 / P-3 / P-4).
4. core/ai/STATE.md — Senior-CRM Milestones table (Milestone B).
5. convex/ai/suggestions.ts (full).
6. convex/ai/briefingsActions.ts (full — cron pattern).
7. convex/crons.ts (full).

Tasks:
1. Schema: add aiNextActions table to convex/schema.ts.
   Migration 2026_05_27_addAiNextActions.ts — empty for new tables (just
   schema validator).
2. convex/ai/queries/nextActions.ts:
   - rankForUser(orgId, userId) — heuristic scoring: stale (lastActivityAt
     > 7d), high-value (deal amount > org median), reminder-due-soon (<48h),
     stage-stuck (>14d in stage).
   - rebuildAllForOrg(orgId) — internal action wrapping rankForUser for every
     active user. Materialises into aiNextActions; expires old rows.
3. Cron: convex/crons.ts — every 30 min: rebuildAllNextActions runs across
   all orgs (paginated).
4. convex/ai/queries/anomalies.ts — getOrgAnomalies(orgId, range="7d"):
   compares this week vs last week on the headline KPIs. Surfaces any KPI
   with > 10% absolute change.
5. Frontend: AIPulseRibbon now reads from aiNextActions (top 3 by score)
   instead of suggestions engine. Suggestions engine kept as fallback.
6. AINextActionsView at /{orgSlug}/ai/next-actions — full-screen ranked list.
   Each row has "Act on it" + "Dismiss" + "Snooze 7d".
7. AI tool: list_next_actions (read tool, in always-on layer). Lets the
   model surface them in chat too.
8. Tests: rank scoring is deterministic given fixed input; cron execution
   path doesn't blow up on empty orgs.
9. Doc cleanup:
   - /SPRINT-PLAN.md → flip Stage 6 row to ✅.
   - core/ai/STATE.md → flip Milestone B row to ✅; add new pending
     "AI insight panels" if any sub-feature deferred.
   - /AI-AGENT-CAPABILITY-AUDIT.md → flip §2.1 P-1/P-2/P-3 rows to ✅
     (Implemented — Stage 6); P-4/P-5 stay pending (Stage 7 + backlog).
   - Future-Enhancements.md → C.8 status → "Partial — Milestone B done
     Stage 6; Milestones C/D/E pending".

Verification: full repo green.

Constraints:
- aiNextActions cap per user: 100 rows. Older rows expire.
- The 30-min cron MUST gate via the existing AI quota gate so a busy org
  doesn't blow the AI budget.
- Heuristic ONLY this stage — no LLM calls. LLM commentary on anomalies is
  Milestone C (Stage 7).

Stop: full green + docs. ask_user: "Start Stage 7" / "Pause".
```

---

## Stage 7 — Analytical layer + Trace UI (analyze_metric + cohort + win/loss + pipeline-velocity + trace viewer)

**Goal:** Move from "stats" to "insights". After this stage, the AI explains *why*.

**New tools:** `analyze_metric`, `cohort_analysis`, `member_performance` (manager-gated), **`get_briefing`** (P3 — read tool surfacing the latest daily/weekly briefing on demand), **`refresh_briefing`** (P3 — atomic, rate-limited 5/min/user).
**New views:** Pipeline-velocity dashboard section, Trace viewer at `/{orgSlug}/ai/trace/:conversationId`.
**New cron:** `analyzeDealClose` — fires on `close_deal` commit; writes a structured retrospective note linked to the deal.

---

### Prompt — copy from here ↓

```
Start Stage 7 of /SPRINT-PLAN.md — Analytical layer + Trace UI.

Pre-flight:
1. AGENTS.md.
2. /SPRINT-PLAN.md — Stage 7 entry. Stages 1-6 must be ✅.
3. /AI-AGENT-CAPABILITY-AUDIT.md §2.2 + §2.5 T-1.
4. convex/ai/queries/telemetry.ts — getOrgUsage shape.
5. convex/ai/orchestrator/streamLoop.ts — recordToolEvent path (trace data
   source).
6. convex/crm/entities/deals/mutations.ts — close mutation hook.

Tasks:
1. Schema additions:
   - aiCohortReports { orgId, kind: "leadSource" | "industry" | "owner",
     periodStart, periodEnd, rows: [{key, count, conversionRate,
     avgDealValue, …}], generatedAt }.
   - aiInsights { orgId, kind, recordRef?, body, confidence, createdAt }.
   Migration: schema validator only (new tables).
2. analyze_metric tool — twoStep. propose returns "I'll analyse {metric}
   over {range}, looking at top contributors and outlier records." commit
   fetches underlying records, runs an LLM narrative pass (subagent), writes
   to aiInsights, returns the insight.
3. cohort_analysis tool + cron rebuild nightly. Writes to aiCohortReports.
4. member_performance tool — gated on org.manage OR
   members.viewPerformance. Same shape.
5. Win/loss reasoning: hook into close_deal commit → ctx.scheduler.runAfter
   schedules an analyzeDealClose action. Writes a structured note linked to
   the deal (categoryId="winLoss"). Add the category if absent.
6. Pipeline-velocity dashboard section: convex/ai/queries/pipelineVelocity.ts
   computes avg days-in-stage + dropoff per stage. New widget
   PipelineVelocityCard. Register in WIDGET_KEYS.
7. Trace viewer: app/[locale]/[orgSlug]/ai/trace/[conversationId]/page.tsx
   thin wrapper → core/ai/views/AIToolTraceView.tsx renders the
   aiToolEvents chain for the conversation in step order.
8. AIReliabilityCard from Stage 5 — wire the "view trace" link.
9. Tests: deterministic snapshot for analyze_metric on a seeded org;
   cohort cron doesn't fail on empty data; trace view renders given a
   sample conversation.
10. Doc cleanup:
    - /SPRINT-PLAN.md → flip Stage 7 row to ✅.
    - core/ai/STATE.md → flip Milestone C row to ✅.
    - /AI-AGENT-CAPABILITY-AUDIT.md → flip §2.2 A-1..A-5 rows to ✅
      (where applicable); flip §2.5 T-1 to ✅.

Verification: full repo green.

Constraints:
- Per-org LLM cost cap: analyze_metric quota-gated (1 call/min, 10/day per
  org by default — adjustable via plan limits).
- Structured-output schema: every LLM-generated insight is parsed against a
  zod schema before write. No raw markdown into aiInsights.body — only
  parsed structure.
- Trace UI is read-only; no mutations. RBAC: same as conversations
  (org member).

Stop: full green + docs. ask_user: "Start Stage 8" / "Pause".
```

---

## Stage 8 — Autonomous layer (Standing Orders + auto-actions + autonomy allow-list)

**Goal:** Cron-driven LLM workflows. After this stage, "every Monday at 9 AM, scan stale leads and create followups" is a real feature.

**New tables:** `aiStandingOrders { orgId, userId, schedule (cron), prompt, allowedTools[], lastRunAt, lastRunSummary, enabled }`.
**New per-user pref:** `users.preferences.aiAutonomy: { autoFollowupOnStaleLead, autoEnrichOnContactCreate, autoTagOnNote, … }`.
**New triggers:** Stage-move auto-followup (extends `pipelineStages.onEnter`); contact-create auto-enrich (already plumbed).
**Followup cadence per stage (P-4):** Each `pipelineStages` row gains optional `defaultFollowupAfterDays` (number) + `defaultFollowupTemplate` (string). When a deal sits in a stage longer than the cadence AND the user has enabled `aiAutonomy.autoFollowupOnStageStuck`, schedule `create_followup` automatically. Closes capability-audit gap P-4.

---

### Prompt — copy from here ↓

```
Start Stage 8 of /SPRINT-PLAN.md — Autonomous layer.

Pre-flight:
1. AGENTS.md — RBAC + audit trail rules.
2. /SPRINT-PLAN.md — Stage 8 entry. Stages 1-7 must be ✅.
3. /AI-AGENT-CAPABILITY-AUDIT.md §2.3 (W-1..W-6) + §2.5 T-5.
4. convex/ai/briefingsActions.ts (cron pattern).
5. convex/ai/orchestrator/run.ts (the loop a standing order will drive).

Tasks:
1. Schema:
   - aiStandingOrders table with schedule (cron expr), prompt, allowedTools.
   - users.preferences.aiAutonomy map (per-user opt-ins).
   - pipelineStages.onEnter optional config { autoFollowupTemplate?,
     autoFollowupAfterDays? }.
   Migration: 2026_05_28_aiStandingOrders.ts — schema validator only.
2. Standing-orders runner: convex/ai/standingOrders/runner.ts. Cron evaluator
   at convex/crons.ts that checks every aiStandingOrders row on the minute and
   schedules runner.run when the schedule matches.
3. runner.run executes the prompt with restricted-tool subset
   (allowedTools[]); writes lastRunSummary; emits aiToolEvents for audit.
4. Settings UI at /settings?group=ai-automation:
   - Standing-orders editor (CRUD).
   - aiAutonomy toggles (auto-followup, auto-enrich, auto-tag, weekly digest).
5. Auto-followup on stage move: hook deal/lead update mutation; if
   pipelineStage.onEnter is set AND user.aiAutonomy.autoFollowupOnStageMove
   is true, schedule create_followup.
6. Auto-enrich on contact-create: schedule enrich_record if domain/phone is
   present AND user.aiAutonomy.autoEnrichOnContactCreate is true.
7. Permission catalog: add ai.automation.manage. Owner+Admin defaults.
8. Audit: every autonomous tool call writes aiToolEvents with
   triggeredBy: "standingOrder:<id>" or "automation:<key>".
9. Tests: cron evaluation matches schedule; standing-order runner respects
   allowedTools whitelist; aiAutonomy off → no auto action.
10. Doc cleanup:
    - /SPRINT-PLAN.md → flip Stage 8 row to ✅.
    - core/ai/STATE.md → flip Milestone D row to ✅.
    - /AI-AGENT-CAPABILITY-AUDIT.md → flip §2.3 + §2.5 T-5 to ✅.

Verification: full repo green.

Constraints:
- Standing orders gated on the new ai.automation.manage permission.
- Per-org cost cap: standing-order LLM calls count against the AI quota
  gate; if exhausted, the runner skips with a logged reason.
- aiAutonomy is OPT-IN (default false on every key) so existing orgs see
  no surprise behaviour.
- Audit trail is mandatory — never call a write tool from a standing order
  without writing a triggeredBy field on aiToolEvents.

Stop: full green + docs. ask_user: "Start Stage 9" / "Pause".
```

---

## Stage 9 — Creative layer (draft_message + draft_proposal + summarise_conversation + web_scrape)

**Goal:** Offload writing as well as logistics.

**New tools:** `draft_message`, `draft_proposal`, `summarise_conversation`, **`web_scrape`** (extracts content from a URL via Firecrawl-scrape so the model can ground a draft in a real source — pairs with the existing `web_search` tool).

---

### Prompt — copy from here ↓

```
Start Stage 9 of /SPRINT-PLAN.md — Creative layer.

Pre-flight:
1. AGENTS.md.
2. /SPRINT-PLAN.md — Stage 9 entry. Stages 1-8 must be ✅.
3. /AI-AGENT-CAPABILITY-AUDIT.md §2.4.
4. Stage 2 send_message tool (draft_message pairs with it).
5. convex/crm/fields/templates/* (proposal template lives here).

Tasks:
1. draft_message tool — twoStep. Args: { entityCode | personCode,
   intent: "follow-up" | "thank-you" | "custom", customPrompt? }.
   propose returns the structured draft (subject + body + suggested
   send_message args). User approves → either send via send_message or
   "Edit before sending" returns the draft into the chat composer.
2. draft_proposal tool — twoStep. Args: { dealCode }. Combines deal +
   line items + org persona + template into a proposal markdown.
3. summarise_conversation tool — read tool. Args: { conversationId |
   personCode + range }. Calls listForPersonForAI from Stage 2; runs
   subagent summariser; returns 3 bullets + open-action items.
4. Update systemPrompt.ts: when user says "draft" / "write" / "compose",
   prefer the draft_* tools over add_note.
5. Tests: deterministic snapshot for each draft tool given a seeded org.
6. Doc cleanup:
   - /SPRINT-PLAN.md → flip Stage 9 row to ✅.
   - core/ai/STATE.md → flip Milestone E row to ✅.
   - /AI-AGENT-CAPABILITY-AUDIT.md → flip §2.4 to ✅.

Verification: full repo green.

Constraints:
- draft_* tools NEVER autosend. The user must approve via send_message.
- Quota-gated like analyze_metric — 5/min/user, 50/day/user by default.

Stop: full green + docs. ask_user: "Start Stage 10" / "Pause".
```

---

## Stage 10 — Hardening + edge-case coverage + final sprint cleanup

**Goal:** Close every remaining edge-case gap from the audits, run the production-readiness sweep, and roll up the sprint.

**Files in scope:**
- Bulk progress streaming (CapabilityAudit §3 Bulk row).
- Adversarial file sanitisation (§3 File analysis row, P1 security gap).
- CSV encoding heuristic improvements + date EU/US disambiguation prompt.
- Enrichment provider failure recovery tests.
- Final sprint roll-up: phase rollup paragraph in PHASE-3-AI-AUDIT.md, drop the per-stage table, score 99 → 99.5 (or 100 if billing wall is in scope this stage too — see "Stretch goal" below).

---

### Prompt — copy from here ↓

```
Start Stage 10 of /SPRINT-PLAN.md — Hardening + edge-case coverage + sprint
roll-up.

Pre-flight:
1. AGENTS.md — Doc cleanup rule, especially the phase-rollup template.
2. /SPRINT-PLAN.md — every Stage 1–9 row should be ✅.
3. /AI-AGENT-CAPABILITY-AUDIT.md §3 (the every-edge-case matrix).
4. /AI-AUDIT-COMPLETE.md §14 (half-baked tools).
5. core/ai/STATE.md — every pending row.
6. PHASE-3-AI-AUDIT.md — §2 + §3 scorecard.

Tasks:
1. Bulk progress streaming. bulk_update_entities + bulk_close_deals: chunk
   in 50-row batches; emit a streamed progress patch on the parent message
   per batch. Update agent-scorer test for bulk.
2. Adversarial file sanitisation. Sanitise the extracted text from
   analyze_file BEFORE storing or rendering. Use a known-safe sanitiser
   (DOMPurify on the frontend; structured zod parse on the backend). Add a
   security test for an XSS-laden PDF fixture.
3. CSV encoding + date heuristic. Detect BOM / Latin-1; on date ambiguity
   (DD/MM vs MM/DD), surface a "which date format?" pick in the import
   preview card. Add encoding fixture tests.
4. Enrichment provider failure recovery. Add explicit 401/429/500 handling
   per provider with friendly error mapping. Test fixtures for each.
5. Trace UI from Stage 7 — extend with cost + tokens per step.
6. Per-tool reliability score from Stage 5 — surface in the AI Pulse Ribbon
   on dashboard ("low reliability tool: enrich_record").
7. Sprint roll-up:
   - /SPRINT-PLAN.md → if every stage row is ✅, replace the whole sprint
     section with one paragraph: "✅ AI/Dashboard sprint — SHIPPED
     2026-MM-DD. Reactive parity → 95%, AI dashboard surface, proactive +
     analytical + autonomous + creative layers, hardening + traces. See git
     log <range>." Per-stage ✅ lines deleted.
   - core/ai/STATE.md → Status line moves to "Stage 10 complete; AI agent
     at senior-CRM bar (~9/10 overall)".
   - PHASE-3-AI-AUDIT.md → roll up §2.0 sprint table to a one-paragraph
     entry. Score 99 → projected 99.5. Update §3 scorecard rows for
     Proactive / Analytical / Autonomous / Creative.
   - Future-Enhancements.md → flip C.6/C.7/C.8 to ✅ Implemented; Additions
     log table gets one closing row.
   - AI-AUDIT-COMPLETE.md → §15 totals updated; AI coverage now ~95% by
     usage frequency.
   - DASHBOARD-AUDIT.md → §6 backend/frontend/tests checklists all ticked.
   - AI-AGENT-CAPABILITY-AUDIT.md → §6 final scorecard updated; §7 one-liner
     becomes "We have built a senior CRM specialist."
8. Production sweep: full repo green, run `pnpm exec next build` once with
   ANALYZE=true to confirm bundle size hasn't ballooned.
9. ask_user with two choices: "Sprint complete — start Phase 4 Part 3
   billing wall (T9)" / "Pause".

Verification (full repo, no exceptions):
  pnpm typecheck           → 0 errors
  pnpm exec biome check .  → 0/0/0
  pnpm test                → all pass
  pnpm exec vitest run     → all pass
  pnpm build               → success
  npx convex codegen       → success (drift check)

Constraints:
- This stage MAY add deferred items to Future-Enhancements.md if any sub-
  task cannot ship in one session. Each deferral MUST follow the AGENTS.md
  rule (full card + Additions-log row + // DEFERRED comment + cross-ref).
- Phase rollup is FINAL — once the per-stage ✅ lines are deleted, the only
  durable record is git history + the rolled-up paragraph.

Stretch goal (only if everything else green AND user said "go further"):
ship Phase 4 Part 3 billing wall (T9) — LemonSqueezy webhook smoke test,
production signing-secret rotation playbook, per-variant feature-gate copy
on pricing card, trial flow, 3-day past_due grace. Score 99.5 → 100.

Stop: full green + sprint roll-up. ask_user: "Phase 4 Part 3 billing wall"
/ "Pause" / "End sprint".
```

---

## Final notes — universal across every stage

1. **Stage independence.** Every stage prompt is self-contained: the agent doesn't need chat history from previous stages. It only needs to read this file + the tracking docs + the audit docs.

2. **Compaction safety.** After each stage, you (the user) can `/clear` or `/compact` and start the next stage clean. The doc-cleanup contract guarantees the next stage's prompt has everything it needs.

3. **No backward-compat.** Per the user's directive: when something is renamed, the old version is deleted in the same edit. No deprecation aliases, no `// LEGACY:` comments, no parallel codepaths. Migration runs same edit.

4. **No partial work.** A stage doesn't end until full-repo verification is green. If a sub-task can't ship cleanly, it gets moved to a new card in `Future-Enhancements.md` with the full deferral metadata, and the stage exits clean.

5. **Source-of-truth attestation** at the end of every stage's reply, per the AGENTS.md "NO TRAINING DATA" rule.

6. **Ask, don't assume.** Each stage prompt's pre-flight is the floor, not the ceiling. If ambiguity surfaces (e.g. "should we keep `reminders.list` AND `reminders.dueToday` as siblings or pick one?"), use `ask_user` with concrete choices — never guess.
