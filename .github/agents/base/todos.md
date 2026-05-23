# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-23 (Weeks 1–3 of AI audit shipped)

---

## ✅ Phase 3A — COMPLETE

All tasks shipped. `pnpm typecheck` → 0 errors.

---

## ✅ Phase 3B — AI Assistant — COMPLETE

| # | Task | Status |
|---|---|---|
| 1 | `convex/ai/systemPrompt.ts` — 3-layer builder | ✅ Done |
| 2 | `convex/ai/toolRegistry.ts` — role → allowed-tools map + layer expansion | ✅ Done |
| 3 | All 14 tools (`tools/*` + 10 layer tools) | ✅ Done |
| 4 | `convex/ai/processChat.ts` — streaming loop with thinking-state, error-chunk handling, post-stream settle, friendly auth/quota errors | ✅ Done |
| 5 | `convex/ai/keys.ts` + `keysActions.ts` — BYOK with AES-GCM | ✅ Done |
| 6 | `convex/ai/availableModels.ts` + `MODEL_REGISTRY` (9 providers, NVIDIA + Moonshot included) | ✅ Done |
| 7 | Chat UI: ChatSheet, ChatMessage, ChatComposer, ChatModelPicker, ChatHistoryDropdown, ChatContextCard, ChatConfirmation | ✅ Done |
| 8 | **NEW: ChatThinkingIndicator** (Claude/OpenAI-style "Thinking…" → tool-call → streaming → done with collapsible reasoning dropdown) | ✅ Done 2026-05-23 |
| 9 | `useAIChat`, `useRouteContext`, `useModelPreference`, `useAvailableProviders` | ✅ Done |
| 10 | `aiMessages.thinkingState` + `reasoning` + `activeTool` schema fields | ✅ Done 2026-05-23 |
| 11 | `_migrations/2026_05_23_backfillAiThinkingState.ts` | ✅ Done 2026-05-23 |
| 12 | Composer hasNoKeys gate (banner + Settings → AI link) | ✅ Done 2026-05-23 |
| 13 | Autoscroll fix (`scrollTo` on viewport, fires on every message change) | ✅ Done 2026-05-23 |
| 14 | Set ANY platform AI key on Convex env (e.g. `ANTHROPIC_API_KEY`) — REQUIRED for chat to actually respond | ⚠️ Manual user step — see "How to set the env var" in this file |

---

## ✅ Production Hardening — Status After 3B

| # | Item | Status |
|---|---|---|
| 1 | Mock data seeded on signup | ✅ Done |
| 2 | AI assistant end-to-end | ✅ Done (Phase 3B) |
| 3 | Email (Resend — invitation + password-reset) | ✅ Done |
| 4 | Soft-delete Trash UI + undelete + daily purge cron | ✅ Done |
| 5 | GDPR export (fflate zip) + cascade delete (24h grace) | ✅ Done |
| 6 | LemonSqueezy webhook + checkout + plan gating | ✅ Done |
| 7 | Security headers in `next.config.ts` | ✅ Done |
| 8 | `entityVisibility` honored in sidebar | ✅ Done |
| 9a | Settings → "Switch template" UI | ✅ Done |
| 9b | Settings → "Delete sample data" button | ✅ Done |
| 10 | `activityLogs` archive cron (rows > 90 days) | ✅ Done 2026-05-23 |

**No P1 residuals remain.**

---

## How to actually start chatting

The chat UI is now fully reactive — but it needs at least ONE of these:

### Option A — Platform env var (works for the whole org)

