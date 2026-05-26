# Future Enhancements

> **Purpose.** Single source of truth for everything intentionally deferred during the testing / pre-launch phase, plus a backlog of opportunistic enhancements we've identified along the way. Anything removed, relaxed, or knowingly skipped MUST land here with full context so it can be reinstated correctly later.
>
> **Audience.** Future agents, future-you, reviewers asking "why is X disabled?".
>
> **Maintenance contract.** Whenever an agent disables, defers, or weakens a guardrail / restriction / capability — even temporarily — they MUST add an entry below before the change is shipped. See `AGENTS.md` → "RULE: Deferred restrictions live in Future-Enhancements.md".
>
> Last updated: 2026-05-23 (Weeks 1–3 of AI audit shipped; B.6/B.7/B.8 marked Shipped)

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
| Phase to ship   | Phase 6 / Week 6 — "Polish + telemetry + pricing wall" (see `PHASE-3-AI-AUDIT.md §6`)  |
| Owners          | `convex/ai/` + `convex/billing/` + `convex/_platform/limits.ts`                        |
| Risk if skipped | A user on the **Free** plan can hit `claude-opus-4` / `gpt-4o` / `o3-mini` against the platform key, which will burn our LLM budget. We rely on the honour-system + total quota during testing — that is fine for staging but not for public launch. |
| Files involved  | `convex/ai/modelRegistry.ts` (`PLAN_ALLOWED_TIERS`, `getAllowedModelsForPlan`), `convex/ai/models.ts` (`getModel()` plan-tier downgrade block) |

**Why we deferred.** During the testing phase we want every model to behave identically for every signed-in user, so we can A/B model behaviour, exercise tools end-to-end on small models, and unblock developers without standing up plan upgrades.

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
| Phase to ship   | Phase 6 / Week 6                                                                   |
| Owners          | `convex/ai/toolRegistry.ts` + every tool def with `requiredCapability: "premium"`  |
| Risk if skipped | Small models (Haiku, Llama-3.3, Kimi, OpenRouter free Llama, gpt-4o-mini) get exposed to high-stakes tools (`bulk_update`, `bulk_close_deals`, `update_org_settings`, `rename_entity_labels`, `invite_member`, `remove_member`, `create_pipeline`, `apply_template`, `create_field`). They are MORE LIKELY to call these incorrectly. The two-step confirmation (`twoStep`) still saves us — but premium gating is a second layer of defence. |
| Files involved  | `convex/ai/toolRegistry.ts` (`getToolsForRequest` capability filter), `convex/ai/tools/layers/bulk.ts`, `convex/ai/tools/layers/settings.ts`, `convex/ai/tools/layers/members.ts`, `convex/ai/tools/layers/pipelines.ts`, `convex/ai/tools/layers/templates.ts`, `convex/ai/tools/layers/fields.ts` |

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
2. The fix in Week 1 #1.2 (filter `expand_tools.execute` output by capability) is the **prerequisite** — once that filter exists, this gate is honest with the model.
3. Confirm runbooks block respects the same filter (it already calls `getActiveRunbooks` which mirrors `getToolsForRequest`).
4. Update the "Model Capability Notice" injected by `systemPrompt.ts` for `modelTier === "small"` so the model knows the gate is real (currently we keep the notice).

**Verification.**
- Unit: with `modelTier: "small"`, `getToolsForRequest` does NOT include `bulk_update`, `update_org_settings`, etc.
- Integration: with `modelKey: "claude-haiku-3-5"`, asking "delete all my leads" yields a refusal/explanation, not a tool call.

---

