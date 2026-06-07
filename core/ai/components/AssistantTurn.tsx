"use client";
/**
 * core/ai/components/AssistantTurn.tsx
 *
 * One assistant turn = ONE assistant message + every tool message that
 * belongs to it. Rendered as:
 *
 *   ┌ avatar ┐  AI Assistant · model
 *   │   🤖   │
 *   └────────┘
 *   ✻ Working                                     ▾   ← single dropdown
 *   │ ●  Search CRM for "x"                              with all tool
 *   │ ●  List lead fields                                rows + their
 *   │ ●  Update Sarah Khan                               inline blocks
 *
 *   <Markdown body — the actual answer streamed by the model>
 *
 *   [📋][🔄]                                  3 min ago
 *
 * S10: when an irreversible AI capability returns `status: "needs_step_up"`
 * the wrapper's envelope arrives as a tool message; we surface a
 * `<StepUpCard>` directly above the assistant prose so the user can
 * confirm twice and re-run the action with a 2FA token. The legacy V1
 * propose/commit `<ChatConfirmation>` was deleted in S10 — this file
 * is the only confirmation surface for V2 chat.
 */
import type { Doc } from "@/convex/_generated/dataModel";
import type { AIMessage } from "../types";
import { AIMark } from "./AIMark";
import { ChatMessageActions } from "./ChatMessageActions";
import { Markdown } from "./markdown/Markdown";
import { type ThinkingState, ThinkingTimeline } from "./reasoning/ThinkingTimeline";
import { type Citation, SourcesRail } from "./SourcesRail";
import { StepUpCard } from "./StepUpCard";

interface Props {
	assistant: AIMessage;
	tools: AIMessage[];
	orgId: string;
	isLast: boolean;
}

function TimestampLabel({ ts }: { ts: number }) {
	const d = new Date(ts);
	const formatted = d.toLocaleString(undefined, {
		hour: "numeric",
		minute: "2-digit",
		month: "short",
		day: "numeric",
	});
	return (
		<span className="text-[10px] text-muted-foreground/70 shrink-0" title={d.toISOString()}>
			{formatted}
		</span>
	);
}

/**
 * Walk the turn's grouped `role:"tool"` rows and pull out the FIRST
 * step-up envelope, if any. The envelope is the one the V2 wrapper
 * returned when an irreversible capability fired without a token.
 *
 * IMPORTANT: tool calls are persisted as SEPARATE `role:"tool"`
 * `aiMessages` rows (see `convex/ai/messages.ts:appendToolCallRecord`),
 * each carrying `toolCalls: [{ id, name, input, output, status }]`.
 * The assistant row itself NEVER carries `toolCalls`, so we must scan
 * the grouped `tools` array — not `assistant.toolCalls` (the historical
 * bug that meant the `<StepUpCard>` never rendered and the envelope
 * leaked into the timeline as a red "needs step-up" error instead).
 *
 * We trust the per-call `output.status` shape produced by
 * `runCapability` — anything else is ignored. The last matching tool
 * row wins so a turn that ran several tools surfaces the step-up that
 * actually blocked it.
 */
function findStepUpRequest(tools: AIMessage[]): {
	capability: string;
	args: Record<string, unknown>;
	headline: string;
} | null {
	let match: { capability: string; args: Record<string, unknown>; headline: string } | null =
		null;
	for (const toolMsg of tools) {
		const toolCalls = (toolMsg as { toolCalls?: unknown }).toolCalls;
		if (!Array.isArray(toolCalls)) continue;
		for (const call of toolCalls) {
			if (!call || typeof call !== "object") continue;
			const c = call as { name?: unknown; input?: unknown; output?: unknown };
			const out = c.output;
			if (!out || typeof out !== "object") continue;
			const status = (out as { status?: unknown }).status;
			if (status !== "needs_step_up") continue;
			const headline =
				typeof (out as { headline?: unknown }).headline === "string"
					? (out as { headline: string }).headline
					: "Confirm to proceed.";
			const name = typeof c.name === "string" ? c.name : "";
			const argsObj =
				c.input && typeof c.input === "object" ? (c.input as Record<string, unknown>) : {};
			if (!name) continue;
			match = { capability: name, args: argsObj, headline };
		}
	}
	return match;
}

