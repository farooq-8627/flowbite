# PENDING.md — Single source of truth for everything still to ship

> **Generated:** 2026-05-27 by consolidating SPRINT-PLAN.md, Future-Enhancements.md, Phase-2-progress.md, the 6 audit docs, the 2 stage-3A planning docs, and a fresh code scan.
>
> **How to use this file.** Anything in here is genuinely pending — verified against the codebase, not just claimed in a doc. Anything shipped lives in `SHIPPED.md`. The two files don't overlap.
>
> **Order of work.** Sections are listed by priority — P0 must ship before public launch, P1 ships in the next sprint window, P2/P3 are backlog with full context preserved so any session can pick them up cold.
>
> **Cross-references kept (not deleted):** `LANDING-PAGE.md` (marketing-site spec), `PLATFORM-OWNER-PANEL.md` (super-admin panel spec), `AGENTS.md` (rules), `core/*/MODULE.md` and `convex/**/MODULE.md` (per-module architecture decisions), `docs/architecture/*` (durable architecture). Per-module STATE.md files were retired on 2026-05-27 and their pending items consolidated into `Future-Enhancements.md` §H.

---

# 🔴 P0 — Must ship before public launch

## P0.1 — LemonSqueezy upgrade flow (the billing wall)

**Status:** ⬜ Pending — final 1 / 100 production-readiness point.
**Owner:** `convex/billing/`, `core/platform/settings/components/groups/billing/`
**Why this is P0:** the AI quota gate already hard-blocks Free tier (`convex/ai/orchestrator/quotaGate.ts`); what's missing is the upgrade UX. Without it, paying users can't actually upgrade — they'd hit the gate, see "BYOK or upgrade", and have nowhere to click.

### What needs to ship

1. **LemonSqueezy webhook smoke test.** `convex/billing/webhooks.ts` already accepts events; verify against LemonSqueezy's test mode. Run the full lifecycle in a dev account: `subscription_created` → `subscription_updated` → `subscription_payment_failed` → `subscription_payment_recovered` → `subscription_cancelled`.

2. **Production signing-secret rotation playbook.** Document at `docs/runbooks/lemonsqueezy-rotation.md`. Current secret is `LEMON_SQUEEZY_SIGNING_SECRET`. Rotation requires:
   - Push new env var to Convex.
   - Update LemonSqueezy webhook config.
   - Verify next inbound event arrives with new signature.

3. **Per-variant feature-gate copy.** The pricing card in `core/platform/settings/components/groups/billing/PricingCard.tsx` lists tiers but the bullets are generic. Map each variant id (in `_platform/limits.ts`) to the specific copy: token quota, premium tools, support level.

4. **Trial flow + grace period.** `subscription_status: "on_trial"` is in the schema enum but unused. Add:
   - UI banner ("X days of trial left").
   - Quota-gate handling that treats trial = active.
   - 3-day grace period for `subscription_status: "past_due"` before falling back to free-tier behaviour.

### Files involved
- `convex/billing/webhooks.ts` — webhook lifecycle handlers
- `convex/_platform/limits.ts` — `getPlanLimits()` may need trial-aware variant
- `convex/ai/orchestrator/quotaGate.ts` — extend to honour `on_trial` + 3-day past_due grace
- `core/platform/settings/components/groups/billing/PricingCard.tsx` — per-variant copy
- `core/platform/settings/components/groups/billing/TrialBanner.tsx` — NEW (small banner)
- `docs/runbooks/lemonsqueezy-rotation.md` — NEW

### Verification
- Test mode subscription transitions flow through correctly + UI reflects state within 5 s.
- Manual: free user clicks "Upgrade to Starter" → completes checkout in LemonSqueezy test mode → returns to app → quota gate now allows platform models.
- `convex/billing/webhooks.test.ts` covers signature verification + state transitions (currently ~6 tests; add trial + past_due cases).

**Effort:** ~3 days.

---

## P0.2 — Re-enable testing-phase restrictions before launch

These 5 guardrails were intentionally relaxed during testing. They MUST be re-enabled before the platform takes paying users on the Free plan, otherwise LLM cost blows the budget.

### P0.2.A — Plan-tier gating in `getModel()`

