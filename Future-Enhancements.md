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

## A.1 — Plan-tier gating in `getModel()` (model downgrade for free/starter plans)

| Field           | Value                                                                                  |
|-----------------|----------------------------------------------------------------------------------------|
| Status          | Disabled (testing phase, 2026-05-23)                                                   |
| Category        | Model gating / Billing                                                                 |
| Phase to ship   | Pre-launch (P0.2.A in `PENDING.md`)                                                    |
| Owners          | `convex/ai/` + `convex/billing/` + `convex/_platform/limits.ts`                        |
| Risk if skipped | A user on the **Free** plan can hit `claude-opus-4` / `gpt-4o` / `o3-mini` against the platform key, which will burn our LLM budget. We rely on the honour-system + total quota during testing — that is fine for staging but not for public launch. |
| Files involved  | `convex/ai/modelRegistry.ts` (`PLAN_ALLOWED_TIERS`, `getAllowedModelsForPlan`), `convex/ai/models.ts` (`getModel()` plan-tier downgrade block) |

**Why we deferred.** During testing phase we want every model to behave identically for every signed-in user, so we can A/B model behaviour, exercise tools end-to-end on small models, and unblock developers without standing up plan upgrades.

**Benefits when reinstated.**
- Cost control. Premium models cost ~50× more per request than small models; uncapped access on the free tier is unsustainable at any meaningful signup volume.
- Pricing leverage. The "use Opus / GPT-4o" upgrade path is one of the strongest reasons to move users from Free → Platform Solo / Team.
- Predictable margins. Each plan tier maps to a known cost-per-active-user envelope only when premium models are gated.

**Use cases / who it protects.**
- Saudi/Dubai RE teams (the launch segment) on the Platform Team plan ($199/mo) — they expect Sonnet/4o by default; they don't care about Opus.
- Solo / freelance Free users — Haiku / 4o-mini / Llama-3.3 are plenty for the vast majority of their requests.

**Implementation sketch when re-enabling.**
1. Restore the `allowedTiers` check in `convex/ai/models.ts` `getModel()` (the block that calls `pickAnyConfiguredModel()` when `!allowedTiers.has(info.tier)`).
2. Surface a soft-fail message when a user picks a model their plan can't run, e.g. "Your plan supports up to Sonnet 4.5; upgrading to Pro unlocks Opus 4."
3. Gate the model picker in `core/ai/components/ChatModelPicker.tsx` so disallowed entries either render greyed out with an upgrade CTA, OR are filtered out entirely (UX decision pending).
4. Frontend hook update — `useModelPreference` should respect `allowedTiers` again, derived from `useCurrentOrg().org.plan` + `MODEL_REGISTRY[modelKey].tier`.
5. For BYOK users, KEEP the bypass: if `usageMode === "byok"`, plan tier doesn't apply (their key, their cost).

**Verification.**
- New unit test: signed in on `plan: "free"`, calling `processChat.run` with `modelKey: "claude-opus-4"` should silently downgrade to a "small"-tier model with `usageMode: "platform"`.
- Manual: Free plan user clicks "Opus 4" in picker → sees upgrade CTA, request still goes out on Sonnet/Haiku.

---

## A.2 — Per-tool `requiredCapability: "premium"` gate

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Disabled (testing phase, 2026-05-23)                                               |
| Category        | Model gating / Tool surface                                                        |
| Phase to ship   | Pre-launch (P0.2.B in `PENDING.md`)                                                |
| Owners          | `convex/ai/toolRegistry.ts` + every tool def with `requiredCapability: "premium"`  |
| Risk if skipped | Small models (Haiku, Llama-3.3, Kimi, OpenRouter free Llama, gpt-4o-mini) get exposed to high-stakes tools (`bulk_update`, `bulk_close_deals`, `update_org_settings`, `rename_entity_labels`, `invite_member`, `remove_member`, `create_pipeline`, `apply_template`, `create_field`). They are MORE LIKELY to call these incorrectly. The two-step confirmation (`twoStep`) still saves us — but premium gating is a second layer of defence. |
| Files involved  | `convex/ai/toolRegistry.ts` (`getToolsForRequest` capability filter), `convex/ai/tools/layers/{bulk,settings,members,pipelines,templates,fields}.ts` |

