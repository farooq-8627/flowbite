# core/ai — State

> Updated: 2026-05-23 (Weeks 1–3 of PHASE-3-AI-AUDIT shipped)
> Status: **Infrastructure 75% / Agent loop 73% (W1–W3 done) / Vertical-CRM features 5%**.
> See `/PHASE-3-AI-AUDIT.md` (root) for the full audit, the build order, and pricing.

The chat infrastructure works; the **agent loop's 9 audit defects are all
fixed in Weeks 1–3**. Phases W4–W6 of the audit are still open. Smaller
models temporarily unblocked for testing — see `/Future-Enhancements.md
§A` for the deferred restrictions log.

---

## ✅ Built and working

| Component | File | Notes |
|-----------|------|-------|
| Chat orchestration shell | `components/ChatSheet.tsx` | Header, history dropdown, context card, message list, suggestion chips, composer. Cmd+. / Esc cancel. |
| Reasoning timeline (Week 1.5) | `components/reasoning/{ThinkingTimeline, TimelineRow, parseReasoning, timelineTitles}.tsx` | Claude/ChatGPT-style "Working" dropdown + vertical rail. Auto-open / auto-close on streaming / sticky after manual toggle. |
| Code block + copy button (Week 1.5b) | `components/code/{CodeBlock, CopyButton}.tsx` | Replaces every `<pre>` in chat. Hides vertical scrollbar; keeps horizontal. |
| Markdown renderer | `components/markdown/Markdown.tsx` | `streamdown` wrapper. ⚠️ Not streaming-aware — partial syntax flashes. Phase 6 work. |
| Message renderer | `components/ChatMessage.tsx` | Tool-result branch dispatches to `ToolResultRenderer`. |
| Per-message actions | `components/ChatMessageActions.tsx` | Copy / regenerate / edit. |
| Composer | `components/ChatComposer.tsx` | Auto-grow textarea, slash commands, no-keys preflight. |
| Suggestions chips | `components/composer/Suggestions.tsx` | Up to 3 chips from `aiMessages.suggestions`. |
| Slash commands | `components/composer/SlashCommands.tsx` | Pure text expansion. |
| Two-step confirmation UI | `components/ChatConfirmation.tsx` | Backed by `confirmConfirmation` (legacy) + `addToolApprovalResponse` (Week 3.4 alias). |
| Model picker | `components/ChatModelPicker.tsx` | Grouped by provider (BYOK ∪ platform). |
| Tool-result cards (9 kinds) | `components/results/*` | entity, entityList, codeLookup, diff, note, reminder, insight, settings, custom. |
| Per-tool propose previews | `components/preview/*` | 9 preview cards. |
| Hooks | `hooks/*.ts` | `useAIChat` exposes `isAwaitingApprovalOrStreaming` + `addToolApprovalResponse`. |

## ✅ Audit defects fixed (Weeks 1–3, see `/PHASE-3-AI-AUDIT.md §6`)

All 9 defects identified by the audit (`§4`) shipped in Weeks 1–3. Quick lookup:

| # | Defect | Fix location |
|---|---|---|
| 1 | `stepCountIs(5)` | `convex/ai/orchestrator/streamLoop.ts` (= 30 uniform; tier-aware deferred — `Future-Enhancements.md §A.3`) |
| 2 | `expand_tools.execute` lying about callable tools | `convex/ai/toolRegistry.ts:isToolExposed` |
| 3 | Opaque Zod tool errors | `convex/ai/orchestrator/zodErrorFormatter.ts` |
| 4 | Missing introspection tools | `convex/ai/tools/introspect.ts` |
| 5 | Single-card reasoning panel | `core/ai/components/reasoning/*` (timeline rebuild) |
| 6 | `confirmation: "twoStep"` reinvents `needsApproval` | `convex/ai/toolRegistry.ts:resolveNeedsApproval` + `streamLoop.ts` |
| 7 | Monolithic prompt + 30 tools | `convex/ai/orchestrator/router.ts` + `convex/ai/subagents/*` |
| 8 | No conversational `contextBag` | `convex/schema/ai.ts:aiConversations.contextBag` + `convex/ai/tools/contextBag.ts` |
| 9 | No agent-level eval / scorer tests | `convex/ai/agentScorer.test.ts` (7 baseline tests; full variant matrix is W6) |

## ⬜ Remaining audit work (`/PHASE-3-AI-AUDIT.md §6` Weeks 4–6)

### Week 4 — CSV import (dual-LLM safety)
- 4.1 `csvImports` schema
- 4.2 Quarantined LLM action `csvParser.ts` (no write tools)
- 4.3 Preview UI with field mapping + dedup warnings
- 4.4 Privileged commit action + bulk insert
- 4.5 Fuzzy dedup helper (`_shared/dedup.ts`)

