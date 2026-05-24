# core/ai — State

> Updated: 2026-05-24 (post hotfix wave: convert_lead tool, EntityResultCard arg fix, message patch hardening, add_note entityCode acceptance, settings empty-patch guard)
> Status: **~98 / 100 production-readiness.** Phase 3 closed; Phase 4 Part 1 + Part 2 (telemetry + AI quota gate + AI-native parity push + widget registry) fully shipped. Only Phase 4 Part 3 (LemonSqueezy upgrade flow) remains.
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

| ID | Task | Effort |
|---|---|---|
| T9 | **Phase 4 Part 3 — LemonSqueezy upgrade flow.** Webhook smoke test (full subscription lifecycle in test mode) + production signing-secret rotation playbook + per-variant feature-gate copy on the pricing card + trial flow + 3-day past_due grace period. Full plan in `/PHASE-4-PART-2-AI-NATIVE-AUDIT.md §2 T9`. | ~3 days |
| T11 | Reminder kinds histogram (low priority). `create_reminder.reminderType` is hardcoded to a 5-item enum; if telemetry shows custom kinds, add `list_reminder_kinds` exposing a 30-day distinct histogram. | ~1 hour |
| T12 | Permission catalog introspection (low priority). Add `list_permission_catalog` always-on read tool returning `{ key, description, category }[]` from `convex/_shared/permissions/catalog.ts`. | ~30 min |

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
