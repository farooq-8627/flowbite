# CODE-ARCHITECTURE — PHASE 3B (AI ASSISTANT)

> **Status (2026-05-23 — final):** Phase 3B is shippable. Core runtime + rich preview cards + every §4.x pending item landed. Sprint 4 (per-tool runbooks) and Sprint 5 (insights + suggestions + slash commands) shipped 2026-05-23. Chat works end-to-end with any provider whose key (env or BYOK) is configured. Disambiguation flow (`ask_user_choice`) wired. Entity AI summary cards live on profile / deal / company detail pages. Free-tier hints + signup links surface in Settings → AI for first-time users.
> **AI SDK upgraded to v6** (was v5) — see §2 + 3B-N below.
> **Verification:** `pnpm typecheck` 0 errors.
> **Phase 3C (next major phase):** WhatsApp / voice processor.
> **Phase 4 (later):** web scraping, AI workspace setup wizard, streak widget, cross-org platform-admin AI, lead scoring, sentiment.

---

## §1 — Completed work (summaries only)

| Sub-phase | Scope (summary) |
|---|---|
| **3B-A** | Dependencies, schema (`aiConversations`, `aiMessages`, `aiBriefings`, `orgAiKeys`, `platformContext`), 4 `ai.*` permissions in catalog, 2 migrations (`seedPlatformContext`, `aiPermissionsBackfill`). |
| **3B-B** | AES-GCM encryption (Node-only `encryption.ts` + V8-safe `encryptionTypes.ts`), model registry split (V8-safe `modelRegistry.ts` + Node-only `models.ts`), BYOK CRUD (`keys.ts` V8 reads/removes, `keysActions.ts` Node encrypt+insert), conversations CRUD, messages public surface (`sendMessage`, `confirmConfirmation`, `cancelStream`, `regenerate`, `editAndResend`). |
| **3B-C** | Three-layer system prompt builder (platform → org → entity context), tool registry with permission/tier/layer filtering, `propose()` + `runTool()` helpers, `_logAIActivityInternal.logAIActivity` mutation. |
| **3B-D** | Always-on tools (search, get_entity_detail, get_dashboard_summary, create_lead/contact/company/deal + commits, update_entity + commit, add_note, create_reminder, create_followup, complete_reminder), `processChat.run` agent loop with two-step gate, `processChat.resume` for approved confirmations, auto-titling. |
| **3B-E** | Frontend `core/ai/` module — `ChatSheet`, `ChatContextCard` (zero-token entity preview), `ChatMessage` (claude-style vertical layout, hover actions, timestamp), `ChatConfirmation`, `ChatHistoryDropdown`, `ChatComposer`, `ChatModelPicker`, `ChatThinkingIndicator` (live thinking/calling_tool/streaming dropdown), `ChatMessageActions` (copy / regenerate / edit). Shell stub replaced. |
| **3B-F** | Briefings backend (cron + on-demand, Haiku-tier platform-billed), `AIBriefingCard` dashboard widget, `WidgetRegistry` `ai.morningBriefing` slot, 3 templates opted in (`b2b_saas`, `dubai_real_estate`, `recruiting`). |
| **3B-G** | 10 expand-layer tool files (~50 tools): pipelines, fields, tags, views, categories, members (with self-promotion + self-removal hard blocks), settings, bulk, templates, data. Every destructive op has `confirmation: "twoStep"`. |
| **3B-H** | Settings → AI tab — `ApiKeySection` (BYOK with provider auto-detect from key prefix; explicit picker when prefix is ambiguous like `sk-…`; scope toggle org-vs-user), `AIPreferencesSection` (default model, auto-context, briefing toggle), Usage strip. |
| **3B-I** | **Composer pre-flight gate** — `useModelPreference().hasNoKeys` disables the input and replaces it with a "No AI key configured" banner + link to Settings → AI. Backend keeps its own friendly-error path because clients with stale BYOK lists could still slip through. |
| **3B-J** | **Bullet-proofed stream loop** in `processChat` — `error` chunk handling, fallback patch when stream ends without `finish`, friendly classifications for auth / quota errors, placeholder inserted *before* model resolution so even key-missing errors land as a visible `❌` bubble. |
| **3B-K** | **Live `thinkingState` field** on `aiMessages` driving the Claude/OpenAI-style indicator (`thinking → calling_tool → streaming → done`). Plus optional `reasoning` chain-of-thought (capped at 10 KB) and `activeTool`. UI's `isStreaming` derives from `thinkingState`, not from empty-content heuristics. |
| **3B-L** | **AI SDK v4 → v5 upgrade (2026-05-23).** Bumped `ai` from `4.3.19` → `5.0.192` to match the v3.x provider line that ships LanguageModel spec v2. Patched `tool({parameters})` → `tool({inputSchema})` (2 sites in `toolRegistry.ts`). Replaced `streamText({ maxSteps: 10 })` → `streamText({ stopWhen: stepCountIs(10) })`. Patched all stream-chunk handlers in `processChat.run` for v5 shapes: `text-delta.text` (was `textDelta`), `reasoning-delta.text` (added; legacy `reasoning` kept as fallback), `tool-call.input` (was `args`), `tool-result.output` (was `result`), new `tool-error` handler that patches the tool-record + thinking-state, new `finish-step` handler that accumulates per-step `usage.inputTokens / outputTokens`, new `abort` handler, `finish.totalUsage` for grand totals. Briefings: `generateText({ maxOutputTokens: 400 })` (was `maxTokens`); `result.usage.inputTokens / outputTokens` (was `promptTokens / completionTokens`). Backward-compat fallbacks kept for every shape diff so a future re-pin to a transitional provider can't break the chat. |
| **3B-M** | **Rich per-tool preview cards (2026-05-23).** New folder `core/ai/components/preview/` with a registry (`index.ts → getPreviewCard(toolName)`) and 9 cards: `LeadPreviewCard` (avatar + email/phone/source badges + notes), `ContactPreviewCard` (avatar + job title + email/phone/company), `CompanyPreviewCard` (logo placeholder + clickable website + industry), `DealPreviewCard` (currency-formatted value + person+date badges; close-deal variant with won/lost banner + reason quote), `EntityDiffCard` (universal `update_entity` diff view; hints to use `move_deal_stage` if a stage key is detected), `BulkPreviewCard` (count badge + 3-row sample + patch keys; close-deal variant with won/lost tone), `DangerPreviewCard` (warning vs danger severity for restore + future hard-delete), `PipelinePreviewCard` (full stage chain for create; insertion point for add-stage), `SettingsPreviewCard` (workspace-wide reminder + key/value list; label-rename variant). `ChatConfirmation` rewritten to look up the right card by `payload.tool` and pass it `{args, fields, title}`; approve/reject buttons + settled tinted treatment preserved. Generic fallback for unmapped tools renders the legacy `{label, value}` list so nothing regresses. |
| **3B-N** | **AI SDK v5 → v6 upgrade (2026-05-23 PM).** Diagnosed: `ai@5.0.192` shipped with `@ai-sdk/provider@2.0.3` (LanguageModel spec v2) but `@ai-sdk/openai@3.0.65` shipped with `@ai-sdk/provider@3.0.10` (spec v3). Mismatch threw `AI_UnsupportedModelVersionError: Unsupported model version v3` at runtime on every tool call. Bumped `ai` from `^5.0.192` → `^6.0.191` (the `latest` dist tag). All `@ai-sdk/*` providers stayed on v3.0.x but were tightened from `^3.0.x` → `~3.0.x` per §4.7. `@openrouter/ai-sdk-provider` pinned `~2.9.0`. Result: `ai@6.0.191` + `@ai-sdk/openai@3.0.65` both depend on `@ai-sdk/provider@3.0.10` — one provider spec end-to-end. No code changes were needed because Phase 3B-L had already migrated to v5/v6-compatible APIs (`inputSchema:`, `stopWhen: stepCountIs(10)`, `maxOutputTokens`, `inputTokens`/`outputTokens`, `text-delta.text`, `tool-call.input`, `tool-result.output`). Audited the codebase for v6 breaking changes (CoreMessage, generateObject, streamObject, Experimental_Agent, textEmbeddingModel, isToolUIPart, etc.) — no usage anywhere, so the bump was a clean drop-in. Bonus: `@convex-dev/agent@0.6.1` peer-deps `ai@^6.0.35`; v6 satisfies that, eliminating a previously-unsatisfied peer-dep warning. |
| **3B-O** | **§4 pending items shipped (2026-05-23 PM).** §4.1 — entity searchX queries (`searchLeads/Contacts/Deals/Companies`) added with optional `excludeFromAI: false` arg; `search_crm` + `get_entity_detail` + briefing collector all honour the opt-out. Discovered + fixed pre-existing call-site bugs: `getByCode` for deals/companies → corrected to `getByDealCode`/`getByCompanyCode`. §4.2 — `useRouteContext.ts` rewritten with three parallel `useQuery` calls (skipped via `"skip"`) so `D-XXX` and `C-XXX` routes inject context alongside the pre-existing `P-XXX` path. §4.3 — `ask_user_choice` always-on tool (twoStep) + `core/ai/components/preview/ChatMultipleChoice.tsx` + `appendUserMessage` internalMutation + special `processChat.resume` branch that synthesises "User picked: \<label\>" and re-runs the agent loop. §4.4 — `"ai.morningBriefing"` opted into all 6 remaining templates (real_estate_global, real_estate_saudi, freelancer, productivity, agency_freelance, generic); all 9 industry templates now opt in. §4.5 — `PROVIDER_HINTS` map in `ApiKeySection.tsx` surfaces a free-tier pill + signup URL for each provider when picked in the "Add API key" dialog. §4.6 — `EntityAISummaryCard` shared component renders `aiContext.summary`/`keyFacts` at the top of profile / deal / company overview tabs (returns `null` when both fields are empty so unaffected pages don't change visually). |
| **3B-P** | **Sprint 4 — per-tool runbooks (2026-05-23 PM).** `ToolRunbook` type + `runbook?: ToolRunbook` field on `ToolDef` in `convex/ai/toolRegistry.ts`. New helpers `getActiveRunbooks` + `formatRunbooksBlock` walk the registry filtered by permission/layer/tier and emit a `## Tool Runbooks` block from `convex/ai/systemPrompt.ts`. Cost scales with the active set: ~30-80 tokens per tool with a runbook, only when that tool is exposed to the model. Coverage: every always-on tool (search_crm, get_entity_detail, get_dashboard_summary, the 4 create_*, update_entity, the 4 notes/reminders, ask_user_choice, ask_user_input) + every user-facing layer tool (move_deal_stage, close_deal, create/add_pipeline, create/attach/detach/delete tags, create/pin/delete saved views, the 4 note categories, invite/cancel/change-role/remove members, update_org_settings, rename_entity_labels, bulk_update/close, list/apply_template, clear_mock_data, view_trash, restore_entity, create_field). `commit_*` internal tools intentionally skipped — the model never picks them. |
| **3B-Q** | **Sprint 5 — insights + suggestions + slash commands (2026-05-23 PM).** Schema: `aiBriefings.scope` (`daily-user` \| `weekly-org`) + structured `payload` (summary + highlights + actionItems + trend) + `validUntil`; `userId` made optional for org-scoped rows; index `by_org_and_scope` added. `aiMessages.suggestions: array<string>` for chat chips. Migration `convex/_migrations/2026_05_23_addBriefingScopeAndPayload.ts` backfills scope=`daily-user` + a derived payload on every legacy briefing row. **Backend**: `convex/ai/briefings.ts` got `collectOrgWeeklyData` (week-over-week pipeline stats), `insertWeeklyBriefing`, `listActiveOrgs`. `convex/ai/briefingsActions.ts` got `generateWeeklyForOrg` (standard-tier model, 700 max-tokens, JSON contract w/ code-fence stripping) + `generateForAllOrgs` (cron iterator). `convex/ai/briefingsPublic.ts` got `todayForUser` + `thisWeekForOrg` queries (scope-filtered). `convex/ai/orchestrator/suggestionGenerator.ts` runs after each chat turn, briefing-tier model, ~200 max-output tokens, JSON-array contract with newline-split fallback; wired into `orchestrator/run.ts` step 11b. `convex/ai/messages.ts::patchSuggestions` persists results. **Cron**: `generate-ai-weekly-insights` every 168 hours added to `convex/crons.ts`. **Frontend**: `core/shell/shell/views/dashboard/cards/{DailyBriefingCard,WeeklyInsightCard}.tsx` (the old `AIBriefingCard.tsx` is now a thin re-export of `DailyBriefingCard`). Both cards prefer the structured `payload` and fall back to legacy `summary`+`highlights[].text` so pre-Sprint-5 rows still render. `DashboardHomeView` mounts them side-by-side under the existing `ai.morningBriefing` widget gate. **Composer additions**: `core/ai/components/composer/Suggestions.tsx` (3 chips above the composer; click → handleSend(suggestion)); `core/ai/components/composer/SlashCommands.tsx` (popover above textarea when draft starts with `/`; supports /find, /create, /summary, /remind). **Tool-result rendering round-out**: `move_deal_stage`, `commit_close_deal`, `commit_restore_entity` now emit `kind: "entity"`; `commit_update_org_settings` + `commit_rename_entity_labels` emit `kind: "settings"` with a section id derived from the patch keys via the new `pickSettingsSection` helper. |

---

## §2 — Locked architectural decisions (do not revisit)

| Topic | Decision |
|---|---|
| Streaming | DB deltas over Convex websockets. No `/api/ai/chat` route. Frontend subscribes via `useQuery`. |
| Models | User-selectable per message + BYOK. Anthropic / OpenAI / Google / xAI / Groq / Mistral / OpenRouter / NVIDIA-NIM / Moonshot. Plan-tier-gated for platform-billed mode; unlimited for BYOK. |
| Conversations | Multiple threads per user, AI auto-titled (Haiku, ~50 tokens), searchable history dropdown. |
| Route context | Auto-loaded via `useRouteContext()` + visible **Context Card** (zero tokens — pure DB read of `entity.aiContext.summary` + `keyFacts`). Toggle to disable injection per-conversation. |
| Briefing | Daily cron-generated, 24h cache. Manual refresh button counts against quota. |
| Web scraping | Deferred to Phase 4. |
| Confirmation | Two-step (`propose_*` → preview card → `commit_*`) for every destructive tool. |
| Platform context | Real `platformContext` DB table edited by super_admin. |
| Tool layers | 12 always-on + 10 on-demand expand groups (~80% prompt-token savings vs always-loaded). |
| Hard-blocked actions | Org delete, self role-promotion, billing cancellation, GDPR export, BYOK key CRUD. |
| **AI SDK pinning** | `ai@^6.x` paired with `@ai-sdk/*@~3.0.x` providers (LanguageModel spec v3). The previous v5 + v3 combination produced an `Unsupported model version v3` error because `ai@5` ships `@ai-sdk/provider@2.x` (expects spec v2) while `@ai-sdk/<x>@3.x` ships `@ai-sdk/provider@3.x` (produces spec v3). Correct combos: `ai@5.x` + `@ai-sdk/*@^2.x` (the `ai-v5` dist tag) **OR** `ai@6.x` + `@ai-sdk/*@^3.x` (the `latest` dist tag — current). Provider versions are now tilde-pinned (`~3.0.x`) so a future `pnpm install` can't pull in `^3.1.x` and break shape contracts. Any future bump must update all `@ai-sdk/*` packages together; document it under a new 3B-X sub-phase. |

---

## §3 — Required Convex env vars

```bash
# Core
npx convex env set ANTHROPIC_API_KEY sk-ant-...
npx convex env set AI_KEYS_ENCRYPTION_KEY "$(openssl rand -base64 32)"
npx convex env set AI_DEFAULT_MODEL "claude-sonnet-4-5"
npx convex env set AI_BRIEFING_MODEL "claude-haiku-3-5"

# Optional fallback providers — set whichever you want supported
npx convex env set OPENAI_API_KEY sk-proj-...
npx convex env set GOOGLE_GENERATIVE_AI_API_KEY ...   # AIza...
npx convex env set XAI_API_KEY xai-...
npx convex env set GROQ_API_KEY gsk_...
npx convex env set MISTRAL_API_KEY ...
npx convex env set OPENROUTER_API_KEY sk-or-...
npx convex env set NVIDIA_API_KEY nvapi-...
npx convex env set MOONSHOT_API_KEY ...
```

If none of the above are set, the chat displays a friendly `❌ No platform key configured. Add one in Settings → AI` banner; users with their own BYOK key can still chat normally.

---

## §4 — Completed pending tasks

> Every Phase-3B sub-item that was open at the start of 2026-05-23 has shipped. The cross-references below point at the canonical files for future agents.

| ID  | Title                                                                | Status                                                                                                  |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 4.1 | Honour `excludeFromAI` in tool queries                              | ✅ Done — `searchLeads/Contacts/Deals/Companies` queries added; `search_crm`, `get_entity_detail`, briefing all skip opted-out rows. Pre-existing `getByCode` typo fixed in passing. |
| 4.2 | Route context for `D-XXX` and `C-XXX` URLs                          | ✅ Done — `useRouteContext.ts` rewritten with three parallel skip-friendly `useQuery`s for person, deal, company. |
| 4.3 | `ask_user_choice` tool + `ChatMultipleChoice` UI                    | ✅ Done — `convex/ai/tools/interaction/askChoice.ts` + `core/ai/components/preview/ChatMultipleChoice.tsx` + `appendUserMessage` internalMutation + special branch in `processChat.resume`. |
| 4.4 | Opt the remaining 6 templates into `ai.morningBriefing`             | ✅ Done — all 9 industry templates now opt in.                                                          |
| 4.5 | Free-tier hints + signup URLs in Settings → AI                      | ✅ Done — `PROVIDER_HINTS` map in `ApiKeySection.tsx` surfaces the matching hint card under the provider Select. |
| 4.6 | `EntityAISummaryCard` on entity detail pages                        | ✅ Done — shared component in `core/entities/shared/components/EntityAISummaryCard.tsx`; mounted on profile, deal, and company overview tabs. |
| 4.7 | Pin `@ai-sdk/*` providers to a tight version range                  | ✅ Done — every `@ai-sdk/*` and `@openrouter/ai-sdk-provider` switched from `^3.0.x` to `~3.0.x` in `package.json`. |
| 4.8 | Sprint 4 — per-tool runbooks                                        | ✅ Done — `ToolRunbook` type + active-set injection into the system prompt; covered every always-on + user-facing layer tool. See 3B-P. |
| 4.9 | Sprint 5 — daily/weekly briefings + chat suggestions + slash commands | ✅ Done — `aiBriefings.scope`+`payload`, weekly cron, `DailyBriefingCard` + `WeeklyInsightCard`, suggestion chips, slash commands. See 3B-Q. |

---

## §4.5 — Phase 3B open work

The only remaining Phase 3B work is **Sprint 6 — tests**:

| Layer | Tool |
|---|---|
| Unit (Zod coercion helpers + tool schemas) | Vitest |
| Integration (tool execute → DB + display.kind contract) | `convex-test` |
| E2E (chat → propose → approve → entity card render) | Playwright |
| Snapshot (one snapshot per ToolDisplay kind) | Vitest + RTL |
| Migration smoke test on real dev data | `npx convex run` |

Detailed scope in [AI-MODULE-PLAN.md §3.1](./AI-MODULE-PLAN.md). Estimated effort: 6-8 hours unit/integration, 4 hours E2E, 2 hours snapshot+contract.

---

## §5 — Verification commands

```bash
# After every change in convex/ai or core/ai:
pnpm typecheck                                # 0 errors  ✅ verified 2026-05-23 PM
pnpm exec biome check convex/ai/ core/ai/ \
  core/entities/shared/components/EntityAISummaryCard.tsx \
  core/platform/profile/ \
  core/entities/_entities/companies/views/CompanyDetailView.tsx \
  core/platform/settings/components/groups/ai/ApiKeySection.tsx \
  convex/crm/entities/                        # 0 errors  ✅ verified 2026-05-23 PM

# After convex dev runs (regenerates _generated/api.d.ts):
pnpm exec convex dev --run convex/_migrations/2026_05_23_seedPlatformContext:run
pnpm exec convex dev --run convex/_migrations/2026_05_23_aiPermissionsBackfill:run

# Smoke tests after the SDK upgrade (one of these must work for chat to come back online):
npx convex env set ANTHROPIC_API_KEY sk-ant-...
# or
npx convex env set GOOGLE_GENERATIVE_AI_API_KEY AIza...
# or use Settings → AI → Add API key with any AIza… / sk-ant… / sk-proj… key.

# Validate the AI SDK pinning didn't drift:
pnpm list ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google \
  @ai-sdk/groq @ai-sdk/mistral @ai-sdk/xai @openrouter/ai-sdk-provider --depth 0
# Expected: ai@6.0.x, all @ai-sdk/* on 3.0.x, @openrouter on 2.9.x.
# Both `ai` and the providers must depend on @ai-sdk/provider@3.0.x.
```

---

## §6 — File inventory (current — updated 2026-05-23 PM, post-Sprint 5)

```
convex/ai/
├── encryption.ts                       AES-GCM encrypt/decrypt + provider auto-detect
├── encryptionTypes.ts                  V8-safe ProviderId / detectProvider / keyHint
├── modelRegistry.ts                    Frontend-safe model registry + plan gating
├── models.ts                           Node-only provider factories + getModel()
├── availableModels.ts                  Node action: listPlatformProviders / adminListProviderStatus
├── keys.ts                             BYOK V8 surface — listKeys, listOwnKeys, removeKey, internal resolveKey + insertEncryptedKey
├── keysActions.ts                      Node: addOrgKey / addUserKey (encrypt → call insertEncryptedKey)
├── conversations.ts                    Thread CRUD + history (V8)
├── messages.ts                         sendMessage / confirmConfirmation / cancelStream / regenerate / editAndResend (V8) + internal write helpers (incl. appendUserMessage for §4.3, **patchSuggestions for Sprint 5**)
├── systemPrompt.ts                     3-layer prompt builder + buildSystemPromptQuery, **injects Tool Runbooks block (Sprint 4)**
├── toolRegistry.ts                     Layered registry + expand_tools meta — uses v6 `inputSchema:` field, **ToolRunbook type + getActiveRunbooks/formatRunbooksBlock helpers (Sprint 4)**
├── briefings.ts                        V8: collect / insert / list-eligible-users — **plus Sprint 5: collectOrgWeeklyData, insertWeeklyBriefing, listActiveOrgs**
├── briefingsPublic.ts                  V8: getLatest, **Sprint 5: todayForUser, thisWeekForOrg**, refreshNow public mutation
├── briefingsActions.ts                 Node: generate / generateForActiveUsers — **plus Sprint 5: generateWeeklyForOrg, generateForAllOrgs**
├── processChat.ts                      Re-export shim — actual orchestrator under orchestrator/
├── _logAIActivityInternal.ts           internalMutation wrapper for ai.* activity logs
├── orchestrator/
│   ├── run.ts                          processChat.run — agent loop, **Sprint 5 step 11b calls suggestionGenerator**
│   ├── resume.ts                       processChat.resume — confirmation branches
│   ├── streamLoop.ts                   v6 streamText chunk loop
│   ├── modelResolver.ts
│   ├── reasoningBuffer.ts
│   ├── toolContextBinder.ts
│   └── suggestionGenerator.ts          ⭐ Sprint 5 — generates 2-3 follow-up chip suggestions per turn
└── tools/
    ├── _shared.ts                      requirePermission, propose, runTool, ToolDisplay union, **Sprint 4: ToolRunbook usage**
    ├── search.ts                       search_crm, get_entity_detail, get_dashboard_summary — runbooks added
    ├── crud/                           per-entity create + commit (split from createEntities.ts)
    │   ├── createLead.ts               runbook + display:entity
    │   ├── createContact.ts            runbook + display:entity
    │   ├── createCompany.ts            runbook + display:entity
    │   ├── createDeal.ts               runbook + display:entity
    │   ├── _context.ts
    │   └── index.ts
    ├── updateEntity.ts                 update_entity universal — runbook + display:diff
    ├── notesReminders.ts               add_note, create_reminder, create_followup, complete_reminder — runbooks + display:note/reminder
    ├── interaction/
    │   ├── askChoice.ts                runbook
    │   └── askInput.ts                 runbook
    └── layers/
        ├── _index.ts
        ├── pipelines.ts                runbooks + display:entity for move_deal_stage + commit_close_deal
        ├── tags.ts                     runbooks
        ├── views.ts                    runbooks
        ├── categories.ts               runbooks
        ├── members.ts                  runbooks (self-block enforced)
        ├── settings.ts                 runbooks + display:settings (with pickSettingsSection helper)
        ├── bulk.ts                     runbooks (bulk update/close)
        ├── templates.ts                runbooks
        ├── data.ts                     runbooks + display:entity for commit_restore_entity
        └── fields.ts                   runbook (create_field)

convex/_migrations/
├── 2026_05_23_seedPlatformContext.ts
├── 2026_05_23_aiPermissionsBackfill.ts
├── 2026_05_23_backfillAiThinkingState.ts
└── 2026_05_23_addBriefingScopeAndPayload.ts   ⭐ Sprint 5 — backfills scope + payload on legacy aiBriefings rows

core/ai/
├── types.ts
├── hooks/
│   ├── useAIChat.ts
│   ├── useRouteContext.ts              Three parallel useQuery (person / deal / company)
│   ├── useAvailableProviders.ts        BYOK ∪ platform-env provider union
│   └── useModelPreference.ts           Reads availableProviders → drives picker + composer gate
└── components/
    ├── ChatSheet.tsx                   Top-level orchestrator — **Sprint 5 mounts <Suggestions/> above ChatComposer**
    ├── ChatMessage.tsx                 User/assistant/tool message rendering — vertical layout, ToolResultRenderer integration
    ├── ChatThinkingIndicator.tsx       (legacy name; actual file is reasoning/ReasoningPanel.tsx)
    ├── ChatConfirmation.tsx            Two-step approval card — uses preview registry
    ├── ChatContextCard.tsx             Zero-token entity context preview
    ├── ChatHistoryDropdown.tsx         Past threads
    ├── ChatModelPicker.tsx             Compact model picker
    ├── ChatMessageActions.tsx          Hover-reveal copy / regenerate / edit row
    ├── ChatComposer.tsx                Input + send + model picker + pre-flight no-keys banner — **Sprint 5 mounts <SlashCommands/>**
    ├── markdown/Markdown.tsx
    ├── reasoning/ReasoningPanel.tsx
    ├── composer/                       ⭐ Sprint 5 — Suggestions.tsx + SlashCommands.tsx
    │   ├── Suggestions.tsx
    │   └── SlashCommands.tsx
    ├── results/                        Sprint 3 — tool-result live renderers
    │   ├── ToolResultRenderer.tsx      Dispatcher with exhaustiveness check
    │   ├── EntityResultCard.tsx
    │   ├── EntityListResultCard.tsx
    │   ├── CodeLookupCard.tsx
    │   ├── DiffResultCard.tsx
    │   ├── NoteResultCard.tsx
    │   ├── ReminderResultCard.tsx
    │   ├── InsightResultCard.tsx       Sprint 5 placeholder for kind:"insight"
    │   ├── SettingsResultCard.tsx
    │   └── CustomResultRegistry.tsx    Escape hatch (intentionally empty by default)
    └── preview/                        Per-tool propose-card previews (§3B-M)
        ├── index.ts                    PREVIEW_REGISTRY + getPreviewCard(toolName)
        ├── LeadPreviewCard.tsx
        ├── ContactPreviewCard.tsx
        ├── CompanyPreviewCard.tsx
        ├── DealPreviewCard.tsx
        ├── EntityDiffCard.tsx
        ├── BulkPreviewCard.tsx
        ├── DangerPreviewCard.tsx
        ├── PipelinePreviewCard.tsx
        ├── SettingsPreviewCard.tsx
        ├── ChatMultipleChoice.tsx
        └── GenericPreviewCard.tsx

core/entities/shared/components/EntityAISummaryCard.tsx       ⭐ At-a-glance AI summary
core/shell/shell/views/dashboard/cards/
├── AIBriefingCard.tsx                  ⭐ Re-export shim → DailyBriefingCard (back-compat)
├── DailyBriefingCard.tsx               ⭐ Sprint 5 — daily-user briefing card, prefers structured payload
├── WeeklyInsightCard.tsx               ⭐ Sprint 5 — weekly-org insight card, trend pill, no refresh button
├── WidgetRegistry.tsx                  ai.morningBriefing slot
├── MetricStrip.tsx
├── MockDataBanner.tsx
├── PipelineCard.tsx
├── RemindersCard.tsx
├── TodaySummaryCard.tsx
└── index.ts                            barrel — exports DailyBriefingCard + WeeklyInsightCard

convex/crons.ts                          Adds generate-ai-weekly-insights cron (every 168h)

All 9 industry templates opt in to ai.morningBriefing.
```

---

## §7 — Hardening notes (production-grade decisions)

1. **Cross-module references** — Convex `_generated/api.d.ts` is stale until `convex dev` runs. The codebase uses `_ref()` + `_anyArgs()` helpers to cast string paths to `FunctionReference` where the typed `internal.X.Y` would otherwise fail TypeScript. Once `convex dev` regenerates types, references resolve to the actual generated types automatically.

2. **Model registry split** — `convex/ai/modelRegistry.ts` is frontend-safe (no `"use node"`). `convex/ai/models.ts` contains Node-only provider factories. Frontend hooks import from `modelRegistry.ts`.

3. **Briefings split** — `convex/ai/briefings.ts` is V8 (queries/mutations). `convex/ai/briefingsActions.ts` is `"use node"` (calls AI providers). Public refresh schedules the action via string-path forward ref.

4. **Tool context injection** — Tool files use module-level `_ctx` set by `processChat` before each agent loop iteration. In Node.js single-threaded async flow within one `internalAction` invocation this is safe; concurrent invocations on the same warm worker would each set their own `_ctx` synchronously before `streamText` runs. Fragile if a future change introduces parallel tool dispatch — flagged in `convex/ai/MODULE.md` §5.4.

5. **BYOK security** — `encryptedKey` is stripped from every public query return. Decryption happens only inside `processChat` (via internal `resolveKey` query). UI sees only `keyHint` (last 4 chars).

6. **Self-promotion / self-removal blocks** — Hard-coded in members layer tools, in addition to permission checks at the underlying mutation level. AI cannot promote or remove the calling user even if it has `members.changeRole` permission.

7. **Plan model cap downgrades** — When a user's plan doesn't allow their requested model tier, `getModel()` automatically downgrades to a configured-key fallback rather than throwing. Free tier users get Haiku-class even if they pick Sonnet. When the requested provider has no key at all, the fallback walks any other provider that does have a key — guarantees the chat keeps working as long as ONE key is configured.

8. **Activity logging** — Every AI tool call writes an `activityLogs` row with `actorType: "ai"` via the `_logAIActivityInternal.logAIActivity` mutation. Full audit trail.

9. **AI SDK chunk-shape backward-compat** — All v6 chunk-shape adapters in `processChat.run` keep a v5/v4-shaped fallback (`chunk.text ?? chunk.textDelta`, `chunk.input ?? chunk.args`, `chunk.output ?? chunk.result`). Future SDK bumps that touch chunk shapes can land safely without immediately breaking the chat — the fallback path catches them while the next agent re-checks the spec diff and retires the legacy alias. The v5 → v6 upgrade itself didn't require any chunk-handler changes because the v5 migration in 3B-L had already moved to v6-compatible shapes.

10. **Preview-card registry as the only switch point** — `ChatConfirmation` doesn't know any tool semantics. Adding a new two-step tool means: (a) write the tool, (b) write a `XPreviewCard.tsx` component, (c) register it in `core/ai/components/preview/index.ts`. Anything not registered falls through to `GenericPreviewCard` (legacy `{label, value}` list) so nothing regresses visually.

---

## §8 — What's pending for Phase 3C

| Item | Notes |
|---|---|
| WhatsApp 360dialog webhook | `app/api/whatsapp/route.ts` |
| Whisper transcription pipeline | Voice notes → text → existing AI chat flow |
| Channel registration UI | Settings → Integrations → WhatsApp tab |
| Per-channel rate limits | Already supported by `enforceRateLimit` — just needs a new scope |

## §9 — What's pending for Phase 4

| Item | Notes |
|---|---|
| Web scraping tools | Reddit / Maps / Firecrawl integration via Trigger.dev jobs |
| AI Workspace Setup wizard | Multi-turn UX for new orgs to configure pipelines + fields by chatting |
| Streak widget | `users.streak` cache + nightly cron + `ai.streakWidget` registry slot |
| Cross-org platform-admin AI | Aggregated stats only, no customer PII (separate tool registry) |
| Lead scoring | Feature pipeline + AI scoring tool |
| Sentiment on notes | Add `sentiment` field via `rebuildEntityContext` |
| Multi-modal voice in chat panel | Web Speech API + processChat |

---

**End of Phase 3B working doc.**
