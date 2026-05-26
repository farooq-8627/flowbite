# core/ai — State

> Updated: 2026-05-26 (Stage 10 of /SPRINT-PLAN.md SHIPPED — AI/Dashboard sprint closed)
> Status: **~99 / 100 production-readiness.** AI agent at senior-CRM bar (~8.6/10 overall capability). Stages 1-10 of the audit-driven sprint shipped end-to-end. Phase 4 Part 3 (LemonSqueezy upgrade flow / billing wall — T9) is the only remaining pre-launch item.

## 🆕 2026-05-25 audit deliverables

Three new audit docs at the repo root — read in this order before adding new tools:

| Doc | What it answers |
|---|---|
| [/AI-AUDIT-COMPLETE.md](../../AI-AUDIT-COMPLETE.md) | The full **3-column map** of every backend function ↔ AI tool. 75 tools enumerated, 51 actionable gaps prioritised P0–P3, half-baked tool list, edge-case test matrix. |
| [/DASHBOARD-AUDIT.md](../../DASHBOARD-AUDIT.md) | Root-cause analysis of the "reminders not showing" bug — `generic` template writes `reminders.list`, frontend gates on `reminders.dueToday`. Also lists the 9 dashboard-metric keys that aren't in `WIDGET_KEYS`. Fix plan + migration sketch. |
| [/AI-AGENT-CAPABILITY-AUDIT.md](../../AI-AGENT-CAPABILITY-AUDIT.md) | Senior-CRM-specialist evaluation. Reactive 9/10, Proactive 4/10, Analytical 3/10, Autonomous 1/10, Creative 2/10. Roadmap milestones A–E (~10 eng-weeks) to reach the bar. |

**Headline findings:**
- AI **cannot send messages** — `crm/shared/messages/mutations:send` exists but no `send_message` tool wraps it. This is why the AI fell back to `add_note`. **P0.**
- AI **cannot edit/delete notes**, **cannot edit reminders**, **cannot delete entities** without going through the bulk-update workaround. **P1.**
- Dashboard widget hide is caused by **template/registry key mismatch**, not "no data". `RemindersCard` is gated on `reminders.dueToday`, generic template writes `reminders.list` → widget hidden permanently.
- Empty-state UX hides widgets instead of showing CTAs — needs a `<NextReminderFallback>`-style pattern on `MessagesPreviewWidget`, `TimelineActivityWidget`, `WeekAheadWidget`.
>
> This file is a **pending-work index**, not a changelog. For shipped detail see git history; for the durable AI Context Architecture see `/PHASE-3-AI-AUDIT.md §0.2`. For active gap analysis see `/PHASE-4-PART-2-AI-NATIVE-AUDIT.md`.
> **For how to test the AI end-to-end, see `core/ai/TESTING.md`.**

## 🛠️ 2026-05-24 hotfix wave (5 incidents → all fixed)

User-reported bugs from a single live testing session:

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `commit_update_org_settings` crashed with "Cannot convert undefined or null to object" after approval | Resume forwarded raw args to commit when zod parse failed; `pickSettingsSection(undefined)` then threw on `Object.keys(undefined)` | `convex/ai/orchestrator/resume.ts` returns a friendly error instead of forwarding malformed args; `pickSettingsSection` is null-safe; `update_org_settings` rejects empty patches at propose time |
| 2 | `commit_create_lead` lead saved but note attach silently failed with `ArgumentValidationError: missing entityId` | `notes/mutations:createForAI` validator required `entityId`, but `add_note` and `commit_create_lead` were passing `entityCode` instead | `notes/mutations:createForAI` now accepts either `entityId` OR `entityCode` and resolves internally via `resolveCodeToRecordForAI` |
| 3 | "Convert lead" said success but no contact appeared in the contacts list | NO `convert_lead` AI tool existed; the model fell back to `update_entity` with `{status: "converted"}`, which only patched the lead row | New `convex/ai/tools/crud/convertLead.ts` (twoStep) + `convertToContactForAI` internal twin in `convex/crm/entities/leads/mutations.ts`; `update_entity` now refuses lead `status:"converted"` patches and redirects to `convert_lead` |
| 4 | Every entity result card in chat threw `getById: Object is missing the required field leadId` | `core/ai/components/results/EntityResultCard.tsx` passed `{ id }` to all four entity getById queries, but each validator expects a different name (`leadId` / `contactId` / `dealId` / `companyId`) | Map updated to carry the correct `idArg` per entity type |
| 5 | `Update on nonexistent document ID` crashed `processChat:run` | `patchAssistantBody` (and 2 sibling patch handlers) didn't check whether the message still existed before patching | All five patch handlers in `convex/ai/messages.ts` now `ctx.db.get` first and silently no-op if the row is gone |

