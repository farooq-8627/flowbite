# convex/ai — MODULE.md

> **STATUS:** 🟢 V2 capability layer is the live chat path AND the MCP/REST surface (S0–S17 shipped 2026-06-05). V1 layer was deleted side-by-side stage-by-stage; nothing remains.
> Updated: 2026-06-05.

**Ownership:** `convex/ai/` (Convex backend) | Consumers: `core/ai/` (Next.js frontend), `core/inbox/ai/`, `convex/crons.ts` (briefings), the WhatsApp inbound + outbound + persona surfaces (S13–S15), the MCP + REST projectors (S16) under `convex/http.ts`.

## Purpose

AI runtime — chat, autonomous, WhatsApp (inbound + outbound + persona), MCP, and REST all share ONE capability registry (`convex/ai/registry/`) and ONE execution path (`runCapability`). The chat flow is unchanged at the boundary: `messages.sendMessage` (mutation) schedules `processChat.run` (internalAction); the UI subscribes to `aiMessages` and reactively renders streaming output as the action patches the assistant message in place.

## V2 architecture (live)

```
convex/ai/registry/                — capability declarations + correctness machine
  types.ts          Capability, Principal, CapabilityCtx, CapabilityResult, Outcome, RiskTier, Channel
  coerce.ts         coerceTimestamp / coerceStringArray / coerceInt / stripEmpty + `field.*` helpers
                    (every `field.*` schema carries a Symbol field-kind tag for coverage.ts)
  result.ts         ok / partial / failed / repair / ask / denied envelope builders
  define.ts         REGISTRY Map + defineCapability / getCapability / listCapabilities
  gate.ts           canRun / channelAllows / needsStepUp (irreversible NEVER over WhatsApp)
  wrapper.ts        runCapability — the ONE execution path; never throws; 7-step pipeline
  resolveRef.ts     real ref resolver — codes (P-NNN/D-NNN/C-NNN) → row _id; prefers args.entityType
  groups.ts         GroupDef registry + renderGroupPlaybooks for the per-turn tail
  drive.ts          PROJECT_DRIVE doctrine + ANTHROPIC_CACHE_CONTROL_EPHEMERAL + assembleSystemPrompt
  catalog.ts        deterministic catalog rendering (cache-stable: alpha by group then name)
  router.ts         deterministic keyword + page-context router for step-0 group preload
  coverage.ts       contract-test generator (Symbol-tagged field-kinds, no behaviour-probing)
  projectors/aiSdk.ts  capability → AI SDK v6 Tool (PERMISSIVE inputSchema; strict parse inside)
convex/ai/runtime/               — agent host + always-on core capabilities
  host.ts           runAgent({principal, channel, trigger, conversation, message, model, history})
                    progressive disclosure via prepareStep; Anthropic ephemeral cache on prefix
  coreTools.ts      search_crm / describe_entity / describe_workspace / read_conversation /
                    discover_capabilities / ask_user (5+ caps; live reads of *ForAI queries)
convex/crm/<domain>/capabilities.ts   — per-domain capability files (S3+ as each domain ports)
  entities/leads/capabilities.ts    create_lead / update_entity / convert_lead / get_entity_detail
                                    + leads group playbook
```

The orchestrator `convex/ai/orchestrator/run.ts` is now a thin auth + plan + quota + history-load + `runAgent` caller (~400 lines, V2 only). The legacy V1 chat-path runtime (subagent router, `expandedLayers`, propose/commit, `runStreamLoop`, fallback chain, `suggestionGenerator`, `twoStepSchemaAudit`) was deleted in S3 alongside the leads tool port.

## Stage rollout (S0–S17 SHIPPED, 2026-06-03 → 2026-06-05)

The full per-stage record lives in `SHIPPED.md`. High-level:

- **S0–S2** registry scaffold + correctness machine + agent host + AI-SDK projector + prompt caching.
- **S3–S7** every CRM domain ported to capabilities + side-by-side delete of the V1 chat path.
- **S8** approvals → org-policy autonomy migration (per-user `aiApprovals` retired).
- **S9** module + vertical registry — capabilities filter by `activeModules ∩ permissions ∩ channel`.
- **S10** members + settings + bulk + 2FA step-up + final V1 deletion (toolRegistry, tools/**, resume, friendlyToolError, ChatConfirmation, preview/, _shared/aiApprovals heavy parts).
- **S11** autonomous engine (event-driven; `runAutonomousTurn` + `autonomousTurn` action).
- **S12** audit feed (`registry/audit.ts:writeAudit`) + coverage report + token measurement.
- **S13** Twilio WhatsApp inbound webhook (per-agent), `agentChannels` table.
- **S14** WhatsApp outbound (`send_whatsapp` + 4 default templates + 24h session-window logic).
- **S15** WhatsApp Agent Profile (Mode C) — autonomous customer replies with an 11-cap allow-list.
- **S16** MCP + REST projectors (`registry/projectors/{mcp,rest,dispatch}.ts`) + `aiApiTokens` Bearer auth + HTTP routes (`POST /ai/mcp` JSON-RPC, `POST /ai/rest/<cap>` envelope). Cross-channel parity test proves identical envelope on chat / MCP / REST.
- **S17** Cutover sweep — verified no V1 remnants; collapsed dead `expandedLayers` arg from public mutations + frontend hook (the V2 host doesn't read it; persisted schema field left as `v.optional` for harmlessness); refreshed module docs; full repo verification green (typecheck 0; biome 0/0; pnpm test 1053 pass / 1 skipped; vitest 215 pass; build green).

## Surviving legacy

None. The V2 capability registry + runtime is the single execution path for chat, autonomous, WhatsApp inbound/outbound/persona, MCP, and REST. `aiMessages.expandedLayers` persisted field is left in the schema as `v.optional` (never read, harmless — a future migration can drop it).

## File map (post-S10)

| File | Runtime | Role |
|------|---------|------|
| `messages.ts` | V8 | Public mutation `sendMessage` (schedules `processChat:run`) + queries (`listForConversation`) + internal helpers (`appendAssistantPlaceholder`, `patchAssistantBody`, `patchAssistantSnapshot`, `appendToolCallRecord`, `patchToolCallRecord`). |
| `conversations.ts` | V8 | Public CRUD on `aiConversations` (`list`, `get`, `create`, `rename`, `archive`, `softDelete`, `setDefaultModel`). |
| `keys.ts` | V8 | BYOK V8 surface — `listKeys`, `listOwnKeys`, `removeKey`, internal `insertEncryptedKey`, internal `resolveKey`. |
| `keysActions.ts` | **Node** | BYOK Node surface — public actions `addOrgKey`, `addUserKey`. They encrypt with `node:crypto`, then call `internal.ai.keys.insertEncryptedKey`. |
| `encryption.ts` | **Node** | `encryptApiKey` / `decryptApiKey` (AES-GCM via `node:crypto`). Re-exports types from `encryptionTypes` for back-compat. |
| `encryptionTypes.ts` | V8 | Pure `ProviderId`, `detectProvider`, `keyHint`. **V8-safe so non-Node files can import without pulling `node:crypto` into the V8 bundle.** |
| `models.ts` | **Node** | `buildLanguageModel` (Vercel AI SDK provider factories), `getPlatformKey`, `getModel`. Imports `@ai-sdk/*` packages. |
| `modelRegistry.ts` | V8 | Static `MODEL_REGISTRY`, `PLAN_ALLOWED_TIERS`, default model constants. **Safe to import from frontend AND Node actions.** |
| `processChat.ts` | **Node** | Re-export shim — preserves the public path `api.ai.processChat:run` (V1 `:resume` retired in S10; replaced by 2FA step-up via `convex/aiStepUp.ts`). |
| `orchestrator/run.ts` | **Node** | `processChat.run` entry-point. Auth → model → quota → placeholder → history → `runtime/host.ts:runAgent` → auto-title. V2 only. |
| `orchestrator/modelResolver.ts` | **Node** | Resolves model + BYOK key + plan tier. |
| `orchestrator/quotaGate.ts` | **Node** | Plan-tier quota check (BYOK unmetered; trial / past_due grace; metered for paid platform). |
| `runtime/host.ts` | **Node** | V2 agent host — ONE entrypoint for every channel. Progressive disclosure via `prepareStep`; Anthropic ephemeral cache on stable prefix; retry budget for `needs_repair` / `infra_retry`. |
| `runtime/coreTools.ts` | V8 | V2 always-on core capabilities (`search_crm`, `describe_entity`, `describe_workspace`, `read_conversation`, `discover_capabilities`, `ask_user`). |
| `registry/*` | V8 | V2 capability layer — `types`, `coerce`, `result`, `define`, `gate`, `wrapper`, `resolveRef`, `groups`, `drive`, `catalog`, `router`, `coverage`, `modules`, `vertical`, `projectors/`. |
| `quarantined/capabilities.ts` | V8 | H.13 caps (`parse_csv`, `analyze_file`, `enrich_record`) — kick off use-node actions via scheduler, return parent row id immediately. |
| `quarantined/csvParser.ts` + `fileAnalyzer.ts` + `enrichmentProviders.ts` | **Node** | Hardened LLM actions (treat-as-data prompts, deterministic local CSV tokeniser, Zod-validated output, per-tenant model picker). |
| `proactive/`, `interaction/`, `creative/`, `analytics/` | V8 | H.13 caps — register at module load via `host.ts` side-effect imports. |
| `insights/` | V8 + Node mix | Pure scoring + anomaly helpers (V8) + `explainDealScore.ts` (Node, calls `pickBriefingModel`). Cron-driven via `crons.ts`. |
| `briefings.ts` | V8 | Internal queries/mutations for the morning briefing. |
| `briefingsActions.ts` | **Node** | `generate` (daily) and `generateForActiveUsers` (cron). Exports `pickBriefingModel` BYOK→platform→env resolver. |
| `briefingsPublic.ts` | V8 | Public surface — `getLatest`, `refreshNow`, `todayForUser`, `thisWeekForOrg`. |
| `actions/*` | **Node** | Creative + analytical LLM actions (`draftMessage`, `draftProposal`, `summariseConversation`, `webScrape`, `analyzeMetric`, `analyzeDealClose`, `rebuildCohorts`, `rankNextActions`). All wired into V2 caps. |
| `queries/*` | V8 | Read surfaces — `nextActions`, `widgets`, `telemetry`, `cohorts`, `cascadeImpact` (used by S10 hard-delete blast-radius), `pipelineVelocity`, `memberPerformance`, `insights`, `anomalies`, `toolTrace`. |
| `standingOrders/*` | V8 + scheduler | Autonomous-loop substrate. Reused by S11 `autonomousTurn` (event-driven engine) — DO NOT delete pre-S11. |
| `internal.ts` | V8 | `rebuildEntityContext` (called from canonical-mutation step 7). |
| `aiEntityPatch.ts` | V8 | Code → row resolution + custom-field patch helpers used by V2 caps. |
| `personaContext.ts` | V8 | `aiPersonaContext` memory (org + user persona facts). |
| `suggestions.ts` | V8 | Heuristic proactive suggestions (no LLM call) — read by `<AISuggestionsPanel>`. |
| `titleGeneration.ts` | **Node** | Auto-title chat threads ~2s after first turn (smallest available model). |
| `csvImports.ts` | V8 | Internal CRUD on `csvImports` rows — used by quarantined CSV parser action. |
| `chatAttachments.ts` | V8 | File-attach helpers used by `ChatAttachButton`. |
| `webSearchAction.ts` | **Node** | Firecrawl `web_search` — called by `web_scrape` capability. |
| `dealClose.ts` + `creativeHelpers.ts` + `analyzeMetricHelpers.ts` | V8 | Pure helpers consumed by their parent Node actions. |
| `telemetry.ts` | V8 | `aiToolEvents` writers + token-sum readers (read by `quotaGate`). |
| `_logAIActivityInternal.ts` | V8 | Helper to write activity-log rows from AI tool calls. |

## Locked architectural decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Public chat entry is a **mutation that schedules an internalAction** (`messages.sendMessage` → `processChat.run`). | The action runs in the background while the UI reactively subscribes to `aiMessages`. |
| 2 | The assistant message is inserted as an **empty placeholder** in `appendAssistantPlaceholder` and patched progressively by `patchAssistantBody`. | Real-time streaming UX without WebSockets. |
| 3 | **BYOK keys are encrypted with AES-GCM** in a Node action; the V8 mutation only ever sees ciphertext. | Plaintext keys never touch the database; clients only see the last-4-char `keyHint`. |
| 4 | **V8 / Node split is a strict convention** — files declare a single runtime; pairs (`X.ts` V8 + `XActions.ts` Node) communicate via `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`. | Each file has a single runtime; bundling errors fail fast. |
| 5 | **`MODEL_REGISTRY` is the single source of truth** for which models the UI exposes. | One place to gate plan tiers, supportsTools, costs. |
| 6 | **AI tools call `*ForAI` internal twins via a path rewrite** in `coreTools.ts:aiQuery` (S2/S3) — the public path is rewritten with the `ForAI` suffix and the trusted `userId` is injected. Same convention as the legacy `toolMutation`/`toolQuery` helpers in `tools/_shared.ts`. | Authoring stays uniform; forgetting the twin fails loud at runtime ("function not found"). |
| 7 | **The V2 capability registry replaces the V1 toolRegistry** as the single source of tool truth. Capabilities declare `permission` + `risk` + `channels` + a permissive AI-SDK schema + a strict `cap.input` schema parsed inside the wrapper. | One execution path per channel; bad args become `repair` envelopes the model self-corrects from. |
| 8 | **The `resolveRef` resolver honours user-supplied `entityType` first**, then field-name (`personCode`/`leadCode`/etc.), then capability `group`. | Multi-entity capabilities like `update_entity` route correctly even from inside a domain-specific group file. |
| 9 | **Side-by-side cleanup, not staged retirement** — when a stage ports a domain, the legacy code for that domain is deleted in the same edit (AGENTS.md `RULE: Side-by-side cleanup`). The S17 "cutover" was retired in S3 because the rule makes it obsolete. | No `*_V2` env flags, no parallel folders. The unported tool files for not-yet-ported domains stay compiling (orphaned) until their stage. |
| 10 | **LLM-readable comments in source** — write comments that teach a fresh LLM the module's role + invariants + gotchas + cross-references. Soft budgets (file header 6–25 lines, function 3–15, inline 1–8) — exceed when the prose teaches; trim when it pads. Stage-history narration + speculative future-work still banned (those rot fast). See AGENTS.md `RULE: LLM-readable comments`. | Comments stay useful for the LLMs that read this codebase cold. |
| 7 | **Briefings are platform-billed only** — never use BYOK. Generated nightly by cron + on-demand via `briefingsPublic.refreshNow` (rate-limited 5/min/user). Sprint 5 added a weekly-org briefing scope generated every 7 days. | Cost predictability; users don't pay for cron-generated work. |
| 8 | **2FA step-up replaces propose/commit for irreversible caps (S10).** When a capability with `risk: "irreversible"` runs, the wrapper returns a `needs_step_up` envelope; `<StepUpCard>` collects user confirmation; `aiStepUp.confirmStepUp` issues a single-use 5-min token; the next `processChat.run` consumes it via `stepUpVerifier`. WhatsApp channel is hard-blocked for irreversible caps regardless. | One uniform safety gate across chat / autonomous / WhatsApp / MCP / REST. The V1 propose/commit path was deleted in S10. |
| 9 | **Live `thinkingState` field on aiMessages** drives the Claude/OpenAI-style indicator (`thinking → calling_tool → streaming → done`). Plus optional `reasoning` chain-of-thought (capped at 10 KB) and `activeTool` (running tool name). | UI never silently spins; user always sees what the model is doing. |
| 10 | **Stream-loop is bullet-proofed** — handles `error` chunk-types, settles the placeholder if the stream ends without a `finish` chunk, maps auth/quota errors to friendly hints. | A user can never be left staring at a permanent spinner. |
| 11 | **Composer pre-flight gate** — `useModelPreference().hasNoKeys` disables the Composer and replaces it with a "No AI key configured" banner. | Defense in depth + zero-confusion onboarding. |
| 12 | **Per-tool `runbook` field (Sprint 4)** — every active tool injects ≤6 one-line policies into the system prompt's `## Tool Runbooks` block. Cost scales with the active set, not with the total registry size. | Localised guidance; no global doctrine block; consistent behaviour across providers. |
| 13 | **Suggestions are best-effort, post-turn (Sprint 5)** — `orchestrator/suggestionGenerator.ts` runs after the chat already settled. Failures are logged + swallowed; no user-visible error. | Polish, not hot-path; chat reliability untouched. |
| 14 | **Daily + weekly briefings live in one table, distinguished by `aiBriefings.scope`** — `daily-user` rows have a `userId`; `weekly-org` rows leave it null. | One index family; the `payload` discriminator carries the structured shape. |
| 15 | **Stage 5 dashboard layer (Stage 5 of `DASHBOARD-V2-PLAN.md`, 2026-05-29)** — 5 AI tools at `convex/ai/tools/dashboard/` (render_widget, annotate_widget, score_deal, explain_deal_score, list_anomalies) backed by 3 new tables (`ephemeralDashboardCells` per-user TTL'd 24h, `dashboardAnnotations` per-org with `dismissedByUserIds[]`, `dealScores` per-org-per-deal). Architectural rule: AI never writes the canonical layout — only ephemeral cells + annotations. The user's "Pin to my dashboard" gesture promotes a cell to `user.preferences.dashboardLayoutOverride.layout` (per-user, scoped by orgId). | Production CRMs converge on this pattern. Per-user override + AI-pinned ephemeral cells gives AI room to express data without org-wide blast radius or hard-locked settings-category friction (decision #26). |
| 16 | **Stage 5 insights modules split** — pure helpers (`dealScoring.ts` + `anomalyDetection.ts`) live in `convex/ai/insights/` with no Convex dependencies; cron orchestrators (`anomalies.ts`, `dealScores.ts`) are V8 internalMutations + internalActions; `explainDealScore.ts` is `"use node"` (calls `generateText` via the daily-briefing's BYOK→platform fallback resolver, now exported as `pickBriefingModel` from `briefingsActions.ts`); `explainDealScoreInternal.ts` is V8 internalQuery (the `"use node"` action calls it via `ctx.runQuery` because Convex forbids queries in `"use node"` files). | Same V8/Node convention enforced everywhere else in this folder (decision #4). The pure helpers are unit-testable without convex-test; the V8/Node pair only crosses the runtime boundary at the LLM call. |

## V8 vs Node runtime convention

> **The non-negotiable rule:** every file in `convex/ai/` runs in EXACTLY ONE Convex runtime. Mixing produces bundling errors that surface only at push time.

### Decision tree

```
Does the file import a Node-only module?
  (node:crypto, node:fs, @ai-sdk/*, etc.)
   │
   ├── YES → must have `"use node"` at the top.
   │         Can ONLY contain actions / internalActions.
   │         Cannot contain query / mutation / internalQuery / internalMutation.
   │
   └── NO  → must NOT have `"use node"`.
            Can contain anything (query / mutation / action — but actions in V8
            are the unusual case; pick V8 only when no Node deps are needed).
```

### Cross-runtime communication

A V8 file and a Node file talk to each other via Convex's runtime bridge:

| From | To | How |
|------|----|-----|
| Node action | V8 query | `ctx.runQuery(internal.path.fn, args)` (or string-path forward ref pre-codegen) |
| Node action | V8 mutation | `ctx.runMutation(internal.path.fn, args)` |
| Node action | Node action | `ctx.runAction(internal.path.fn, args)` |
| V8 mutation | Node action | `ctx.scheduler.runAfter(0, "path:fn" as any, args)` (must use scheduler — V8 cannot call actions directly) |
| V8 file (any) | V8 file (any) | direct import |
| V8 file | Node file | **Only `import type` is allowed.** Anything else pulls Node deps into the V8 bundle. |
| Node file | V8 file | direct import is allowed; the V8 file's compiled output gets bundled into the Node bundle, which is fine because Node is a superset. |

### File-pair convention

Whenever a feature has both DB writes and LLM/encryption calls, it's split into a pair:

```
foo.ts          (V8) — queries / mutations / internalMutations / internalQueries
fooActions.ts   (Node) — actions / internalActions; all `node:*` and `@ai-sdk/*` use
```

The Node file calls into the V8 file via `ctx.runQuery` / `ctx.runMutation`. Existing pairs:

- `keys.ts` ↔ `keysActions.ts`
- `briefings.ts` ↔ `briefingsActions.ts`
- `messages.ts` ↔ `processChat.ts` (different naming for historical reasons; same pattern)

Keep this naming when adding new features. Future agents (and the CLI bundler) rely on it.

### Pre-codegen forward reference shim

Convex's `internal` and `api` types only know about modules that existed at the last successful push. When introducing a new V8 ↔ Node pair in a single commit, the action's `ctx.runMutation(internal.foo.fn, ...)` won't typecheck until the codegen runs. Both `keysActions.ts` and `briefingsActions.ts` use the established workaround:

```ts
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
const _anyArgs = (a: Record<string, unknown>) => a as any;

await ctx.runMutation(_ref("ai/foo:insertSomething"), _anyArgs({ ... }));
```

Once `npx convex dev --once` succeeds, the typed `internal.ai.foo.insertSomething` form will work and the shim can be replaced.

## Schema dependencies

| Table | Owner |
|-------|-------|
| `aiConversations` | `convex/schema/ai.ts` |
| `aiMessages` | `convex/schema/ai.ts` |
| `aiBriefings` | `convex/schema/ai.ts` |
| `orgAiKeys` | `convex/schema/ai.ts` |
| `aiProviderCatalogs` | `convex/schema/ai.ts` (2026-06-06 — dynamic `/v1/models` cache, 24h TTL) |

`aiMessages` carries: `role` (`user` / `assistant` / `tool`), `content`, optional `toolCalls[]`, optional `confirmationState` + `confirmationPayload`, optional usage tokens, model + provider + usageMode.

`aiProviderCatalogs` is the cache of `GET <baseUrl>/v1/models` per (provider, baseUrl). Read by `useAvailableProviders` to merge dynamic models into the picker (~300 OpenRouter models including Qwen3 Coder 480B); written by `convex/ai/providerCatalogActions.ts:refreshCatalog` (Node action) on key save + every 24h cron tick. The static `MODEL_REGISTRY` is unchanged — dynamic catalogs ADD to it, dedup on `modelId`. Dynamic entries surface in the picker with the modelKey shape `dyn:<provider>:<modelId>`; `getModel` + `modelResolver` split on the FIRST colon to recover provider + slug (so `:free`-suffixed slugs survive unmangled).

## Permissions

| Permission | Required for |
|-----------|--------------|
| `ai.use` | `messages.sendMessage`, `conversations.create`, `aiStepUp.confirmStepUp` |
| `ai.byokOrg` | Add/remove org-scope BYOK keys; remove other users' user-scope keys |
| `ai.byokUser` | Add/remove your own user-scope BYOK keys |
| `ai.briefingRefresh` | Manually re-trigger morning briefing generation |

All defined in `convex/_shared/permissions/catalog.ts`.

## Rate limits

| Scope | Limit | Where |
|-------|-------|-------|
| `ai.chat` | `RATE_LIMITS.ai` (currently 30/min) | `messages.sendMessage` |
| `ai.addKey` | 10/min | `keys.insertEncryptedKey` |
| `ai.briefing.refresh` | 5/min | `briefingsPublic.refreshNow` |
| `ai.conversation.create` | 30/min | `conversations.create` |

All gate on `(userId, orgId)` so a single user can't bypass by alternating verbs.

## Free / cheap testing

For BYOK testing without paying, recommended providers (already supported):

| Provider | Free tier | Model registry key | Where to get a key |
|----------|-----------|---------------------|---------------------|
| Groq | 30 req/min, generous quotas | `llama-3.3-70b` | https://console.groq.com/keys |
| Google Gemini | Generous Studio free tier | `gemini-2.0-flash` | https://aistudio.google.com/apikey |
| NVIDIA NIM | 5,000 req/month | `nvidia-llama-3.3-70b` | https://build.nvidia.com → user account → API keys |
| OpenRouter | ~200 req/day on `:free` models | `openrouter-llama-3.3-70b-free` | https://openrouter.ai/keys |
| Mistral | Limited free trial | `mistral-large` | https://console.mistral.ai/api-keys |

Two ways to provide a key:

1. **Per-user BYOK**: Settings → AI → "Add API key" — encrypted at rest; only used for that user's messages.
2. **Platform-wide**: Set the env var (`GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, etc.) **in the Convex dashboard** (not `.env.local` — that's Next.js). Used as fallback when no BYOK exists for the requested provider.

If neither is set for the resolved model's provider, `processChat.run` writes `❌ Platform API key not configured: <provider>` to the assistant message.

## Avoids / Never-do

- ❌ **Never** put a query or mutation in a `"use node"` file. The bundler will reject the push.
- ❌ **Never** import a `"use node"` file from a non-Node file as anything other than `import type`. The bundler will pull `node:crypto` (or whatever) into the V8 bundle and fail.
- ❌ Never persist a plaintext API key. Encryption happens in the Node action; only the ciphertext ever reaches `ctx.db.insert`.
- ❌ Never expose `encryptedKey` in a public query. `listKeys` and `listOwnKeys` strip it.
- ❌ Never skip the 2FA step-up for `irreversible` capabilities (bulk delete, settings/schema, members/roles). The wrapper returns `needs_step_up` and `<StepUpCard>` drives the confirm flow; bypassing the wrapper to call a cap directly is forbidden.
- ❌ Never call `processChat.run` synchronously from a mutation. Always schedule via `ctx.scheduler.runAfter(0, …)`.

## Open work / Pending

The AI-TOOLING-BUILD-STAGES.md plan (S0–S17) is fully shipped. New AI work is tracked under `Future-Enhancements.md §B` and the relevant per-stage cards (B.40 WhatsApp Templates Admin UI, B.41 WhatsApp Agent external prerequisites, B.42 MCP streaming/SSE deferral, etc.). Per-task pending detail belongs in `PENDING.md`.