/**
 * B.44 — extract grounding citations the host wrote into
 * `aiMessages.metadata.citations`. Older messages (pre-B.44) lack the
 * field entirely, in which case we return an empty array and the
 * `<SourcesRail>` renders nothing. Defensive shape-checks because the
 * field is `v.optional(v.any())` and we never want a malformed value
 * to crash the chat UI.
 */
function extractCitations(assistant: Doc<"aiMessages">): Citation[] {
	const meta = (assistant as { metadata?: unknown }).metadata;
	if (!meta || typeof meta !== "object") return [];
	const raw = (meta as { citations?: unknown }).citations;
	if (!Array.isArray(raw)) return [];
	const out: Citation[] = [];
	for (const c of raw) {
		if (!c || typeof c !== "object") continue;
		const url = (c as { url?: unknown }).url;
		if (typeof url !== "string" || url.length === 0) continue;
		const title = (c as { title?: unknown }).title;
		const snippet = (c as { snippet?: unknown }).snippet;
		const source = (c as { source?: unknown }).source;
		const sourceTag: Citation["source"] =
			source === "anthropic" || source === "openai" || source === "google"
				? source
				: "firecrawl";
		out.push({
			url,
			...(typeof title === "string" && title.length > 0 ? { title } : {}),
			...(typeof snippet === "string" && snippet.length > 0 ? { snippet } : {}),
			source: sourceTag,
		});
	}
	return out;
}

