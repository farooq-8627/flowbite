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
