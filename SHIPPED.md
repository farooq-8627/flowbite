# SHIPPED.md — Consolidated changelog (one-line summaries)

> **Generated:** 2026-05-27 by consolidating SPRINT-PLAN.md ✅ paragraphs, the 6 audit doc closeouts, Phase-2-progress.md rollups, and the Future-Enhancements.md Additions log.
>
> **Format.** One row per shipped scope. Each row: date · scope name · what shipped (one sentence) · key file paths. Detail lives in git history; this file is a fast lookup for "is X shipped already?".
>
> **Verification baseline (2026-05-27, post Stage 3-A session 2):** typecheck 0, biome 0/0/0 (959 files), `pnpm test` 550 pass / 1 skipped, `pnpm exec vitest run` 161 pass, `pnpm build` success on all routes.

---

## 🏗️ Foundation phases (Phase 0 → Phase 2)

| Date | Scope | What shipped | Key paths |
|---|---|---|---|
| 2026-04..2026-05 | **Phase 0** | Auth (Convex Auth + OAuth), RBAC catalog, shell primitives. ✅ 100%. | `convex/auth.ts`, `convex/_shared/permissions/catalog.ts`, `core/shell/auth/`, `core/shell/shell/` |
| 2026-04..2026-05 | **Phase 1** | Shell + sidebar + navigation + onboarding wizard + dashboard scaffolding. ✅ 100%. | `core/shell/shell/views/dashboard/`, `core/shell/onboarding/`, `app/[locale]/(private)/[orgSlug]/` |
| 2026-04..2026-05 | **Phase 2 — Backend** | 28 Convex tables, all mutations + queries follow the canonical 7-step pattern (RBAC → dedup → record code → DB → logActivity → sendNotification → AI rebuild). ✅ 100%. | `convex/schema/`, `convex/crm/entities/`, `convex/_shared/` |
| 2026-04..2026-05 | **Phase 2 — Frontend** | Slices 0-7: shared primitives, leads/contacts/companies/deals list+board, profile detail, company + deal detail, kanban + drag-drop, messages, notes, calendar, reminders, follow-ups, timeline, settings, dashboard. ✅ 100%. | `core/entities/`, `core/comms/`, `core/scheduling/`, `core/data-display/` |
| 2026-04..2026-05 | **Pipelines** | Multi-pipeline + stage-aware fields + transition policy (block / warn / off). ✅ 100%. | `convex/crm/fields/pipelines/`, `core/platform/settings/components/groups/pipelines/` |
| 2026-05-27 | **Phase 2 deferred polish #1** | `<EntityFollowups>` mounted in `ProfileContent`, `DealDetailShell`, `CompanyDetailView` (forwards to `<FollowUpsPanel>`). Verified via code-scan during 2026-05-27 consolidation — was silently shipped before docs flipped. | `core/scheduling/followups/components/EntityFollowups.tsx`, `core/platform/profile/views/ProfileContent.tsx`, `core/platform/profile/components/DealDetailShell.tsx`, `core/entities/_entities/companies/views/CompanyDetailView.tsx` |
| 2026-05-27 | **Phase 2 deferred polish #2** | `FillMissingFieldsDialog` ships — auto-opens on `MISSING_REQUIRED_FIELDS` block-policy error, user fills via `fieldValues.bulkSet`, auto-retries `moveToStage`. Verified via code-scan; was silently shipped before docs flipped. | `core/entities/_entities/deals/components/FillMissingFieldsDialog.tsx`, `core/entities/_entities/deals/views/DealDetailView.tsx` |

---

## 🤖 Phase 3 — AI agent foundation (production-readiness 41 → 86)