All five regressions are now covered by:
- The agentScorer registry tests (Layer 1 — wiring) catch missing/mismatched twoStep pairs
- Validator strict-shape tests (Layer 2) catch the entityId/entityCode mismatch class
- The new `core/ai/TESTING.md` documents how to add Playwright e2e specs for Layers 3 + 4

## 🎯 Where we are

| Phase | Range | Score |
|---|---|---|
| Phase 3 — AI Agent | 41 → 86 | ✅ closed |
| Phase 4 Part 1 — Reliability + Polish | 86 → 97 | ✅ FULLY shipped |
| Phase 4 Part 2 — Telemetry + AI quota + AI-native parity + T8 widgets | 97 → 99 | ✅ FULLY shipped |
| Phase 4 Part 3 — Billing wall (LemonSqueezy upgrade flow) | 99 → 100 | ⬜ pending |

**Latest verification (2026-05-24, after T8 + BYOK gate + cleanup):**
- `pnpm typecheck` → 0 errors
- `pnpm test` → 243 pass / 1 skipped (13 files)
- `pnpm exec vitest run` → 140 pass (9 files)
- `pnpm exec biome check .` → 0 errors / 0 warnings / 0 infos (843 files)
- `pnpm build` → SUCCESS (18 routes)

## ⬜ Pending

### 🚨 Reactive-completeness wave (audit-driven, 2026-05-25)