**What's disabled:** any user can hit `claude-opus-4` / `gpt-4o` / `o3-mini` against the platform key regardless of plan.
**Risk:** uncapped Free-tier access on premium models would burn the LLM budget at any meaningful signup volume.
**Files:** `convex/ai/modelRegistry.ts` (`PLAN_ALLOWED_TIERS`, `getAllowedModelsForPlan`), `convex/ai/models.ts` (`getModel()` plan-tier downgrade block).

**How to re-enable:**
1. Restore the `allowedTiers` check in `convex/ai/models.ts` `getModel()` (the block that calls `pickAnyConfiguredModel()` when `!allowedTiers.has(info.tier)`).
2. Surface a soft-fail message when a user picks a model their plan can't run: "Your plan supports up to Sonnet 4.5; upgrading to Pro unlocks Opus 4."
3. Gate the model picker in `core/ai/components/ChatModelPicker.tsx` so disallowed entries either render greyed out with an upgrade CTA, OR are filtered out entirely (UX decision pending).
4. `useModelPreference` should respect `allowedTiers` again, derived from `useCurrentOrg().org.plan` + `MODEL_REGISTRY[modelKey].tier`.
5. For BYOK users, KEEP the bypass: if `usageMode === "byok"`, plan tier doesn't apply (their key, their cost).

**Verification:** new unit test — signed in on `plan: "free"`, calling `processChat.run` with `modelKey: "claude-opus-4"` should silently downgrade to a small-tier model with `usageMode: "platform"`.

### P0.2.B — Per-tool `requiredCapability: "premium"` gate

**What's disabled:** small models (Haiku, Llama-3.3, Kimi, gpt-4o-mini) can call high-stakes tools (`bulk_update`, `bulk_close_deals`, `update_org_settings`, `rename_entity_labels`, `invite_member`, `remove_member`, `create_pipeline`, `apply_template`, `create_field`).
**Risk:** small models hallucinate destructive args (e.g. `bulk_close_deals` with no filter → closes everything). Two-step approval still saves us, but the premium gate is a second layer of defence.
**Files:** `convex/ai/toolRegistry.ts` (`getToolsForRequest` capability filter), `convex/ai/tools/layers/{bulk,settings,members,pipelines,templates,fields}.ts`.

**How to re-enable:**
1. Restore the `if (def.requiredCapability === "premium" && modelTier === "small") continue;` filter in `getToolsForRequest()` in `convex/ai/toolRegistry.ts`.
2. Confirm runbooks block respects the same filter.
3. Update the "Model Capability Notice" injected by `systemPrompt.ts` for `modelTier === "small"`.

**Verification:**
- Unit: with `modelTier: "small"`, `getToolsForRequest` does NOT include `bulk_update`, `update_org_settings`, etc.
- Integration: with `modelKey: "claude-haiku-3-5"`, asking "delete all my leads" yields a refusal/explanation, not a tool call.

### P0.2.C — `stepCountIs` cap (raised to 30 for all models during testing)

**What's relaxed:** every model has the same 30-step recovery budget. The original spec proposed tier-aware caps `(small=12, standard=20, premium=30)`.
**Risk:** pathological agent loop on a small model can run for 30 tool steps before bailing.
**Files:** `convex/ai/orchestrator/streamLoop.ts:81`.

**How to re-enable:**
```ts
const STEP_CAP_BY_TIER = { small: 12, standard: 20, premium: 30 } as const;
const cap = STEP_CAP_BY_TIER[modelResult.tier];
streamText({ ..., stopWhen: stepCountIs(cap) });
```

**Verification:** small-tier model hitting an infinite tool loop terminates at 12 steps. Telemetry: `aiMessages.usage.totalSteps` p99 stays under cap.

### P0.2.D — `systemPrompt.ts` "Model Capability Notice" alignment

**What's stale:** the prompt still claims the small-model gate is on. Since P0.2.B is off, the claim is technically inaccurate.
**Decision:** when P0.2.B is reinstated, the notice and the gate align automatically.

### P0.2.E — `enforcePlanLimit` quota tightening

**What's loose:** Free plan caps deliberately generous for testing (`maxLeads`, `maxDeals`, `maxCustomFields` in `convex/_platform/limits.ts`).
**Files:** `convex/_shared/enforcePlanLimit.ts`, `convex/_platform/limits.ts`.

**How to re-enable:** re-tune `Free` limits (e.g. `maxLeads: 100`, `maxDeals: 50`, `maxCustomFields: 5`). Ship the AI-message credit pool ($199 = 50,000 credits) per the pricing ladder.