| Date | Scope | What shipped | Key paths |
|---|---|---|---|
| 2026-05-23 | **W1 stop-the-bleeding** | streamLoop tool sanitisation, friendly Zod errors, introspection tools, baseline scorer. | `convex/ai/orchestrator/streamLoop.ts`, `convex/ai/orchestrator/zodErrorFormatter.ts`, `convex/ai/tools/introspect.ts` |
| 2026-05-23 | **W2 subagent routing** (B.6) | 5-subagent registry; heuristic-first classifier; subagent persisted on `aiMessages.subagent`; runbook filtering. | `convex/ai/subagents/`, `convex/ai/orchestrator/router.ts` |
| 2026-05-23 | **W3 AI SDK v6 native HITL + contextBag** (B.7 + B.8) | `needsApproval` field on `ToolDef`; `aiConversations.contextBag` + `set_context_var` synthetic tool; "Facts already known" injected into prompt; frontend `addToolApprovalResponse` mutation alias matches SDK v6 cookbook. | `convex/ai/orchestrator/streamLoop.ts`, `convex/ai/tools/contextBag.ts`, `convex/_migrations/2026_05_24_addContextBagAndSubagent.ts` |
| 2026-05-23 | **ForAI auth bridge (W3.5)** | `*ForAI` internal twin pattern locked-in. `toolMutation` rewrites paths automatically + injects trusted `userId`. AGENTS.md non-negotiable. | `convex/ai/tools/_shared.ts`, every `*/mutations.ts` with a `*ForAI` twin |
| 2026-05-24 | **W4 dual-LLM CSV import** (B.3) | Quarantined LLM extracts structured rows with no tools; privileged `bulkInsertFromCsvImpl` only sees Zod-validated rows; per-row dedup at parse-time + re-validated at write-time; preview UI + propose/commit. Lead-only in Phase 1. | `convex/ai/quarantined/csvParser.ts`, `convex/ai/tools/layers/csvImport.ts`, `core/ai/components/preview/CsvImportPreviewCard.tsx` |
| 2026-05-24 | **W5 enrichment + file analysis** | 4-provider enrichment trace (Firecrawl web_search, LinkedIn, email_finder, RDAP whois); file-analysis subagent extracts structured data with custom-field application. | `convex/ai/quarantined/enrichmentProviders.ts`, `convex/ai/quarantined/fileAnalyzer.ts`, `convex/ai/tools/layers/enrichment.ts`, `convex/ai/tools/layers/fileAnalysis.ts` |
| 2026-05-24 | **W6 multi-provider failover + variant-matrix scorer + commit-arg strip + friendly-errors hotfix** (P1.1) | Failover wired into streamLoop; per-variant scorer matrix; commit-arg strip on resume; friendly-error envelope. | `convex/ai/orchestrator/streamLoop.ts`, `convex/ai/orchestrator/resume.ts`, `convex/ai/scorer.test.ts` |
| 2026-05-24 | **2026-05-24 hotfix wave (5 incidents)** | (1) `commit_update_org_settings` null-safety; (2) `notes/createForAI` accepts `entityId` OR `entityCode`; (3) NEW `convert_lead` twoStep tool + ForAI twin; (4) EntityResultCard idArg map per entity type; (5) `aiMessages.patch*` handlers null-safe. | `convex/ai/orchestrator/resume.ts`, `convex/crm/shared/notes/mutations.ts`, `convex/ai/tools/crud/convertLead.ts`, `core/ai/components/results/EntityResultCard.tsx`, `convex/ai/messages.ts` |

---

## 🔧 Phase 4 — Reliability + Telemetry (production-readiness 86 → 99)

### Phase 4 Part 1 — Reliability + Polish (86 → 97) · 2026-05-24

| Wave | What shipped | Key paths |
|---|---|---|
| **P1.10 dynamic schema** | `buildOrgSchemaContext` injects per-org schema (fieldDefinitions + tags + noteCategories + orgMembers + activityLogs) into the system prompt at request time. | `convex/ai/orchestrator/orgSchemaContext.ts` |
| **P1.9 ToolSummary envelope** | Every tool returns a structured `{ headline, table, facts, suggestedNext, cardFields }`. ToolSummaryCard renders it. Constraint F enforced. | `convex/ai/tools/_shared.ts`, `core/ai/components/results/ToolSummaryCard.tsx` |
| **P1.4 ToolInstruction structured template** | `whenToCall`, `whenNotToCall`, `preflight`, `requiredClarifications`, `synonyms`, `goodExample`, `badExample`. `buildToolDescription` regenerates the description deterministically. | `convex/ai/toolRegistry.ts` |
| **P1.11 multi-tier FriendlyToolError** | `ChatToolError` card surfaces structured error envelopes (PERMISSION_DENIED / VALIDATION_FAILED / NOT_FOUND / etc) with friendly markdown + recovery hints. | `convex/ai/orchestrator/friendlyToolError.ts`, `core/ai/components/results/ChatToolError.tsx` |
| **P1.12 aiPersonaContext** | Single table, keyed by `(orgId, userId)`. Holds `identity` (owner-edited ≤10 KB) + `summary` + `keyFacts` (AI-managed ≤4 KB) + `preferences` (per-user). Replaces dropped `orgs.aiContext` column. | `convex/ai/personaContext.ts`, `convex/_migrations/2026_05_24_dropOrgAiContext.ts` |
| **P1.13 route-aware context** | `## Current page` block emitted into the system prompt based on the active route. | `convex/ai/systemPrompt.ts`, `core/ai/hooks/useChatRouteContext.ts` |
| **P1.14 proactive suggestions panel** | Pure-heuristic suggestions (no LLM cost) shown above chat composer. Mounted on dashboard + person profile. Chat-prefill window-event bridge. | `convex/ai/suggestions.ts`, `core/ai/components/AISuggestionsPanel.tsx` |
| **P1.2 streaming markdown polish** | Lazy table rendering + defer mid-stream heading + text-balance. Suppresses incomplete syntax until closing tag arrives. | `core/ai/components/markdown/Markdown.tsx` |
| **AI-native cleanup wave** | Dropped `orgs.aiContext` (migration); added `aiPersonaContext.identity`; new `update_org_identity` AI tool; per-entity rule-based summariser at `convex/ai/internal.ts:rebuildEntityContext` (455 lines + 14 tests). | `convex/ai/internal.ts`, `convex/_migrations/2026_05_24_dropOrgAiContext.ts`, `convex/ai/tools/layers/settings.ts` |

