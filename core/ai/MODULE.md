# core/ai — Module decisions

> Decision log for the AI assistant module. Every architecture choice that
> affects how AI tools, the orchestrator, the chat UI, or the
> stream-loop work goes here. Append rows; never delete.
>
> Related docs: `core/ai/STATE.md` (live status), `PHASE-3-AI-AUDIT.md`
> (six-week build order), `AGENTS.md` (the global rules — most importantly
> the AI-tool auth-bridge rule).

---

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Two-step writes use a `propose_*` + `commit_*` pair, *not* a single tool that toggles between preview/commit. | Lets the propose-side runbook differ from the commit-side runbook, lets the orchestrator inspect the tool name to decide whether to render an approval card, and keeps the SDK schema validation separate per side. |
| 2 | Tools live in `convex/ai/tools/{always,layers,interaction,crud}/*.ts` with one file per layer. Layer files own a `setXContext` setter and a module-level `_ctx` so `execute()` can read the orchestrator's `ToolContext` without threading it through tool args. | Single setter call per layer in `convex/ai/orchestrator/toolContextBinder.ts` keeps the binding location in one place. Adding a new layer = add the import + setter call there + register tools at module load. |
| 3 | Chat is **DB-streamed**, not WebSocket-streamed. `processChat.run` (Node action) patches `aiMessages.content` every ~50 chars; the UI re-renders via `useQuery`. | Trade-off: DB writes are the bottleneck on burst rate, not the model. Win: native cancellation (cancelStream patches a flag the loop polls), zero infrastructure cost, replays work for free, and the stream loop survives a Vercel function timeout because it lives in Convex. |
| 4 | `confirmation: "twoStep"` is the legacy tool field; `needsApproval: boolean | (args)=>boolean` is the new one (Week 3.3). The orchestrator combines them via `resolveNeedsApproval(toolName, args)`. | Legacy tools keep working; new tools follow the AI SDK v6 cookbook shape. We also adopt the cookbook frontend mutation `addToolApprovalResponse` (alias of `confirmConfirmation`) so component code reads identically to the SDK docs. |
| 5 | Subagent routing (Week 2). 5 POJOs in `convex/ai/subagents/`. Heuristic-first router escalates to Haiku-class LLM only when confidence < 0.6. 4-second wall-clock timeout. Never throws. | Cuts the prompt token budget by 30-60% per turn (only the active subagent's tool runbooks ship), keeps the model focused, and lets us add specialists (CSV import, enrichment, file analysis) without bloating every turn's prompt. |
| 6 | `aiConversations.contextBag` (Week 3.2) — typed facts the user provides during a turn, persisted via the `set_context_var` synthetic tool, capped at 4KB FIFO. Injected as "Facts already known" in the prompt. | The model never has to re-ask. Salesforce's L4 variables / Anthropic's "agent state" pattern. Keys are snake_case `[a-z][a-z0-9_]{0,63}`. |
| 7 | **AI tools call `*ForAI` internal twins, NEVER public `orgQuery`/`orgMutation`.** Per Convex docs, scheduled actions don't propagate auth identity. Every public mutation an AI tool needs gets an internal twin in the same file: takes `userId: v.id("users")` arg, validates via `requireOrgMemberByIds`, calls the same `*Impl` body. The `toolMutation` / `toolQuery` helpers in `_shared.ts` rewrite paths automatically (`foo:bar` → `foo:barForAI`) and inject the trusted `userId`. | Single source of truth for the AI auth path. Tool authors keep writing the public path string; the helper appends `ForAI` at runtime. Missing twins fail fast with "function not found" — easy to debug. See `AGENTS.md` → "RULE: AI tools call `*ForAI` internal twins" for the full doctrine. |
| 8 | **All permitted layers are pre-expanded at orchestrator start (architecture fix 2026-05-24).** `streamText({tools:...})` is invoked once per turn with a frozen tools dict — if the model calls `expand_tools` mid-stream, the SDK can't grow the dict, so the next layer-tool call hits "tool not found". Run.ts now passes the union of all layer ids the user has permission for. The `expand_tools` meta-tool stays as a hint signal but is functionally a no-op. | Removes the expand-then-call infinite loop. Token cost is bounded because runbooks are still filtered to the active subagent's allowed tools. |
| 9 | **Two-step preview is captured by calling `execute()` on twoStep tools.** Streamloop now invokes the tool's execute() (which runs the tool's `propose()` helper) for `confirmation: "twoStep"` tools, extracts the rich preview `{title, fields}`, and stores it on `confirmationPayload.preview`. Before this fix the payload only carried `{tool, args}` and `ChatConfirmation` showed "(no preview details)". | Each two-step tool's `propose()` is the source of truth for its preview. The frontend `<{Lead,Field,Deal,…}PreviewCard>` registry receives a populated payload and renders the right rich card. `GenericPreviewCard` auto-derives a row list from `args` as a safety net for any tool whose `propose()` doesn't reach the orchestrator. |
| 10 | **`resume.ts` resolves commit_* tools with all layers expanded.** The user just approved a propose_* card; the matching commit_* tool may live in a layer that wasn't in the original `expandedLayers` arg. Resume now passes the full layer list so the commit handler is always findable. | Fixes the silent-failure mode where approving a `create_field` propose card produced no audit-log row because the `commit_create_field` lookup returned undefined. |
| 11 | **AI message bubble alignment** — assistant turns are right-aligned (avatar/name on the right, body in a `max-w-[94%]` container). User turns stay left-aligned with the same width clamp. The chat sheet wraps in `chat-sheet-wrapper` so its scrollbar policy applies; markdown bodies use `w-full min-w-0 overflow-x-clip` and apply `max-w-full overflow-x-auto` to descendant `<pre>` and `<table>` so long lines/tables scroll inside their own box rather than pushing the panel wider. | Mirrors Claude / ChatGPT visually; eliminates the "code block overflows" report from screenshots; LTR text inside the bubble still flows normally — only the bubble alignment changes. |
| 12 | **Sequence enforcement: streamLoop breaks on twoStep tool-result.** When the SDK emits a `tool-result` for a twoStep tool, streamLoop lifts the propose() preview onto the pending DB row, settles the assistant body (`thinkingState: "done"`), and EXITS the for-await loop early. The model has no chance to call another tool in the same turn — the user's approval triggers a fresh `processChat.resume`. | Small models (e.g. Llama-3.3-70B) ignored the prompt rule "stop and wait" and kept calling tools after a propose. The orchestrator-level break is a hard guarantee that doesn't depend on model behaviour. The propose() preview is captured naturally from the SDK's tool-result chunk, so we don't have to call execute() ourselves (which would have run it twice). |
| 13 | **Markdown table normalisation** — `normalizeAssistantMarkdown` does a single linear pass over the assistant's text and injects a blank line wherever a non-pipe non-empty line immediately follows a `|...|` table row. Skips fenced code blocks. Only runs after streaming completes (mid-stream a table row may be partial). | GFM table parsers (remark-gfm under streamdown) absorb prose into the last cell when there's no separator. Small models routinely emit "row | row | row\nClosing prose." without the blank line. The post-process is a safety net; the prompt has a parallel rule asking the model to emit the blank line itself. |
| 14 | **System-prompt "Tool Sequencing Rules" block** (added 2026-05-24) — five non-negotiable rules: one write at a time; never bundle write+read; never invoke commit_* directly; always blank-line after a table; one table per entity. | The biggest source of agent-loop misbehaviour on small models is the model wanting to "do multiple things at once." Explicit, numbered rules in the prompt are the cheapest way to anchor it; the orchestrator-level fixes in #12 + #13 are the safety net for when the model still ignores them. |

