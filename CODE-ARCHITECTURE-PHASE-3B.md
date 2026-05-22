# CODE-ARCHITECTURE — PHASE 3B (AI ASSISTANT) — SUMMARY

> **Status:** Phase 3B-A through 3B-H ✅ **COMPLETE.**
> **Verification:** `pnpm typecheck` 0 errors. `pnpm exec biome check convex/ai core/ai` 0 errors.
> **Phase 3C (NEXT):** WhatsApp / voice processor.
> **Phase 4 (LATER):** web scraping, AI workspace setup wizard, streak widget, cross-org platform-admin AI, lead scoring, sentiment.

---

## §1 — What was shipped

| Sub-phase | Scope | Status |
|---|---|---|
| **3B-A** | Dependencies + schema + migrations + permissions | ✅ |
| **3B-B** | Encryption (AES-GCM) + models registry + BYOK keys + conversations + messages | ✅ |
| **3B-C** | Three-layer system prompt + tool registry + propose/runTool helpers + activity-log mutation | ✅ |
| **3B-D** | Always-on tools (search, create, update, notes, reminders) + processChat brain (streamText agent loop, two-step gate, auto-titling) | ✅ |
| **3B-E** | Frontend `core/ai/` module — ChatSheet, ChatContextCard (zero-token entity preview), ChatMessage, ChatConfirmation, ChatHistoryDropdown, ChatComposer, ChatModelPicker; replaced shell stub | ✅ |
| **3B-F** | Briefings backend (cron-generated, Haiku-tier) + AIBriefingCard dashboard widget + WidgetRegistry entry + 3 templates opted-in | ✅ |
| **3B-G** | 10 expand layer tool files (~50 tools): pipelines, fields, tags, views, categories, members, settings, bulk, templates, data — every destructive op has two-step confirmation; self-promotion + self-removal hard-blocked | ✅ |
| **3B-H** | Settings → AI tab — ApiKeySection (BYOK with provider auto-detect, scope toggle), AIPreferencesSection (default model, auto-context, briefing toggle), Usage strip | ✅ |

---

## §2 — Locked architectural decisions (do not revisit)

| Topic | Decision |
|---|---|
| Streaming | `@convex-dev/agent`-style — DB deltas over websocket. No `/api/ai/chat` route. Frontend subscribes via `useQuery`. |
| Models | User-selectable per message + BYOK. Anthropic / OpenAI / Google / xAI / Groq / Mistral / OpenRouter / NVIDIA-NIM. Plan-tier-gated for platform-billed mode; unlimited for BYOK. |
| Conversations | Multiple threads per user, AI auto-titled (Haiku, ~50 tokens), searchable history dropdown. |
| Route context | Auto-loaded via `useRouteContext()` + visible **Context Card** (zero tokens — pure DB read of `entity.aiContext.summary` + `keyFacts`). Toggle to disable injection per-conversation. |
| Briefing | Daily cron-generated, 24h cache. Manual `[↻ Refresh]` button counts against quota. |
| Web scraping | Deferred to Phase 4. |
| Confirmation | Two-step (`propose_*` → preview card → `commit_*`) for every destructive tool. |
| Platform context | Real `platformContext` DB table edited by super_admin. |
| Tool layers | 12 always-on + 10 on-demand expand groups (~80% prompt-token savings vs always-loaded). |
| Hard-blocked actions | Org delete, self role-promotion, billing cancellation, GDPR export, BYOK key CRUD. |

---

## §3 — Required Convex env vars

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
npx convex env set AI_KEYS_ENCRYPTION_KEY "$(openssl rand -base64 32)"
npx convex env set AI_DEFAULT_MODEL "claude-sonnet-4-5"
npx convex env set AI_BRIEFING_MODEL "claude-haiku-3-5"

# Optional — additional providers if you want platform-billed fallback for them:
npx convex env set OPENAI_API_KEY sk-proj-...
npx convex env set GOOGLE_GENERATIVE_AI_API_KEY ...
npx convex env set XAI_API_KEY xai-...
npx convex env set GROQ_API_KEY gsk_...
npx convex env set MISTRAL_API_KEY ...
npx convex env set OPENROUTER_API_KEY sk-or-...
```

---

## §4 — File inventory (final)

```
convex/ai/
├── encryption.ts                       AES-GCM encrypt/decrypt + provider auto-detect
├── modelRegistry.ts                    Frontend-safe model registry + plan gating
├── models.ts                           Node-only provider factories + getModel()
├── keys.ts                             BYOK CRUD + resolveKey internalQuery
├── conversations.ts                    Thread CRUD + history
├── messages.ts                         sendMessage + confirmConfirmation + internal write helpers
├── systemPrompt.ts                     3-layer prompt builder + buildSystemPromptQuery
├── toolRegistry.ts                     Layered registry + expand_tools meta
├── briefings.ts                        Daily AI briefing — collect/generate/cron action
├── briefingsPublic.ts                  getLatest query + refreshNow public mutation
├── processChat.ts                      AI brain — agent loop, streamText, tool dispatch
├── _logAIActivityInternal.ts           internalMutation wrapper for ai.* activity logs
├── internal.ts                         rebuildEntityContext (existing stub)
└── tools/
    ├── _shared.ts                      requirePermission, propose, runTool, toolMutation, toolQuery
    ├── search.ts                       search_crm, get_entity_detail, get_dashboard_summary
    ├── createEntities.ts               create_lead/contact/company/deal (+ commit_*)
    ├── updateEntity.ts                 update_entity universal (+ commit_)
    ├── notesReminders.ts               add_note, create_reminder, create_followup, complete_reminder
    └── layers/
        ├── _index.ts                   Force-load layer files
        ├── pipelines.ts                move_deal_stage, close_deal, create_pipeline, add_pipeline_stage
        ├── tags.ts                     create/attach/detach/delete tags
        ├── views.ts                    saved view CRUD
        ├── categories.ts               note category CRUD
        ├── members.ts                  invite, change_role, remove (self-block enforced)
        ├── settings.ts                 update_org_settings, rename_entity_labels
        ├── bulk.ts                     bulk_update_entities, bulk_close_deals (premium)
        ├── templates.ts                list/apply, clear_mock_data
        ├── data.ts                     view_trash, restore_entity
        └── fields.ts                   create_field