**Why we deferred.** Same testing rationale as A.1 — we want every developer-grade test ("invite a member to my workspace", "rename the lead label to Customer") to work on the cheapest available platform key.

**Benefits when reinstated.**
- Reliability. Smaller models hallucinate destructive args (e.g. `bulk_close_deals` with no filter → closes everything). Even with `twoStep`, the user sees a confusing preview screen they didn't ask for.
- Cost. Bulk tools tend to chain — one `bulk_update` followup often fires a follow-up `add_note` per row. Letting Haiku drive that loop wastes both Haiku and our DB budget.
- Defence-in-depth. RBAC + premium gate + twoStep + rate limit = 4 layers. Removing any one is OK during testing; shipping with 3 is fine; shipping with 2 is risky.

**Use cases / who it protects.**
- Admin actions (member invite, settings changes, label renames) feel "wrong" coming from a small model in production — premium routing matches user intuition.
- Bulk write operations on real-estate workspaces (200 leads, 50 deals) — we want the smartest available agent on those.

**Implementation sketch when re-enabling.**
1. Restore the `if (def.requiredCapability === "premium" && modelTier === "small") continue;` filter in `getToolsForRequest()` in `convex/ai/toolRegistry.ts`.
2. Confirm runbooks block respects the same filter (it already calls `getActiveRunbooks` which mirrors `getToolsForRequest`).
3. Update the "Model Capability Notice" injected by `systemPrompt.ts` for `modelTier === "small"` so the model knows the gate is real.

**Verification.**
- Unit: with `modelTier: "small"`, `getToolsForRequest` does NOT include `bulk_update`, `update_org_settings`, etc.
- Integration: with `modelKey: "claude-haiku-3-5"`, asking "delete all my leads" yields a refusal/explanation, not a tool call.

---

## A.3 — `stepCountIs` cap (raised to 30 for all models during testing)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Relaxed (testing phase, 2026-05-23)                                                |
| Category        | Cost / Reliability                                                                 |
| Phase to ship   | Pre-launch (P0.2.C in `PENDING.md`)                                                |
| Owners          | `convex/ai/orchestrator/streamLoop.ts`                                             |
| Risk if skipped | A pathological agent loop on a small model can run for 30 tool steps before bailing. With `tool-error` recovery + Zod-error reformatting + introspection tools the practical loop length is 3-5, but the worst case is unbounded by tier. |
| Files involved  | `convex/ai/orchestrator/streamLoop.ts:81`                                          |

**Why we deferred.** The original `stepCountIs(5)` cap caused the user-visible "Empty message" bug. We've raised it to a single value (30) so every model — including smaller ones — has the same recovery budget. The original spec proposed tier-aware caps `(small=12, standard=20, premium=30)`, which we'll restore later.

**Benefits when reinstated.**
- Cost. Each step on Opus 4 costs ~$0.05; capping small models lower means we pay for retries proportionate to the LLM cost.
- Performance. Lower caps shorten the worst-case latency for misbehaving prompts on small models.
- Predictability. Per-tier caps give product an SLA: "small model requests resolve in ≤12 steps".

**Implementation sketch when re-enabling.**
```ts
// streamLoop.ts
const STEP_CAP_BY_TIER = { small: 12, standard: 20, premium: 30 } as const;
const cap = STEP_CAP_BY_TIER[modelResult.tier];
streamText({ ..., stopWhen: stepCountIs(cap) });
```

**Verification.**
- Unit: small-tier model hitting an infinite tool loop terminates at 12 steps.
- Telemetry: `aiMessages.usage.totalSteps` percentile-99 stays under cap.

---