**Verification:** creating 101st lead on Free plan throws `PLAN_LIMIT_REACHED`. Dashboard surfaces a "X% of plan used" indicator.

---

# 🟡 P1 — Next sprint window

## P1.1 — Stage 3-A session 3 (Proactive UX polish closeout)

**Goal:** close the WHOLE Stage 3-A as ✅ shipped. Sessions 1 + 2 are done; session 3 is a polish wave with a focused 4-item scope.

### P1.1.A — FirstTimeTour for ChatLandingPane (UX-5 from STAGE-3A-PROACTIVE-UX-PLAN.md)

**What it does:** 3-step coachmark that fires once per device when a user first sees the new Chat Landing Pane (the empty-state with greeting + Today's Pulse + Top 3 next actions + recent thread chips).

**Steps:**
1. Point at the "Today's Pulse" block: "Your morning briefing lives here."
2. Point at the "Top 3 Next Actions" rows: "These are the highest-priority things waiting for you."
3. Point at the prompt chips: "Tap one of these to ask me to do it."

**Files:**
- `core/ai/components/ChatLandingPane.tsx` — mount `<FirstTimeTour id="chat-landing-v1" steps={...} />` after the existing UI.
- Tag elements with `data-tour="landing-pulse"`, `data-tour="landing-actions"`, `data-tour="landing-chips"`.

**Acceptance:** tour fires once per device; Esc / × / backdrop-click dismisses; bumping the id (`v1` → `v2`) re-fires when steps change.

### P1.1.B — Drag-and-drop file attach on dashboard composer

**What it does:** drop a CSV / image onto `AIQuickComposerCard`; the card lazy-creates a conversation, attaches the file, opens the chat panel with the manifest line in the body.

**Why deferred from session 2:** the lazy-create-conversation-on-attach UX changes the contract slightly (file scoped to a thread that has no message yet). Session 2 already shipped `lazyWarmForUser` and the section header — adding D&D would have doubled the test surface.

**Files:**
- `core/ai/lib/uploadAttachments.ts` (NEW) — extract from `core/ai/components/composer/ChatAttachButton.tsx`. Surface: `uploadAttachments({ orgId, conversationId, files }): Promise<PendingAttachment[]>`.
- `core/ai/components/composer/FileAttachButton.tsx` (NEW) — paperclip affordance + D&D listener that lazy-creates the conversation via an `onEnsureConversation: () => Promise<Id<"aiConversations">>` prop.
- `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx` — mount `<FileAttachButton>` next to model picker; add `pendingAttachments` state; inject `[file:<id> "name"]` manifest line into body before send.

**Acceptance:** drag CSV onto composer → conversation auto-created → side panel opens with first turn containing the manifest line.

### P1.1.C — Final cross-template manual-smoke pass per persona

For each of the 9 industry templates (`generic`, `real_estate`, `health_clinic`, `salon`, `coaching`, `event_planning`, `productivity`, `freelancer`, `agency`, `b2b_saas`), open the seeded workspace, eyeball the dashboard, confirm first-paint feels persona-appropriate. Document any gaps in `Future-Enhancements.md` if found.

### P1.1.D — Closeout — collapse Stage 3-A IN-PROGRESS block to a single ship paragraph

Apply the doc-cleanup contract: roll up sessions 1 + 2 + 3 into a single ✅ paragraph in `SHIPPED.md`. Move all per-session detail to git history.

---

## P1.2 — Phase 2 deferred polish (verified pending)

> **Note:** the prior Phase-2-progress.md listed 4 deferred polish items. A code-scan during this consolidation (2026-05-27) found 2 of them are ACTUALLY ALREADY SHIPPED but were never flipped in docs. Only the 2 items below are genuinely pending.

### P1.2.A — Warn-mode banner on deal detail (MEDIUM)

**What it does:** when `pipelines.stages[].onEnter.requiredFields` are missing AND `stageTransitionPolicy === "warn_only"`, show an amber pill + missing-field list + CTA on the deal detail.

**Status:** schema + transition policy support it; UI doesn't render the warning.

**Files:**
- `core/entities/_entities/deals/views/DealDetailView.tsx` — add a `<WarnModeBanner>` between the header and the kanban.
- New `core/entities/_entities/deals/components/WarnModeBanner.tsx`.
- Reuse `convex/crm/entities/deals/queries.ts:getMissingFieldsForStage` (already exists).

**Acceptance:** dragging a deal into a stage with `warn_only` policy + missing required fields renders the banner; clicking "Fill now" opens `<FillMissingFieldsDialog>` (already shipped).

### P1.2.B — Per-stage advanced settings UI in PipelineEditor (MEDIUM)

**What it does:** expose `staleAfterDays`, `warningAfterDays`, `isFinal`, `finalType` for editing per stage. Schema supports them; UI only reads `isFinal`.

**Files:**
- `core/platform/settings/components/groups/pipelines/PipelineEditor.tsx` — add an "Advanced" expandable per row with 4 number/select inputs.
- `convex/crm/fields/pipelines/mutations.ts:updateStageImpl` — accepts the 4 fields already.

**Acceptance:** editor saves all 4 fields; `<StaleIndicator>` (already exists) honours per-stage `staleAfterDays` from the saved value, not a hardcoded default.

---

## P1.3 — P3 AI tool gaps from AI-TOOL-COVERAGE-AUDIT (G-1..G-7)

> **Source:** `AI-TOOL-COVERAGE-AUDIT.md §3` — function-by-function pass against the dev deployment found 7 P3 gaps. All P3, none affect the senior-CRM bar; group as a single mini-stage when the user wants polish.

| ID | Tool | Effort | Notes |
|---|---|---|---|
| G-1 | `change_pipeline` (move D-007 between Sales / Renewals pipelines) | ~1 hr | Public `deals/mutations:changePipeline` exists; ForAI twin missing. |
| G-2 | `reorder_field_definitions` | ~30 min | Public exists. Setup-time gesture. |
| G-3 | `start_dm` / `start_direct_message` | ~1 hr | `conversations/mutations:ensureDirectMessage` exists. "DM Sara about Acme deal." |
| G-4 | `manage_conversation` (rename / archive / unarchive — fold into one twoStep with `mode`) | ~1 hr | 3 public mutations exist; could be one tool. |
| G-5 | `delete_note_category` | ~30 min | Public `noteCategories/mutations:remove` exists; UI-only today. |
| G-6 | `move_note_to_entity` | ~30 min | Public `notes/mutations:setEntity` exists; useful when AI mis-attaches. |
| G-7 | `mark_all_notifications_read` | ~30 min | `notifications/mutations:markAllRead` exists. |

**Acceptance for the batch:** every tool has a `*ForAI` twin in the same file as the public mutation, the tool registers in the right layer, the system prompt verb-routes to it, and a contract test covers happy + auth-deny paths.

---

## P1.4 — Capability roadmap deferrals

> **Source:** `AI-AGENT-CAPABILITY-AUDIT.md §6` final scorecard. These are the 7 items that did not ship in Stages 6-9 and are tracked as backlog cards. None block the senior-CRM bar (already reached at 8.6/10).

| ID | What | Why deferred |
|---|---|---|
| D-4 | Auto-note from file (after `analyze_file`, write a structured note to the right entity) | Needs UX decision on "which entity" when ambiguous. |
| D-5 | Stage-template tool (apply a 5-stage template wholesale to a new pipeline) | Needs template catalogue. |
| W-3 | Auto-tag classifier (when a note is added, auto-suggest tags via embedding similarity) | Needs embedding store. |
| W-5 | Weekly digest email (per-org Monday morning summary) | Needs Resend integration + template editor. |
| P-5 | Similarity / pattern matching (find leads similar to my best closed deals) | Needs embedding store. |
| `set_default_note_category` | Atomic tool to flip the default | Public `setDefault` mutation exists; ForAI twin trivial; defer to user request. |
| Bulk-progress mid-flight chunked streaming | Stream `commit_bulk_*` progress as chunks while the loop runs | Needs streaming-patch protocol on `aiMessages`. |

---

## P1.5 — Low-priority polish (T11, T12, C-tier audit items)

| ID | What | Effort |
|---|---|---|
| T11 | Reminder kinds histogram. `create_reminder.reminderType` is hardcoded to a 5-item enum. If telemetry shows custom kinds, add `list_reminder_kinds` returning a 30-day distinct histogram. | ~1 hr |
| T12 | Permission catalog introspection. Add `list_permission_catalog` always-on read tool returning `{ key, description, category }[]` from `convex/_shared/permissions/catalog.ts`. | ~30 min |
| C.4 | Audit propose-vs-commit schema diff for every twoStep tool. Startup check that diffs each `propose_X.schema` against `commit_X.schema` and warns when propose has fields commit doesn't. Prevents silent data loss on new twoStep tools. | ~2 hrs |
| C.5 | Friendly errors on `streamLoop` `tool-error` chunks. Run the same `friendlyToolError` mapper on `chunk.error` before patching the tool record. Keep raw error in `output.rawError` for debugging. | ~1 hr |
| Custom-field diff capture in `update_entity` | Capture the BEFORE/AFTER for every patched field for richer activity logs. | ~2 hrs |

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

### B.22 — Org-wide approval-policy override (Owner force-locks a category)

**What it does:** today every member tunes their own per-user approval gate (`users.preferences.aiApprovals`). This card adds an Owner-level override (`orgs.settings.aiApprovalsOverride`) that force-locks specific categories org-wide regardless of user preference.

**Why deferred:** per-user controls already ship; per-org override is a Phase 5 governance lever for teams of 10+.

**Files:**
- `convex/schema/identity.ts::orgs` — add `settings.aiApprovalsOverride` (8 booleans, optional).
- `convex/_shared/aiApprovals.ts` — add `resolveEffectiveAutoApprove(userPref, orgOverride)`; if any override key is `true`, the user pref for that key is forced to `false` ("always ask wins").
- `convex/ai/toolRegistry.ts::resolveNeedsApproval` — accept `orgOverride`.
- `convex/ai/orchestrator/run.ts` — load `org.settings.aiApprovalsOverride` and pass through.
- `core/platform/settings/components/groups/ai/AIApprovalsSection.tsx` — show "🔒 Org policy: always asks" badge on locked rows; suppress user toggle.
- New `convex/orgs/mutations.ts:updateAiApprovalsOverride` (Owner+Admin gated on `org.manage`).

**Acceptance:** 4 contract tests in `convex/ai/approvalGate.test.ts` — org-override `true` forces ask even when user opted in; `undefined` falls back to user pref; `false` is no-op (force-lock direction only); UI renders the locked badge.

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

Reserved for super-admin operations (e.g. "show me churn risk across all paying orgs", "list orgs with > 80% plan usage"). Schema is multi-tenant from day 1; the AI layer hasn't yet been pointed at the multi-org view. **Track separately under `PLATFORM-OWNER-PANEL.md` — that doc is the canonical spec for this whole surface.**

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

**Spec:** `PLATFORM-OWNER-PANEL.md` (preserved as-is; ~24 hours of focused implementation).

**Mount path:** `/{locale}/platform-owner` (added to `RESERVED_SLUGS`).

**Triple gate:** middleware → server-component layout (platformRole === "super_admin") → Convex `requirePlatformOwner` helper + email allow-list env var.

**Surfaces:** Overview, Org list, Org detail, AI context editor, Tool catalogue (read-only) + runbook overrides, Tiers, Billing (LemonSqueezy webhooks), Feature flags, Audit log, Env vars (read/write via Convex admin token).

---

# How to use this file

1. **Anything in here is verified pending** as of 2026-05-27. If you ship a section, move its 1-line summary to `SHIPPED.md` and DELETE the section here in the SAME edit (per AGENTS.md → "RULE: Doc cleanup at every commit").
2. **Anything not in here is shipped or out of scope.** Don't re-track work already in `SHIPPED.md`. Don't add work that contradicts a locked decision in `AGENTS.md`.
3. **When in doubt, scan the codebase.** This file is grounded by a code-scan; if the codebase says one thing and a doc says another, trust the codebase and update the doc. The 2 docs-drift items found during this consolidation (FollowUpsPanel mounted as EntityFollowups; FillMissingFieldsDialog already at `core/entities/_entities/deals/components/`) were already silently shipped.
4. **Cross-references retained:** `LANDING-PAGE.md`, `PLATFORM-OWNER-PANEL.md`, `AGENTS.md`, `SHIPPED.md`, every `core/*/MODULE.md`, every `convex/**/MODULE.md`, every `docs/architecture/*`. Everything else at the repo root that previously tracked progress has been collapsed into this file. Per-module STATE.md files were retired on 2026-05-27 — their pending items live in `Future-Enhancements.md` §H.
