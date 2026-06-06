# core/ai — Module decisions

> Frontend AI module — chat sheet, composer, results renderer, attach pipeline,
> reasoning timeline, AI cockpit dashboard widgets. Backend half lives in
> `convex/ai/MODULE.md`; this file owns the React/Next side only.
>
> Updated 2026-06-05 (post-Stage 10). The V1 propose/commit two-step UX +
> `<ChatConfirmation>` + per-tool preview registry was deleted in S10. AI
> writes that are `risk: "irreversible"` now flow through `<StepUpCard>` +
> `aiStepUp.confirmStepUp` (2FA step-up), not propose/commit cards.

---

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | **Chat is DB-streamed, not WebSocket-streamed.** `processChat.run` (Node action) patches `aiMessages.content` every ~80 ms via `patchAssistantSnapshot`; the UI re-renders via `useQuery`. Cancellation patches a `thinkingState: "error"` row the loop polls. | Trade-off: DB writes are the bottleneck on burst rate, not the model. Win: native cancellation, zero infrastructure cost, replays work for free, and the loop survives a Vercel function timeout because it lives in Convex. |
| 2 | **Single `<useAIChat>` hook** owns the chat surface. Reads conversation messages via `api.ai.messages:listForConversation` + persists active thread via `usePersistedConversationId(orgId)` (per-org localStorage key, SSR-safe + stale-id resilient). Lazy-creates only when no active thread exists. | One hook called from `<ChatSheet>`, `<AIQuickComposerCard>`, `<ChatLandingPane>`. UI reads stay reactive without prop-drilling. |
| 3 | **Every list-affecting AI mutation has `withOptimisticUpdate`** (per `rules.md §4.4`). The dropNextAction cache helper at `core/ai/lib/aiNextActionsCache.ts` patches the proactive ribbon instantly when a task is completed/deleted. Server stamps `updatedAt`; the optimistic patch only writes the user-visible field. | Eliminates "fire mutation → wait → re-render → flash" on the AI Pulse Ribbon. |
| 4 | **Reasoning panel is Claude/ChatGPT-style timeline**, not a single collapsible block. Streaming reasoning chunks are buffered and rendered as discrete steps; tool-calls become rows; final answer is the last row. `<ReasoningPanel>` + `<TimelineRow>` + `<ThinkingTimeline>`. | Matches the production AI surfaces users have already seen; per-step "Show details" beats one giant scrollable blob. |
| 5 | **`<AIMark>` is the single AI brand mark** — Sparkles icon + tone variants + a11y label. Replaced 7 `lucide:Bot` usages across TopNav / ChatAvatar / AssistantTurn / ChatSheet / ChatMessage / DailyBriefingCard / WeeklyInsightCard. | One visual identity for AI surfaces; consistent across light/dark/RTL. |
| 6 | **Auto-send carve-out for the dashboard QuickComposer** (locked AGENTS.md decision #27). User-typed text in `<AIQuickComposerCard>` SENDS on Enter; AI-INITIATED suggestions (`<AIPulseRibbon>`, `<ChatLandingPane>` Top-3) stay click-to-act. Settings → AI Autonomy (decision #26) governs whether tool calls inside that send require step-up — auto-send affects OUTBOUND text only. | Power users get the lowest friction on outbound; safety gate stays on the tool-call surface. |
| 7 | **2FA step-up replaces propose/commit (S10).** `<StepUpCard>` scans assistant tool-results for `needs_step_up` envelopes and drives the confirm-twice flow via `aiStepUp.confirmStepUp` (issues a single-use 5-min token, hashes args server-side, re-schedules `processChat.run` with the token). The host injects a `stepUpVerifier` into every `CapabilityCtx` that consumes the token before any `irreversible` capability runs. | One uniform safety surface for chat + autonomous + WhatsApp + MCP + REST. WhatsApp channel is hard-blocked for irreversible caps regardless of step-up. |
| 8 | **First-time tour for `<ChatLandingPane>`** uses `<FirstTimeTour id="chat-landing-v1">` with 3 steps tagged via `data-tour="landing-pulse" / "landing-actions" / "landing-chips"`. Bumped from v1 → vN whenever step content changes meaningfully. | Per `rules.md §2.6` — power gestures get a one-time coachmark, never a tooltip. |
| 9 | **Drag-attach + click-attach share one upload pipeline.** Shared helper at `core/ai/lib/uploadAttachments.ts` (`useUploadAttachments` hook) consumed by `<ChatAttachButton>` AND `<AIQuickComposerCard>` (via drag handlers + dashed-border "Drop to attach" overlay). | One mutation, one optimistic update, one error path. |
| 10 | **Right-aligned assistant bubbles + width-clamped markdown.** Assistant turns: avatar/name on the right, body in `max-w-[94%]`. User turns: same width clamp, left-aligned. `<Markdown>` clamps `<pre>` and `<table>` with `max-w-full overflow-x-auto` so long lines/tables scroll inside their own box rather than pushing the panel wider. | Mirrors Claude/ChatGPT visually; eliminates "code block overflows" reports. |
| 11 | **Markdown table normalisation** — `normalizeAssistantMarkdown` does a single linear pass over the assistant's text and injects a blank line wherever a non-pipe non-empty line immediately follows a `\|...\|` table row. Skips fenced code blocks. Only runs after streaming completes (mid-stream a row may be partial). | GFM table parsers (remark-gfm under streamdown) absorb prose into the last cell when there's no separator. The post-process is a safety net; the system prompt has a parallel rule. |
| 12 | **`<AISuggestionsPanel>` reads `api.ai.suggestions:list`**, not LLM calls. Pure heuristics over already-cached data so the panel runs on every dashboard render without latency or cost. Empty state: scope-aware copy + "Ask AI what's next" + record-specific review CTA. | Latency-free proactive surface; the model never sees the suggestion list — clicking a suggestion fires a fresh chat turn with the suggestion's `intent` pre-filled. |
| 13 | **`<RecentActivityWidget>` filters `entityType === "org"` rows client-side.** The full timeline at `/timeline` legitimately needs the org-bootstrap row; the dashboard's at-a-glance widget doesn't. Filter is widget-only — the underlying `getDashboardStats.recentActivity` query is shared. | Fresh workspaces render the empty-state CTA instead of a single "Created organization X" row. |
| 14 | **Result cards register via `core/ai/components/results/CustomResultRegistry.tsx`** keyed by `display.kind`. `ToolResultRenderer` looks up the registered card and falls through to a generic JSON view if none. | Capabilities that return rich `display: { kind, ... }` envelopes get bespoke cards (entity, list, diff, code-lookup, settings, insight, task) without the orchestrator caring. |

## How frontend talks to the V2 capability layer

1. User types → `<ChatComposer>` → `useAIChat.send(text)` → `messages.sendMessage` mutation.
2. Mutation schedules `ai/processChat:run` (Node action).
3. Action runs `runtime/host.ts:runAgent`, streams text-deltas via `onTextDelta` → `messages.patchAssistantSnapshot`.
4. UI's `useQuery(api.ai.messages.listForConversation)` re-renders.
5. If a capability returns `needs_step_up` → `<StepUpCard>` mounts → user confirms → `aiStepUp.confirmStepUp` → token issued → action re-scheduled with `stepUpToken` → wrapper consumes token, runs the cap → result streams in.

## Linked rules in AGENTS.md / rules.md (NON-NEGOTIABLE)

- `rules.md §3.5` — **AI tools call `*ForAI` internal twins, NEVER public `orgQuery`/`orgMutation`.**
- `rules.md §1.1` — **Side-by-side cleanup.** When a capability replaces V1 code, V1 is deleted in the same edit (S3–S10 followed this verbatim).
- `rules.md §2.6` — `<FirstTimeTour>` for power gestures; never tooltips.
- `rules.md §4.4` — Optimistic update on every list-affecting mutation; never bump `updatedAt` optimistically.

## File map

```
components/
  AssistantTurn.tsx          right-aligned wrapper around ChatMessage
  ChatMessage.tsx            single message bubble (markdown + reasoning + tool results)
  ChatSheet.tsx              the slide-over chat panel
  ChatComposer.tsx           textarea + attach + send + slash commands
  ChatLandingPane.tsx        empty-conversation surface (Today's Pulse, Top 3, recent threads)
  ChatHistoryDropdown.tsx    conversation list trigger
  ChatModelPicker.tsx        BYOK + platform model selector
  ChatContextCard.tsx        page-context badge
  ChatMessageActions.tsx     copy / edit / regenerate row
  StepUpCard.tsx             2FA confirm UX for irreversible caps (post-S10)
  AIMark.tsx                 single Sparkles brand mark
  AISuggestionsPanel.tsx     heuristic proactive suggestions (no LLM)
  composer/
    ChatAttachButton.tsx     paperclip → uses uploadAttachments helper
    SlashCommands.tsx        / commands menu
    Suggestions.tsx          inline suggestion chips
  markdown/
    Markdown.tsx             GFM + Shiki + table normaliser
  reasoning/
    ReasoningPanel.tsx       outer container
    ThinkingTimeline.tsx     timeline of thinking + tool steps
    TimelineRow.tsx          single step (text / tool-call / tool-result)
    ReasoningStepCard.tsx    expandable detail for one step
    parseReasoning.ts        pure parser
    timelineTitles.ts        humane titles for each row type
  code/
    CodeBlock.tsx            Shiki-highlighted code fence
    CopyButton.tsx           shared copy affordance
  results/
    CustomResultRegistry.tsx display.kind → React component
    ToolResultRenderer.tsx   dispatcher
    ToolSummaryCard.tsx      generic summary
    EntityResultCard.tsx     entity card (lead/contact/deal/company/task)
    EntityListResultCard.tsx multi-entity list
    DiffResultCard.tsx       update-entity diff
    NoteResultCard.tsx       note add/update
    SettingsResultCard.tsx   settings change
    InsightResultCard.tsx    analytics insight
    CodeLookupCard.tsx       cap returned a code (e.g. P-007)
    ChatToolError.tsx        friendly error envelope
    TaskResultCard.tsx       task created/updated
hooks/
  useAIChat.ts               chat send + history + active thread + cancel
  usePersistedConversationId.ts  per-org localStorage active-thread persistence
  useChatRouteContext.ts     entity/page/route context for the active page
  useRouteContext.ts         simpler route summary used by some dashboard widgets
  useModelPreference.ts      BYOK vs platform + remembered model
  useAvailableProviders.ts   provider list + 🔑 badge
lib/
  uiPreferences.ts           reasoning-collapsed + thread-density per-user keys
  chatPrefill.ts             send-prefilled-text-to-chat bridge
  uploadAttachments.ts       shared upload pipeline (click + drag)
  aiNextActionsCache.ts      optimistic patch helper for the proactive ribbon
views/
  AINextActionsView.tsx      /ai/next-actions full surface
  AIToolTraceView.tsx        /ai/trace/<conversationId> read-only audit (reads aiToolEvents)
types.ts                     small shared types
```

## Avoids / Never-do

- ❌ Never call `useQuery(api.ai.messages.listForConversation)` from a non-chat surface — it subscribes to a high-churn doc. Use `<AIQuickComposerCard>` (which dropped `useAIChat` exactly to avoid this) or `<ChatLandingPane>`-style read-only previews instead.
- ❌ Never render the V1 `<ChatConfirmation>` or any preview card under `core/ai/components/preview/` — both deleted in S10. Use `<StepUpCard>` for irreversible-cap confirmations.
- ❌ Never put `useAIChat()` return values directly in `useEffect` deps — destructure stable methods (`send`, `cancel`, `isStreaming`) per `rules.md §2.7`.
- ❌ Never skip the auto-send carve-out (locked decision #27). `<AIQuickComposerCard>` Enter MUST send; AI-initiated suggestions MUST stay click-to-act.

## Open work / Pending

Tracked in `PENDING.md` (P0 AI-TOOLING-BUILD-STAGES — S11–S17 stages map to the next chat/autonomous/WhatsApp surfaces). Frontend follow-ups land here when they have an explicit blocker.