## A.4 — `systemPrompt.ts` "Model Capability Notice" alignment

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Kept active — but its claims are not enforced while A.2 is disabled                |
| Category        | Prompt / Honesty                                                                   |
| Phase to ship   | Re-align with A.2 — same edit                                                      |
| Owners          | `convex/ai/systemPrompt.ts`                                                        |
| Risk if skipped | While A.2 is disabled, the small-model notice tells the model "you cannot use bulk_update" — but the tool registry actually exposes it. The model can call it. Result: confusing for the model + misleading audit logs. |
| Files involved  | `convex/ai/systemPrompt.ts:148-159`                                                |

**Decision.** When A.2 is reinstated, the notice and the gate align automatically. No separate work needed.

---

## A.5 — `enforcePlanLimit` quotas during onboarding & dev

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Active in code; expansive defaults in `_platform/limits.ts`                        |
| Category        | Billing / Plan limits                                                              |
| Phase to ship   | Pre-launch (P0.2.E in `PENDING.md`) — alongside the LemonSqueezy upgrade flow      |
| Owners          | `convex/_shared/enforcePlanLimit.ts`, `convex/_platform/limits.ts`                 |
| Risk if skipped | Low for now — limits exist but are generous on Free. Risk grows once paid plans differentiate. |
| Files involved  | `convex/_platform/limits.ts`                                                       |

**Why we deferred.** Limits exist (`enforcePlanLimit` is wired) but Free plan caps are deliberately loose for testing. Reinstating means tightening the numbers, not re-enabling the function.

**Implementation sketch.**
- Re-tune `Free` limits in `_platform/limits.ts` (e.g. `maxLeads: 100`, `maxDeals: 50`, `maxCustomFields: 5`).
- Ship the AI-message credit pool that the audit's pricing ladder ($199 = 50,000 credits) requires.

**Verification.**
- Unit: creating 101st lead on Free plan throws `PLAN_LIMIT_REACHED` ConvexError.
- E2E: dashboard surfaces a "X% of plan used" indicator.

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

## B.26 — `AIQuickComposerCard` file attach (lazy-create-on-attach UX)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX / AI                                                                            |
| Phase to ship   | Stage 3-A session 3 OR Stage 3-B                                                   |
| Owners          | `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx`, `core/ai/components/composer/ChatAttachButton.tsx`, `core/ai/lib/uploadAttachments.ts` (NEW — extract helper) |
| Risk if skipped | Low. The dashboard QuickComposer ships in Stage 3-A session 1 without file attach. Users who want to attach files first open the chat panel and use the paperclip there — that already works. |
| Files involved  | `core/ai/lib/uploadAttachments.ts` (NEW), `core/ai/components/composer/FileAttachButton.tsx` (NEW), `AIQuickComposerCard.tsx` |

**Why we deferred.** The QuickComposer doesn't have a conversationId locally on first paint — it's lazy-created on first send. Adding file attach means lazy-creating on first attach instead, which changes the UX contract slightly.

**Implementation sketch.**
1. Extract `uploadAttachments(orgId, conversationId, files): Promise<PendingAttachment[]>` from `ChatAttachButton`.
2. New `FileAttachButton` component that takes an `onEnsureConversation` prop (lazy-create) + uses the helper.
3. Mount on `AIQuickComposerCard` next to the model picker.
4. Reuse the `[file:<id> "name"]` manifest line injection — body is rebuilt on send with `attachments` prepended.
5. Add a `<PendingAttachmentChips />` row above the textarea so the user can see + remove attachments before sending.

**Verification.** Vitest cases for `uploadAttachments` helper (mock fetch + the `attach` mutation). Manual: drag a CSV onto the dashboard composer, type "import this", press Enter — the side panel opens with the manifest in the first turn.

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

## C.5 — `streamLoop.ts` should also surface friendly errors on `tool-error` chunks

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX                                                                                 |
| Phase to ship   | Phase 4 — alongside markdown / streaming polish                                    |
| Owners          | `convex/ai/orchestrator/streamLoop.ts` `case "tool-error"`                         |
| Risk if skipped | Tool failures inside the model's run loop currently render the raw error text in the timeline row. The model still recovers, but the user-visible expanded error is verbose. |