### Week 5 — Enrichment + file analysis
- 5.1 `enrichment` subagent + 4 waterfall providers (web search → LinkedIn → email finder → domain WHOIS). The subagent declaration already exists in `convex/ai/subagents/enrichment.ts` — Week 5 fills in the actual tool implementations and unlocks them via the subagent's `allowedTools`.
- 5.2 `file_analysis` subagent + 3 vision tools (passport / listing photo / invoice)

### Week 6 — Polish + telemetry + billing wall
- 6.1 Streaming-aware Markdown parser (Attio Problem 5)
- 6.2 Per-org AI telemetry dashboard (cost / latency / per-tool error rate)
- 6.3 Multi-provider auto-failover on 5xx
- 6.4 LemonSqueezy plan-tier limits wired to AI usage
- 6.5 Re-enable `Future-Enhancements.md §A.1–§A.4` deferred restrictions
- 6.6 Variant-matrix scorer (Attio `defineAgentTestSuite`) — extends Week 1.6 baseline

## Architecture notes (current — revised end of Week 3)

- Chat is **DB-streamed**, not WebSocket-streamed. `processChat.run` (Node action) patches `aiMessages.content` every ~50 chars; UI `useQuery` re-renders on each patch.
- `thinkingState` is the canonical "is this message done" signal.
- `isStreaming` in `useAIChat` looks at the last message's `thinkingState`. `isAwaitingApprovalOrStreaming` (Week 3.4) additionally checks for any pending tool confirmation in the latest turn.
- The Composer is the single point where the user's preference (`defaultModel` + `defaultProvider`) gets attached to the send call. Server re-derives provider from `MODEL_REGISTRY[modelKey].provider` to defend against stale client state.
- Chat panel mounts only in `ChatSheet.tsx` — used by both desktop sidebar and mobile sheet. Do not fork.
- **Suggestions are persisted on the message**, not on the conversation.
- **SlashCommands are pure text expansion** — no backend handshake.
- **Subagent routing (Week 2):** `convex/ai/orchestrator/router.ts` runs a heuristic-first classifier on every turn; escalates to a Haiku-class LLM when confidence < 0.6; 4s wall-clock timeout; never throws. The chosen subagent is persisted on `aiMessages.subagent` for telemetry. Subagent declarations live in `convex/ai/subagents/`.
- **`needsApproval` (Week 3.3):** `ToolDef.needsApproval` (boolean OR `(args)=>boolean`) is the single source of truth. Legacy `confirmation: "twoStep"` is honoured during the migration window. `resolveNeedsApproval(toolName, args)` is read by `streamLoop.ts`. The frontend uses `addToolApprovalResponse` (cookbook alias of `confirmConfirmation`).
- **Deviation from AI SDK v6 literal native HITL:** the SDK's `needsApproval` keeps `streamText` alive until the user responds. We adopt the SDK's NAME + ARG SHAPE so frontend code matches the cookbook, but server-side our DB-streamed resume model (`run` → DB patch → user approves → separate `resume` action) is preserved. Documented in `Future-Enhancements.md §B.8` (now Shipped).
- **`contextBag` (Week 3.2):** `aiConversations.contextBag` stores typed facts the user provides. `set_context_var` tool writes; system-prompt builder injects as "Facts already known". Capped at 4KB FIFO.

## Key invariants

1. Assistant placeholder is inserted **before** model resolution → any failure lands as visible ❌ message, never a silent spinner.
2. Stream loop always settles the placeholder on exit, including providers that omit `finish`.
3. `scrollIntoView` is BANNED (AGENTS.md rule) — chat autoscroll uses `viewport.scrollTo`.
4. `reasoning` field is append-only and capped at 10 KB inside `patchThinkingState`.
5. Suggestion generation is best-effort — failures don't surface to the user.
6. The router never throws — every failure path returns a `RouterDecision` with `source: "fallback"`.
7. `set_context_var` keys are snake_case `[a-z][a-z0-9_]{0,63}`. Anything else gets rejected by Zod with a model-readable hint.

## Documents (Phase-3 source-of-truth, in priority order)

1. **`/PHASE-3-AI-AUDIT.md`** — full audit, build order, pricing, sources. Read first.
2. `/AGENTS.md` — global coding rules (RTL, scroll containers, subscription budget, etc.).
3. `/CODE-ARCHITECTURE-PHASE-3B.md` — Phase 3 schema deltas (LemonSqueezy, retention, etc.).
4. `/Build-Order.md` — full project build order across all phases.
5. `/Future-Enhancements.md` — deferred restrictions and backlog cards.