## Tool layer naming conventions

| Convention | Example | Why |
|---|---|---|
| Read tool name = `list_<entity>_<thing>` or `get_<entity>_<thing>` | `list_entity_fields`, `get_entity_detail` | Matches REST conventions; the model expects familiar names. |
| Write tool name = imperative verb | `create_lead`, `update_field`, `attach_tag` | Matches CLI / GitHub-issue title style. |
| Two-step write = `propose_*` (the bare verb) + `commit_*` pair | `create_field` (propose) + `commit_create_field` | The propose side is what the model picks; `commit_*` is internal-only. |
| Synthetic / agent-state tools = noun-verb without entity prefix | `set_context_var`, `expand_tools`, `ask_user_choice` | Signals to the model that they don't write to a CRM entity; their effect is conversational. |

## Layer system

| Layer | Tools | Notes |
|---|---|---|
| `always` | introspection (`list_entity_fields`, `list_pipelines`, `list_my_permissions`, `list_active_layers`), search (`search_crm`, `get_entity_detail`, `get_dashboard_summary`), CRUD on the 4 main entities, notes/reminders, set_context_var, ask_user_choice/input | Every turn loads these. |
| `pipelines` | `move_deal_stage`, `close_deal`, `create_pipeline`, `add_pipeline_stage` | |
| `fields` | `create_field`, `update_field`, `remove_field` | All twoStep, all `requiredCapability: "premium"`. |
| `tags` | `create_tag`, `attach_tag`, `detach_tag`, `delete_tag` | |
| `views` | `create_saved_view`, `pin_saved_view`, `delete_saved_view` | |
| `categories` | note category CRUD | |
| `members` | invite, change role, remove, cancel invitation | |
| `settings` | `update_org_settings`, `rename_entity_labels` | |
| `bulk` | `bulk_update_entities`, `bulk_close_deals` | All twoStep with row-count preview. |
| `templates` | `list_templates`, `apply_template`, `clear_mock_data` | |
| `data` | `view_trash`, `restore_entity` | |

After the 2026-05-24 architecture fix, **all layers are loaded by default** —
`expand_tools` is now a hint to the model rather than a gate. Subagent
allow-lists still narrow (e.g. `qa` subagent gets read-only tools only).

## How a new AI tool gets shipped

1. Confirm the public Convex handler exists (or create it).
2. Add the `*ForAI` internal twin in the same file (mandatory — see `AGENTS.md`).
3. Pick or create the layer file under `convex/ai/tools/layers/` (or use `tools/crud/`, `tools/notesReminders.ts`, etc.).
4. `registerTool({ name, layer, permission, schema, runbook, execute })` at module load.
5. If twoStep: also register `commit_<tool_name>` with the actual mutation call. Use `propose()` in the propose-side `execute`.
6. If the result has a non-text shape (entity card, diff, list), set `display: { kind: "entity", entityType, entityId }` etc. — see `core/ai/components/results/ToolResultRenderer.tsx`.
7. Add a row to `core/ai/STATE.md` under "Built and working".
8. If the tool deserves a custom approval card, register it in `core/ai/components/preview/index.ts`.

## Linked rules in AGENTS.md (NON-NEGOTIABLE)

- **AI tools call `*ForAI` internal twins, NEVER public `orgQuery`/`orgMutation`** — see "Decisions" row #7 above + `AGENTS.md` for the full pattern.
- **Convex schema/data changes — migrate IN THE SAME MESSAGE, never defer.**
- **Deferred restrictions live in `Future-Enhancements.md`** — every gate we relax for testing must land here too.