On the Convex dashboard (https://dashboard.convex.dev → your project → Settings → Environment Variables) set ONE of:

| Var | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude (default model: claude-sonnet-4-5) |
| `OPENAI_API_KEY` | OpenAI |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq (very fast Llama) |
| `MOONSHOT_API_KEY` | Moonshot Kimi |
| `XAI_API_KEY` | xAI Grok |
| `MISTRAL_API_KEY` | Mistral |
| `OPENROUTER_API_KEY` | OpenRouter (free tier available) |
| `NVIDIA_API_KEY` | NVIDIA NIM (free tier available) |

Convex hot-reloads automatically. No deploy needed.

### Option B — BYOK (per-user or per-org, in-app)

`Settings → AI → Add API key` → choose provider, paste, save. The chat works immediately.

If neither is set, the Composer shows an actionable "No AI key configured" banner.

---

## Phase 3 — AI agent audit (PHASE-3-AI-AUDIT.md §6)

> The audit's 6-week roadmap takes the agent loop from 41/100 → 84/100 production-readiness.

### ✅ Weeks 1–3 — SHIPPED 2026-05-23

- **Week 1** — Stop the bleeding (6/6). `stepCountIs(30)`; `expand_tools` capability filter; Zod-error reformatter; 4 read-only introspection tools; reasoning panel rebuilt as Claude/ChatGPT-style timeline + `<CodeBlock>` + `<CopyButton>`; 7-test agent scorer harness. Still deferred: tier-aware `stepCountIs` and per-tool premium gate (re-enable in Week 6 — see `Future-Enhancements.md §A.1–A.4`).
- **Week 2** — Subagent routing (4/4). 5 subagent POJOs (`crm_action`, `qa`, `enrichment`, `csv_import`, `settings`); heuristic-first classifier in `convex/ai/orchestrator/router.ts` (escalates to Haiku); `aiMessages.subagent` schema field + `patchAssistantSubagent` mutation; `systemPrompt.ts` is subagent-aware; `selectToolsForSubagent` narrows the tool set in `run.ts`.
- **Week 3** — Native HITL + contextBag (4/4). `aiConversations.contextBag` schema + migration `2026_05_24_addContextBagAndSubagent.ts`; `set_context_var` synthetic tool; "Facts already known" injected into the prompt; `ToolDef.needsApproval` field + `resolveNeedsApproval` helper (legacy `confirmation: "twoStep"` honoured for back-compat); `addToolApprovalResponse` mutation + `lastAssistantMessageIsCompleteWithApprovalResponses` helper exposed via `useAIChat`.

Verification: `pnpm typecheck` 0 errors; `pnpm test` (convex) 125 passed / 1 skipped; `pnpm exec vitest run` (frontend) 116 passed.

### ⬜ Week 4 — CSV import (dual-LLM safety)

The first vertical-CRM "killer feature". `csvImports` table + quarantined LLM action + preview UI + privileged commit + fuzzy dedup helper. See `PHASE-3-AI-AUDIT.md §6 Week 4` and §7 (dual-LLM pattern).

### ⬜ Week 5 — Enrichment waterfall + file analysis

Clay-style waterfall in the `enrichment` subagent (web search → LinkedIn → email finder → domain WHOIS) + vision-model file analysis (passport / listing photo / invoice). See `PHASE-3-AI-AUDIT.md §6 Week 5`.

### ⬜ Week 6 — Polish + telemetry + pricing wall (re-enable §A.1–§A.4 here)

Streaming-aware Markdown parser; per-org AI telemetry dashboard; multi-provider auto-failover on 5xx; LemonSqueezy plan-tier limits wired to AI usage. Also: re-enable plan-tier gating, premium-tool gate, tier-aware `stepCountIs`, and the small-model "Capability Notice" per `Future-Enhancements.md §A`.

---

## Phase 3C — WhatsApp / Voice (next priority)

| # | Task | Priority |
|---|---|---|
| 1 | 360dialog webhook route at `app/api/integrations/360dialog/webhook/route.ts` | MEDIUM |
| 2 | Whisper → Claude → fieldValues processor (`convex/ai/voiceProcessor.ts`) | MEDIUM |
| 3 | Channel registration UI in Settings → Integrations | MEDIUM |
| 4 | Gulf-market: WhatsApp notification channel | MEDIUM |

---

## Phase 4 (deferred — after 3C)

- Streak widget (`userDailyActivity` table, nightly cron, `users.streak` cache).
- Cmd+K global command palette.
- CSV import / export per entity.
- Markdown renderer in chat (react-markdown + Shiki highlight).
- Bulk-update modal for the kanban (single-mutation `bulk*` tools already exist; UI not yet wired).