| ID | Task | Priority | Effort |
|---|---|---|---|
| ✅ **R1** | **Stage 2 — SHIPPED 2026-05-26.** `send_message` + `commit_send_message`, `list_messages`, `mark_thread_read`, `add_participants` + commit, `remove_participant` + commit shipped under the new `messaging` tool layer. ForAI twins added for every public mutation/query the tools call (`sendForAI` / `updateForAI` / `removeForAI` / `toggleReactionForAI` on messages; `ensureForEntityForAI` / `addParticipantsForAI` / `removeParticipantForAI` / `markReadForAI` / `leaveForAI` / `updateNotificationLevelForAI` on conversations; matching query twins). System prompt gained `## Messaging` verb-routing block. 8 ForAI contract tests at `convex/ai/tools/messaging/messaging.test.ts`. Closes the user's "AI calls add_note when I asked to send a message" complaint end-to-end. | — | — |
| ✅ **R2-R5** | **Stage 3 — SHIPPED 2026-05-26.** P1 reactive parity wave shipped: `delete_entity` + commit (universal — soft-deletes lead/contact/company/deal/note/reminder via cascade-impact propose), `update_reminder` + commit (twoStep, accepts `followUpCode` or `reminderId`), `update_note` + commit / `delete_note` + commit / `pin_note` (atomic) / `set_note_category` (atomic), `add_person_to_company` + commit / `remove_person_from_company` + commit (twoStep, idempotent). Per AGENTS.md non-negotiable rule: every backing public mutation gained a same-file `*ForAI` twin (leads/contacts/companies/deals `softDeleteForAI`; companies `addPersonForAI` / `removePersonForAI`; notes `updateForAI` / `togglePinForAI` / `setCategoryForAI` / `removeForAI`; reminders `updateForAI` / `removeForAI`) — bodies extracted to `*Impl` helpers so public + ForAI cannot diverge. New internal query `convex/ai/queries/cascadeImpact.ts:getEntityCascadeImpact` powers the universal delete propose card. System prompt gained Stage-3 verb-routing blocks for Notes / Reminders / Companies / universal deletion. 12 ForAI contract tests at `convex/ai/tools/stage3/stage3.test.ts`. Closes the user's "AI uses bulk_update to delete things" + "AI can't push my reminder" + "AI can't add Sara to Acme" complaints. | — | — |
| ✅ **R6-R10** | **Stage 4 — SHIPPED 2026-05-26.** P2/P3 reactive parity wave shipped: 18 new AI tools across 7 layers covering pipeline-stage edits (`update_pipeline_stage`, `remove_pipeline_stage`, `reorder_pipeline_stages`, `set_default_pipeline`), lead status (`move_lead_status`), tag/view edits (`update_tag`, `update_saved_view`), files (`list_files`, `update_file_tags`, `remove_file`), reopen-deal (`reopen_deal`), org-wide timeline (`list_org_timeline`), invitations (`resend_invitation`), custom roles (`create_custom_role` / `update_custom_role` / `delete_custom_role`), and per-user notifications (`list_notifications`, `mark_notification_read`). 3 new tool layers introduced: `files`, `timeline`, `notifications`. Per AGENTS.md non-negotiable rule, every backing public mutation/query has a same-file `*ForAI` twin: pipelines (6 twins via `*Impl` extraction), tags (NEW public `update` + ForAI), savedViews (`updateForAI`), files (`listByScopeForAI` + `listForEntityForAI` + `updateTagsForAI` + `removeForAI`), orgRoles (3 twins on `authenticatedMutation` model + `listForAI`), timeline (`getForOrgForAI`), invitations (NEW public `resend` + `resendForAI`), deals (NEW public `reopen` + `reopenForAI`), notifications (`listMineForAI` + `markReadForAI`). System prompt gained a `## Pipelines / Files / Timeline / Roles / Notifications / Tag-view` block with verb-driven routing. 14 ForAI contract tests at `convex/ai/tools/stage4/stage4.test.ts`. AI coverage by usage frequency: ~70% → ~95%. Reactive parity gap with the UI is closed for the entire app. | — | — |

### 🐛 Dashboard fix wave

✅ **Stage 1 — SHIPPED 2026-05-26.** `WIDGET_KEYS` extended from 12 → 25 covering every section + KPI + placeholder key the industry templates use; `LEGACY_KEY_RENAMES` collapses `calendar.miniWidget` → `calendar.mini`; idempotent migration `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` ran on dev (scanned 1 / patched 0 — already canonical); 4 widget empty states replaced with CTA cards mirroring `<NextReminderFallback />`; `RemindersCard` gate widened to honour `reminders.list`. The user's "reminders not showing" complaint is fixed end-to-end. See `convex/_shared/widgetRegistry.ts`, `convex/ai/queries/widgets.test.ts` (32 contract tests).

✅ **Stage 5 — SHIPPED 2026-05-26.** D4 (`AIQuickComposerCard`) + D5 (`AIPulseRibbon`) + AICostWatcher all closed. New AI dashboard surface: `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx` (pinned mini composer that opens the side sheet via the new `flowbite:ai-chat-open` event + prefills via the existing `flowbite:ai-chat-prefill` event) and `AIPulseRibbon.tsx` (top-3 dismissible suggestions reading `ai.suggestions.list` — same heuristic engine — with per-user dismiss persisted in `users.preferences.aiPulseDismissed`). Settings → AI gained `AIReliabilityCard` (per-tool callCount / successRate / avgDurationMs / topErrorReason for 7d / 30d / 90d windows) backed by the new `getOrgUsage.reliability.perTool` aggregation. Two new widget keys (`ai.quickComposer`, `ai.pulseRibbon`) registered + opted into all 9 templates; idempotent migration `convex/_migrations/2026_05_26_addAiDashboardWidgets.ts` patches existing org rows (1 patched on dev, idempotent re-run unchanged=1). 15 contract tests at `convex/stage5.test.ts`. Schema added `users.preferences.aiPulseDismissed` (record, capped 50 via writer).