convex/_migrations/
├── 2026_05_23_seedPlatformContext.ts
└── 2026_05_23_aiPermissionsBackfill.ts

convex/schema/
├── ai.ts                               Extended: orgAiKeys, aiBriefings, aiConversations, aiMessages
└── platform.ts                         Added: platformContext

convex/orgs/queries.ts                  + getMemberWithPermissions (internalQuery for processChat)
convex/users/queries.ts                 + getPreferences (internalQuery for processChat)
convex/users/mutations.ts               updatePreferences extended with AI fields
convex/_shared/permissions/catalog.ts   + 4 ai.* permissions

convex/crons.ts                         + generate-ai-briefings cron

core/ai/
├── types.ts
├── hooks/
│   ├── useAIChat.ts
│   ├── useRouteContext.ts
│   └── useModelPreference.ts
└── components/
    ├── ChatSheet.tsx                   Top-level orchestrator
    ├── ChatMessage.tsx                 User/assistant/tool message rendering
    ├── ChatConfirmation.tsx            Two-step approval card
    ├── ChatContextCard.tsx             Zero-token entity context preview
    ├── ChatHistoryDropdown.tsx         Past threads
    ├── ChatModelPicker.tsx             Per-message model selector
    └── ChatComposer.tsx                Input + send + model picker

core/shell/shell/components/ai-chat-panel/ai-chat-panel.tsx   Replaced stub → renders <ChatSheet/>

core/shell/shell/views/dashboard/cards/AIBriefingCard.tsx     Dashboard briefing widget
core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx     + ai.morningBriefing entry
core/shell/shell/views/dashboard/DashboardHomeView.tsx        Renders AIBriefingCard at top

core/platform/settings/components/groups/AIGroup.tsx          Mounts AIPreferences + ApiKey + Usage
core/platform/settings/components/groups/ai/
├── ApiKeySection.tsx                   BYOK key management UI
└── AIPreferencesSection.tsx            Default model + briefing + auto-context toggles

3 industry templates opted in to ai.morningBriefing:
- convex/crm/fields/templates/definitions/b2b_saas.ts
- convex/crm/fields/templates/definitions/dubai_real_estate.ts
- convex/crm/fields/templates/definitions/recruiting.ts
```

---

## §5 — Hardening notes (production-grade decisions made)

1. **Cross-module references** — Convex `_generated/api.d.ts` is stale until `convex dev` runs.
   The codebase uses `_ref()` + `_anyArgs()` helpers to cast string paths to FunctionReference where the typed `internal.X.Y` would otherwise fail TypeScript. Once `convex dev` regenerates types, references resolve to the actual generated types automatically.

2. **Model registry split** — `convex/ai/modelRegistry.ts` is frontend-safe (no `"use node"`). `convex/ai/models.ts` contains Node-only provider factories. Frontend hooks import from `modelRegistry.ts`.

3. **Briefings split** — `convex/ai/briefings.ts` is `"use node"` (calls AI providers). `convex/ai/briefingsPublic.ts` is V8-only (orgQuery + orgMutation). Public refresh schedules the action via string-path forward ref.

4. **Tool context injection** — Tool files use module-level `_ctx` set by `processChat` before each agent loop iteration. In Node.js single-threaded async flow within one `internalAction` invocation this is safe; concurrent invocations on the same warm worker would each set their own `_ctx` synchronously before `streamText` runs.

5. **BYOK security** — `encryptedKey` is stripped from every public query return. Decryption happens only inside `processChat` (via internal `resolveKey` query). UI sees only `keyHint` (last 4 chars).

6. **Self-promotion / self-removal blocks** — Hard-coded in members layer tools, in addition to permission checks at the underlying mutation level. AI cannot promote or remove the calling user even if it has `members.changeRole` permission.

7. **Plan model cap downgrades** — When a user's plan doesn't allow their requested model tier, `getModel()` automatically downgrades to the highest allowed tier rather than throwing. Free tier users get Haiku-class even if they pick Sonnet.

8. **Activity logging** — Every AI tool call writes an `activityLogs` row with `actorType: "ai"` via the `_logAIActivityInternal.logAIActivity` mutation. Full audit trail.

---

## §6 — What's pending for Phase 3C

| Item | Notes |
|---|---|
| WhatsApp 360dialog webhook | `app/api/whatsapp/route.ts` |
| Whisper transcription pipeline | Voice notes → text → existing AI chat flow |
| Channel registration UI | Settings → Integrations → WhatsApp tab |
| Per-channel rate limits | Already supported by `enforceRateLimit` — just needs new scope |

## §7 — What's pending for Phase 4

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

## §8 — Verification commands

```bash
pnpm typecheck                                # 0 errors
pnpm exec biome check convex/ai/ core/ai/     # 0 errors
pnpm exec biome check core/platform/settings/components/groups/ai/   # 0 errors

# After convex dev runs (regenerates _generated/api.d.ts):
pnpm exec convex dev --run convex/_migrations/2026_05_23_seedPlatformContext:run
pnpm exec convex dev --run convex/_migrations/2026_05_23_aiPermissionsBackfill:run
```

---

**End of Phase 3B summary.**