### Phase 4 Part 2 — Telemetry + AI quota gate + AI-native parity (97 → 99) · 2026-05-24

| Wave | What shipped | Key paths |
|---|---|---|
| **Telemetry writer** | `recordToolEvent` wired into streamLoop tool-call/result/error/finish; synthetic `_chat_turn` row per turn. | `convex/ai/telemetry.ts`, `convex/ai/orchestrator/streamLoop.ts` |
| **getOrgUsage rollup** | 247-line query exposing per-tool / per-model / sparkline / plan gauge data. Single source for AI Usage settings card AND Billing → Plan limits. | `convex/ai/queries/telemetry.ts` |
| **AI quota gate** | Free tier hard-blocks platform models; metered tiers compare month-to-date totals; BYOK is unmetered on every plan. Friendly markdown error routes through the same `failChat` path as auth errors. | `convex/ai/orchestrator/quotaGate.ts`, `convex/ai/orchestrator/run.ts` |
| **Settings folder restructure** | `groups/notes/*` → `groups/crm/*`; `groups/crm/PipelineEditor` → `groups/pipelines/`; field editors → `groups/modules/`. `AIGroup` got 6-tab pattern (Identity/Memory/Approvals/Automation/Keys/Usage). | `core/platform/settings/components/groups/` |
| **AI-native parity push** | Phantom tools fixed (`list_followups` registered as always-on); 7 new always-on read tools (`list_followups` / `_for_person` / `list_tags` / `list_categories` / `list_members` / `list_saved_views` / `list_field_options`); field-flag column on every entity table; workspace-context emits plan tier, code prefixes, reminder defaults, soft-delete retention, pipeline transition policy, file-attach convention. | `convex/ai/tools/introspect.ts`, `convex/ai/orchestrator/orgSchemaContext.ts`, `convex/ai/systemPrompt.ts` |
| **Web search via Firecrawl** | `convex/ai/webSearchAction.ts` (Node-only Firecrawl wrapper) + always-on `web_search` tool gated on `FIRECRAWL_API_KEY`. | `convex/ai/webSearchAction.ts`, `convex/ai/tools/webSearch.ts` |
| **Chat file-attach UI** | Paperclip + chip list + `[file:<id>]` body markers + `chatAttachments.attach` mutation scoped to `aiChat`/`conversationId`. | `core/ai/components/composer/ChatAttachButton.tsx`, `convex/ai/chatAttachments.ts` |
| **WIDGET_REGISTRY share** | Pure data half in `convex/_shared/widgetRegistry.ts`; render specs in `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`. `list_widgets` read tool + `update_dashboard_layout` propose/commit. | `convex/_shared/widgetRegistry.ts`, `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx` |
| **BYOK policy update** | Quota gate now allows BYOK on every plan including free; platform models stay locked to paid tiers. | `convex/ai/orchestrator/quotaGate.ts` |
| **Stale-code purge** | Dropped deprecated `invitationRoleValidator` / `invitationRoleValues` / `InvitationRole`; legacy `orgs.stripeCustomerId` / `stripeSubscriptionId` fields + `by_stripeCustomerId` index removed; dead `users.preferences.aiContextCardCollapsed` removed. | (deletions) |

---

## 🚀 AI / Dashboard sprint — Stages 1-10 (2026-05-26)