### 🎓 Senior CRM specialist roadmap (per AI-AGENT-CAPABILITY-AUDIT.md)

**Today: ~8.5 / 10.** Stages 6 + 7 + 8 + 9 closed Milestones B + C + D + E. Bar reached on every dimension except depth (Stage 10 hardening pass).

| Milestone | Headline | Status |
|---|---|---|
| ✅ **B — Proactive** | Stale-record detector, per-record next-action ranking, pipeline-anomaly alerts, confidence labels | **Shipped — Stage 6, 2026-05-26.** `aiNextActions` table + heuristic ranker (cron-rebuilt every 30 min) + 3 always-on AI tools (`list_next_actions` / `list_stale_records` / `list_pipeline_anomalies`) + `AIPulseRibbon` reads from ranked store + `/{orgSlug}/ai/next-actions` view. T-4 confidence labels closed in the same wave. See `convex/ai/queries/nextActions.ts`, `convex/ai/queries/anomalies.ts`, `convex/ai/actions/rankNextActions.ts`. |
| ✅ **C — Analytical** | "Why is X happening?" tool, cohort analysis, win/loss reasoning, pipeline-velocity, trace UI | **Shipped — Stage 7, 2026-05-26.** New `analytics` AI tool layer (`analyze_metric` twoStep+expensive, `cohort_analysis` / `member_performance` / `get_briefing` / `refresh_briefing` atomic). 2 new tables: `aiInsights` (zod-validated narrative storage, 90d TTL) + `aiCohortReports` (deterministic rollup, 30d TTL). Nightly `rebuild-ai-cohorts` cron. Win/loss retrospective fires on `closeAsDoneImpl`. Pipeline-velocity dashboard surface. T-1 trace UI shipped. New permissions: `members.viewPerformance` + `ai.analytics.viewMetrics` + `ai.cohorts.view` + `ai.trace.view`. New `costClass` field on `ToolDef` (Constraint I). 18 contract tests at `convex/stage7.test.ts`. |
| ✅ **D — Autonomous** | Standing orders / playbooks (cron-driven LLM workflows), auto-followup on stage move, auto-enrich on create, per-user autonomy allow-list | **Shipped — Stage 8, 2026-05-26.** New `aiStandingOrders` table + `users.preferences.aiAutonomy` map + `pipelines.stages[].onEnter` config + `aiToolEvents.triggeredBy` audit. V8 cron evaluator + use-node runner with tool whitelist. Auto-action triggers in `triggers.ts`. New permission `ai.automation.manage`. Settings UI: `AIAutomationSection.tsx`. 26 contract tests at `convex/stage8.test.ts`. T-5 (per-user autonomy allow-list) closed in the same wave. |
| ✅ **E — Creative** | `draft_message` + `draft_proposal` (twoStep), `summarise_conversation` (atomic), `web_scrape` (atomic — Firecrawl pair for `web_search`) | **Shipped — Stage 9, 2026-05-26.** New `creative` tool layer at `convex/ai/tools/creative/`. 4 internal action subagents at `convex/ai/actions/{draftMessage,draftProposal,summariseConversation,webScrape}.ts` — each runs LLM with structured-output Zod gates AND a deterministic fallback (`buildDeterministicDraftMessage` / `buildDeterministicProposal` / `buildDeterministicSummary`) so contract tests + free-tier deployments pass without an API key. Drafts NEVER autosend or persist by AI — every draft surfaces `suggestedNext` chips routing the user back to `send_message` / `add_note` / `create_followup`. Quota gate at `convex/ai/creativeHelpers.ts`: `enforceCreativeQuota` (5/min/user via `enforceRateLimit` scope `ai.creative` + 50/day/user soft cap counted from successful `aiToolEvents` with creative tool names — failed runs don't count); `enforceWebScrapeRateLimit` (30/min/user, separate budget); `countRecentCreativeRunsForUser` (read-only counter). Pure-helper `validateScrapeUrl` + `checkScrapeConfigured` extracted from the use-node action so the bad-URL + WEB_SCRAPE_NOT_CONFIGURED paths are unit-testable. systemPrompt gained `## Creative drafting (Stage 9)` block with verb routing + non-negotiables. 17 contract tests at `convex/stage9.test.ts`. AI-AGENT-CAPABILITY-AUDIT.md §6 final scorecard: Creative drafting 2/10 → 7/10; OVERALL 7.5 → 8.5. |

Total to reach senior-CRM bar: **0 eng-weeks remaining** — Stage 10 of `/SPRINT-PLAN.md` shipped 2026-05-26. The AI/Dashboard sprint (Stages 1-10) is closed end-to-end.

### ✅ Stage 10 — Hardening + sprint roll-up — SHIPPED 2026-05-26

4 production-grade pure helpers shipped under `convex/_shared/`:

- **`sanitiseExtractedText.ts`** — adversarial-file XSS / injection sanitiser. Strips `<script>` / on*= / `javascript:` / `data:text/html`, redacts dangerous markdown link targets, length-caps + idempotent. Wired into `convex/ai/quarantined/fileAnalyzer.ts` BEFORE the structured extracted record is persisted. Closes the AI-AGENT-CAPABILITY-AUDIT.md §3 P1 security gap.
- **`csvEncodingDetect.ts`** — UTF-8 BOM, UTF-16-LE/BE BOM, Latin-1 / Windows-1252 fallback. Wired into `convex/ai/quarantined/csvParser.ts` replacing `blob.text()`. Friendly warning surfaced via `describeEncodingWarning` when the decode falls back lossily.
- **`bulkProgress.ts`** — row-level diff + retry chips for `commit_bulk_update_entities` + `commit_bulk_close_deals`. Replaces the silent `{succeeded, failed}` counter with a `ToolSummary` envelope (per-row failure table + retry intent chips per Constraint F). Mid-flight chunked streaming remains in `Future-Enhancements.md` backlog.
- **`enrichmentErrorMap.ts`** — provider-friendly error mapping (401 / 403 / 404 / 429 / 500 / timeout / DNS / network / not-configured / invalid-response → `{code, retryable, fallThrough, hint}`). Wired into all 4 provider trace pushes in `convex/ai/quarantined/enrichmentProviders.ts` (web_search Firecrawl, linkedin_lookup, email_finder, domain_whois RDAP).

39 contract tests at `convex/stage10.test.ts` (12 sanitiser + 9 CSV encoding + 5 bulk-progress + 8 enrichment friendly-error + 3 RemindersCard gate-contract — closes the last DASHBOARD-AUDIT.md §6 checkbox). Full repo verification: `pnpm typecheck` 0 errors, `pnpm exec biome check .` 0/0/0, `pnpm test` 463 pass / 1 skipped (was 424; +39 stage10 tests), `pnpm exec vitest run` 140 pass, `pnpm build` success on all routes. Capability scorecard moves from 8.5 → 8.6/10.

### 💸 Phase 4 Part 3 — Billing wall (still pending)

| ID | Task | Effort |
|---|---|---|
| T9 | **LemonSqueezy upgrade flow.** Webhook smoke test (full subscription lifecycle in test mode) + production signing-secret rotation playbook + per-variant feature-gate copy on the pricing card + trial flow + 3-day past_due grace period. Full plan in `/PHASE-4-PART-2-AI-NATIVE-AUDIT.md §2 T9`. | ~3 days |

### 🧹 Low-priority backlog

| ID | Task | Effort |
|---|---|---|
| T11 | Reminder kinds histogram. `create_reminder.reminderType` is hardcoded to a 5-item enum; if telemetry shows custom kinds, add `list_reminder_kinds` exposing a 30-day distinct histogram. | ~1 hr |
| T12 | Permission catalog introspection. Add `list_permission_catalog` always-on read tool returning `{ key, description, category }[]` from `convex/_shared/permissions/catalog.ts`. | ~30 min |

## 🆕 BYOK policy (locked 2026-05-24)

`convex/ai/orchestrator/quotaGate.ts` now takes `usageMode` and behaves:

- **BYOK on any plan** → always allowed (user pays the model bill).
- **Platform on free** → blocked with `"add BYOK or upgrade"` message.
- **Platform on starter / pro** → metered against `aiTokensPerMonth`.
- **Platform on enterprise** → unmetered.

The gate runs AFTER `resolveModelAndKey` so it knows whether the user
brought their own key. Order matters in `convex/ai/orchestrator/run.ts`:
model resolution → quota check → stream loop.

## 📐 AI Context Architecture (durable reference)

Always read `/PHASE-3-AI-AUDIT.md §0.2` before adding a new context source. Highlights:

- **Single table — `aiPersonaContext`** — keyed by `(orgId, userId)`. Holds three layers in one row:
  - `identity` (owner-edited, ≤10 KB) — replaces the now-dropped `orgs.aiContext` column.
  - `summary` + `keyFacts` (AI-managed dynamic memory, ≤4 KB total).
  - `preferences` (per-user only).
- **Per-entity `aiContext`** lives on the entity row itself; auto-rebuilt by a deterministic rule-based summariser fired on every CRUD via `ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext)`.
- **Codes** (P-001, D-001, C-001, FU-001) are the cross-table glue. Locked decision #12 in `AGENTS.md`.
- **Widget registry** (locked decision #31 in `/PHASE-4-PART-2-AI-NATIVE-AUDIT.md §3`) — pure data in `convex/_shared/widgetRegistry.ts`, render specs in `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`. AI tools (`list_widgets`, `update_dashboard_layout`) validate every key against `WIDGET_KEYS`.
- **AI write tools** cover settings + schema + pipelines + fields + tags + members + dashboard layout — see `/PHASE-3-AI-AUDIT.md §0.2` for the exhaustive list.
- **Telemetry** — every tool call + every chat turn (synthetic `_chat_turn` row) writes to `aiToolEvents`; the rollup query `api.ai.queries.telemetry.getOrgUsage` is the single source for AI Usage settings card AND Billing → Plan limits.
- **AI quota gate** — see "BYOK policy" section above.

## 📐 AI Context Architecture (durable reference)

Always read `/PHASE-3-AI-AUDIT.md §0.2` before adding a new context source. Highlights:

- **Single table — `aiPersonaContext`** — keyed by `(orgId, userId)`. Holds three layers in one row:
  - `identity` (owner-edited, ≤10 KB) — replaces the now-dropped `orgs.aiContext` column.
  - `summary` + `keyFacts` (AI-managed dynamic memory, ≤4 KB total).
  - `preferences` (per-user only).
- **Per-entity `aiContext`** lives on the entity row itself; auto-rebuilt by a deterministic rule-based summariser fired on every CRUD via `ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext)`.
- **Codes** (P-001, D-001, C-001, FU-001) are the cross-table glue. Locked decision #12 in `AGENTS.md`.
- **AI write tools** cover settings + schema + pipelines + fields + tags + members — see `/PHASE-3-AI-AUDIT.md §0.2`.
- **Telemetry** — every tool call + every chat turn (synthetic `_chat_turn` row) writes to `aiToolEvents`; the rollup query `api.ai.queries.telemetry.getOrgUsage` is the single source for the AI Usage settings card AND Billing → Plan limits.
- **AI quota gate** — `convex/ai/orchestrator/quotaGate.ts::checkAiQuota`. Free tier (`aiTokensPerMonth = 0`) hard-blocks AI; metered tiers compare month-to-date totals; enterprise (`-1`) is unmetered. Friendly markdown message routes through the same `failChat` path as auth/quota errors.

## 📁 Key paths

```
convex/ai/
  systemPrompt.ts              # 11-layer prompt assembly
  personaContext.ts            # aiPersonaContext queries + mutations (P1.12 + identity 2026-05-24 + memory read/forget Part 2)
  internal.ts                  # rebuildEntityContext rule-based summariser (455 lines, 14 tests)
  internal.test.ts             # deterministic unit tests for the summarisers
  suggestions.ts               # pure-heuristic suggestions for the panel (P1.14)
  telemetry.ts                 # NEW (Part 2) — recordToolEvent + sumTokensThisMonth
  queries/
    telemetry.ts               # NEW (Part 2) — getOrgUsage rollup
  orchestrator/
    run.ts                     # the streamLoop entry point — quota gate sits here
    streamLoop.ts              # AI SDK v6 native HITL — telemetry hooks at tool-call/result/error/finish
    friendlyToolError.ts       # multi-tier error envelope (P1.11)
    orgSchemaContext.ts        # dynamic schema injection (P1.10)
    quotaGate.ts               # NEW (Part 2) — checkAiQuota
  tools/
    toolRegistry.ts            # registerTool + ToolInstruction
    layers/                    # 16 tool layers — see PHASE-3-AI-AUDIT.md §0.2 for the inventory
    crud/                      # create_lead / contact / deal / company
    notesReminders.ts          # add_note / create_followup / create_reminder / complete_* / cancel_* (all instruction+summary)
    personaContext.ts          # update_*_context_facts tools (P1.12)

core/ai/
  components/
    ChatSheet.tsx
    ChatComposer.tsx
    AISuggestionsPanel.tsx     # P1.14
    results/ChatToolError.tsx  # P1.11
    markdown/Markdown.tsx      # streaming-aware (P1.2)
  hooks/
    useChatRouteContext.ts     # P1.13
  lib/
    chatPrefill.ts

core/platform/settings/components/groups/  # FOLDER RESTRUCTURE (Part 2 closeout)
  AIGroup.tsx                  # 5 sections: BusinessContext / AIMemory / AIPreferences / ApiKeys / AIUsage
  BillingGroup.tsx             # AI tokens UsageBar wired to getOrgUsage
  CRMGroup.tsx                 # imports moved from notes/* → crm/*
  PipelinesGroup.tsx           # imports moved from crm/PipelineEditor → pipelines/PipelineEditor
  ai/
    AIUsageSection.tsx         # NEW (Part 2) — 305 lines
    AIMemorySection.tsx        # NEW (Part 2) — 230 lines
    AIPreferencesSection.tsx
    ApiKeySection.tsx
  crm/                         # was: TagsSection + PipelineEditor + 5 field editors
                               # now: TagsSection + (notes/* moved here)
                               #      → NoteCategoriesSection / RemindersSection / FollowupsSection / TimelineSection
  pipelines/                   # NEW folder — PipelineEditor + StageFieldsTable + StageScopedEditFieldDialog
  modules/                     # was: SlotFieldsSection / SlotPipelinesSection / ModuleDisplaySection
                               # now: also CreateFieldDialog / EditFieldDialog / SortableFieldsTable / FieldEditor
  team/                        # MembersSection / RolesSection / RoleEditor / InvitationsSection / InviteMemberDialog
  workspace/                   # General / EntityLabels / CodePrefixes / WorkspaceTemplate / ModuleVisibility
  appearance/                  # UserEntityDefaultsSection (theme + layout still inline)
  # notes/ — DELETED (was redundant; sub-sections live under CRM in the UI)

convex/_migrations/
  2026_05_24_dropOrgAiContext.ts   # one-shot: copy orgs.aiContext → aiPersonaContext.identity, then drop column
```