**Implementation sketch.** Run the same `friendlyToolError` mapper on the `chunk.error` value before patching the tool record's output. Keep the raw error in `output.rawError` for debugging, but surface `friendly.markdown` to the timeline rendering layer.

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

| ID | What | Why deferred |
|---|---|---|
| D-4 | Auto-note from file (after `analyze_file`, write a structured note to the right entity) | Needs UX decision on "which entity" when ambiguous. |
| D-5 | Stage-template tool (apply a 5-stage template wholesale to a new pipeline) | Needs template catalogue. |
| W-3 | Auto-tag classifier (when a note is added, auto-suggest tags via embedding similarity) | Needs embedding store. |
| W-5 | Weekly digest email (per-org Monday morning summary) | Needs Resend integration + template editor. |
| P-5 | Similarity / pattern matching (find leads similar to my best closed deals) | Needs embedding store. |
| `set_default_note_category` | Atomic tool to flip the default | Public `setDefault` mutation exists; ForAI twin trivial; defer to user request. |
| Bulk-progress mid-flight chunked streaming | Stream `commit_bulk_*` progress as chunks while the loop runs | Needs streaming-patch protocol on `aiMessages`. |
| Custom-field diff capture in `update_entity` | Capture BEFORE/AFTER for every patched field for richer activity logs. | ~2 hrs work. |

---

# G. Low-priority backlog (from PHASE-3 / PHASE-4 audit closeouts)

| ID | What | Effort |
|---|---|---|
| T11 | Reminder kinds histogram. `create_reminder.reminderType` is hardcoded to a 5-item enum; if telemetry shows custom kinds, add `list_reminder_kinds` returning a 30-day distinct histogram. Tool would live in `convex/ai/tools/introspect.ts`. | ~1 hr |
| T12 | Permission catalog introspection. The list of available permission keys is at `convex/_shared/permissions/catalog.ts`. Today the AI sees the user's OWN permissions but can't enumerate the catalog. Add `list_permission_catalog` always-on read tool returning `{ key, description, category }[]`. | ~30 min |

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
| 2026-05-24 | UX            | C.5 — Friendly errors in streamLoop tool-error chunk            | C       |
| 2026-05-26 | RBAC          | B.22 — Org-wide approval-policy override                        | B       |
| 2026-05-26 | UX            | B.24 — Dashboard industry-awareness pass                        | B       |
| 2026-05-26 | UX            | B.25 — Per-widget action shortcuts                              | B       |
| 2026-05-26 | UX            | B.26 — `AIQuickComposerCard` file attach                        | B       |
| 2026-05-26 | AI (gap)      | G-1 .. G-7 — 7 P3 AI tool gaps from coverage audit              | E       |
| 2026-05-27 | Doc cleanup   | This file rewritten — every shipped row migrated to SHIPPED.md  | —       |
| 2026-05-27 | Module polish | H.1 .. H.12 — per-module deferred polish migrated from 17 STATE.md files (then STATE.md files deleted) | H |

---

# H. Per-module deferred polish (migrated from STATE.md files on 2026-05-27)

> **Source.** All 17 `core/*/STATE.md` + `convex/crm/fields/pipelines/STATE.md` files were deleted on 2026-05-27 (work was either fully done or migrated here). The genuinely-pending items below are the residual polish that was tracked per-module. None of these block the senior-CRM bar; all are explicit deferrals with clear file paths.

## H.1 — Auth (Phase 2 polish)

| Field | Value |
|---|---|
| Status | Backlog |
| Files involved | `core/auth/components/SignUpPage.tsx`, `core/auth/components/VerifyEmailPage.tsx` |

- **Wire email verification into SignUp flow** (MEDIUM) — after signup, redirect to `/verify-email?email=...` if Convex Auth requires it. The `VerifyEmailPage` is built; sign-up just doesn't route to it today.
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