> **All 10 stages shipped end-to-end.** Reactive parity ~95% by usage frequency. Senior-CRM bar reached on every dimension. Final scorecard: 8.6 / 10.

| Stage | Scope | What shipped | Key paths |
|---|---|---|---|
| **Stage 1** | Dashboard fix wave | `WIDGET_KEYS` 12 → 25; idempotent migration `2026_05_26_normalizeDashboardMetrics`; all 9 templates use canonical keys; CTA empty states on 4 widgets; `RemindersCard` gate widened to honour `reminders.list`. **Reminders-not-showing bug fixed end-to-end.** 32 contract tests. | `convex/_shared/widgetRegistry.ts`, `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts`, `core/shell/shell/views/dashboard/cards/{Messages,Timeline,WeekAhead,MiniCalendar}*.tsx`, `convex/ai/queries/widgets.test.ts` |
| **Stage 2** | Messaging tool wave | 5 new AI tools (`send_message`+commit, `list_messages`, `mark_thread_read`, `add_participants`+commit, `remove_participant`+commit). Every backing public mutation/query got a same-file `*ForAI` twin (messages: 4 twins; conversations: 6 twins). System prompt `## Messaging` block. 8 contract tests. | `convex/ai/tools/messaging/`, `convex/crm/shared/messages/{mutations,queries}.ts`, `convex/crm/shared/conversations/{mutations,queries}.ts` |
| **Stage 3** | Reactive parity P1 wave | 8 new tools: universal `delete_entity`+commit (lead/contact/company/deal/note/reminder), `update_reminder`+commit, `update_note`+commit / `delete_note`+commit / `pin_note` / `set_note_category`, `add_person_to_company`+commit / `remove_person_from_company`+commit. New cascade-impact query. 12 contract tests. | `convex/ai/tools/crud/deleteEntity.ts`, `convex/ai/tools/scheduling/`, `convex/ai/tools/notes/`, `convex/ai/tools/companies/`, `convex/ai/queries/cascadeImpact.ts` |
| **Stage 4** | Reactive parity P2 wave | 18 new tools across 7 layers: pipeline-stage edits (4 tools), `move_lead_status`, `update_tag`, `update_saved_view`, files (3 tools), `reopen_deal`, `list_org_timeline`, custom roles (3 tools), notifications (2 tools), `resend_invitation`. 3 NEW tool layers (`files`, `timeline`, `notifications`); 4 layers extended. NEW public mutations (`tags:update`, `invitations:resend`, `deals:reopen`). **AI coverage 70% → 95%.** 14 contract tests. | `convex/ai/tools/layers/{pipelines,tags,views,members}.ts`, `convex/ai/tools/{files,timeline,notifications}/`, `convex/crm/shared/{tags,savedViews,timeline,notifications}/`, `convex/orgRoles/`, `convex/invitations/`, `convex/files/` |
| **Stage 5** | AI dashboard surface | `AIQuickComposerCard` (pinned mini composer, opens chat sheet via `flowbite:ai-chat-open` event), `AIPulseRibbon` (top-3 dismissible suggestions), `AIReliabilityCard` in Settings → AI. 2 new widget keys; idempotent migration `2026_05_26_addAiDashboardWidgets`. `users.preferences.aiPulseDismissed` schema. `getOrgUsage.reliability.perTool` aggregation. 15 contract tests. | `core/shell/shell/views/dashboard/cards/{AIQuickComposerCard,AIPulseRibbon}.tsx`, `core/platform/settings/components/groups/ai/AIReliabilityCard.tsx`, `convex/_migrations/2026_05_26_addAiDashboardWidgets.ts` |
| **Stage 6** | Proactive layer (Milestone B) | `aiNextActions` materialised ranking table + cron-rebuilt heuristic ranker (every 30 min, 100 rows/user cap, NO LLM cost) + 3 always-on tools (`list_next_actions`, `list_stale_records`, `list_pipeline_anomalies`). `AIPulseRibbon` reads from ranked store. New `/{orgSlug}/ai/next-actions` view. WoW anomaly detector. Confidence labels (T-4). 20 contract tests. | `convex/ai/queries/{nextActions,anomalies}.ts`, `convex/ai/actions/rankNextActions.ts`, `convex/ai/tools/proactive.ts`, `app/[locale]/(private)/[orgSlug]/ai/next-actions/page.tsx`, `convex/_migrations/2026_05_27_addAiNextActions.ts` |
| **Stage 7** | Analytical layer + Trace UI (Milestone C) | New `analytics` tool layer with 5 tools: `analyze_metric`+commit (twoStep+expensive, quota-gated), `cohort_analysis`, `member_performance`, `get_briefing`, `refresh_briefing`. 2 new tables: `aiInsights` (zod-gated) + `aiCohortReports`. Win/loss retrospective on `closeAsDoneImpl`. Pipeline-velocity dashboard card. T-1 trace UI at `/{orgSlug}/ai/trace/[conversationId]`. 4 new permissions. New `costClass` field on `ToolDef`. 18 contract tests. | `convex/ai/tools/analytics/`, `convex/ai/queries/{pipelineVelocity,cohorts,insights,memberPerformance,toolTrace}.ts`, `convex/ai/actions/{analyzeMetric,rebuildCohorts,analyzeDealClose}.ts`, `core/ai/views/AIToolTraceView.tsx`, `convex/_migrations/2026_05_28_addAiAnalyticsTables.ts` |
| **Stage 8** | Autonomous layer (Milestone D) | `aiStandingOrders` table (closed-union schedule: interval/daily/weekly; allowedTools≤30). `users.preferences.aiAutonomy` map (4 opt-in keys, default false). `pipelines.stages[].onEnter` triggers. `aiToolEvents.triggeredBy` audit field. V8 cron evaluator + use-node runner with tool whitelist. Auto-action triggers (`maybeFireAutoFollowupOnStageMove` + `maybeFireAutoEnrichOnContactCreate`). New permission `ai.automation.manage`. Settings UI: `AIAutomationSection.tsx`. 26 contract tests. T-5 closed. | `convex/ai/standingOrders/`, `convex/schema/ai.ts` (aiStandingOrders), `core/platform/settings/components/groups/ai/AIAutomationSection.tsx`, `convex/_migrations/2026_05_28_aiStandingOrders.ts` |
| **Stage 9** | Creative layer (Milestone E) | New `creative` tool layer: `draft_message`+commit (twoStep+expensive), `draft_proposal`+commit (twoStep+expensive), `summarise_conversation` (atomic+expensive), `web_scrape` (atomic+normal — Firecrawl pair for `web_search`). 4 use-node action subagents with structured-output Zod gates + deterministic fallbacks. **Drafts NEVER autosend or persist by AI** — every draft surfaces `suggestedNext` chips. Quota helpers: `enforceCreativeQuota` (5/min/user + 50/day soft cap); `enforceWebScrapeRateLimit` (30/min). 17 contract tests. | `convex/ai/tools/creative/`, `convex/ai/actions/{draftMessage,draftProposal,summariseConversation,webScrape}.ts`, `convex/ai/creativeHelpers.ts` |
| **Stage 10** | Hardening + sprint roll-up | 4 production-grade pure helpers: `sanitiseExtractedText` (adversarial-file XSS sanitiser — wired into `fileAnalyzer`), `csvEncodingDetect` (UTF-8/UTF-16/Latin-1 BOM detection — wired into `csvParser`), `bulkProgress` (row-level diff + retry chips — wired into `commit_bulk_*`), `enrichmentErrorMap` (provider-friendly error mapping — wired into 4 providers). 39 contract tests. | `convex/_shared/{sanitiseExtractedText,csvEncodingDetect,bulkProgress,enrichmentErrorMap}.ts`, `convex/ai/quarantined/{fileAnalyzer,csvParser,enrichmentProviders}.ts` |