export function AssistantTurn({ assistant, tools, orgId, isLast }: Props) {
	const thinkingState = (assistant.thinkingState ?? "done") as ThinkingState;
	const isLive =
		thinkingState === "thinking" ||
		thinkingState === "calling_tool" ||
		thinkingState === "streaming";
	const hasContent = typeof assistant.content === "string" && assistant.content.trim().length > 0;
	const wasCancelled = !!assistant.aborted;

	// S10 — surface the 2FA confirm card when the LATEST turn carried a
	// `needs_step_up` envelope on one of its grouped `role:"tool"` rows.
	// Guarded to `isLast` so a historical (already-superseded) step-up
	// turn never shows a stale duplicate "Confirm" card — once the user
	// confirms (or sends any new message) this turn stops being last and
	// the card disappears on its own.
	const stepUpRequest = !isLive && isLast ? findStepUpRequest(tools) : null;
	// B.44 — citations live on `assistant.metadata.citations`. Compute once
	// per render; cheap (small array, defensive shape checks). When the
	// list is empty, `<SourcesRail>` renders nothing.
	const citations = !isLive ? extractCitations(assistant) : [];

	// B.42 follow-up — the model occasionally settles a turn with tool
	// calls but emits no prose. Before this fix the user saw a flat
	// "Empty message" with no hint that work happened; now we surface a
	// concise "AI ran N action(s) — see steps above" recap and the
	// timeline auto-expands to show the rail. The turn is treated as
	// "complete via tools" rather than "broken".
	const settledNoContent = !isLive && !hasContent;
	const ranToolCount = tools.length;
	const showToolOnlyRecap = settledNoContent && ranToolCount > 0 && !stepUpRequest;
	// True empty (no tool calls + no content + not a step-up + not an
	// error) — keep the legacy "Empty message" placeholder so we still
	// flag genuinely-broken turns (e.g. provider returned no output).
	// When `thinkingState === "error"` AND the content carries the
	// error string (per the schema comment in `convex/schema/ai.ts`),
	// `hasContent` is true and the markdown branch handles it; this
	// branch only fires for the rare null-output edge case.
	const showTrueEmpty =
		settledNoContent && ranToolCount === 0 && !stepUpRequest && thinkingState !== "error";

	return (
		<div className="group flex flex-col gap-1.5 px-3 py-2 items-end min-w-0">
			{/* Header row: avatar + author + model — right-aligned to match
			    the assistant bubble. The avatar moves to the END (right in
			    LTR / left in RTL — `flex-row-reverse` handles both). */}
			<div className="flex flex-row-reverse items-center gap-2 min-w-0">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<AIMark size="size-3.5" tone="brand" aria-hidden="true" />
				</div>
				<span className="text-xs font-semibold">AI Assistant</span>
				{assistant.model && !isLive && (
					<span className="text-[10px] text-muted-foreground/70 truncate">
						· {assistant.model}
						{assistant.usageMode === "byok" ? " · 🔑" : ""}
					</span>
				)}
				{wasCancelled && (
					<span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
						· cancelled
					</span>
				)}
			</div>

			{/* Body — fills the entire message column (after the parent's
			    `px-3` outer padding). Width-clamped via `w-full min-w-0`
			    (the ScrollArea viewport fix in globals.css ensures the
			    parent column can't grow past the panel). */}
			<div className="w-full min-w-0">
				{/* Thinking timeline (single working dropdown w/ rail) */}
				<ThinkingTimeline
					state={thinkingState}
					activeTool={assistant.activeTool ?? null}
					reasoning={assistant.reasoning ?? null}
					toolMessages={tools}
					orgId={orgId}
				/>

				{/* A — V1-style inline approval (locked 2026-06-06). The
				    step-up card mounts INLINE between the timeline rail
				    and any markdown prose so the user sees the awaiting
				    tool row → approval card → (no further prose because
				    the awaitingApprovalStop killed the model's "Shall I
				    proceed?" generation) in one continuous bubble. After
				    Confirm twice, processChat.runResume continues the
				    stream into the SAME assistant message, appending
				    further tool rows + the final summary. */}
				{stepUpRequest && assistant.conversationId && (
					<div className="mt-2">
						<StepUpCard
							orgId={orgId}
							conversationId={assistant.conversationId as unknown as string}
							assistantMessageId={assistant._id as unknown as string}
							capability={stepUpRequest.capability}
							args={stepUpRequest.args}
							headline={stepUpRequest.headline}
						/>
					</div>
				)}

				{/* The assistant's prose body — the actual answer. */}
				{hasContent ? (
					<Markdown source={assistant.content} isStreaming={isLive} />
				) : isLive ? (
					<span className="text-muted-foreground italic text-xs">
						Preparing response…
					</span>
				) : stepUpRequest ? null : showToolOnlyRecap ? (
					<p className="text-muted-foreground text-xs leading-relaxed">
						AI completed {ranToolCount} action{ranToolCount === 1 ? "" : "s"} — see the
						steps above for what ran.
					</p>
				) : thinkingState === "error" ? (
					<p className="text-rose-600 dark:text-rose-400 text-xs leading-relaxed">
						The assistant ran into an error and didn't return a response. Try sending
						the message again.
					</p>
				) : showTrueEmpty ? (
					<p className="text-muted-foreground italic text-xs">
						No response from the model. Try sending the message again.
					</p>
				) : null}

				{/* B.44 — Sources rail. Renders only on settled assistant turns
				    that actually have citations; everything else (CRM-only
				    turns, live streaming, step-up cards) sees nothing. */}
				{!isLive && hasContent && citations.length > 0 && (
					<SourcesRail citations={citations} />
				)}

				{/* Footer: actions on the LEFT (hover), timestamp on the RIGHT (always) */}
				{!isLive && hasContent && (
					<div className="mt-1 flex items-center justify-between gap-2">
						<ChatMessageActions message={assistant} orgId={orgId} isLast={isLast} />
						<TimestampLabel ts={assistant.createdAt} />
					</div>
				)}
			</div>
		</div>
	);
}
