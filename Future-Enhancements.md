# Future Enhancements — pending only

> **Purpose.** Single source of truth for things intentionally deferred during testing/pre-launch + opportunistic enhancements identified along the way. Anything removed/relaxed/skipped MUST land here with full context so it can be reinstated correctly later.
>
> **Audience.** Future agents, future-you, reviewers asking "why is X disabled?".
>
> **Maintenance contract.** Whenever an agent disables, defers, or weakens a guardrail/restriction/capability — even temporarily — they MUST add an entry below before the change is shipped. See `AGENTS.md` → "RULE: Deferred restrictions live in Future-Enhancements.md".
>
> **Cross-references.** This file is for **deferral cards** only. For full pending sprint scope (with stage groupings + acceptance criteria), see **`PENDING.md`**. For shipped items, see **`SHIPPED.md`**. For per-module architecture, see `core/*/MODULE.md` + `convex/**/MODULE.md` (per-module STATE.md files were retired on 2026-05-27 and their pending items consolidated into Section H below).
>
> Last full rewrite: **2026-05-27** (collapsed every shipped card into `SHIPPED.md`; only deferral cards remain here).

---

## How to read this file

Each entry is a self-contained card. The reader should be able to re-enable / implement an item using ONLY that entry — no chat history needed.

```
### <Short title>

| Field           | Value                                                                |
|-----------------|----------------------------------------------------------------------|
| Status          | Deferred / Removed / Backlog / In progress                           |
| Category        | Model gating / RBAC / Rate limit / Billing / UX / Performance / etc. |
| Phase to ship   | When this should land                                                |
| Owners          | Module(s) responsible                                                |
| Risk if skipped | What goes wrong in production if we forget                           |
| Files involved  | Concrete file paths + line ranges when known                         |

**Why we deferred:** ...
**Benefits when reinstated:** ...
**Use cases / who it protects:** ...
**Implementation sketch:** ...
**Verification:** what command / test confirms it's back on
```

---

# A. Currently-disabled restrictions (re-enable before public launch)

## A.6 — Auto-approve `files` (✅ implemented Stage 0.5 of `DASHBOARD-V2-PLAN.md`, 2026-05-28)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | ✅ Implemented (Stage 0.5)                                                          |
| Phase shipped   | Stage 0.5 of `DASHBOARD-V2-PLAN.md`                                                |
| See             | `SHIPPED.md` "Stages 0.5 + 1 of `DASHBOARD-V2-PLAN.md`"                            |

**Outcome.** `convex/ai/orchestrator/streamLoop.ts:wrapToolsForApprovalSanitisation` now closes the silent-drop class of bug at its source: when `resolveNeedsApproval(...) === false` for a propose-shape result AND a paired `commit_<tool>` is registered AND its zod schema accepts the propose payload's `confirmationPayload.args`, the wrapper looks up the commit via `getRegisteredTool` (same path `resume.ts` uses post-user-approval), parses the args, runs `commit.execute()`, and returns the commit's real summary to the SDK. `convex/_shared/aiApprovals.ts:AUTO_APPROVE_DEFAULTS.files` flipped back to `true`. Architectural deviation from the original plan: kept the auto-commit path as a registry lookup instead of adding a `commitFn?` field to every ToolDef — zero churn for tool authors, single code path with `resume.ts`. Verified by `convex/ai/approvalGate.test.ts` guards 14a / 14b / 14c.

---

## A.7 — Bulk tools exempted from the `requiredCapability: "premium"` model-tier gate (2026-05-29)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Removed (intentional — product decision, NOT a testing-phase deferral)             |
| Category        | Tool surface / Model gating                                                        |
| Phase to ship   | Permanent for bulk-CREATE. Re-evaluate bulk-UPDATE/CLOSE gating at launch (see below). |
| Owners          | `convex/ai/tools/layers/bulk.ts`                                                   |
| Risk if skipped | Small-tier models can run bulk update/close/create. Blast radius is still bounded by the HARD-LOCKED `bulk` approval category (every batch shows one propose card the user must approve) + per-entity RBAC + per-row rate limits. |
| Files involved  | `convex/ai/tools/layers/bulk.ts` (`bulk_update_entities`, `bulk_close_deals`, new `bulk_create_entities`); `convex/ai/tools/tasks.ts` (`bulk_create_tasks`) |

**Why we removed it:** the user's core onboarding flow is "let me add/seed all my data at once" instead of one record at a time. Gating bulk behind a premium model tier meant a free/testing org on a small model could not seed test data or do a bulk import — the exact friction that produced the 2026-05-29 "make 10 leads → it made 1 then mis-routed to apply_template" bug. Bulk-CREATE staying free is a deliberate product decision (data onboarding must always work). The two existing A.2-gated bulk tools (`bulk_update_entities`, `bulk_close_deals`) were ungated in the same edit for consistency.

**Benefits of keeping it removed:** any user, any tier, can onboard/seed/clean data in one approval round. Removes the #1 friction in first-run.

**Use cases / who it protects:** free-tier + testing orgs seeding sample data; teams importing an existing book of business; the AI's "create N sample deals" empty-state CTA on the pipeline panel.

**If bulk-update/close gating must come back** (cost-control on small models only): re-add `requiredCapability: "premium"` to `bulk_update_entities` + `bulk_close_deals` ONLY — keep `bulk_create_entities` + `bulk_create_tasks` free. The `bulk` HARD-LOCKED twoStep category (`convex/_shared/aiApprovals.ts`) already forces an approval card regardless, so the gate is purely a model-tier cost lever, not a safety one.
**Verification:** `convex/ai/agentScorer.test.ts` exercises the tool layer; a small-tier request now sees the bulk tools. Manual: ask a small-model org "create 5 sample leads" → `bulk_create_entities` propose card appears.

---

# B. Backlog — known opportunities

## B.1 — Streak widget (Phase 4 deferred from Phase 3A)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Reserved slot in dashboard registry; renders "Coming soon"                         |
| Category        | Engagement / Gamification                                                          |
| Phase to ship   | Phase 4 (post-3C)                                                                  |
| Owners          | `convex/users/`, `core/shell/shell/views/dashboard/`                               |
| Risk if skipped | None — purely upside.                                                              |
| Files involved  | `convex/schema/identity.ts` (planned: `userDailyActivity` table; `users.streak` cache), `convex/crons.ts` (planned: nightly streak compute), `core/shell/shell/views/dashboard/cards/StreakCard.tsx` (planned). |

**Why deferred.** Decided in Phase 3A (Q9) to ship a placeholder slot but defer real implementation until after AI assistant + WhatsApp/voice (3B/3C) ship.

**Implementation sketch.**
1. New table `userDailyActivity` with `(userId, orgId, date)` unique index and `count` field.
2. Increment from any user-driven mutation (note add, deal move, reminder complete) — debounced once per day per user.
3. Cron: nightly `computeStreaks` walks `userDailyActivity` for the last 60 days and updates `users.streak = { current, longest, lastActiveDate }`.
4. Widget in `WIDGET_REGISTRY` slot `"users.streak"` — already reserved in productivity template.

**Benefits.** Daily-active retention lever; pattern proven in Duolingo / Linear / Notion. Trivial to implement on top of `activityLogs` (we already have it).

---

## B.2 — Cmd+K global command palette

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred (Phase 4)                                                                 |
| Category        | Productivity / UX                                                                  |
| Phase to ship   | Phase 4                                                                            |
| Owners          | `core/data-display/command-palette/`                                               |
| Risk if skipped | None functional — just a power-user accelerator.                                   |
| Files involved  | `core/data-display/command-palette/MODULE.md` already drafts the design.           |

**Implementation sketch.** Use `cmdk` library; index all routes + entities + slash commands; respect locale; reuse `useEntityLabels`.

---

## B.4 — Markdown chat renderer with Shiki highlighting

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred (Phase 4 / polish)                                                        |
| Category        | UX                                                                                 |
| Phase to ship   | Phase 4 (`streamdown` replacement — Attio Problem 5)                               |
| Owners          | `core/ai/components/markdown/`                                                     |
| Risk if skipped | Half-rendered `**bold` flickers in mid-stream. Cosmetic but noticeable.            |
| Files involved  | `core/ai/components/markdown/Markdown.tsx`                                         |

**Implementation sketch.** Suppress incomplete syntax until closing tag arrives; smooth animation decoupled from network bursts. Reference: Attio engineering blog.

---

## B.5 — Bulk-update modal for kanban (UI for existing AI tools)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred (Phase 4)                                                                 |
| Category        | Productivity                                                                       |
| Phase to ship   | Phase 4                                                                            |
| Owners          | `core/data-display/kanban/`                                                        |
| Risk if skipped | None. Power users currently fall back to AI ("close all deals with no activity for 30+ days"). |
| Files involved  | New: `core/data-display/kanban/components/BulkActionsBar.tsx`                      |

---

