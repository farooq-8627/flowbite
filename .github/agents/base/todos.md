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

### ✅ Week 3.5 — Auth-bridge enforcement + agent-loop hardening — SHIPPED 2026-05-24

Out-of-band fix triggered by "Model tried to call unavailable tool 'create_field'" + "(no preview details)" reports. Hardening over the Week 1–3 surface; no new audit defects covered.

- **Option B `*ForAI` rule locked in `AGENTS.md`** + cross-referenced from `.github/agents/base/rules.md` and a new `core/ai/MODULE.md`. Every public `orgMutation` an AI tool calls now MUST have an internal `*ForAI` twin in the same file. The `toolMutation` helper in `_shared.ts` rewrites paths and injects the trusted `userId`.
- **Pre-expand all permitted layers at orchestrator start.** `streamText({tools:...})` is invoked once with a frozen dict; `expand_tools` mid-stream couldn't grow it. `run.ts` now passes the union of every layer the user has permission for; `expand_tools` is now a hint signal.
- **Two-step preview captured.** `streamLoop.ts` calls `execute()` for twoStep tools so `propose()` runs and its `{title, fields}` reaches `confirmationPayload.preview`.
- **`resume.ts` uses all layers** when re-resolving `commit_*` so layer-gated commit handlers aren't lost after approval.
- **New AI tools** via the canonical pattern: `update_field`, `commit_update_field`, `remove_field`, `commit_remove_field`. Required new `*ForAI` twins: `crm/fields/fieldDefinitions/mutations:updateForAI` + `:removeForAI`. `create_field` reworked to auto-derive `name` from label + emit options in the preview.
- **Chat-panel UI** — assistant turn right-aligned (avatar+name on the right, body in `max-w-[94%]`); `Markdown.tsx` clamps `<pre>` and `<table>` with `max-w-full overflow-x-auto`; new `FieldPreviewCard`; `GenericPreviewCard` auto-derives a row list from `args` as a safety net.

### ✅ §6.5 follow-up bug class — Day 1 + Day 2 SHIPPED 2026-05-24

Triggered by a user report after Week 3.5. Underlying causes were model behaviour + tool-result serialisation + UX rendering. Per AGENTS.md doc-cleanup rule, the per-task detail is collapsed; full diagnosis + verbatim avoid-list / sequence diagram / verification protocol live in `PHASE-3-AI-AUDIT.md §6.5`.

- ✅ **T1.1** — Hide `propose()` JSON in `streamLoop.ts` via `wrapToolsForApprovalSanitisation` + `proposeStash`.
- ✅ **T1.2** — Composite `stopWhen: [stepCountIs(30), stopOnAnyTwoStepCall()]` halts on first twoStep call.
- ✅ **T1.3** — `resume.ts` reuses the existing assistant message for commit results (single-turn HITL).
- ✅ **T1.4** — `convex/_shared/synonyms.ts` (`entityTypeEnum`, `fieldTypeEnum`, `__NEEDS_CLARIFICATION__` sentinel + `FIELD_TYPE_CLARIFICATION_OPTIONS`); applied to introspect / search / updateEntity / notesReminders / fields / bulk / tags / views / data tools; `create_field` execute handles the sentinel via `ask_user_choice`.
- ✅ **T1.5** — Pre-flight runbook lines on `create_field` (uses `list_entity_fields`) and `create_lead` / `create_contact` / `create_deal` / `create_company` (uses `search_crm`).
- ✅ **T1.6** — `systemPrompt.ts` derives advertised layers from `getActiveRunbooks()` output; added Tool Sequencing Rules 6 (pre-flight) + 7 (synonym auto-mapping).
- ✅ **T1.7** — Removed broken `gemini-2.0-flash`/`-pro`; added `gemini-2.5-{flash-lite,flash,pro}`, `gemini-3.5-flash`, `gemini-3.1-pro-preview`; demoted `nvidia-llama-3.3-70b` to `small` with `pickerNote`.

Verification: `pnpm typecheck` exit 0; `pnpm test` 125 pass / 1 skipped; `pnpm exec vitest run` 122 pass.

### ⬜ §6.5 Day 3 — Pending

Manual cross-model flow tests on Claude Sonnet 4.5, Gemini 2.5 Flash, and NVIDIA Llama-3.3 (BYOK). Verify:
1. One approval card per twoStep tool call.
2. Commit result lands on the same assistant bubble (no split).
3. `entityType: "leads"` auto-maps to `"lead"`; `prospect → lead`; `companies → company`.
4. `fieldType: "file"` triggers an `ask_user_choice` clarification card with the 8 supported types.
5. `create_field` for an existing label warns the user instead of duplicating.
6. Gemini 2.5 family appears in the picker once `GOOGLE_GENERATIVE_AI_API_KEY` is set.

Once Day 3 is verified by the user, resume Week 4 (CSV import + dual-LLM safety).

### ✅ Week 4 — CSV import + dual-LLM safety — SHIPPED 2026-05-24