---

## 🎛️ Post-sprint follow-ups

| Date | Scope | What shipped | Key paths |
|---|---|---|---|
| 2026-05-26 | **Configurable approval gate + AI settings tab refactor** | `convex/_shared/aiApprovals.ts` SSOT (8 user-toggleable categories + 3 hard-locked: `bulk`/`settings`/`members`); 58 tools tagged with `approvalCategory` across 36 files; `resolveNeedsApproval` consumes per-user `aiApprovals` map (precedence: alwaysAsk → hard-lock → user override → declared confirmation); new `AIApprovalsSection.tsx`; `AIGroup.tsx` refactored to 6-tab pattern. AGENTS.md row #26 added. 14 contract tests. | `convex/_shared/aiApprovals.ts`, `convex/ai/toolRegistry.ts`, `convex/ai/approvalGate.test.ts`, `core/platform/settings/components/groups/ai/AIApprovalsSection.tsx` |
| 2026-05-26 | **Stage 3-A H1+H2+H3 hotfixes** | (H1) Router heuristic rewritten — explicit CRM-action verb pre-empt + bigram-only settings rule. Bare nouns no longer trigger settings. 62 tests. (H2) `friendlyToolError` distinguishes `SUBAGENT_SCOPE` from `PERMISSION_DENIED`. 7 tests. (H3) `usePersistedConversationId` — localStorage-keyed by orgId, SSR-safe, stale-id resilient. 10 vitest cases. **Closes the user-reported `create_followup` failure.** | `convex/ai/orchestrator/router.ts`, `convex/ai/orchestrator/friendlyToolError.ts`, `core/ai/hooks/usePersistedConversationId.ts` |
| 2026-05-26 | **Stage 3-A 3A.1 + 3A.2 + DEALS LOST hotfix** | (3A.1) `ChatLandingPane.tsx` (387 lines) — replaces static empty state with greeting + last-visited route + Today's Pulse + Top 3 next actions (Snooze/Dismiss/Act per row) + recent-thread chips + auto-send try-asking chips. 11 vitest cases. (3A.2) `AIQuickComposerCard.tsx` rewrite — Enter SENDS through `useAIChat`, persisted thread reuse, inline `<ChatModelPicker>`, no-key fallback. AGENTS.md row #27 codifies the auto-send carve-out. (Hotfix) DEALS LOST = "Soon" fixed in `WidgetRegistry.tsx` + `MetricStrip.tsx`. | `core/ai/components/ChatLandingPane.tsx`, `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx`, `AGENTS.md` row #27 |
| 2026-05-27 | **Stage 3-A session 2 — Convex concurrency + 3A.3/3A.4/3A.5 + pure-code cleanup** | (B.23) `aiStandingOrders.firstFireAt` field + `by_enabled_and_first_fire` index + `computeFirstFireAt` helper. Evaluator's full-table scan DELETED; replaced by `listDueForEvaluation` index-bounded read (zero-doc reads when nothing due). `useRemindersNextUpcoming({ enabled })` gate. Backfill migration. 6 new tests. (3A.3) Idempotent `2026_05_27_addAiMorningBriefingMetric` migration inserts `ai.morningBriefing` BEFORE `ai.pulseRibbon`. (3A.4) `lazyWarmForUser` orgMutation + ForAI twin (rate-limited 1/min/user); ribbon fires once per session via `useRef`; 3-row skeleton during warm. (3A.5) `ProactiveWorkspaceSection` wraps the AI cluster; collapse persists per-user via `users.preferences.dashboardSectionsCollapsed.proactive`; `setDashboardSectionCollapsed` mutation + ForAI twin. (Cleanup) Removed runtime `LEGACY_KEY_RENAMES` + `normalizeDashboardLayout` exports — alias map now scoped to migration only. | `convex/ai/standingOrders/{schedule,evaluator,queries,mutations}.ts`, `convex/_migrations/2026_05_27_addAiMorningBriefingMetric.ts`, `convex/_migrations/2026_05_28_addStandingOrderFirstFireAt.ts`, `convex/ai/queries/nextActions.ts`, `core/shell/shell/views/dashboard/cards/{AIPulseRibbon,ProactiveWorkspaceSection}.tsx`, `convex/_shared/widgetRegistry.ts` |