## B.11 — Multi-entity CSV import (contact / company / deal twins)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Onboarding / Data import                                                           |
| Phase to ship   | Phase 5 (vertical-CRM expansion)                                                   |
| Owners          | `convex/crm/entities/{contacts,companies,deals}/mutations.ts` (new `bulkInsertFromCsvImpl/Import/ForAI` per entity) |
| Risk if skipped | Medium. Users with mixed-entity spreadsheets ("companies sheet + contacts sheet") today must split-and-import twice. |
| Files involved  | `convex/ai/quarantined/csvParser.ts` (extend `targetEntity` switch); `convex/ai/tools/layers/csvImport.ts` (broaden `TARGET_ENTITY` enum); `convex/schema/ai.ts` (already supports the union — no migration). |

**Why deferred.** Phase 1 ships `lead` only because it's the highest-frequency import path. The schema's `targetEntity` union already accepts `lead | contact | company | deal`; the parser short-circuits non-lead with a friendly error today. Adding the three additional entities is structurally straightforward — each needs its own `*Impl` body that respects entity-specific dedup keys (companies dedup by domain, deals by `(stage, value, personCode)`).

**Implementation sketch.**
1. Add `bulkInsertFromCsvImpl` + public + ForAI in `crm/entities/contacts/mutations.ts`, `companies/mutations.ts`, `deals/mutations.ts`.
2. Extend `convex/_shared/dedup.ts` with entity-specific candidate shapes (e.g. `DedupCompanyCandidate` keyed on domain).
3. Widen `TARGET_ENTITY` enum in `convex/ai/tools/layers/csvImport.ts` from `["lead"]` to `["lead", "contact", "company", "deal"]`.
4. Drop the Phase-1 short-circuit in `convex/ai/quarantined/csvParser.ts` (`if (importRow.targetEntity !== "lead") fail()`).

**Verification.** Add three new scorer tests mirroring the existing CSV ones, one per entity. Manual: import a real contacts CSV → preview shows correct dedup decisions → commit lands rows in the right table.

---

## B.12 — CSV preview per-row dedup-decision override UI

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX                                                                                 |
| Phase to ship   | Phase 4 (CRM polish)                                                               |
| Owners          | `core/ai/components/preview/CsvImportPreviewCard.tsx`; new `convex/ai/csvImports.ts:patchRowDecision` mutation |
| Risk if skipped | Low. Users who disagree with a parser decision today must re-export the file with a different shape. |
| Files involved  | `core/ai/components/preview/CsvImportPreviewCard.tsx` (currently read-only); `convex/ai/csvImports.ts` (add `patchRowDecision` orgMutation that flips `dedupDecision` in `previewRows[idx]`). |

**Implementation sketch.**
1. Add `patchRowDecision` to `convex/ai/csvImports.ts` — orgMutation that takes `{csvImportId, idemKey, decision}`, locates the row by idemKey, swaps the field, patches the doc.
2. Add inline `Skip` / `Insert` / `Merge` buttons to each row in `CsvImportPreviewCard.tsx` (only visible while status === "ready").
3. Optimistic update — `withOptimisticUpdate` so the badge flips instantly.

**Verification.** Add a frontend vitest covering the click-flip flow. Manual: open a preview with a wrong dedup call, click the row to flip skip→insert, approve, confirm the row landed.

---

## B.13 — CSV mapping editor in the preview card

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX                                                                                 |
| Phase to ship   | Phase 4 (CRM polish)                                                               |
| Owners          | `core/ai/components/preview/CsvImportPreviewCard.tsx`; new `convex/ai/csvImports.ts:patchMapping` mutation; re-parse path |
| Risk if skipped | Low–Medium. The parser's heuristic header guesser handles ~85% of real-world CSVs; outlier cases need a second import after editing the file. |
| Files involved  | `core/ai/components/preview/CsvImportPreviewCard.tsx` (today shows mapping read-only / not at all); `convex/ai/quarantined/csvParser.ts` (re-extract using user-edited mapping); `convex/ai/csvImports.ts`. |

**Implementation sketch.**
1. Add `patchMapping` orgMutation that swaps the `mapping` field + flips status back to `parsing`.
2. Schedule the parser action to re-run with the new mapping passed in.
3. Add an "Edit mapping" toggle in the preview card that exposes a per-column `<select>` of canonical fields.
4. Show "Re-parsing…" spinner while the action re-runs.

---

