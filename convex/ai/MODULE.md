# convex/ai — MODULE.md

> **STATUS:** 🟡 Phase 3B core landed; runtime needs platform key OR BYOK to actually respond.
> Updated: 2026-05-23.

**Ownership:** `convex/ai/` (Convex backend) | Consumers: `core/ai/` (Next.js frontend), `core/inbox/ai/`, `convex/crons.ts` (briefings), future WhatsApp voice processor.

## Purpose

AI chat runtime + BYOK key management + morning briefings. `processChat.run` is the streaming brain (Vercel AI SDK `streamText`); `messages.sendMessage` is the public entry point that schedules it. Conversations and messages are persistent in Convex tables; the UI subscribes via `useQuery` and reactively renders streaming output as the action patches the assistant message in place.

## File map (canonical)

| File | Runtime | Role |
|------|---------|------|
| `messages.ts` | V8 | Public mutations (`sendMessage`, `confirmConfirmation`) + queries (`listForConversation`) + internal helpers (`appendAssistantPlaceholder`, `patchAssistantBody`, `appendToolCallRecord`, `patchToolCallRecord`, `setConfirmationPending`). |
| `conversations.ts` | V8 | Public CRUD on `aiConversations` (`list`, `get`, `create`, `rename`, `archive`, `softDelete`, `setDefaultModel`). |
| `keys.ts` | V8 | BYOK V8 surface — `listKeys`, `listOwnKeys`, `removeKey`, internal `insertEncryptedKey`, internal `resolveKey`. |
| `keysActions.ts` | **Node** | BYOK Node surface — public actions `addOrgKey`, `addUserKey`. They encrypt with `node:crypto`, then call `internal.ai.keys.insertEncryptedKey`. |
| `encryption.ts` | **Node** | `encryptApiKey` / `decryptApiKey` (AES-GCM via `node:crypto`). Re-exports types from `encryptionTypes` for back-compat. |
| `encryptionTypes.ts` | V8 | Pure `ProviderId`, `detectProvider`, `keyHint`. **V8-safe so non-Node files can import without pulling `node:crypto` into the V8 bundle.** |
| `models.ts` | **Node** | `buildLanguageModel` (Vercel AI SDK provider factories), `getPlatformKey`, `getModel`. Imports `@ai-sdk/*` packages. |
| `modelRegistry.ts` | V8 | Static `MODEL_REGISTRY`, `PLAN_ALLOWED_TIERS`, default model constants. **Safe to import from frontend AND Node actions.** |
| `processChat.ts` | **Node** | `run` (internalAction) and `resume` (internalAction). Streams the LLM response, dispatches tools, patches the assistant message progressively. |
| `briefings.ts` | V8 | Internal queries/mutations for the morning briefing (`collectUserBriefingData`, `insertBriefing`, `listEligibleUsers`). |
| `briefingsActions.ts` | **Node** | `generate` (internalAction) and `generateForActiveUsers` (cron internalAction). Calls `generateText`. |
| `briefingsPublic.ts` | V8 | Public surface for briefings — `getLatest` (query), `refreshNow` (mutation that schedules `briefingsActions:generate`). |
| `systemPrompt.ts` | V8 | 3-layer system prompt builder (platform → org → entity context). Internal query. |
| `toolRegistry.ts` | V8 | `getToolsForRequest` filters tools by permissions + model tier + expanded layers. |
| `tools/*` | V8 | Tool definitions (zod schema → handler). Each tool has a `setXContext(toolCtx)` setter called from `processChat.run`. Layer tools live in `tools/layers/`. |
| `internal.ts` | V8 | Misc internal helpers. |
| `_logAIActivityInternal.ts` | V8 | Helper to write activity-log rows from AI tool calls. |

## Locked architectural decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Public chat entry is a **mutation that schedules an internalAction** (`messages.sendMessage` → `processChat.run`). Mutations cannot stream LLM output, but they CAN insert rows + schedule actions in one transaction. | The action runs in the background while the UI reactively subscribes to `aiMessages`. |
| 2 | The assistant message is inserted as an **empty placeholder** in `appendAssistantPlaceholder` and patched progressively by `patchAssistantBody`. Tokens stream into the DB; `useQuery` re-renders on each patch. | Real-time streaming UX without WebSockets. ~50-character batches keep write rate reasonable. |
| 3 | **BYOK keys are encrypted with AES-GCM** in a Node action (`keysActions.ts`); the V8 mutation `keys.insertEncryptedKey` only ever sees the ciphertext. `encryptedKey` is **stripped** from every public read path. | Plaintext keys never touch the database; clients only see the last-4-char `keyHint`. |
| 4 | **V8 / Node split is a strict convention** — see "V8 vs Node runtime convention" below. Bundling errors `Could not resolve "node:crypto"` and `function is a Query function. Only actions can be defined in Node.js` both come from violations of this convention. | Each file has a single runtime; pairs (`X.ts` V8 + `XActions.ts` Node) communicate only via `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`. |
| 5 | **`MODEL_REGISTRY` is the single source of truth** for which models the UI exposes. Adding a provider requires (a) `getPlatformKey` env-var case in `models.ts`, (b) factory case in `buildLanguageModel`, (c) at least one entry in `modelRegistry.ts`. NVIDIA + OpenRouter free models added 2026-05-23. | One place to gate plan tiers, supportsTools, costs. |
| 6 | **Tools register their context via `setXContext(toolCtx)`** at the start of `processChat.run`. Each tool reads `toolCtx` lazily inside its handler. This works around the Vercel AI SDK's stateless `tool()` factory. | Tools can hit Convex via the action context without each tool reimplementing auth. |
| 7 | **Briefings are platform-billed only** — never use BYOK. Generated nightly by cron + on-demand via `briefingsPublic.refreshNow` (rate-limited 5/min/user). | Cost predictability; users don't pay for cron-generated work. |
| 8 | **Two-step confirmation gate** for destructive tools — model emits a tool-call, `processChat.run` writes a `confirmationState: "pending"` record, the UI surfaces a confirm/reject dialog, `confirmConfirmation` mutation updates state and schedules `processChat.resume`. | Safe by default for delete / bulk-update / billing changes. |

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

`aiMessages` carries: `role` (`user` / `assistant` / `tool`), `content`, optional `toolCalls[]`, optional `confirmationState` + `confirmationPayload`, optional usage tokens, model + provider + usageMode.

## Permissions

| Permission | Required for |
|-----------|--------------|
| `ai.use` | `messages.sendMessage`, `messages.confirmConfirmation`, `conversations.create` |
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
- ❌ Never skip the confirmation gate for destructive tools (delete, bulk update, billing changes).
- ❌ Never call `processChat.run` synchronously from a mutation. Always schedule via `ctx.scheduler.runAfter(0, …)`.

## Open work / Pending

| # | Item | Where |
|---|------|-------|
| 1 | `excludeFromAI` flag on entities + notes/reminders → respected by tool queries (Phase 3A schema landed; tool-side filter NOT yet applied). | `convex/ai/tools/search.ts`, `convex/ai/tools/notesReminders.ts` |
| 2 | NVIDIA + OpenRouter providers added to model registry but not wired into the org plan-gating UI yet. | `core/platform/settings/components/groups/ai/` |
| 3 | Streak widget placeholder in productivity template; tool to query `userDailyActivity` deferred to Phase 4. | `convex/ai/tools/layers/data.ts` (future) |
| 4 | Action contexts (`setSearchToolContext`, etc.) are set per request but the underlying tool definitions are imported eagerly. Cold start is fine on Convex's V8 isolate but watch bundle size as more tools land. | `convex/ai/processChat.ts` |