## A.3 — `stepCountIs` cap (raised to 30 for all models during testing)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Relaxed (testing phase, 2026-05-23)                                                |
| Category        | Cost / Reliability                                                                 |
| Phase to ship   | Phase 6 / Week 6 (or sooner if cost telemetry exposes a runaway loop)              |
| Owners          | `convex/ai/orchestrator/streamLoop.ts`                                             |
| Risk if skipped | A pathological agent loop on a small model can run for 30 tool steps before bailing. With `tool-error` recovery + Zod-error reformatting (Week 1 #1.3) + introspection tools (Week 1 #1.4) the practical loop length is 3-5, but the worst case is unbounded by tier. |
| Files involved  | `convex/ai/orchestrator/streamLoop.ts:81`                                          |

**Why we deferred.** Per the audit doc (`PHASE-3-AI-AUDIT.md §1`), the original `stepCountIs(5)` cap caused the user-visible "Empty message" bug. We've raised it to a single value (30) so every model — including smaller ones — has the same recovery budget. The original spec proposed tier-aware caps `(small=12, standard=20, premium=30)`, which we'll restore later.

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
- Unit: small-tier model hitting an infinite tool loop terminates at 12 steps (test: stub a tool that always returns `tool-error`, count steps).
- Telemetry: `aiMessages.usage.totalSteps` percentile-99 stays under cap.

---

## A.4 — `systemPrompt.ts` "Model Capability Notice" for small models

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Kept active (the prompt block still emits) — but its claims are no longer enforced |
| Category        | Prompt / Honesty                                                                   |
| Phase to ship   | Re-align with A.2 — same week                                                      |
| Owners          | `convex/ai/systemPrompt.ts`                                                        |
| Risk if skipped | While A.2 is disabled, the small-model notice tells the model "you cannot use bulk_update" — but the tool registry actually exposes it. The model can call it. Result: confusing for the model + misleading audit logs. |
| Files involved  | `convex/ai/systemPrompt.ts:148-159`                                                |

**Why we deferred.** A.2 is the actual gate; the prompt block is informational. During testing the gate is off, so the notice is technically inaccurate. We keep it deliberately so we don't have to rewrite system-prompt logic twice.

**Decision.** When A.2 is reinstated, the notice and the gate align automatically.

---

## A.5 — `enforcePlanLimit` quotas during onboarding & dev

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Active in code; expansive defaults in `_platform/limits.ts`                        |
| Category        | Billing / Plan limits                                                              |
| Phase to ship   | Phase 6 / Week 6 ("Wire LemonSqueezy plan-tier limits to AI usage")                |
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

# B. Backlog — known opportunities (not yet started)

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

**Benefits.**
- Daily-active retention lever; pattern proven in Duolingo / Linear / Notion.
- Trivial to implement on top of `activityLogs` (we already have it).

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

## B.3 — CSV import / export per entity (Phase 4 — but elevated by audit)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | ✅ **Shipped 2026-05-24** (Week 4 of `PHASE-3-AI-AUDIT.md §6`)                      |
| Category        | Onboarding / Data import                                                           |
| Phase to ship   | Week 4 of `PHASE-3-AI-AUDIT.md §6` — DONE                                           |
| Owners          | `core/ai/components/preview/CsvImportPreviewCard.tsx`, `convex/ai/quarantined/csvParser.ts`, `convex/crm/entities/leads/mutations.ts` (`bulkInsertFromCsvImpl/Import/ForAI`), `convex/_shared/dedup.ts` |
| Risk if skipped | High. Audit (§11) calls this out: "Every CRM buyer's first action is import my old spreadsheet. If that fails, deal dies in week 1." |
| Files involved  | `csvImports` table; `convex/_shared/dedup.ts`; `convex/ai/quarantined/csvParser.ts` + `csvParserInternal.ts`; `convex/ai/tools/layers/csvImport.ts` + `csvImportInternal.ts`; `convex/ai/csvImports.ts` (public read); `core/ai/components/preview/CsvImportPreviewCard.tsx` |

**What shipped (one-paragraph rollup).**
Dual-LLM pattern enforced — quarantined LLM extracts structured rows with no tools, privileged `bulkInsertFromCsvImpl` only sees Zod-validated row list. Per-row dedup decisions (insert/merge/skip) baked at parse-time and re-validated at write-time. Preview UI shows status banner + decision count badges + first-5-row sample table. AI tool flow: `import_csv` (twoStep) → user approval → `commit_import_csv` re-reads previewRows from trusted DB. Phase 1 ships `lead` entity only; contact/company/deal twins deferred to B.9.

**Deferred sub-items captured in their own cards:**
- B.11 — Multi-entity CSV import (contact / company / deal twins)
- B.12 — CSV preview per-row dedup-decision override UI
- B.13 — CSV mapping editor in the preview card

---

## B.4 — Markdown chat renderer with Shiki highlighting

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred (Phase 4 / Week 6 polish)                                                 |
| Category        | UX                                                                                 |
| Phase to ship   | Week 6 (`streamdown` replacement — Attio Problem 5, audit §2.3)                    |
| Owners          | `core/ai/components/markdown/`                                                     |
| Risk if skipped | Half-rendered `**bold` flickers in mid-stream. Cosmetic but noticeable.            |
| Files involved  | `core/ai/components/markdown/Markdown.tsx`                                         |

**Implementation sketch.** Suppress incomplete syntax until closing tag arrives; smooth animation decoupled from network bursts. Reference: Attio engineering blog cited in audit §2.3.

---

## B.5 — Bulk-update modal for kanban (UI for existing `bulk_*` AI tools)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred (Phase 4)                                                                 |
| Category        | Productivity                                                                       |
| Phase to ship   | Phase 4                                                                            |
| Owners          | `core/data-display/kanban/`, AI tool layer is already done.                        |
| Risk if skipped | None. Power users currently fall back to AI ("close all deals with no activity for 30+ days").                                  |
| Files involved  | New: `core/data-display/kanban/components/BulkActionsBar.tsx`                      |

---

## B.6 — Subagent routing (audit §6 Week 2) — ✅ SHIPPED 2026-05-23

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Shipped 2026-05-23                                                                  |
| Category        | AI architecture                                                                    |
| Phase shipped   | Week 2 of `PHASE-3-AI-AUDIT.md §6`                                                 |
| Owners          | `convex/ai/subagents/`, `convex/ai/orchestrator/router.ts`                         |
| Files involved  | `convex/ai/subagents/{types,crmAction,qa,enrichment,csvImport,settings,index}.ts`, `convex/ai/orchestrator/router.ts`, `convex/ai/orchestrator/run.ts`, `convex/schema/ai.ts` (`aiMessages.subagent`), `convex/ai/systemPrompt.ts` |

**Outcome.** 5-subagent registry; heuristic-first classifier (Haiku
escalation when confidence < 0.6); subagent persisted on
`aiMessages.subagent`; `systemPrompt.ts` filters runbooks to the
subagent's allow-list. See `core/ai/STATE.md` for the architecture
notes added at end-of-Week-3.

---

## B.7 — `contextBag` typed conversational state (audit §6 Week 3) — ✅ SHIPPED 2026-05-23

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Shipped 2026-05-23                                                                  |
| Category        | AI memory / state                                                                  |
| Phase shipped   | Week 3 of `PHASE-3-AI-AUDIT.md §6`                                                 |
| Owners          | `convex/ai/`, schema `aiConversations.contextBag`                                  |
| Files involved  | `convex/schema/ai.ts`, `convex/_migrations/2026_05_24_addContextBagAndSubagent.ts`, `convex/ai/tools/contextBag.ts`, `convex/ai/conversations.ts:patchContextBag`, `convex/ai/systemPrompt.ts` ("Facts already known" block) |

**Outcome.** `set_context_var` tool persists snake_case facts; system
prompt injects them as "Facts already known"; 4KB FIFO budget enforced
in `patchContextBag`.

---

## B.8 — Migrate `propose`/`commit_*` to AI SDK v6 native HITL (audit §6 Week 3) — ✅ SHIPPED 2026-05-23 (with deviation)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Shipped 2026-05-23 — see deviation below                                            |
| Category        | AI architecture / DRY                                                              |
| Phase shipped   | Week 3.3 + 3.4 of `PHASE-3-AI-AUDIT.md §6`                                         |
| Owners          | `convex/ai/toolRegistry.ts`, `convex/ai/orchestrator/streamLoop.ts`, `convex/ai/messages.ts`, `core/ai/hooks/useAIChat.ts` |

**What shipped.**
- `ToolDef.needsApproval: boolean | (args)=>boolean` — single declarative source of truth on the tool def.
- `resolveNeedsApproval(toolName, args)` — used by `streamLoop.ts`. Reads new field; legacy `confirmation: "twoStep"` honoured for back-compat during the migration window.
- `addToolApprovalResponse` mutation — alias of `confirmConfirmation` matching the AI SDK v6 cookbook signature `{ orgId, toolApprovalId, approved, editedArgs }`.
- `lastAssistantMessageIsCompleteWithApprovalResponses` pure helper exported from `convex/ai/messages.ts`; re-implemented in `core/ai/hooks/useAIChat.ts` as `isAwaitingApprovalOrStreaming`.

**Deviation from the audit's literal wording.** Full-native AI SDK v6
`needsApproval` keeps `streamText` alive until the user responds —
incompatible with our DB-streamed resume model (`run` → DB patch → user
approves → separate `resume` action). We adopt the SDK's NAME + ARG
SHAPE so frontend code reads identically to the cookbook, but
server-side the existing pause/resume flow is preserved. Net result:
tool authors get the SDK's mental model, dynamic approval works
(`(args) => args.rowCount > 50`), and we did not have to rewrite the
streaming layer.

**Follow-up (open).** Existing tools with `confirmation: "twoStep"`
should be progressively migrated to `needsApproval: true`. New tools
should NOT use `confirmation`. Both fields are honoured today; remove
`confirmation` from the type when the migration completes.

---

## B.9 — Enrichment waterfall + file analysis (audit §6 Week 5)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Deferred to Week 5                                                                 |
| Category        | Vertical-CRM "wow" features                                                        |
| Phase to ship   | Week 5                                                                             |
| Owners          | `convex/ai/subagents/enrichment.ts` + `convex/ai/subagents/fileAnalysis.ts` (new)  |
| Files involved  | New tools under `convex/ai/tools/enrichment/` and `convex/ai/tools/files/`         |

---

## B.10 — Streaming Markdown parser, telemetry, multi-provider auto-failover, AI-credit pool (audit §6 Week 6)

Bundled here for brevity; each is a separate row in the audit doc. Re-read `PHASE-3-AI-AUDIT.md §6 Week 6` when starting.

---

## B.11 — Multi-entity CSV import (contact / company / deal twins)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | Onboarding / Data import                                                           |
| Phase to ship   | Phase 5 (vertical-CRM expansion) — track behind Week 5 enrichment                  |
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
| Phase to ship   | Phase 4 (CRM polish) — independent of Phase 3                                       |
| Owners          | `core/ai/components/preview/CsvImportPreviewCard.tsx`; new `convex/ai/csvImports.ts:patchRowDecision` mutation |
| Risk if skipped | Low. Users who disagree with a parser decision today must re-export the file with a different shape (e.g. add a `__skip__` column). |
| Files involved  | `core/ai/components/preview/CsvImportPreviewCard.tsx` (currently read-only); `convex/ai/csvImports.ts` (add `patchRowDecision` orgMutation that flips `dedupDecision` in `previewRows[idx]`). |

**Why deferred.** The propose-and-approve flow is functional without per-row override; the user reviews the parser's decisions and either accepts the whole batch or re-runs the import. Adding clickable buttons per row is incremental polish, not blocking sales.

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
| Phase to ship   | Phase 4 (CRM polish) — independent of Phase 3                                       |
| Owners          | `core/ai/components/preview/CsvImportPreviewCard.tsx`; new `convex/ai/csvImports.ts:patchMapping` mutation; re-parse path |
| Risk if skipped | Low–Medium. The parser's heuristic header guesser handles ~85% of real-world CSVs; outlier cases need a second import after editing the file. |
| Files involved  | `core/ai/components/preview/CsvImportPreviewCard.tsx` (today shows mapping read-only / not at all); `convex/ai/quarantined/csvParser.ts` (re-extract using user-edited mapping); `convex/ai/csvImports.ts`. |

**Why deferred.** The parser's `guessHeaderMap` heuristic catches the common cases (`first_name` / `email` / `company`). When it misses, the user re-exports with renamed headers — slower than an inline editor but functional. Inline editing requires re-running the LLM extract step, which costs additional tokens and complicates the state machine.

**Implementation sketch.**
1. Add `patchMapping` orgMutation that swaps the `mapping` field + flips status back to `parsing`.
2. Schedule the parser action to re-run with the new mapping passed in.
3. Add an "Edit mapping" toggle in the preview card that exposes a per-column `<select>` of canonical fields.
4. Show "Re-parsing…" spinner while the action re-runs.

**Verification.** Add a scorer test where the parser is fed a CSV with `surname` instead of `lastName` and the mapping editor is used to fix it. Manual: import a CSV with off-spec headers → edit mapping → re-parse → preview shows the corrected fields.

---

## B.20 — Cross-conversation AI learning (embedding-based memory)

**Status:** Backlog
**Category:** AI / UX
**Phase to ship:** Phase 5 (`PHASE-3-AI-AUDIT.md` Phase 4 Part 3 follow-on)
**Owners:** `core/ai`
**Risk if skipped:** Without it, every new chat starts from zero. The AI re-learns the user's preferences each time. P1.12 (`aiPersonaContext`) covers durable facts the model writes explicitly, but does NOT capture latent patterns ("this user always asks for short replies", "this user tags every lead with `@hot`").
**Files involved:** `convex/ai/personaContext.ts` (extend), new `convex/ai/learningPipeline.ts`, new `convex/schema/aiSchema.ts::aiObservations` table, new embedding store (Convex's vector index or external).
**Why we deferred:** Real cross-chat learning needs an embedding store, a quarantined summarisation worker that runs after each conversation, and a careful safety review (we must NEVER store PII in the persona). P1.12 ships the durable-context surface; this card ships the auto-learning loop.
**Benefits when reinstated:**
- Conversational warmth: AI remembers "you prefer concise answers" without being told each session.
- Personalised suggestions: P1.14's suggestion ranking improves with observed preferences.
- Reduced clarifications: AI infers user intent from prior patterns.
**Use cases / who it protects:**
- Field workers who chat from mobile and want minimal back-and-forth.
- Power users who want the AI to anticipate their next ask.
**Implementation sketch:**
1. New `aiObservations` table (orgId, userId, observation, confidence, ts) — capped at 200 rows / user via FIFO eviction.
2. After each chat completes, a quarantined LLM action reads the conversation + the current `aiPersonaContext` and emits either a `keyFacts` patch or an observation.
3. `buildSystemPrompt` reads top-N observations by confidence, includes them under `## Observed patterns` (clearly labelled "may be wrong, ask if you're unsure").
4. User-facing toggle in Settings → AI: "Let the AI learn from our conversations" (off by default; opt-in).
**Verification:** A two-conversation scorer test where conversation 1 establishes "I prefer one-line replies", conversation 2 verifies the AI honours it without being re-told.

---

## B.21 — AI workflow integration (Inngest + activityLogs event bus)

**Status:** Backlog
**Category:** AI / Workflow
**Phase to ship:** Phase 5
**Owners:** `core/ai`, `core/workflows` (new module)
**Risk if skipped:** AI is currently chat-only. The user's vision is "AI integrated everywhere — when a deal moves stage, when a lead goes stale, when a reminder fires, AI suggests / summarises / acts." P1.14 (proactive suggestions panel) is the synchronous read-side; this card is the asynchronous event side.
**Files involved:** new `convex/workflows/` module, new `convex/ai/triggers.ts`, integration with Inngest (already provisioned).
**Why we deferred:** This is its own phase. It needs a workflow definition language, a trigger registry, retries, idempotency, and per-org limits. Piling it on top of Phase 4 Part 1 would compromise the polish work. Phase 4 Part 2's "Per-org AI Telemetry UI" is a prerequisite — operators need visibility before we let the AI fire async.
**Benefits when reinstated:**
- AI-generated daily digest of org activity emailed to admins.
- Auto-summarise long activity threads on entity detail.
- Proactive flag of risky deals (stalled / value-mismatch / unassigned).
- Auto-suggest follow-up reminders when a lead goes 14d untouched.
**Use cases / who it protects:**
- Sales managers who want a "what changed yesterday" digest.
- Solo founders running the CRM solo who need an AI co-pilot watching the pipeline.
- RE teams managing 200+ listings who can't manually scan for stale ones.
**Implementation sketch:**
1. Define `workflows` schema (id, trigger, action, enabled, lastRanAt, …).
2. Inngest function listens for `activityLogs` inserts, dispatches matching workflows.
3. Workflow actions can be: "summarise to slack", "create AI insight row", "send notification", "schedule reminder".
4. Per-org cost cap (workflow actions count against the org's AI budget).
**Verification:** End-to-end test: insert an activityLog row of type "deal.stage.moved" → workflow fires → an `aiInsights` row appears with the AI's analysis.

---

# C. Audit-flagged but not yet roadmapped

## C.1 — Tree-shaped conversations (Attio Problem 1)

Currently `aiMessages` is a flat list keyed by `(conversationId, createdAt)`. Editing a previous turn forks the conversation logically but not in storage. Audit §2.3 notes Attio went to a tree model.

**Effort.** Schema change + UI rewrite of history dropdown. Probably 2–3 days; defer until user feedback says they want branching.

---

## C.2 — Per-org AI eval suite (Attio "defineAgentTestSuite")

We've shipped Week 1 #1.6 baseline scorer (5 tests) — this is the kernel of the eval suite, not the full version. Full version: per-variant sweeps (different models / prompts / tools), cost + latency reporting, regression alerts.

**Effort.** Week 1 #1.6 unblocks it. Building the variant matrix + reporter is ~1 week.

---

## C.3 — Multi-tenancy: cross-org platform-admin AI (Phase 4)

Reserved for super-admin operations (e.g. "show me churn risk across all paying orgs", "list orgs with > 80% plan usage"). Schema is multi-tenant from day 1; the AI layer hasn't yet been pointed at the multi-org view.

---

## C.4 — Audit every twoStep tool's propose-vs-commit schema diff

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | AI / reliability                                                                   |
| Phase to ship   | Phase 4 — alongside the LemonSqueezy billing wall pass                             |
| Owners          | `convex/ai/tools/*`, especially the `commit_*` halves                              |
| Risk if skipped | Currently mitigated by `resume.ts` zod-strip (every commit safely drops unknown fields). But silent data loss is still possible — e.g. a propose carries `notes` and the commit ignores it (this is exactly the original `create_lead` bug, fixed for that one tool). For every other twoStep tool, a propose-only field that the commit lacks is silently lost. |

**Why this card exists.** The 2026-05-24 incident in `convex/ai/tools/crud/createLead.ts` was the first symptom — the propose carried `notes`, the commit dropped it, and the underlying mutation rejected it as an unknown arg. We fixed `create_lead` end-to-end (commit now persists the note via a chained `notes:create`). The same shape risk exists for any future twoStep that adds preview-only fields to its propose schema.

**Implementation sketch.** Add a startup check that diffs each `propose_X.schema` against `commit_X.schema` and warns (not fails) when propose has fields commit doesn't. The strip-on-resume already guarantees correctness at runtime; this would catch the silent-loss case at the agent-author moment.

---

## C.5 — `streamLoop.ts` should also surface friendly errors on `tool-error` chunks

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Backlog                                                                            |
| Category        | UX                                                                                 |
| Phase to ship   | Phase 4 — alongside markdown / streaming polish (B.10)                             |
| Owners          | `convex/ai/orchestrator/streamLoop.ts` `case "tool-error"`                         |
| Risk if skipped | Tool failures inside the model's run loop (vs. resume-time commits) currently render the raw error text in the timeline row. The model still sees and recovers from it, but the user-visible expanded error is verbose. |

**Implementation sketch.** Run the same `friendlyToolError` mapper on the `chunk.error` value before patching the tool record's output. Keep the raw error in `output.rawError` for debugging, but surface `friendly.markdown` to the timeline rendering layer.

---

## C.6 — Reactive-completeness wave (audit-driven, 2026-05-25)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | ✅ Implemented — Stages 2-4 of the audit-driven sprint shipped (2026-05-26). Milestone A complete. |
| Category        | AI / tool surface parity                                                           |
| Phase to ship   | — (shipped)                                                                        |
| Owners          | `convex/ai/tools/**`                                                                |
| Risk if skipped | — (shipped)                                                                        |

**Why this card exists.** Audit pass on 2026-05-25 enumerated every backend public function and cross-mapped against the registered AI tool surface. Found 51 actionable gaps. P0 items (3) all sit in the messaging module — `send_message`, `list_messages`, `mark_thread_read` — none wrapped despite the underlying mutations/queries being fully implemented. P1 items (5) cover note edits, reminder updates, company-person links, and a universal `delete_entity`. P2 items (7) cover pipeline-stage edits, lead-stage move, files, tag/view edits, reopen-deal, org-timeline, invitations + custom-role CRUD.

**Cross-references:**
- `/AI-AUDIT-COMPLETE.md` — full 3-column map + 75-tool registry. §16 P0/P1/P2/P3 all flipped to ✅.
- `/AI-AGENT-CAPABILITY-AUDIT.md` — what reactive-completeness unlocks (Milestone A in the senior-CRM roadmap).
- `core/ai/STATE.md` — Reactive-completeness wave block.

**Shipped (2026-05-26).** Stage 2 of the audit-driven sprint shipped the P0 messaging family (`send_message`, `list_messages`, `mark_thread_read`, `add_participants`, `remove_participant`) plus all the matching ForAI twins. Stage 3 shipped the entire P1 wave: universal `delete_entity` + commit routing to `softDeleteForAI` for lead/contact/company/deal + `removeForAI` for note/reminder; `update_reminder` + commit; `update_note` / `delete_note` + commits + atomic `pin_note` / `set_note_category`; `add_person_to_company` / `remove_person_from_company` + commits. Stage 4 closed P2/P3: 18 new AI tools across 7 layers covering pipeline-stage edits (`update_pipeline_stage` / `remove_pipeline_stage` / `reorder_pipeline_stages` / `set_default_pipeline`), `move_lead_status` (atomic, mirrors `move_deal_stage`), `update_tag` + `update_saved_view` (atomic), files (`list_files` / `update_file_tags` / `remove_file`), `reopen_deal`, `list_org_timeline`, invitations (`resend_invitation`), custom roles (`create_custom_role` / `update_custom_role` / `delete_custom_role`), and notifications (`list_notifications` / `mark_notification_read`). 3 new tool layers introduced (`files`, `timeline`, `notifications`); 4 existing layers extended (`pipelines`, `tags`, `views`, `members`). Per AGENTS.md non-negotiable rule, every backing public mutation/query has a same-file `*ForAI` twin: pipelines (6 twins via `*Impl` extraction), tags (NEW public `update` + ForAI), savedViews (`updateForAI`), files (`listByScopeForAI` + `listForEntityForAI` + `updateTagsForAI` + `removeForAI`), orgRoles (3 twins on `authenticatedMutation` model + `listForAI`), timeline (`getForOrgForAI`), invitations (NEW public `resend` + `resendForAI`), deals (NEW public `reopen` + `reopenForAI`), notifications (`listMineForAI` + `markReadForAI`). System prompt gained Stage-4 verb-routing block for Pipelines / Files / Timeline / Roles / Notifications / Tag-view edits. 14 ForAI contract tests at `convex/ai/tools/stage4/stage4.test.ts`. AI coverage by usage frequency: ~70% → ~95%. Reactive parity gap with the UI is closed for the entire app — the user can no longer say "the AI can't do X" for any common reactive verb.

---

## C.7 — Dashboard widget registry & template key normalisation

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | ✅ Implemented — Stage 1, 2026-05-26                                              |
| Category        | UX / AI tool reliability                                                           |
| Phase to ship   | Same sprint as C.6                                                                 |
| Owners          | `convex/_shared/widgetRegistry.ts`, `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`, every `convex/crm/fields/templates/definitions/*.ts` |
| Risk if skipped | Reminders / Messages / Activity / Calendar widgets disappear from the dashboard for orgs whose template wrote unrecognised metric keys (`reminders.list`, `calendar.miniWidget`, `tasks.thisWeek`, `tasks.recentlyCompleted`). The user explicitly hit this on 2026-05-25 ("why are reminders not showing on dashboard?"). Also blocks the AI's `update_dashboard_layout` tool from writing the same keys the dashboard itself uses. |

**Why this card exists.** `WIDGET_KEYS` registers 12 KPI tile keys. The dashboard layout uses an additional 9+ keys (`messages.recent`, `activity.recent`, `today.focus`, `calendar.weekAhead`, `calendar.mini`, plus template-specific variants). `validateDashboardLayout` rejects anything not in `WIDGET_KEYS`, so the AI tool surface is artificially restricted and the templates emit "ghost" keys.

**Implementation sketch.** See `/DASHBOARD-AUDIT.md §3 Step 1–3` — extend `WIDGET_KEYS`, write migration, update templates. Plus replace `null` empty states on `MessagesPreviewWidget`, `TimelineActivityWidget`, `WeekAheadWidget` with CTA cards (pattern: `<NextReminderFallback />`).

**Verification.** `convex/ai/queries/widgets.test.ts` asserts `validateDashboardLayout` accepts every key emitted by every template definition (32 contract tests, parametrised across all 9 templates). Migration `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` is idempotent — dev run scanned 1 org, patched 0 (already canonical post-registry-extension).

**Shipped (2026-05-26).** Stage 1 of the audit-driven sprint (`SPRINT-PLAN.md`). `WIDGET_KEYS` 12 → 25; `LEGACY_KEY_RENAMES` collapses `calendar.miniWidget` → `calendar.mini`; all 9 templates use canonical keys; CTA empty states landed on the 4 broken widgets; `RemindersCard` gate widened to honour `reminders.list`. The "reminders widget not showing" bug is fixed end-to-end.

**Shipped (2026-05-26 — Stage 5).** The remaining Stage-1 deferral is closed. `AIQuickComposerCard` + `AIPulseRibbon` mounted on the dashboard (`core/shell/shell/views/dashboard/cards/`); two new widget keys (`ai.quickComposer`, `ai.pulseRibbon`) registered + opted into all 9 templates; idempotent migration `convex/_migrations/2026_05_26_addAiDashboardWidgets.ts` ran on dev (1 org patched, idempotent re-run unchanged=1); `AIReliabilityCard` lands the per-tool reliability table in Settings → AI; `users.preferences.aiPulseDismissed` schema field + `dismissAiPulseSuggestion` authenticated mutation drive per-user dismissal. 15 contract tests at `convex/stage5.test.ts`. C.7 is now fully Implemented.

---

## C.8 — Senior-CRM roadmap (Milestones B–E from AI-AGENT-CAPABILITY-AUDIT.md)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | ✅ Implemented — Milestones B + C + D + E all shipped (Stages 6 + 7 + 8 + 9, 2026-05-26). Senior-CRM bar reached on every dimension; Stage 10 polish + edge-case hardening is the only remaining work. |
| Category        | AI / proactive + analytical + autonomous + creative                                |
| Phase to ship   | Phase 5 (post-launch — once reactive completeness is shipped)                      |
| Owners          | `convex/ai/**`, `core/ai/**`                                                        |
| Risk if skipped | (Closed.) Without these the AI remained a "junior agent that does what's asked." Stages 6–9 closed every reactive + proactive + analytical + autonomous + creative gap from the AI-AGENT-CAPABILITY-AUDIT scorecard. |

**Why this card exists.** AI-AGENT-CAPABILITY-AUDIT scorecard (post-Stage 9): Reactive 9.5/10, Proactive 8/10, Analytical 8/10, Autonomous 8/10, Creative 7/10, Trust 9/10. Overall ~8.5/10. Roadmap milestones:

- ✅ **Milestone B — Proactive — SHIPPED Stage 6, 2026-05-26.** New `aiNextActions` materialised ranking table + heuristic ranker (`convex/ai/queries/nextActions.ts`, cron-rebuilt every 30 min, 100 rows/user cap, no LLM cost) + 3 always-on AI tools (`list_next_actions`, `list_stale_records`, `list_pipeline_anomalies`) + `AIPulseRibbon` reads from ranked store + `/{orgSlug}/ai/next-actions` view + WoW anomaly detector (`convex/ai/queries/anomalies.ts`) + confidence labels (closes capability-audit T-4). 20 contract tests at `convex/stage6.test.ts`. P-4 stage-cadence + P-5 pattern matching deferred (Stage 8 + backlog).
- ✅ **Milestone C — Analytical — SHIPPED Stage 7, 2026-05-26.** New `analytics` AI tool layer with 5 tools (`analyze_metric` twoStep+expensive, `cohort_analysis`, `member_performance`, `get_briefing`, `refresh_briefing`). 2 new tables (`aiInsights` + `aiCohortReports`). Win/loss retrospective fires on `closeAsDoneImpl` via scheduled `analyzeDealClose` action. Pipeline-velocity dashboard card opted into all 9 templates. T-1 trace UI shipped at `/{orgSlug}/ai/trace/[conversationId]` + AIReliabilityCard "View trace" wire-up. 4 new permissions (`members.viewPerformance`, `ai.analytics.viewMetrics`, `ai.cohorts.view`, `ai.trace.view`). New `costClass` field on `ToolDef` (Constraint I). 18 contract tests at `convex/stage7.test.ts`. Closes capability-audit A-1..A-5 + T-1 + T-3.
- ✅ **Milestone D — Autonomous — SHIPPED Stage 8, 2026-05-26.** New `aiStandingOrders` table (closed-union schedule: interval / daily / weekly) + `users.preferences.aiAutonomy` opt-in toggles + `pipelines.stages[].onEnter` triggers + `aiToolEvents.triggeredBy` audit trail. V8 cron evaluator + use-node runner with tool whitelist. Auto-action triggers for stage-move + contact-create. New permission `ai.automation.manage`. Settings UI: `AIAutomationSection.tsx`. 26 contract tests at `convex/stage8.test.ts`. T-5 closed in the same wave.
- ✅ **Milestone E — Creative — SHIPPED Stage 9, 2026-05-26.** New `creative` AI tool layer at `convex/ai/tools/creative/` with 4 tools: `draft_message` + commit (twoStep, costClass `expensive`), `draft_proposal` + commit (twoStep, costClass `expensive`), atomic `summarise_conversation` (costClass `expensive`), atomic `web_scrape` (costClass `normal` — Firecrawl-scrape pair for `web_search`). 4 internal action subagents at `convex/ai/actions/{draftMessage,draftProposal,summariseConversation,webScrape}.ts` — each runs LLM with structured-output Zod gates AND a deterministic fallback. Quota helpers at `convex/ai/creativeHelpers.ts`: `enforceCreativeQuota` (5/min/user + 50/day/user soft cap counted from successful aiToolEvents); `enforceWebScrapeRateLimit` (30/min/user separate budget). Drafts NEVER autosend or persist by AI — every draft surfaces `suggestedNext` chips routing to `send_message` / `add_note` / `create_followup`. systemPrompt gained `## Creative drafting (Stage 9)` block with verb routing + non-negotiables. 17 contract tests at `convex/stage9.test.ts`. Closes capability-audit D-1/D-2/D-3 + adds D-6 web grounding.

**Cost estimate (post-Stage 9).** ~$5-15/org/mo for the creative layer at full opt-in; ~$30-65/org/mo total at full opt-in across milestones B + C + D + E.

**Implementation sketch + cross-references.** See `/AI-AGENT-CAPABILITY-AUDIT.md §2-§4` for per-milestone gaps and `§5` for cost/eng-week breakdowns. Stage 10 (`/SPRINT-PLAN.md`) — the polish + edge-case hardening pass that closes the sprint — **shipped 2026-05-26**: 4 production-grade pure helpers under `convex/_shared/{sanitiseExtractedText,csvEncodingDetect,bulkProgress,enrichmentErrorMap}.ts` wired into `analyze_file`, `import_csv`, `bulk_update_entities`/`bulk_close_deals`, and the 4-provider enrichment trace; 39 contract tests at `convex/stage10.test.ts`.

---

# D. Process / governance items (rules and conventions, not features)

## D.1 — STATE.md compliance audit (every module)

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Drift inevitable                                                                   |
| Category        | Governance                                                                         |
| Phase to ship   | Continuous                                                                         |
| Owners          | All agents                                                                         |
| Risk if skipped | The next agent has zero handoff context; cost of drift compounds.                  |

**Process.** Quarterly: walk every `core/*/STATE.md`, `features/*/STATE.md`, and the top-level `convex/`/`*/MODULE.md`. Delete stale items, mark missing ones.

---

## D.2 — Migrate context summary back into version control

| Field           | Value                                                                              |
|-----------------|------------------------------------------------------------------------------------|
| Status          | Open question                                                                      |
| Category        | Governance                                                                         |
| Phase to ship   | Whenever the team agrees                                                           |
| Risk if skipped | Phase-3A summary referenced a `CODE-ARCHITECTURE-PHASE-3A.md` that no longer exists on disk. The work shipped, but the design rationale lives only in chat history. |

**Decision needed.** Either a) keep architecture docs as long-lived files in `/docs/architecture/` and never delete, or b) snapshot final phases into the build-context (`.github/agents/base/context.md`) before deleting phase docs.

---

# E. Additions log — this is where new entries go

> When you defer / disable / weaken something, add the card to the right section above (A / B / C / D), then add a one-line entry below with date + category for traceability.

| Date       | Category | Title                                                                | Section |
|------------|----------|----------------------------------------------------------------------|---------|
| 2026-05-23 | Model gating  | A.1 — Plan-tier gating in `getModel()`                          | A       |
| 2026-05-23 | Tool surface  | A.2 — Per-tool `requiredCapability: "premium"` gate             | A       |
| 2026-05-23 | Cost          | A.3 — `stepCountIs` cap (raised to 30 for all models)           | A       |
| 2026-05-23 | Prompt        | A.4 — Small-model "Capability Notice" no longer enforced        | A       |
| 2026-05-23 | Billing       | A.5 — `enforcePlanLimit` defaults loose during testing          | A       |
| 2026-05-23 | Engagement    | B.1 — Streak widget (deferred from Phase 3A → Phase 4)          | B       |
| 2026-05-23 | UX            | B.2 — Cmd+K global command palette                              | B       |
| 2026-05-23 | Onboarding    | B.3 — CSV import / export (elevated to Week 4)                  | B       |
| 2026-05-23 | UX            | B.4 — Markdown chat renderer with Shiki                         | B       |
| 2026-05-23 | Productivity  | B.5 — Bulk-update modal for kanban (UI on existing AI tools)    | B       |
| 2026-05-23 | AI            | B.6 — Subagent routing (audit Week 2)                           | B       |
| 2026-05-23 | AI            | B.7 — `contextBag` typed conversational state (audit Week 3)    | B       |
| 2026-05-23 | AI            | B.8 — Migrate to AI SDK v6 native HITL (audit Week 3)           | B       |
| 2026-05-23 | AI            | B.9 — Enrichment waterfall + file analysis (audit Week 5)       | B       |
| 2026-05-23 | AI            | B.10 — Week 6 polish bundle (markdown, telemetry, failover)     | B       |
| 2026-05-23 | AI (shipped)  | B.6 — Subagent routing — SHIPPED                                | B       |
| 2026-05-23 | AI (shipped)  | B.7 — `contextBag` typed conversational state — SHIPPED         | B       |
| 2026-05-23 | AI (shipped)  | B.8 — `needsApproval` migration (with deviation) — SHIPPED      | B       |
| 2026-05-24 | AI (shipped)  | B.3 — CSV import + dual-LLM safety (audit Week 4) — SHIPPED     | B       |
| 2026-05-24 | Onboarding    | B.11 — Multi-entity CSV import (contact / company / deal)       | B       |
| 2026-05-24 | UX            | B.12 — CSV preview per-row dedup-decision override UI           | B       |
| 2026-05-24 | UX            | B.13 — CSV mapping editor in the preview card                   | B       |
| 2026-05-24 | AI (audit)    | C.4 — Audit propose-vs-commit schema diff for every twoStep      | C       |
| 2026-05-24 | UX            | C.5 — Friendly errors in streamLoop tool-error chunk             | C       |
| 2026-05-24 | AI (shipped)  | C.6 — DataTable duplicate-key from `fieldDefinitions` create — SHIPPED | C  |
| 2026-05-24 | AI (shipped)  | C.7 — `commit_*` tools wired through `applyEntityPatchByCode` (Bug 2) — SHIPPED | C |
| 2026-05-24 | AI (shipped)  | B.17 — File-analysis custom-field application (P1.3) — SHIPPED   | B       |
| 2026-05-24 | AI (shipped)  | B.10a — Multi-provider failover wired into streamLoop (P1.1) — SHIPPED | B   |
| 2026-05-24 | AI (shipped)  | C.8 — Follow-up by code (`complete_followup_by_code` / `cancel_followup_by_code`) — SHIPPED | C |
| 2026-05-24 | AI (shipped)  | C.9 — Fuzzy code normalisation (`P001 → P-001`) — SHIPPED        | C       |
| 2026-05-24 | AI (shipped)  | C.10 — Dev-time twoStep schema-diff log (P1.6) — SHIPPED         | C       |
| 2026-05-24 | AI            | B.20 — Cross-conversation AI learning (embedding-based memory)   | B       |
| 2026-05-24 | AI            | B.21 — AI workflow integration (Inngest + activityLogs bus)      | B       |
| 2026-05-24 | AI (shipped)  | P1.10 — Dynamic per-org schema context (buildOrgSchemaContext) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.9 — ToolSummary envelope + ToolSummaryCard — SHIPPED          | —       |
| 2026-05-24 | AI (shipped)  | P1.4 — ToolInstruction structured template (infra + create_lead) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.11 — Multi-tier FriendlyToolError + ChatToolError card — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.12 — aiPersonaContext (per-org + per-user durable AI memory) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.13 — Route-aware context expansion (## Current page block) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.14 — Proactive AI Suggestions panel (pure heuristics, no model calls) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.2 — Streaming Markdown polish (lazy table, defer mid-stream heading, text-balance) — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.4 + P1.9 follow-on — instruction + summary on create_contact / create_deal / create_company / add_note / create_followup / search_crm — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | P1.14 mounting — AISuggestionsPanel on dashboard + person profile, chat-prefill window-event bridge — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | orgs.aiContext wired into system prompt as `## About this organisation`; users.aiContext marked DEPRECATED; per-user follow-up snapshot + file upload limits added to system prompt — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | AI-native cleanup wave: dropped orgs.aiContext column entirely (migration shipped), added aiPersonaContext.identity field, new update_org_identity AI tool, last 6 lower-traffic tool migrations completed, per-entity rebuildEntityContext shipped as deterministic summariser (455 lines + 14 tests), full codebase cleanup (biome 0/typecheck 0/build green) — SHIPPED | — |
| 2026-05-24 | AI + Settings (shipped) | Phase 4 Part 2 — Telemetry writer (`recordToolEvent`) wired into streamLoop tool-call/result/error/finish; `getOrgUsage` rollup query (247 lines); AI quota gate (`checkAiQuota`) hard-blocks free tier and meters paid tiers at chat entry; new Settings → AI sections: AI Memory (read-only summary + keyFacts + per-scope "Forget all") + AI Usage (gauge + range tabs + 4-stat strip + daily sparkline + top-5 tools/models); Billing → Plan limits AI tokens UsageBar wired to real telemetry; settings folder restructure (notes/ deleted, pipelines/ created, field editors moved to modules/); 97 → 99 — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | Phase 4 Part 2 — AI-native parity push: phantom tools fixed (list_followups + list_followups_for_person registered as always-on); 5 new always-on read tools (list_tags / list_categories / list_members / list_saved_views / list_field_options) + 5 ForAI internal twins; orgSchemaContext.ts now renders showInStages / allowedFileTypes / sensitive / defaultValue / groupName flag column on every entity field table; systemPrompt.ts adds plan tier, codePrefixes, reminderDefaults, followupDefaults, softDeleteRetentionDays, dashboardMetrics ordering, pipeline-level stageTransitionPolicy + allowSkipStages, and a static "File attachments in chat" convention block; convex/ai/webSearchAction.ts (Node-only Firecrawl wrapper) + convex/ai/tools/webSearch.ts always-on web_search tool gated on FIRECRAWL_API_KEY; convex/ai/chatAttachments.ts (attach mutation, scope=aiChat scopeId=conversationId); core/ai/components/composer/ChatAttachButton.tsx + ChatComposer paperclip + chip list + body marker injection; ChatSheet handleEnsureConversation lazily creates a conversation when user attaches before sending — SHIPPED | — |
| 2026-05-24 | AI (shipped)  | T8 — WIDGET_REGISTRY backend exposure (`convex/_shared/widgetRegistry.ts` SSoT, frontend imports the data half + decorates with icons/getters/hrefs); `list_widgets` always-on read tool emits the catalogue + current layout; `update_dashboard_layout` settings-layer twoStep tool patches `org.settings.dashboardMetrics` after validating every key. systemPrompt now points the model at `update_dashboard_layout` instead of the generic `update_org_settings` patch path — SHIPPED | — |
| 2026-05-24 | Billing (shipped) | BYOK policy update — quota gate now allows BYOK on every plan including free; platform models stay locked to paid tiers (free → "add BYOK or upgrade" message; starter/pro → metered; enterprise → unmetered). `convex/ai/orchestrator/quotaGate.ts` rewritten + `run.ts` moved the gate from before to after `resolveModelAndKey` so it knows `usageMode`. — SHIPPED | — |
| 2026-05-24 | Cleanup (shipped) | Stale-code purge — deprecated `invitationRoleValidator` / `invitationRoleValues` / `InvitationRole` removed (no consumers); legacy `orgs.stripeCustomerId` + `stripeSubscriptionId` fields + `by_stripeCustomerId` index removed (zero rows had values, verified via runOneoffQuery; LemonSqueezy fields are the SSoT); dead `users.preferences.aiContextCardCollapsed` removed (no UI consumer). — SHIPPED | — |
| 2026-05-25 | AI / Audit    | C.6 — Reactive-completeness wave (51 actionable gaps catalogued in `/AI-AUDIT-COMPLETE.md`). P0: `send_message` family (3 tools), P1: 5 tools (note edits, reminder updates, company-person, universal delete) | C |
| 2026-05-25 | UX / Audit    | C.7 — Dashboard widget registry & template key normalisation. Root cause: `generic` template writes `reminders.list` but dashboard gates on `reminders.dueToday`; 9+ keys not in `WIDGET_KEYS`. See `/DASHBOARD-AUDIT.md` | C |
| 2026-05-25 | AI / Roadmap  | C.8 — Senior-CRM specialist roadmap (Milestones B–E, ~10 eng-weeks). Proactive ranking + analytical reasoning + autonomous workflows + creative drafting. See `/AI-AGENT-CAPABILITY-AUDIT.md` | C |
| 2026-05-26 | UX (shipped)  | C.7 — Dashboard widget registry & template key normalisation — SHIPPED Stage 1. `WIDGET_KEYS` 12 → 25; `LEGACY_KEY_RENAMES`; idempotent migration; CTA empty states on 4 widgets; `RemindersCard` gate widened. `D4` (`AIQuickComposerCard`) deferred to Stage 5. | C |
| 2026-05-26 | AI (shipped)  | C.6 — Messaging tool wave — Stage 2 SHIPPED. `send_message` (+ commit), `list_messages`, `mark_thread_read`, `add_participants` (+ commit), `remove_participant` (+ commit). ForAI twins added across messages + conversations modules. P1 surface still pending Stage 3. | C |
| 2026-05-26 | AI (shipped)  | C.6 — Reactive parity P1 wave — Stage 3 SHIPPED. Universal `delete_entity` (+ commit) over lead/contact/company/deal/note/reminder; `update_reminder` (+ commit); `update_note` / `delete_note` (+ commits) + `pin_note` / `set_note_category` (atomic); `add_person_to_company` / `remove_person_from_company` (+ commits). ForAI twins on entity `softDelete`, companies `addPerson`/`removePerson`, notes `update`/`togglePin`/`setCategory`/`remove`, reminders `update`/`remove`. New `convex/ai/queries/cascadeImpact.ts` powers cascade-impact propose card. P2 surface still pending Stage 4. | C |
| 2026-05-26 | AI (shipped)  | C.6 — Reactive parity P2 wave — Stage 4 SHIPPED. 18 new AI tools across 7 layers covering pipeline-stage edits (`update_pipeline_stage` / `remove_pipeline_stage` / `reorder_pipeline_stages` / `set_default_pipeline`), `move_lead_status`, `update_tag`, `update_saved_view`, files (`list_files` / `update_file_tags` / `remove_file`), `reopen_deal`, `list_org_timeline`, `resend_invitation`, custom roles (`create_custom_role` / `update_custom_role` / `delete_custom_role`), and notifications (`list_notifications` / `mark_notification_read`). 3 new tool layers: `files`, `timeline`, `notifications`. ForAI twins added on pipelines/tags/savedViews/files/orgRoles/timeline/invitations/deals/notifications backend modules. NEW public `tags/mutations:update`, `invitations/mutations:resend`, `deals/mutations:reopen`. 14 ForAI contract tests. AI coverage by usage frequency: ~70% → ~95%. **Milestone A (Reactive parity) complete.** | C |
| 2026-05-26 | UX (shipped)  | C.7 — AI dashboard surface — Stage 5 SHIPPED. `AIQuickComposerCard` (pinned mini composer that opens the chat sheet via new `flowbite:ai-chat-open` event + prefills via existing `flowbite:ai-chat-prefill`); `AIPulseRibbon` (top-3 dismissible AI suggestions ribbon, per-user dismiss in `users.preferences.aiPulseDismissed` via new `dismissAiPulseSuggestion` mutation); `AIReliabilityCard` in Settings → AI driven by new `getOrgUsage.reliability.perTool` aggregation. 2 new widget keys (`ai.quickComposer`, `ai.pulseRibbon`) registered + opted into all 9 templates; idempotent migration `convex/_migrations/2026_05_26_addAiDashboardWidgets.ts`. 15 contract tests at `convex/stage5.test.ts`. **C.7 fully closed.** | C |
| 2026-05-26 | AI (shipped)  | C.8 — Proactive layer (Milestone B) — Stage 6 SHIPPED. New `aiNextActions` materialised ranking table (orgId / userId / recordKind / recordCode / score 0-100 / confidence high|medium|low / reasonCode enum / reasonText / suggestedIntent / dueAt? / snoozedUntil? / expiresAt). Pure heuristic ranker `convex/ai/queries/nextActions.ts` (NO LLM): reminders score 80+/70/50/35 by overdue/<24h/<48h/<7d, leads 40 (>7d) → 55 (>14d), deals 45 (>14d) → 60 (>21d), high-value boost +20. Cron action `rankNextActions:rebuildAllOrgs` every 30 min, paginates active memberships, schedules per-user `rebuildForUser` mutations 100 ms apart. `convex/ai/queries/anomalies.ts` exposes WoW deltas on pipelineValue / newLeads / dealsWon (10% threshold) + a stale-leads helper. 3 new always-on AI tools `list_next_actions` / `list_stale_records` / `list_pipeline_anomalies` with structured `ToolInstruction` shape (Constraint G). `AIPulseRibbon` rewired to read from ranked store first, falls back to `ai.suggestions:list`; renders confidence badges + "All next actions" link. New `AINextActionsView` at `/{orgSlug}/ai/next-actions` (full-screen ranked list + confidence-tab filter + Act/Snooze 7d/Dismiss). Migration `2026_05_27_addAiNextActions.ts` (schema-only no-op + healthcheck). 20 contract tests at `convex/stage6.test.ts`. **Milestones B/P-1/P-2/P-3 + T-4 closed.** | C |
| 2026-05-26 | AI (shipped)  | C.8 — Analytical layer + Trace UI (Milestone C) — Stage 7 SHIPPED. New `analytics` AI tool layer with 5 tools: `analyze_metric` + `commit_analyze_metric` (twoStep, `costClass: "expensive"` per Constraint I — quota-gated 1/min, 10/day soft cap via `aiToolEvents` count check), `cohort_analysis` / `member_performance` / `get_briefing` / `refresh_briefing` (atomic). 2 new tables: `aiInsights` (kind, body, recordRef?, modelUsed, generatedAt, expiresAt — TTL 90d, indexed by_org_and_kind_and_generated + by_org_and_recordRef_code + by_expires) and `aiCohortReports` (kind, periodStart, periodEnd, rows[], generatedAt, expiresAt — TTL 30d). New deterministic queries `convex/ai/queries/{pipelineVelocity,cohorts,insights,memberPerformance,toolTrace}.ts`; new actions `convex/ai/actions/{analyzeMetric,rebuildCohorts,analyzeDealClose}.ts` + non-Node helpers `convex/ai/{dealClose,analyzeMetricHelpers}.ts`. `closeAsDoneImpl` schedules `analyzeDealClose` (LLM retrospective with deterministic fallback; auto-creates Win/Loss note category + writes structured note). Cron `rebuild-ai-cohorts` (24h interval) shipped. T-1 trace UI: `AIToolTraceView.tsx` + `app/[locale]/(private)/[orgSlug]/ai/trace/[conversationId]/page.tsx` + `AIReliabilityCard` View-trace button wired via `TraceLinkButton`. Pipeline-velocity dashboard: `pipeline.velocity` widget key + `PipelineVelocityCard.tsx` + opt-in for all 9 templates + idempotent migration `2026_05_28_addPipelineVelocityWidget.ts`. Migration `2026_05_28_addAiAnalyticsTables.ts` ran on dev: schema-healthcheck + permission backfill (3 system roles patched: Owner/Admin got 4 keys; Member got 2). 4 new permissions: `members.viewPerformance`, `ai.analytics.viewMetrics`, `ai.cohorts.view`, `ai.trace.view`. New `costClass` field on `ToolDef` (Constraint I). 18 contract tests at `convex/stage7.test.ts`. **Milestone C (Analytical) closed; Milestone B + C now both ✅; Trust score 8 → 9 (T-1 + T-3); Analytical score 3 → 8.** | C |
| 2026-05-26 | AI (shipped)  | C.8 — Autonomous layer (Milestone D) — Stage 8 SHIPPED. New `aiStandingOrders` table (closed-union schedule: `interval` / `daily` / `weekly`; `allowedTools[]` whitelist ≤ 30; per-row `enabled` toggle + `lastRunAt` / `lastRunSummary` / `lastRunStatus`; indexed by_org + by_org_and_user + by_enabled). `users.preferences.aiAutonomy` map (4 keys: `autoFollowupOnStageMove` / `autoEnrichOnContactCreate` / `autoTagOnNote` / `weeklyDigestEmail`; every key default FALSE). `pipelines.stages[].onEnter.{autoFollowupTemplate, autoFollowupAfterDays}` config. `aiToolEvents.triggeredBy?` provenance audit field; `aiToolEvents.conversationId` flipped to optional so non-chat code paths can write provenance. Pure schedule helpers `convex/ai/standingOrders/schedule.ts:shouldFireNow` (deterministic, exported for tests). V8 cron evaluator `evaluator.ts:tick` runs every minute (registered in `convex/crons.ts:evaluate-ai-standing-orders`). Use-node `runner.ts:run` reloads the row, refuses if owner lost `ai.automation.manage`, opens a synthetic `aiConversations` row for trace audit, narrows the tool dict to (owner permissions × `allowedTools[]`), runs `generateText` with `stepCountIs(8)` cap, persists summary + emits one `aiToolEvents` row per tool call with `triggeredBy: "standingOrder:<id>"`. Auto-action triggers `convex/ai/standingOrders/triggers.ts`: `maybeFireAutoFollowupOnStageMove` (hooked into `deals/mutations:moveToStageImpl`) + `maybeFireAutoEnrichOnContactCreate` (hooked into `contacts/mutations:createImpl`); both write `aiToolEvents` with `triggeredBy: "automation:onStageMove"` / `"automation:onContactCreate"`. New permission `ai.automation.manage` (Owner+Admin); migration `2026_05_28_aiStandingOrders` ran on dev (2 system roles patched + table healthcheck; idempotent re-run reports `rolesPatched: 0`). Per AGENTS.md non-negotiable, every public mutation/query has a same-file `*ForAI` twin: `standingOrders/mutations.{create,update,remove}ForAI` + `recordRunResult` + `openConversationForRun` internals; `standingOrders/queries.{listForUser,listForOrg}ForAI` + `listEnabledForEvaluation` + `getForRun` internals; `users/mutations.updateAiAutonomyForAI`. Settings UI: new `core/platform/settings/components/groups/ai/AIAutomationSection.tsx` mounted in `AIGroup.tsx` — 4 autonomy toggles + standing-orders editor (list + create + delete + enable toggle); permission-gated on `ai.automation.manage`. systemPrompt gained `## Autonomous layer (Stage 8)` block with verb-driven routing + opt-in non-negotiable. 26 contract tests at `convex/stage8.test.ts`. **Milestone D (Autonomous) closed; T-5 closed; W-3 (auto-tag classifier) + W-5 (weekly digest email) carry over to Future-Enhancements backlog (the autonomy gates ship in Stage 8 schema; the underlying integrations land in a future iteration).** | C |
| 2026-05-26 | AI (shipped)  | C.8 — Creative layer (Milestone E) — Stage 9 SHIPPED. New `creative` AI tool layer at `convex/ai/tools/creative/` with 4 tools: `draft_message` + `commit_draft_message` (twoStep, `costClass: "expensive"`), `draft_proposal` + `commit_draft_proposal` (twoStep, `costClass: "expensive"`), atomic `summarise_conversation` (`costClass: "expensive"`), atomic `web_scrape` (`costClass: "normal"` — Firecrawl-scrape pair for `web_search`). 4 internal `"use node"` action subagents at `convex/ai/actions/{draftMessage,draftProposal,summariseConversation,webScrape}.ts` — each runs `generateText` with structured-output Zod gates (`DraftMessageSchema`, `DraftProposalSchema`, `ConversationSummarySchema`) AND a deterministic fallback (`buildDeterministicDraftMessage` / `buildDeterministicProposal` / `buildDeterministicSummary`) so contract tests + free-tier deployments pass without an API key. Pure-helper `validateScrapeUrl` + `checkScrapeConfigured` extracted from the use-node `webScrape` action so the bad-URL + WEB_SCRAPE_NOT_CONFIGURED gates are unit-testable. New V8 helpers at `convex/ai/creativeHelpers.ts`: `enforceCreativeQuota` (internalMutation — `requireOrgMemberByIds` auth gate + 5/min/user via `enforceRateLimit` scope `"ai.creative"` + 50/day/user soft cap counted from successful `aiToolEvents` with creative tool names — failed runs do NOT count); `enforceWebScrapeRateLimit` (30/min/user lighter gate, separate budget); `countRecentCreativeRunsForUser` (read-only counter exposed for Settings UI / tests). Drafts are NEVER auto-sent or persisted by AI — every draft surfaces `suggestedNext` chips routing to `send_message` / `add_note` / `create_followup` so the user dispatches it themselves. Layer wired into all 7 enumeration sites (`LayerId` union + `LAYER_DESCRIPTIONS` + `expand_tools` schema in `toolRegistry.ts`; `ALL_LAYERS` in `run.ts`; `allLayers` in `resume.ts` + `introspect.ts` + introspect description; `ALL_KNOWN_LAYERS` + heuristic tool→layer map in `systemPrompt.ts` for the 6 creative tool names; `bindAllToolContexts` in `toolContextBinder.ts`; barrel re-export in `tools/layers/_index.ts`). systemPrompt gained `## Creative drafting (Stage 9)` block with verb routing (`draft/write/compose` → `draft_message`; `proposal/quote/contract` → `draft_proposal`; `summarise/recap` → `summarise_conversation`; `scrape/fetch URL` → `web_scrape`) + non-negotiables (drafts NEVER auto-send, NEVER persist, 5min+50day quota, language defaults to org locale + user preferred language). 17 contract tests at `convex/stage9.test.ts` covering deterministic builders + webScrape pure validators + quota-helper auth/rate-limit/soft-cap behaviour. AI-AGENT-CAPABILITY-AUDIT.md §6 final scorecard: Creative drafting 2/10 → 7/10; OVERALL 7.5 → 8.5. **Milestone E (Creative) closed; senior-CRM bar reached on every dimension.** | C |
| 2026-05-26 | AI (shipped)  | C.8 — Hardening + sprint roll-up (Stage 10) — SHIPPED. **AI/Dashboard sprint (Stages 1-10 of `/SPRINT-PLAN.md`) is now CLOSED.** 4 production-grade pure helpers shipped under `convex/_shared/`: `sanitiseExtractedText.ts` (adversarial-file XSS sanitiser — strips `<script>` / on*= / `javascript:` / `data:text/html`, redacts dangerous markdown link targets, length-cap + idempotent — wired into `convex/ai/quarantined/fileAnalyzer.ts` BEFORE the structured extracted record is persisted; closes the AI-AGENT-CAPABILITY-AUDIT §3 P1 security gap); `csvEncodingDetect.ts` (UTF-8 BOM + UTF-16-LE/BE BOM + Latin-1 / Windows-1252 fallback + friendly warning via `describeEncodingWarning` — wired into `convex/ai/quarantined/csvParser.ts` replacing `blob.text()`); `bulkProgress.ts` (per-row failure table + retry chips per Constraint F via `summariseBulkResults` — wired into `commit_bulk_update_entities` + `commit_bulk_close_deals`, replacing the silent `{succeeded, failed}` counter); `enrichmentErrorMap.ts` (`mapEnrichmentError` recognises 401/403/404/429/500/timeout/DNS/network/not-configured/invalid-response and emits `{code, retryable, fallThrough, hint}` — wired into all 4 provider trace pushes in `convex/ai/quarantined/enrichmentProviders.ts`). 39 contract tests at `convex/stage10.test.ts` (12 sanitiser + 9 CSV encoding + 5 bulk-progress + 8 enrichment friendly-error + 3 RemindersCard gate-contract — closes the last DASHBOARD-AUDIT.md §6 checkbox). Final scorecard: 8.5 → 8.6/10 — Tool surface depth (edge cases) 7 → 8/10. Backlog (deferred with full Future-Enhancements cards): bulk-progress mid-flight streaming, D-4 (auto-note from file), D-5 (stage-template), W-3 (auto-tag classifier), W-5 (weekly digest email), P-5 (similarity), custom-field diff in `update_entity`, `set_default_note_category`. **Sprint complete.** | C |