---

## 📐 Locked architectural decisions (durable reference)

The 31 locked architectural decisions live in `AGENTS.md` (decisions #1-#31 + 5 performance-critical rules + 4 absolute rules — no training data, RTL-safe Tailwind, dynamic radius, no hardcoded app strings).

The full AI Context Architecture (11-layer system prompt assembly) lives in the per-module `MODULE.md` files (`core/ai/MODULE.md`, `core/shell/shell/MODULE.md`, `core/platform/settings/MODULE.md`).

The Convex backend layout (28 tables + 7-step canonical mutation pattern + permission catalog SSOT + reserved slugs SSOT + notification keys SSOT) lives in `convex/_arch.md` + `convex/**/MODULE.md`.

---

## How to use this file

1. **Adding a row.** When you ship something, add a row here in the same edit that flips the source-of-truth doc (per AGENTS.md → "RULE: Doc cleanup at every commit"). One sentence. One date. Key paths.
2. **No edits to past rows.** The git history is the audit trail; a flipped row should not be re-edited unless the work was rolled back.
3. **Cross-references.** Per-module detail lives in `core/*/MODULE.md` and `convex/**/MODULE.md`. Phase-level rationale lives in `docs/architecture/`. The 31 locked decisions live in `AGENTS.md`. Anything not yet shipped lives in `PENDING.md`.