## B.20 — Cross-conversation AI learning (embedding-based memory)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI / UX                                                                            |
| Phase to ship   | Phase 5                                                                            |
| Owners          | `core/ai`                                                                          |
| Risk if skipped | Without it, every new chat starts from zero. The AI re-learns the user's preferences each time. P1.12 (`aiPersonaContext`) covers durable facts the model writes explicitly, but does NOT capture latent patterns ("this user always asks for short replies", "this user tags every lead with `@hot`"). |
| Files involved  | `convex/ai/personaContext.ts` (extend), new `convex/ai/learningPipeline.ts`, new `convex/schema/aiSchema.ts::aiObservations` table, new embedding store (Convex's vector index or external). |

**Why deferred.** Real cross-chat learning needs an embedding store, a quarantined summarisation worker that runs after each conversation, and a careful safety review (we must NEVER store PII in the persona). P1.12 ships the durable-context surface; this card ships the auto-learning loop.

**Implementation sketch.**
1. New `aiObservations` table (orgId, userId, observation, confidence, ts) — capped at 200 rows / user via FIFO eviction.
2. After each chat completes, a quarantined LLM action reads the conversation + the current `aiPersonaContext` and emits either a `keyFacts` patch or an observation.
3. `buildSystemPrompt` reads top-N observations by confidence, includes them under `## Observed patterns` (clearly labelled "may be wrong, ask if you're unsure").
4. User-facing toggle in Settings → AI: "Let the AI learn from our conversations" (off by default; opt-in).

**Verification.** A two-conversation scorer test where conversation 1 establishes "I prefer one-line replies", conversation 2 verifies the AI honours it without being re-told.

---

## B.21 — AI workflow integration (Inngest + activityLogs event bus)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI / Workflow                                                                      |
| Phase to ship   | Phase 5                                                                            |
| Owners          | `core/ai`, `core/workflows` (new module)                                           |
| Risk if skipped | AI is currently chat-only. Without this card the AI can't surface "deal moved stage → suggest follow-up", "lead went stale → ask the user", "morning digest emailed to admins". |
| Files involved  | new `convex/workflows/` module, new `convex/ai/triggers.ts`, integration with Inngest (already provisioned). |

**Why deferred.** This is its own phase. Needs a workflow definition language, a trigger registry, retries, idempotency, and per-org limits. Phase 4 Part 2's "Per-org AI Telemetry UI" is a prerequisite — operators need visibility before we let the AI fire async.

**Implementation sketch.**
1. Define `workflows` schema (id, trigger, action, enabled, lastRanAt, …).
2. Inngest function listens for `activityLogs` inserts, dispatches matching workflows.
3. Workflow actions can be: "summarise to slack", "create AI insight row", "send notification", "schedule reminder".
4. Per-org cost cap (workflow actions count against the org's AI budget).

**Verification.** End-to-end test: insert an activityLog row of type "deal.stage.moved" → workflow fires → an `aiInsights` row appears with the AI's analysis.

---

## B.22 — Org-wide approval-policy override (Owner force-locks a category)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | RBAC / Governance                                                                  |
| Phase to ship   | Phase 5                                                                            |
| Owners          | `convex/_shared/aiApprovals.ts`, `convex/ai/toolRegistry.ts`, `core/platform/settings/components/groups/ai/AIApprovalsSection.tsx`, new `orgs.settings.aiApprovalsOverride` schema field |
| Risk if skipped | Low. Per-user approval preferences ship today; each member tunes their own gate. The risk this card mitigates is "one risky member opts in to auto-approve `delete_record` and trashes records they shouldn't have." |
| Files involved  | `convex/schema/identity.ts::orgs`, `convex/_shared/aiApprovals.ts`, `convex/ai/toolRegistry.ts`, `convex/ai/orchestrator/run.ts`, `core/platform/settings/components/groups/ai/AIApprovalsSection.tsx`, new `convex/orgs/mutations.ts:updateAiApprovalsOverride` |

**Why we deferred.** Per-user controls ship the user value today. Per-org overrides need: a clear UX for "owner force-locks delete_record" (different visual state than "user-default ON"), a backfill story (existing user prefs that conflict with a newly-locked category), and an audit-log trail.

**Implementation sketch.**
1. Schema: extend `orgs.settings` with the optional override map. No migration — additive optional field.
2. `resolveEffectiveAutoApprove` becomes `(userPref, orgOverride)` — for each category, if `orgOverride[k] === true`, return `false`; else fall back to user pref / default.
3. `run.ts` calls `ctx.runQuery("orgs/queries:get", {orgId})` and passes `org.settings.aiApprovalsOverride` through.
4. UI: each row in `AIApprovalsSection` checks the override; if locked, render disabled Switch with a "🔒 Locked by org policy" subtitle.
5. Owner-only editor card under Settings → AI → Approvals → "Workspace overrides" (collapsed by default).
6. Activity log entry on every override change.

**Verification.** Add 4 contract tests to `convex/ai/approvalGate.test.ts`: org-override `true` forces ask even when user opted in; `undefined` falls back to user pref; `false` is a no-op (we only support force-lock direction); UI renders the locked badge correctly.

---

## B.24 — Dashboard industry-awareness pass (templates' default widget set)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX / Personalisation                                                               |
| Phase to ship   | Stage 3-A session 3 OR Stage 3-B (focused work)                                    |
| Owners          | `convex/crm/fields/templates/definitions/{generic,real_estate,health_clinic,salon,coaching,event_planning,productivity,freelancer,agency,b2b_saas}.ts`, `convex/_shared/widgetRegistry.ts`, `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`, `core/shell/shell/views/dashboard/DashboardHomeView.tsx` |
| Risk if skipped | Medium. User feedback after Stage 5/7 dashboards landed: "different industries don't see widgets that match their persona — the dashboard feels half-baked." |
| Files involved  | The 9 industry-template `dashboardMetrics` arrays + `DashboardHomeView.tsx` (currently fixed Row 1 / Row 2 / Row 3, needs to honour array order). |

**Why we deferred.** Genuine persona work needs a short interview per persona ("what does a real-estate agent want to see in the first 10 seconds of opening their dashboard?"), a migration that flips existing orgs without trampling explicit user choices, and a pre-flight scan to confirm the migration is safe.

**Implementation sketch.**
1. For each of the 9 templates, write a persona paragraph at the top of the `definitions/<industry>.ts` file: "A real-estate workspace's first paint should lead with…" — anchor every default below to that paragraph.
2. Re-rank `dashboardMetrics` per template; surface the new ordering with a one-test-per-template guard.
3. Order-aware section rendering in `DashboardHomeView.tsx`.
4. Migration `convex/_migrations/2026_05_28_personaDashboardDefaults.ts` — for orgs whose `dashboardMetrics` exactly matches the OLD generic-default array, swap to the new persona default. Otherwise no-op.

**Verification.** 9 contract tests at `convex/widgetTemplates.test.ts` — every persona's default round-trips through `validateDashboardLayout` AND has a UNIQUE first-paint shape vs `generic`.

---

## B.25 — Per-widget action shortcuts ("mark complete" / "open record" / inline AI compose)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX                                                                                 |
| Phase to ship   | Stage 3-A session 3 OR Stage 3-B                                                   |
| Owners          | `core/shell/shell/views/dashboard/cards/{TodaySummaryCard,RemindersCard,PipelineCard,MessagesPreviewWidget,WeekAheadWidget,MiniCalendarWidget,TimelineActivityWidget}.tsx`, `core/scheduling/reminders/components/ReminderCard.tsx`, `core/comms/messages/components/*` |
| Risk if skipped | Low-medium. User feedback (we1.png + we2.png): widgets need inline shortcuts on populated AND empty states. |
| Files involved  | All 8 dashboard widget files; needs a shared `convex/react` mock at `core/test-utils/mockConvex.tsx` for vitest component tests. |

**Per-widget shortcut grid (acceptance criteria):**

| Widget | Empty-state | Populated-state per-row |
|---|---|---|
| `RemindersCard` | already partial via `<NextReminderFallback>` | leading `<ReminderQuickComplete>` (already shipped) + "Open record" + on-hover "Reschedule" |
| `TodaySummaryCard` | n/a (always populated) | per-row "Ask AI for next move" inline shortcut |
| `MessagesPreviewWidget` | "Send a message" CTA (already shipped Stage 1) | per-row "Reply" + "Open thread" on hover |
| `WeekAheadWidget` | "Schedule something" CTA (already Stage 1) | per-event "Mark done" + "Reschedule" + "Open" |
| `MiniCalendarWidget` | "+ Schedule" header CTA (already Stage 1) | per-event-dot tooltip + click → details popover |
| `TimelineActivityWidget` | "Take an action" CTA (already Stage 1) | per-row "Open record" + on-hover "Show me what changed" |
| `PipelineCard` | n/a | "What changed today?" `sendChatPrefill` shortcut in the header |

**Implementation sketch.** Reuse `sendChatPrefill` for AI-delegating shortcuts; reuse the existing per-row mutation hooks for direct-action shortcuts. RTL-safe + `rounded-[var(--radius)]` everywhere. Per-widget `aria-label` on every shortcut button.

**Verification.** 8 vitest cases (one per widget) — render the widget in both states and assert the shortcut buttons are present + clickable.

---

## B.26 — `AIQuickComposerCard` file attach (lazy-create-on-attach UX) — ✅ Implemented 2026-05-27

Shipped in the Dashboard AI fixes pass on 2026-05-27. `AIQuickComposerCard` now embeds `<ChatAttachButton>` directly, with `ensureConversation` callback for lazy-create and `[file:<id> "name"]` manifest-line prepending on send. Attachment chips render above the textarea with per-file remove. Closed without extracting a separate `uploadAttachments.ts` helper — the existing `ChatAttachButton` was reusable as-is. See `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx`.

---

## B.27 — Per-org "Re-apply latest template" action

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Industry templates / data-migration UX                                             |
| Phase to ship   | Phase 5+                                                                           |
| Owners          | `convex/_platform/industries/`, `core/platform/settings/components/groups/workspace/` |
| Risk if skipped | Owners who edit a built-in template via `/xowner/industries/<key>` see the changes apply only to NEW orgs that pick the template afterwards. Existing orgs keep their old shape. The owner has no in-product way to push curated changes (e.g. a new "Closed-Won-Refund" stage) to existing customers without writing a one-off migration. |
| Files involved  | `convex/_platform/industries/mutations.ts` (add `reapplyLatestToOrg`), `convex/orgs/mutations.ts::applyTemplate` (extend with `merge: "skip-if-exists" | "overwrite"`), `core/platform/settings/components/groups/workspace/WorkspaceTemplateSection.tsx` (add "Re-apply latest" CTA + diff preview). |

**Why we deferred.** Per locked decision L6 in `INDUSTRY-TEMPLATES-DB-MIGRATION.md` — re-applying risks stomping per-org customisations (added pipelines, edited field labels, removed stages). The only safe path is a structured diff-and-merge UI that the org admin sees before approving, which is a multi-week project on its own. v1 ships "edits affect new orgs only".

**Benefits when reinstated.**
- Owners can ship template improvements (new field, renamed stage, new AI persona overlay) to every org on that template — no manual per-org work.
- Customer trust — customers see live template improvements without a forced re-onboarding.
- Platform velocity — feature rollout via template edit becomes the default workflow once this lands.

**Use cases / who it protects.** Real-estate brokerages on `real-estate-dubai` adopting a new RERA field; B2B SaaS orgs adopting a new MEDDIC stage.

**Implementation sketch.**
1. New `reapplyLatestToOrg(orgId, templateKey)` internal action that:
   - Reads the current `platformTemplates` row.
   - Reads the org's existing pipelines / fields / modules / etc.
   - Computes a 4-way diff: ADD (new in template, missing in org), REMOVE (removed from template, exists in org — usually skip), RENAME (matched by code/name), KEEP (org customisation, untouched).
2. Returns the diff as a structured payload for the UI.
3. Settings UI lets the org admin tick which ADDs to apply, then commits.
4. Audit log gets `org.template.reapply` rows for each entity touched.

**Verification.** Two-org integration test where org-A has the old template + a custom pipeline; the owner edits the template; the org admin runs re-apply; org-A's custom pipeline survives, the new template stage is added.

---

## B.28 — AI-generated custom industry templates from chat

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI / industry templates                                                            |
| Phase to ship   | Phase 5+                                                                           |
| Owners          | `convex/_platform/industries/`, `convex/ai/tools/`                                 |
| Risk if skipped | Onboarding flow remains constrained to the 9 built-in templates + admin clones. New industries (e.g. "veterinary clinic", "construction subcontractor") need a platform-admin to either clone from `generic` and customise OR seed a brand-new template by hand. AI could do this conversationally. |
| Files involved  | `convex/_platform/industries/mutations.ts` (already has `cloneTemplate` + `createTemplate`), new `convex/ai/tools/industries/createCustomTemplate.ts` ForAI tool. |

**Why we deferred.** Per locked decision L10 in `INDUSTRY-TEMPLATES-DB-MIGRATION.md` — out of scope for the v1 migration. The schema column `createdBy` is on `platformTemplates` from day 1 so this card is purely additive: write the AI tool, the table is ready.

**Benefits when reinstated.**
- Long-tail coverage. The 9 built-ins capture our launch ICPs; AI-generated templates cover everything else without the team writing custom YAML.
- Faster time-to-value for niche industries — operator pastes a one-paragraph description, AI proposes pipeline + fields + AI persona, operator approves.
- Compounding leverage — each accepted AI template can be promoted to "built-in" with a click.

**Use cases / who it protects.** Niche B2B verticals signing up via the marketing site without an existing template fit.

**Implementation sketch.**
1. New AI tool `createCustomTemplate` (twoStep) that:
   - Takes `{ description, region?, sourceTemplateKey? }` as args.
   - Generates pipeline, fields, modules, AI persona via a constrained-output LLM call (zod schema mirrors `IndustryTemplate`).
   - Calls `_platform.industries.mutations:cloneTemplate` (when `sourceTemplateKey` set) or `createTemplate` (when blank) with the generated definition.
   - Records `createdBy = userId` so the platform owner can audit AI-generated templates separately.
2. UI surface: chat command "create me a new template for veterinary clinics" → propose card with the generated definition + per-slot edit affordance → commit.
3. Generated templates carry `isBuiltIn: false` (informational); owner can promote to built-in by toggling the flag in `/xowner/industries/<key>`.

**Verification.** Scorer test where the user types "I run a veterinary clinic, set me up" → AI generates a template with vet-specific stages (e.g. "Initial visit" → "Treatment" → "Follow-up") + fields (species, breed, vaccine status); operator approves; the new template seeds the workspace.

---

## B.29 — Mock-data editor v2 (cross-reference dropdown editor inside `/xowner/industries/<key>`)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Owner panel UX / industry templates                                                |
| Phase to ship   | Phase 5+                                                                           |
| Owners          | `owner/views/industries/`, `convex/_platform/industries/`                          |
| Risk if skipped | Mock data is read-only in the v1 owner editor (see `MockDataPreview.tsx`). Tweaking sample leads/contacts/deals/notes/tasks for a built-in template requires editing the template's `definition.mockData` JSON directly via `JsonSlotEditor` — error-prone because cross-references (`mockData.deals[].stageCode`, `mockData.deals[].companyKey`, `mockData.notes[].anchorTo`) must stay valid. |
| Files involved  | `owner/views/industries/_components/MockDataPreview.tsx` (replace), new `owner/views/industries/_components/MockDataEditor.tsx`, `convex/_platform/industries/validators.ts` (already cross-checks). |

**Why we deferred.** Per locked decision L3 in `INDUSTRY-TEMPLATES-DB-MIGRATION.md` — user explicitly confirmed v1 ships read-only. v1 still ships mock data through the seed migration; the editor is purely a quality-of-life upgrade for owners.

**Benefits when reinstated.**
- Owners can iterate on mock data without writing JSON. Adding a new sample lead becomes a 4-field form.
- Cross-reference dropdowns prevent invalid references (every `companyKey` field is a `<select>` populated from `mockData.companies[].key`).
- Lowers the bar for non-technical platform admins to maintain templates.

**Use cases / who it protects.** Platform-admin team without TypeScript fluency; future "growth" team members tweaking templates for marketing experiments.

**Implementation sketch.**
1. `MockDataEditor.tsx` — 5 sub-tabs: Companies / Leads / Contacts / Deals / Notes / Tasks.
2. Each tab: paginated table + "+ add" inline form. Foreign-key fields use `<select>` populated from sibling-tab data.
3. Save path: build a fresh `definition.mockData` object → submit through `updateTemplate.patch.definition` (server still runs `validateDefinition`).
4. Bonus: live preview tile that shows the mock workspace as a new org would see it.

**Verification.** Manual: open `/xowner/industries/real-estate-dubai`, switch to Mock Data tab, add a new lead with a company-link via dropdown, save; verify the template's seed-migration output reflects the change after a fresh org onboarding.

---

## B.30 — Template versioning + restore-prior-version

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Owner panel / data-safety                                                          |
| Phase to ship   | Phase 5+ (after B.27 — re-apply latest)                                            |
| Owners          | `convex/_platform/industries/`, `convex/_platform/audit/`                          |
| Risk if skipped | `platformAuditLogs` already captures the before/after diff on every `updateTemplate` call (with `definition: "[blob]"` in the audit row to keep size sane). The full prior `definition` is recoverable only by hand-writing a Convex query against the audit row. There's no UI to browse versions / restore one. |
| Files involved  | `convex/_platform/industries/mutations.ts` (add `restoreTemplateVersion`), new `convex/_platform/industries/queries.ts:listTemplateVersions`, new `owner/views/industries/_components/VersionHistory.tsx`, schema: extend `platformAuditLogs` to keep the FULL `definition` blob on `owner.industries.template.update` rows (currently it's `"[blob:updated]"`). |

**Why we deferred.** Per non-goal #6 in `INDUSTRY-TEMPLATES-DB-MIGRATION.md §1.2` — audit log captures before/after; time-travel restore is a v2. Most edits are forward-only and the owner can clone the template before risky changes. The "I broke it, restore the v3 from yesterday" use case is a real but infrequent operator need.

**Benefits when reinstated.**
- Operator confidence. Risky template edits become reversible.
- Forensic clarity. "When did the AI persona for B2B SaaS change to mention MEDDIC?" gets a one-click answer.
- Compliance — for platforms operating in regulated verticals, "show me the template the org onboarded onto" is a genuine audit need.

**Use cases / who it protects.** Platform owner reverting a botched bulk-edit; compliance team responding to a customer dispute.

**Implementation sketch.**
1. Schema: extend `platformAuditLogs` rows for `owner.industries.template.update` to store the FULL `before.definition` (no `[blob]` mask). Trade-off: audit row size goes from ~2 KB to ~30 KB per template-edit. Acceptable given low frequency.
2. New query `listTemplateVersions(templateKey)` returns the audit-log row series for a template's lifetime.
3. New mutation `restoreTemplateVersion({ templateKey, auditRowId })` reads the row's `before.definition`, runs `validateDefinition`, writes back via `updateTemplate.patch.definition`. Audit verb: `owner.industries.template.restore`.
4. UI: "Versions" tab inside `TemplateEditorView` listing `(timestamp, actor, summary)` per row + "Restore this version" button with typed-confirm.

**Verification.** Edit a template's pipelines tab; visit Versions tab; restore the prior version; confirm the row's `definition.pipelines` reverts; re-apply to a new org confirms behaviour matches the prior version.

---

## B.31 — Platform Owner Panel Tier B/C deferrals (10 items)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Owner panel — Tier B / Tier C                                                      |
| Phase to ship   | Post-launch (none block Tier A v1 — Stages 0–7 SHIPPED 2026-05-27)                 |
| Owners          | `convex/_platform/`, `owner/`, `app/xowner/`                                       |
| Risk if skipped | None for launch — Tier A panel covers every must-have surface (overview, users, tiers, billing settings, flags, AI context, AI keys, industries, reserved slugs, audit, settings). These 10 items are quality-of-life upgrades discovered while shipping the spec; each can ship independently when there's user-pull. |
| Files involved  | See per-item sketches below.                                                       |

**Why we deferred.** Per locked decision L11 in `PLATFORM-OWNER-PANEL.md` — Tier A only for v1. Tier B / Tier C items came up during the spec write-up but were explicitly out of scope.

**Items (each can ship as its own card if it picks up momentum):**

1. **Tool runbook overrides editor** — UI to edit the AI runbook catalog without redeploying. Depends on AI Sprint 4. Files: `convex/_platform/runbooks/` (new), `owner/views/runbooks/` (new).
2. **Convex env-vars editor in the panel** — currently the operator uses the Convex dashboard. Adding this would require an admin-token round-trip — high blast radius for marginal gain. Files: `convex/_platform/env/` (new), `owner/views/env/` (new).
3. **LemonSqueezy / Razorpay webhook console + replay** — currently the operator uses the provider dashboards. Useful for incident response. Files: `convex/_platform/webhooks/` (new), `owner/views/webhooks/` (new).
4. **Waitlist viewer** — depends on the waitlist table from `LANDING-PAGE.md`. Files: `convex/marketing/waitlist/` (will exist after landing page ships), `owner/views/waitlist/` (new).
5. **DB-backed owner allow-list + invite flow** — replaces the `PLATFORM_OWNER_EMAILS` env-list. Per L2 we deferred — env-only is enough for ≤5 owners. Files: new `platformOwners` table, `owner/views/owners/` (new).
6. **TOTP via authenticator app (replaces email OTP)** — stronger second factor; email OTP is good enough for v1 because the email account itself is a hardware-key-protected Google account (per recommendation S1). Files: `convex/_platform/totp/` (new).
7. **WebAuthn / passkey for owner login** — no native Convex Auth support yet; revisit when upstream ships. Files: `convex/auth.ts`.
8. **Cross-org analytics that read content (still aggregated)** — locked decision L7 says "no org content access". Revisit only if a clear, GDPR-safe use case appears. Files: new aggregation pipeline; not yet sketched.
9. **Convex / Sentry insight feed inside the panel** — surfaces the existing MCP feeds inline. Files: `owner/views/overview/InsightFeed.tsx` (new).
10. **Per-user tier (subscription decoupled from org)** — schema change (currently tier lives on the org). Files: `convex/schema/identity.ts`, `convex/_platform/tiers/`, `convex/_platform/users/`.

**Verification.** Each item ships its own card-fields when it gets prioritised. Until then this consolidated card is the durable record that they were considered + intentionally deferred.

---

## B.32 — Drag-to-reorder for dashboard panels (Stage 5 deferral)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Dashboard UX                                                                       |
| Phase to ship   | Stage 6 of `DASHBOARD-V2-PLAN.md` (or a focused dashboard-UX sprint)               |
| Owners          | `core/shell/shell/views/dashboard/`, `convex/users/mutations.ts`                   |
| Risk if skipped | Low — `Pin to my dashboard` button on AI-rendered cells is the primary write path for v1; users wanting to reorder can use Settings → Dashboard. |
| Files involved  | `core/shell/shell/views/dashboard/DashboardLayoutRenderer.tsx`, `core/shell/shell/views/dashboard/DashboardHomeView.tsx`, lift `useKanbanItems` from `core/data-display/kanban/` |

**Why we deferred.** Stage 5 ships the AI-write surfaces (5 tools + per-user override + AIPinnedRow + annotation chips) end-to-end. Drag-to-reorder is a focused UI effort — porting the kanban pattern to the dashboard panel grid requires custom drop-target sizing per `span: 1 | 2 | 3` and a new persistence path through `setMyDashboardLayoutOverride`. Out of scope for the same session that landed the underlying schema.

**Benefits when reinstated.**
- One-handed reordering directly on the dashboard.
- Removes the round-trip through Settings → Dashboard for personal layout edits.
- Makes the AI-pinned cells one of two write paths (drag + Pin) with consistent UX.

**Use cases / who it protects.** Power users who want to rearrange their personal layout frequently — sales managers swapping pipeline panel position day-to-day, freelancers re-pinning the invoice aging panel during billing weeks.

**Implementation sketch.**
1. Lift `useKanbanItems` (RTL-safe + 1-mutation-per-drop per AGENTS.md) from `components/ui/kanban.tsx` into a `useDashboardPanelDrag` hook.
2. Wrap each panel cell in `DashboardLayoutRenderer` with a drag handle visible on hover.
3. `onCommit` calls `setMyDashboardLayoutOverride({ orgId, layout: { ...current, panels: reordered } })` exactly once per drop.
4. Optimistic update: `withOptimisticUpdate` patches the user's preferences cache so the visual order updates instantly.

**Verification.**
- New e2e test: drag panel A above panel B, refresh page, panel A renders first.
- Convex test: `setMyDashboardLayoutOverride` rate-limit holds at 120/min/user-org (drag bursts coalesced).

---

## B.33 — Per-deal score-dot UX in the Deals widget (Stage 5 deferral)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Dashboard UX — predictive scoring surface                                          |
| Phase to ship   | Stage 6 of `DASHBOARD-V2-PLAN.md` or a dedicated AI-surface polish stage           |
| Owners          | `core/entities/_entities/deals/`, `core/shell/shell/views/dashboard/cards/`        |
| Risk if skipped | Low — score is fully accessible via the AI tool surface (`score_deal`, `explain_deal_score`); the cron runs daily and the table is populated. |
| Files involved  | `core/entities/_entities/deals/components/DealCard.tsx`, `core/entities/_entities/deals/views/DealsView.tsx`, new `core/shell/shell/views/dashboard/cards/DealScoreDot.tsx` |

**Why we deferred.** Stage 5 ships the deterministic scoring engine + cron + on-demand AI tool + LLM explainer end-to-end. The frontend dot UX (small coloured circle on each deal row tied to the score 0-100, with a "Why?" popover that calls `explain_deal_score`) is a discrete UI deliverable that benefits from its own design pass — colour scale, popover layout, accessibility (keyboard popover trigger + ARIA live region for the LLM narrative).

**Benefits when reinstated.**
- Glanceable per-row health signal across kanban + list views.
- Click → 1 LLM call, narrative inline. Same gate (`ai.briefingRefresh`) the AI tool already enforces.
- Surfaces the score everywhere deals render — Deals widget, kanban, list, profile drawer.

**Use cases / who it protects.** Sales teams scanning their pipeline daily — "where do I focus today?" answered without opening the AI panel.

**Implementation sketch.**
1. New `<DealScoreDot dealId={...} />` reads `dealScores.queries.getForDeal` (subscription is free — already cached by `listForOrg`'s batched query).
2. Colour scale: 80+ green, 60-79 amber, <60 red. Confidence label as the tooltip.
3. Popover on click: shows component breakdown + "Generate explanation" button → calls a frontend mutation that schedules `explainDealScore.run` and reads back the persisted `dealScores.explanation` row.
4. Mount in `<DealCard>` next to the deal title + in `DealsListView` as a column.

**Verification.**
- Frontend test: dot colour responds to score band.
- Backend test: clicking "Why?" without `ai.briefingRefresh` → permission error surfaced as a friendly toast.

---

## B.34 — `revise_forecast` AI tool (Stage 5 deferral)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI tool — analytical                                                               |
| Phase to ship   | When forecast-revision shows up as a real user pattern; covered for now by `analyze_metric` (Stage 7) |
| Owners          | `convex/ai/tools/dashboard/`, `convex/aiInsights`                                   |
| Risk if skipped | Low — `analyze_metric` returns the same shape (forecast narrative + 3-5 findings + action items) and is already in the analytics layer. The "revise" semantics are a v2 nuance. |
| Files involved  | New `convex/ai/tools/dashboard/reviseForecast.ts`, extend `aiInsights` schema with `forecastSnapshot`. |

**Why we deferred.** Stage 5 plan listed `revise_forecast` as the 3rd of 5 capabilities. Looking at it more carefully during implementation: `analyze_metric` already returns a forecast narrative + persists it to `aiInsights`, and the user-facing affordance ("AI proposes a forecast revision with diff preview") is a UI investment on top of an already-shipped tool. Not enough delta to warrant a 4th twoStep tool until users actually ask for it.

**Benefits when reinstated.**
- Diff preview ("forecast was $1.4M, AI suggests $1.42M based on these signals") makes the analytical insight actionable.
- Persists the revised number so the dashboard's Forecast tab can show "AI-revised forecast" alongside the deterministic one.

**Implementation sketch.**
1. New `revise_forecast` twoStep tool: propose returns the existing forecast snapshot + the revised number + 3-5 supporting findings.
2. Commit writes a new `aiInsights` row with `kind: "forecastRevision"` + the diff payload.
3. Forecast tab on `<SalesPipelinePanel>` reads the latest forecastRevision row + renders an "AI revision" badge.

**Verification.**
- Backend: contract test that the propose payload's commit schema accepts every field.
- Frontend: Forecast tab badge surfaces only when an unfiltered AI-revision row exists.

---

# C. Audit-flagged but not yet roadmapped

## C.1 — Tree-shaped conversations (Attio Problem 1)

Currently `aiMessages` is a flat list keyed by `(conversationId, createdAt)`. Editing a previous turn forks the conversation logically but not in storage. Audit notes Attio went to a tree model. **Effort.** Schema change + UI rewrite of history dropdown. Probably 2–3 days; defer until user feedback says they want branching.

## C.2 — Per-org AI eval suite (Attio "defineAgentTestSuite")

Week 1 baseline scorer (5 tests) is the kernel. Full version: per-variant sweeps (different models / prompts / tools), cost + latency reporting, regression alerts. **Effort.** ~1 week.

## C.3 — Multi-tenancy: cross-org platform-admin AI

Reserved for super-admin operations (e.g. "show me churn risk across all paying orgs", "list orgs with > 80% plan usage"). Schema is multi-tenant from day 1; the AI layer hasn't yet been pointed at the multi-org view. **Track separately under `PLATFORM-OWNER-PANEL.md` — that doc is the canonical spec for this whole surface.**

## C.4 — Audit every twoStep tool's propose-vs-commit schema diff

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI / reliability                                                                   |
| Phase to ship   | Phase 4 — alongside the LemonSqueezy billing wall pass                             |
| Owners          | `convex/ai/tools/*`, especially the `commit_*` halves                              |
| Risk if skipped | Currently mitigated by `resume.ts` zod-strip (every commit safely drops unknown fields). But silent data loss is still possible — e.g. a propose carries `notes` and the commit ignores it. |

**Why this card exists.** The 2026-05-24 incident in `convex/ai/tools/crud/createLead.ts` was the first symptom — the propose carried `notes`, the commit dropped it, and the underlying mutation rejected it as an unknown arg. Same shape risk exists for any future twoStep that adds preview-only fields to its propose schema.

**Implementation sketch.** Add a startup check that diffs each `propose_X.schema` against `commit_X.schema` and warns (not fails) when propose has fields commit doesn't. The strip-on-resume already guarantees correctness at runtime; this would catch the silent-loss case at the agent-author moment.

---

# D. Process / governance

## D.1 — MODULE.md / Future-Enhancements compliance audit (every module)

**Process.** Quarterly: walk every `core/*/MODULE.md`, `features/*/MODULE.md`, `convex/**/MODULE.md`, and `Future-Enhancements.md` §H. Confirm cards still reflect reality, delete stale ones, add new ones the team has flagged in chat but never wrote down. Drift is inevitable; the audit catches it.

## D.2 — Migrate context summary back into version control

**Open question.** Either (a) keep architecture docs as long-lived files in `/docs/architecture/` and never delete, or (b) snapshot final phases into the build-context (`.github/agents/base/context.md`) before deleting phase docs. Decide before the next phase doc cleanup.

---

# E. AI tool gaps (P3 — from AI-TOOL-COVERAGE-AUDIT)

> **Source.** Function-by-function audit of every public Convex function vs ForAI twin existence vs registered AI tool. 213 public functions visited via `functionSpec` against the dev deployment on 2026-05-26. 7 P3 gaps logged. None affect the senior-CRM-specialist bar reached at the end of Stage 9.

| ID | Tool | Public path that exists | What's missing |
|---|---|---|---|
| G-1 | `change_pipeline` (move D-007 between Sales / Renewals pipelines) | `deals/mutations:changePipeline` | ForAI twin + tool def. |
| G-2 | `reorder_field_definitions` | `crm/fields/fieldDefinitions/mutations:reorder` | ForAI twin + tool def. Setup-time gesture. |
| G-3 | `start_dm` / `start_direct_message` (open 1-on-1 conversation with another member) | `conversations/mutations:ensureDirectMessage` | ForAI twin + tool def. "DM Sara about Acme deal." |
| G-4 | Conversation-edit tools (`rename_conversation` / `archive_conversation` / `unarchive_conversation`) | 3 public mutations exist | Could fold under a single `manage_conversation` twoStep tool with `mode: rename | archive | unarchive`. |
| G-5 | `delete_note_category` | `noteCategories/mutations:remove` | ForAI twin + tool def. UI-only today; categories accumulate over time. |
| G-6 | `move_note_to_entity` | `notes/mutations:setEntity` | Useful for "AI mis-attached this note, move it to the deal". |
| G-7 | `mark_all_notifications_read` | `notifications/mutations:markAllRead` | ForAI twin + atomic tool def. |

---

# F. Capability roadmap deferrals (from AI-AGENT-CAPABILITY-AUDIT §6)

> **Source.** Senior-CRM-specialist scorecard (final scorecard 8.6/10 reached at Stage 10). These are the items that did not ship in Stages 6-9 and remain backlog. None block the senior-CRM bar.

## F.1 — `aiNextActions.reasonCode` literals still use `reminder_*` (deferred for ABI continuity)

| Field | Value |
|---|---|
| Status | Backlog |
| Category | API surface / data ABI |
| Phase to ship | Whenever the next `aiNextActions` schema migration ships (no separate window) |
| Owners | `convex/ai/queries/nextActions.ts`, `convex/schema/ai.ts` |
| Risk if skipped | None at runtime — these strings never surface in user-facing copy. They're persisted in `aiSuggestion` rows, asserted in `convex/stage6.test.ts`, and stay opaque to the model (the system prompt advertises only the user-readable `reasonText`). The cost of skipping is a stylistic inconsistency with Decision #5 (ONE verb family — `task_*`). |
| Files involved | `convex/schema/ai.ts:697-699` (validator literals), `convex/ai/queries/nextActions.ts:86-88,153,164,182` (writers), `convex/stage6.test.ts:173` (asserter) |

**Why we deferred:** The Stage 4D SHIPPED row chose to keep `recordKind: "reminder"` for ABI continuity on already-persisted `aiSuggestion` rows. The same logic applies to the `reasonCode` literals: they are an internal classification key, not a user-facing string, and renaming them requires walking every persisted `aiSuggestion` row plus rebaseling the test. The reasonCode is opaque to the model — the prompt advertises `reasonText` ("Reminder X is overdue") which is independent of the codename.

**Benefits when reinstated:**
- Single verb family across the whole repo (Decision #5 fully satisfied).
- Stylistic consistency for future grep audits.

**Use cases / who it protects:** Future agents running the cross-cutting "verb family audit" — anyone writing a fresh nextActions consumer who has to re-learn that `reminder_overdue` here != `reminder_overdue` in the dropped notification keys.

**Implementation sketch when re-enabling:**

```ts
// 1. Flip the literal union in convex/schema/ai.ts:697-699:
//      "reminder_overdue"        → "task_overdue"
//      "reminder_due_soon"       → "task_due_soon"
//      "reminder_due_this_week"  → "task_due_this_week"
// 2. Flip writer constants in convex/ai/queries/nextActions.ts:86-88,
//    153,164,182.
// 3. Idempotent migration that walks `aiSuggestion` rows and rewrites
//    reasonCode in-place; size of table is bounded by per-user TTL so the
//    walk is cheap.
// 4. Rebaseline convex/stage6.test.ts:173 to expect "task_overdue".
```

**Verification:** `pnpm typecheck` 0 + the migration's dry-run reports the expected number of patched rows + `pnpm test convex/stage6.test.ts` green after rebaseline.

---

| ID | What | Why deferred |
|---|---|---|
| D-4 | Auto-note from file (after `analyze_file`, write a structured note to the right entity) | Needs UX decision on "which entity" when ambiguous (the file may match multiple records). Flag this for the next product session before scoping. |
| W-3 | Auto-tag classifier (when a note is added, auto-suggest tags via embedding similarity) | Needs embedding store. **Design freeze: see [`docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md`](../docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md) §6.1 — ships as stage E.2 (~1 day after E.1 schema lands).** |
| W-5 | Weekly digest email (per-org Monday morning summary) | Resend is wired (used for owner OTP); the digest content + per-org opt-in surface + template editor is a separate ~1-day ship. Two open questions: (a) what goes in the digest body — pipeline movement, hot leads, overdue tasks?; (b) is the template user-editable or fixed? Defer until product decision. |
| P-5 | Similarity / pattern matching (find leads similar to my best closed deals) | Needs embedding store. **Design freeze: see [`docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md`](../docs/architecture/17-EMBEDDING-STORE-PROPOSAL.md) §6.2 — ships as stage E.3 (~1 day after E.1 schema lands), parallel with E.2.** |
| Bulk-progress mid-flight chunked streaming | Stream `commit_bulk_*` progress as chunks while the loop runs | Needs streaming-patch protocol on `aiMessages` — current `bulkProgress` helper writes a final summary, not interim chunks. Architecture-level change to the patch protocol; defer to a dedicated streaming session. |

---

# G. Low-priority backlog (from PHASE-3 / PHASE-4 audit closeouts)

| ID | What | Effort |
|---|---|---|
| T11 | Reminder kinds histogram. `create_reminder.reminderType` is hardcoded to a 5-item enum; if telemetry shows custom kinds, add `list_reminder_kinds` returning a 30-day distinct histogram. Tool would live in `convex/ai/tools/introspect.ts`. | ~1 hr |

---

# Additions log — for tracking deferral cadence

> When you defer / disable / weaken something, add the card to the right section above (A / B / C / D / E / F / G), then add a one-line entry below with date + category. Older log rows have been moved to `SHIPPED.md` Additions log when the underlying card shipped — keeping only currently-pending entries here.

| Date       | Category | Title                                                                | Section |
|------------|----------|----------------------------------------------------------------------|---------|
| 2026-05-23 | Model gating  | A.1 — Plan-tier gating in `getModel()`                          | A       |
| 2026-05-23 | Tool surface  | A.2 — Per-tool `requiredCapability: "premium"` gate             | A       |
| 2026-05-23 | Cost          | A.3 — `stepCountIs` cap (raised to 30 for all models)           | A       |
| 2026-05-23 | Prompt        | A.4 — Small-model "Capability Notice" no longer enforced        | A       |
| 2026-05-23 | Billing       | A.5 — `enforcePlanLimit` defaults loose during testing          | A       |
| 2026-05-29 | Tool surface  | A.7 — Bulk tools exempted from premium model-tier gate (product decision) | A       |
| 2026-05-23 | Engagement    | B.1 — Streak widget (deferred from Phase 3A → Phase 4)          | B       |
| 2026-05-23 | UX            | B.2 — Cmd+K global command palette                              | B       |
| 2026-05-23 | UX            | B.4 — Markdown chat renderer with Shiki                         | B       |
| 2026-05-23 | Productivity  | B.5 — Bulk-update modal for kanban (UI on existing AI tools)    | B       |
| 2026-05-24 | Onboarding    | B.11 — Multi-entity CSV import (contact / company / deal)       | B       |
| 2026-05-24 | UX            | B.12 — CSV preview per-row dedup-decision override UI           | B       |
| 2026-05-24 | UX            | B.13 — CSV mapping editor in the preview card                   | B       |
| 2026-05-24 | AI            | B.20 — Cross-conversation AI learning (embedding-based memory)  | B       |
| 2026-05-24 | AI            | B.21 — AI workflow integration (Inngest + activityLogs bus)     | B       |
| 2026-05-24 | AI (audit)    | C.4 — Audit propose-vs-commit schema diff for every twoStep     | C       |
| 2026-05-26 | RBAC          | B.22 — Org-wide approval-policy override                        | B       |
| 2026-05-26 | UX            | B.24 — Dashboard industry-awareness pass                        | B       |
| 2026-05-26 | UX            | B.25 — Per-widget action shortcuts                              | B       |
| 2026-05-26 | UX            | B.26 — `AIQuickComposerCard` file attach (✅ shipped 2026-05-27) | B       |
| 2026-05-26 | AI (gap)      | G-1 .. G-7 — 7 P3 AI tool gaps from coverage audit              | E       |
| 2026-05-27 | Doc cleanup   | This file rewritten — every shipped row migrated to SHIPPED.md  | —       |
| 2026-05-27 | Module polish | H.1 .. H.12 — per-module deferred polish migrated from 17 STATE.md files (then STATE.md files deleted) | H |
| 2026-05-27 | Dashboard AI  | Dashboard AI fixes + Platform AI Keys owner panel (chatPrefill, AIQuickComposer rewrite + file uploader, ProactiveWorkspaceSection refresh button, useTaskMutations aiNextActions patch, briefing BYOK fallback + error rows, `platformAiKeys` table + `/xowner/ai-keys` UI) | — |
| 2026-05-27 | AI Pulse      | Reactive AI Pulse — event-driven rebuild on every relevant lead/deal/task mutation (replaces cron-only model). New `nextActionsTrigger.ts` helper + `aiNextActionsCache.ts` shared optimistic-patch utility | — |
| 2026-05-27 | Templates     | B.27 — Per-org "Re-apply latest template" action                | B       |
| 2026-05-27 | Templates / AI| B.28 — AI-generated custom industry templates from chat        | B       |
| 2026-05-27 | Owner UX      | B.29 — Mock-data editor v2 (cross-reference dropdown editor)    | B       |
| 2026-05-27 | Data safety   | B.30 — Template versioning + restore-prior-version              | B       |
| 2026-05-27 | Owner panel   | B.31 — Platform Owner Panel Tier B/C deferrals (10 items)       | B       |
| 2026-05-27 | API surface   | F.1 — `aiNextActions.reasonCode` literals still `reminder_*` (G10 of P1.6.A — deferred for ABI continuity) | F       |
| 2026-05-27 | Billing       | A.1 / A.2 / A.3 / A.4 / A.5 — all 5 testing-phase restrictions reinstated + LemonSqueezy upgrade flow shipped (P0.1 + P0.2 wave). See `SHIPPED.md`. | A → ✅ |
| 2026-05-28 | AI / approval | A.6 — Auto-approve `files` flipped to default-OFF (Stage 0 of `DASHBOARD-V2-PLAN.md`); restore via Stage 0.5 commit-shim. | A       |
| 2026-05-28 | AI / approval | A.6 — ✅ Implemented Stage 0.5 of `DASHBOARD-V2-PLAN.md` — `wrapToolsForApprovalSanitisation` auto-commit shim restored `AUTO_APPROVE_DEFAULTS.files = true`. See `SHIPPED.md`. | A → ✅ |
| 2026-05-28 | Dashboard UX  | Stage 1 of `DASHBOARD-V2-PLAN.md` — surface polish (AI Cockpit rename, Sparkles/AIMark unification, weekly Generate-now, drop duplicated AI briefing KPI, currency-agnostic icon). See `SHIPPED.md`. | — |
| 2026-05-29 | Dashboard UX  | Stage 2 of `DASHBOARD-V2-PLAN.md` — Sales Pipeline Panel rewrite (Summary / Velocity / Forecast tabs replace `PipelineCard` + `PipelineVelocityCard`; HubSpot-weighted forecast + 12-week sparkline + coverage-ratio dial; idempotent migration renames `pipeline.velocity` → `pipeline.salesPanel` across orgs + 9 templates). See `SHIPPED.md`. | — |
| 2026-05-29 | Process       | AGENTS.md RULE 5 added — Convex MCP tools + `npx convex run` hang in this agent runtime; agent emits commands for the user to run locally. | — |
| 2026-05-29 | Dashboard UX  | Stage 5 of `DASHBOARD-V2-PLAN.md` — AI writes into the UI (5 AI tools + per-user dashboard layout override + 3 new tables + 3 crons + AIPinnedRow + annotation chips). See `SHIPPED.md`. | — |
| 2026-05-29 | Dashboard UX  | B.32 — Drag-to-reorder for dashboard panels (Stage 5 deferral; `Pin to my dashboard` button covers the AI-write case for v1). | B |
| 2026-05-29 | Dashboard UX  | B.33 — Per-deal score-dot UX in the Deals widget (Stage 5 deferral; score still accessible via `score_deal` + `explain_deal_score` AI tools). | B |
| 2026-05-29 | AI tool       | B.34 — `revise_forecast` AI tool deferred (covered by `analyze_metric` in the analytics layer until users explicitly ask for the diff-preview pattern). | B |

---

# H. Per-module deferred polish (migrated from STATE.md files on 2026-05-27)

> **Source.** All 17 `core/*/STATE.md` + `convex/crm/fields/pipelines/STATE.md` files were deleted on 2026-05-27 (work was either fully done or migrated here). The genuinely-pending items below are the residual polish that was tracked per-module. None of these block the senior-CRM bar; all are explicit deferrals with clear file paths.

## H.1 — Auth (Phase 2 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/auth/components/SignUpPage.tsx`, `core/auth/components/VerifyEmailPage.tsx` |

- ✅ **Wire email verification into SignUp flow** — shipped 2026-05-30. `convex/ResendOTP.ts` + `verify: ResendOTP` on the `Password({...})` config; `SignUpPage`/`SignInPage` branch on `signIn(...).then(r => r.signingIn === false)` to route through `/verify-email?email=...`. See SHIPPED.md "Auth hardening — signup OTP verification + …".
- **OAuth-specific error handling** (LOW) — currently the OAuth path shows a generic toast (`OAuthAccountNotLinked`); could be more specific (account-already-linked, provider-revoked, etc.).

## H.2 — Shell topnav (Phase 2)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/shell/shell/components/TopNav.tsx`, `core/shell/components/sidebar/*.tsx` |

- **NotificationBell in TopNav** (MEDIUM, Phase 2) — bell icon + popover from shadboard. The `_onToggleNotifications` prop name is reserved; wire-up + popover content needed. Currently the notifications surface is `/{orgSlug}/notifications` page only.
- **FullscreenToggle in TopNav** (LOW, Phase 2) — currently in sidebar footer; promote to topnav.
- **QuickAdd "+" button in TopNav with `C` keyboard shortcut** (MEDIUM) — global create surface; opens a small popover with quick-create entries (Lead / Contact / Deal / Company / Note / Reminder). Powers a faster "log it now" workflow than navigating to the right list view first.
- **Dead code cleanup** (LOW) — delete unused sidebar primitives: `nav-main`, `nav-documents`, `nav-secondary`, `layout-controls`, `account-switcher`, `sidebar-support-card`. They were carried over from the shadboard template and no longer have call sites.

## H.3 — Onboarding (Phase 3A polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/onboarding/components/OnboardingPage.tsx`, `core/onboarding/MODULE.md` (product-tour plan) |

- **Sub-niche picker (Step 2b)** (HIGH, Phase 3A) — show sub-niche cards when `industry === "real-estate"` or `b2b-saas` so the seeded template matches the actual niche (e.g. real-estate → residential / commercial / brokerage). Phase 3A scope.
- **Resume from last step** (MEDIUM) — read `org.onboardingStep` on mount to resume the wizard mid-flow when a user closes the tab.
- **Guard: redirect completed users away from `/onboarding`** (LOW) — currently no guard; users can re-visit the wizard after completing it.
- **Product tour (post-onboarding)** (LOW) — full plan in `core/onboarding/MODULE.md` using `onborda` library. Triggers on first dashboard visit; key `"product_tour_v1"` in `users.dismissedCards[]`.

## H.4 — Settings (Phase 4)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/platform/settings/components/groups/{WorkspaceGroup,DataGroup}.tsx`, `core/platform/settings/components/groups/modules/SortableFieldsTable.tsx`, `core/platform/settings/components/groups/pipelines/PipelineEditor.tsx` |

- **Logo upload via Convex `_storage`** (MEDIUM) — `WorkspaceGroup` has placeholder; needs the upload pipeline + `org.settings.logoFileId` field + `<LogoBadge>` resolution.
- **Drag-reorder modules** (MEDIUM) — `settings.modules[].order` already supported; UI is per-row chevron buttons today. Switch to `@dnd-kit` Sortable.
- **FieldEditor: drag-reorder + `showInStages` scoping** (MEDIUM) — `SortableFieldsTable` exists; the `EditFieldDialog`'s "Visible on stages" multi-select is already shipped for deals via `StageScopedEditFieldDialog`. Lead / contact / company `EditFieldDialog` doesn't yet expose the multi-select.
- **PipelineEditor — per-stage advanced settings** (MEDIUM) — `staleAfterDays`, `warningAfterDays`, `isFinal`, `finalType` editing UI per row. Schema supports them; UI only reads `isFinal` today. Cross-references `PENDING.md` P1.2.B.
- **DataGroup → Export: wire Trigger.dev CSV/JSON job** (MEDIUM) — UI exists; backend job missing.
- **Code prefix rename background job** (LOW) — when an org renames `P-` → `PER-`, every cross-table reference (deals.personCode, messages.personCode, activityLogs) must update. Trigger.dev job.
- **Mobile sub-group toolbar accordion (< 640px)** (LOW) — current pill row wraps; accordion would be nicer for very small viewports.

## H.5 — Profile / OverviewCard (Phase 4 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/platform/profile/components/OverviewCard.tsx` |

- **Add Company link + linked company panel inside OverviewCard** (MEDIUM) — currently company shown only via TagsCell-adjacent owner row; could surface a dedicated company chip.
- **Persist OverviewCard pill ordering as a per-user preference** (LOW) — once the dynamic pill picker ships.
- **OverviewCard skeleton state instead of "Loading…" text** (LOW) — replace text fallback with shadcn `<Skeleton>`.

## H.6 — Messages — Phase 3 / 4 / 6 / 9 future hooks

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/comms/messages/components/*`, `convex/crm/shared/messages/*`, `convex/integrations/whatsapp/*` (NEW — Phase 3) |

- **Typing indicators** (Phase 4) — Convex doesn't ship presence; needs either an ephemeral `typingNow` table with TTL cron, OR Convex's presence component (when stable), OR Liveblocks. UI affordance: dots animation under `MessageList`. Mutation: `setTyping({ conversationId, ttl: 5s })` upserts in `presence` keyed by `(userId, conversationId)`.
- **AI on-behalf wiring (`authorType: "ai"` from tool registry)** (Phase 3) — backend `messages.send` already accepts `authorType: "ai"` + `onBehalfOf`. The AI tool registry just needs to call it. The `<ChatAvatar isAI />` already renders the bot subscript.
- **WhatsApp integration** (Phase 3) — schema already supports it (`channel: "whatsapp"` + `authorType: "contact"` + `authorPersonCode`). Needs: (a) `convex/integrations/whatsapp/webhook.ts` — verifies signature, resolves contact by phone, upserts message with idempotency key `"whatsapp:" + msg.id`. (b) `trigger/whatsapp-out.ts` — outbound worker. (c) "Send via WhatsApp" toggle in `MessageInput`.
- **Threads-within-threads** (Phase 4) — backend `threadId` field already supported on conversations + messages; UI defers to a single thread today. Surface "Open thread" → side panel showing only messages with that `threadId`.
- **External participants (client portal)** (Phase 9) — schema doesn't yet model `externalUser`. Adds `conversationMembers.userKind: "internal" | "external"` + new `externalUsers` table. Needs full client-portal feature first.
- **Slack/Teams bridge** (Phase 6) — same channel mechanism as WhatsApp; Phase 6 worker mirrors messages with `channel: "slack"` / `"teams"`.
- **Playwright e2e** (LOW) — wait for the polish sprint to land first to avoid spec churn. Critical paths: new conversation → send → appears; add participant → inbox row; edit → "(edited)"; delete → bubble disappears; react → pill; attach → chip + bubble; mention → notification; cursor-pagination → loads older.

## H.7 — Notes (Phase 4 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/comms/notes/components/*`, `core/platform/settings/components/groups/crm/NoteCategoriesSection.tsx`, `core/shell/shell/views/dashboard/cards/*` |

- **`RecentNotesWidget.tsx` for the dashboard** (LOW) — reuses `useNotesForOrg({ limit: 5 })`. Reserved widget key already in `WIDGET_KEYS`.
- **Drag-to-reorder categories in Settings → CRM → Note categories** (LOW) — currently chevron buttons; `@dnd-kit` Sortable would be nicer.
- **Entity-board sortOrder rebalance** (LOW) — notes have one (`rebalanceCategoryIfTight`); entity boards (leads/deals/contacts/companies) skip it because the groupBy axis is dynamic. Add a per-axis rebalancer when precision issues actually surface.

## H.8 — Timeline (Phase B)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/comms/timeline/components/*`, `convex/crm/shared/timeline/queries.ts` |

- **Merge messages into the timeline query** (MEDIUM) — backend query change: add a `messages` source to `getForScope` with channel-aware rendering. Frontend already supports a `card` kind.
- **Composer attachments** (LOW) — notes module already supports attached files; wire the file-upload buffer into `TimelineComposer`. Currently a stubbed paperclip icon.
- **"Mark internal" toggle in composer** (LOW) — currently every comment posted from the timeline is `isInternal: false`.
- **Per-user "mark as seen"** (LOW) — track per-user last-seen `createdAt`; show an unread divider in the feed.
- **Filter by date range (calendar slider)** (LOW) — currently capped at the latest N pages via cursor; date-range filter would require backend support.

## H.9 — Calendar / Reminders / Follow-ups (Phase 4 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/scheduling/calendar/*`, `core/scheduling/reminders/*`, `core/scheduling/followups/*`, `convex/crm/shared/reminders/*`, `convex/crons.ts` |

- **`?date=` URL param round-trip on Calendar** (LOW) — `selectedDate` is in-memory only; should parse + write the URL param.
- **Multi-day event rendering (span across cells)** (LOW) — not needed until we add multi-day reminders.
- **Reopen completed reminders inline** (LOW) — a `reopen` verb or status toggle on a completed row.
- **Cursor-based pagination for very large orgs (>2000 reminders)** (LOW) — `listAllForOrg` currently collects all; switch to `paginationOptsValidator` when it bites.
- **Follow-ups Phase B** — `requireDealCode` setting (LOW), `cadencePresets` setting (LOW), `notifyAssignee` toggle (LOW), calendar chip color verification (LOW).
- **Auto-close stale follow-ups cron** (MEDIUM) — `org.settings.followupDefaults.autoCloseAfterDays` is read but not enforced. Add `internalMutation:autoCloseStaleFollowups` that paginates orgs, reads the setting, and patches past-due rows to `completed`. Cron via `crons.interval("auto-close-stale-followups", { hours: 24 }, ...)`.

## H.10 — Entities (Phase 3 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/entities/_entities/leads/views/LeadsView.tsx`, `core/platform/settings/components/groups/AppearanceGroup.tsx`, `core/entities/shared/components/EntityCard.tsx` |

- **AI summary generator cron** (MEDIUM, Phase 3) — `EntityCard` already shows `item.aiSummary`; the on-update / nightly generator that writes it doesn't exist yet. **(Note:** per-entity rebuild via `internal.ai.internal.rebuildEntityContext` IS shipped — this card is specifically about `aiSummary` as a separate light field, vs. the deeper `aiContext.summary` that already auto-updates.**)**
- **"Replay tutorials" button** (LOW) — surface `resetAllTours()` from `components/ui/first-time-tour.tsx` in Appearance settings.
- **Card highlight admin picker** (LOW) — today driven by cardFields; later: dedicated "show on card" toggle in Fields manager.

## H.11 — Pipelines (Phase 3 + polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/platform/settings/components/groups/PipelinesGroup.tsx`, `convex/crm/fields/pipelines/*`, `convex/crm/fields/templates/registry.ts`, `convex/orgs/templates/pipelineStages.ts`, `convex/crons.ts` |

- **AI tool `setup_workspace_from_template`** (Phase 3) — backend ready (`convex/crm/fields/templates/internal.ts:setupWorkspaceFromTemplate`). Tool definition in the AI registry needed.
- **Pipeline templates picker UI** (MEDIUM) — "Create pipeline from template…" button next to the blank-create input. Consumes `convex/crm/fields/templates/registry.ts`. Faster onboarding.
- **Drag-reorder pipelines themselves** (LOW) — if an org has many pipelines a manual order beats alphabetical.
- **Stale-deal cron firing `deal_stale` notifications** (MEDIUM) — `staleAfterDays` is rendered on cards but no cron exists. Pair with the per-stage advanced settings UI in H.4.
- **Transition-policy contract tests** (LOW) — `block` blocks; `warn` succeeds + logs metadata; `off` no checks; policy-update RBAC. Lock the contract before touching it again.
- **Consolidate `convex/orgs/templates/pipelineStages.ts` with `convex/crm/fields/templates/registry.ts`** (LOW) — two registries today, both seed pipelines. Pick one. Pair with the onboarding wizard rewrite.

## H.12 — Shell shared layouts (LOW)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/shell/shared/layouts/ShellLayout.tsx`, `core/shell/shared/layouts/ShellNav.tsx` |

- **Mobile toolbar accordion (< 640px)** (LOW) — current pill row wraps; accordion would be nicer.
- **Keyboard navigation for nav rail** (LOW) — arrow up/down to move between groups.
- **Reusable `DangerZoneCard` in shared** (LOW) — Settings has its own; move once Profile or another module needs it.

---

# I. One-shot migrations to run in production

When deploying these to a fresh production environment, run once on each:

| Migration | Command | Purpose |
|---|---|---|
| Notes color/type backfill | `npx convex run _migrations/addNotesColorAndType:run` | Backfill legacy notes with `color="yellow"` + `type="general"` (idempotent — safe to re-run). |
| Pre-seed-categories notes | `npx convex run _migrations/seedNoteCategories:run` | Seeds 6 default note categories per org + backfills `categoryId` from legacy `color`. Idempotent. |
| Audio MIME categories | `npx convex run _migrations/allowAudioUploads:run` | Patches `"audio"` into older orgs' `org.settings.fileUpload.allowedMimeCategories`. Idempotent. Default-allow-all orgs are skipped. |
| Permission catalog backfill | `npx convex run orgs/mutations:backfillRolePermissions` | When a new permission key is added to `convex/_shared/permissions/catalog.ts`, run this to patch existing role docs. Idempotent. |
| AI morning briefing widget backfill | `_migrations._2026_05_27_addAiMorningBriefingMetric:run` | Inserts `ai.morningBriefing` BEFORE `ai.pulseRibbon` for existing orgs. Idempotent. |
| Standing-orders firstFireAt index | `_migrations._2026_05_28_addStandingOrderFirstFireAt:run` | Backfills `firstFireAt` for every existing enabled standing order. Idempotent. |
| Dashboard widget normalize | `_migrations._2026_05_26_normalizeDashboardMetrics:run` | Rewrites `calendar.miniWidget` → `calendar.mini`. Already ran in Stage 1; alias map now scoped inside the migration. |