5/5 tasks (4.1–4.5) shipped. Per AGENTS.md doc-cleanup rule, the per-task descriptions live in `PHASE-3-AI-AUDIT.md §6 Week 4` (one-paragraph rollup). Highlights:

- `csvImports` schema (parsing→ready→committing→completed/failed/cancelled), per-row idemKey + dedupDecision + validationError.
- `convex/_shared/dedup.ts` — pure dedup (email exact → skip; phone exact → merge; name+company Levenshtein ≤2 → merge; else insert).
- `convex/ai/quarantined/csvParser.ts` (action) + `csvParserInternal.ts` — hardened system prompt, NO tools, deterministic local CSV tokeniser, 25-row batches through `generateObject` + Zod, prefers Haiku/Llama.
- `bulkInsertFromCsvImpl/Import/ForAI` in `convex/crm/entities/leads/mutations.ts` — privileged commit, `RATE_LIMITS.bulk`, batches of 100, idempotent.
- `convex/ai/tools/layers/csvImport.ts` — `import_csv` (twoStep) + `commit_import_csv`. Commit re-reads previewRows from trusted DB, never trusts the model.
- `core/ai/components/preview/CsvImportPreviewCard.tsx` — status-aware preview hydrating from `convex/ai/csvImports.ts:get`.
- 15 new scorer tests. `pnpm typecheck` exit 0; `pnpm test` 140 pass / 1 skipped (up from 125); `pnpm exec vitest run` 122 pass.

### ✅ Week 5.1 — Enrichment waterfall — SHIPPED 2026-05-25

Clay-style 4-provider waterfall. Real Firecrawl `web_search` + RDAP `domain_whois`; LinkedIn / email-finder stubbed cleanly for Phase 4 plug-in (Future-Enhancements §B.14, §B.15). New `enrichmentRuns` schema, quarantined provider action with hardened "treat web content as data" distillation step (Zod-validated `EnrichmentOutputSchema`), `enrich_record` / `commit_enrich_record` AI tools route through `ENTITY_UPDATE_MUTATION` SSOT.

### ✅ Week 5.2 — File analysis (vision) — SHIPPED 2026-05-25

`fileAnalyses` schema. Quarantined vision parser at `convex/ai/quarantined/fileAnalyzer.ts` with hardened "treat the image as data" prompt per kind (passport / listing_photo / invoice). Cost-ascending model picker (Claude Sonnet 4.5 → Gemini Flash → Flash-Lite → GPT-4o), 10 MB cap, base64 encoding, per-kind Zod schema. AI tools `analyze_file` / `commit_analyze_file` apply canonical fields via `ENTITY_UPDATE_MUTATION`.

### ✅ Week 6.3 — Multi-provider failover (resolver) — SHIPPED 2026-05-25

`resolveFallbackChain()` in `convex/ai/orchestrator/modelResolver.ts` returns the user's primary model first then up to 2 cross-family providers with working keys. Foundation; orchestrator-level wiring deferred to Phase 4 (Future-Enhancements §B.19).

### ✅ Week 6.6 — Variant-matrix scorer — SHIPPED 2026-05-25

12 new tests in `convex/ai/agentScorer.test.ts`. `runVariantMatrix(suiteId, cases, variants, runner)` harness. Three suites: title sanitiser (6 cases), file-analyzer passport patches (4 cases), file-analyzer invoice patches (2 cases). Phase 4 expands `DEFAULT_VARIANTS` to real model variants.

### ✅ Chat-title auto-generation + UI tweaks — SHIPPED 2026-05-25

`convex/ai/titleGeneration.ts:autoTitle` runs ~2s after first turn, picks smallest configured model, summarises in ≤6 words. `setAutoTitleInternal` refuses to clobber a user-set title. ChatSheet header shows real conversation title (falls back to `APP_CONFIG.name`). ChatHistoryDropdown trigger: dropped "X threads" / "No history" label, kept icon + numeric count only.

### ⬜ Phase 4 — Polish + telemetry + billing wall

The Phase 3 audit (`PHASE-3-AI-AUDIT.md §5 + §6`) has the canonical pending list. Headline items:
- Streaming-aware Markdown parser polish (Future-Enhancements §B.10)
- Per-org AI telemetry dashboard UI (schema shipped in Phase 3; UI is Phase 4 — §B.18)
- Multi-provider failover orchestrator wiring (resolver shipped; wiring is Phase 4 — §B.19)
- LemonSqueezy plan-tier billing wall + re-enable §A.1–A.4 deferrals (§B.20)
- T2.1–T2.5 Tier-2 follow-ups from §6.5 Day 0 diagnosis (Future-Enhancements §B.6–B.9)
- LinkedIn + email-finder real provider integration (§B.14 / §B.15)
- Custom-field application in `commit_analyze_file` (§B.17)
- Multi-entity CSV import / per-row override UI / mapping editor (§B.11–B.13)

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
