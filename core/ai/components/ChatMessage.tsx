"use client";
/**
 * core/ai/components/ChatMessage.tsx
 *
 * Renders a single chat message. Layout matches Claude / ChatGPT, vertical:
 *
 *   ┌ avatar ┐  Author Name · model
 *   │   🤖   │
 *   └────────┘
 *   ┌─────────────────────────────────────────────────┐
 *   │ ▶ Thinking… (collapsible)                       │
 *   │                                                 │
 *   │  Full-width markdown body.                      │
 *   └─────────────────────────────────────────────────┘
 *   [📋][🔄]                                  3 min ago   ← actions left, time right
 *
 * Key invariants:
 *   - Actions are icons-only; revealed on `.group` hover.
 *   - Timestamp is on the right and ALWAYS visible (not a hover-only thing).
 *   - Vertical spacing is tight: py-2 instead of py-4 between turns so
 *     conversations feel dense like Claude / ChatGPT.
 *   - Tool messages and confirmation cards keep their compact rendering.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { Bot, CheckCircle2, User, WrenchIcon, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../types";
import { ChatConfirmation } from "./ChatConfirmation";
import { ChatMessageActions } from "./ChatMessageActions";
import { Markdown } from "./markdown/Markdown";
import { ReasoningPanel, type ThinkingState } from "./reasoning/ReasoningPanel";
import { type ToolDisplay, ToolResultRenderer } from "./results/ToolResultRenderer";

interface ChatMessageProps {
	message: AIMessage;
	orgId: string;
	isLast?: boolean;
}

export function ChatMessage({ message, orgId, isLast }: ChatMessageProps) {
	const isAssistant = message.role === "assistant";
	const isTool = message.role === "tool";

	if (isTool && message.confirmationState === "pending") {
		return <ChatConfirmation message={message} orgId={orgId} />;
	}

	if (isTool) {
		const toolCalls = message.toolCalls as Array<{
			name: string;
			status: string;
			output?: unknown;
		}> | null;
		if (!toolCalls?.length) return null;
		const tc = toolCalls[0];

		// Sprint 3: When the tool's output carries a structured `display`
		// payload, render the matching live component (entity card, list,
		// diff, note, reminder, etc.) BELOW the 1-line tool summary. This
		// is the doctrine — the chat is a live view into the data, not a
		// recap of what the tool did in prose.
		const display = extractToolDisplay(tc.output);
		const hasRichDisplay =
			display !== undefined && (typeof display !== "string" || display.length > 0);
		const hasStructuredKind =
			typeof display === "object" &&
			display !== null &&
			(display as ToolDisplay).kind !== "text";

		return (
			<div className="flex flex-col gap-1.5 px-3 py-1">
				{/* Tool summary header — always visible so the user can
				    see WHICH tool ran. Kept compact (single row). */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<WrenchIcon className="size-3 flex-none" />
					<span className="truncate">
						{tc.status === "completed" ? (
							<CheckCircle2 className="inline size-3 text-emerald-500 me-1" />
						) : tc.status === "failed" ? (
							<XCircle className="inline size-3 text-rose-500 me-1" />
						) : null}
						{tc.name.replace(/_/g, " ")}
					</span>
				</div>

				{/* Tool result — rendered as a live component when the
				    tool emitted a structured display payload. The
				    Markdown branch covers tools that haven't migrated
				    yet (and tools whose result is genuinely text). */}
				{hasRichDisplay && hasStructuredKind && (
					<div className="ms-5">
						<ToolResultRenderer display={display as ToolDisplay} orgId={orgId} />
					</div>
				)}
			</div>
		);
	}

	if (isAssistant) {
		return <AssistantMessage message={message} orgId={orgId} isLast={isLast ?? false} />;
	}

	return <UserMessage message={message} orgId={orgId} isLast={isLast ?? false} />;
}

// ─── Assistant message ────────────────────────────────────────────────────────

function AssistantMessage({
	message,
	orgId,
	isLast,
}: {
	message: AIMessage;
	orgId: string;
	isLast: boolean;
}) {
	const thinkingState = (message.thinkingState ?? "done") as ThinkingState;
	const isLive =
		thinkingState === "thinking" ||
		thinkingState === "calling_tool" ||
		thinkingState === "streaming";
	const hasContent = !!message.content && message.content.trim().length > 0;
	const wasCancelled = !!message.aborted;

	return (
		<div className="group flex flex-col gap-1.5 px-3 py-2 items-end min-w-0">
			{/* Header row: avatar + author + model — right-aligned to match
			    the assistant bubble (see AssistantTurn for the canonical
			    layout — this branch is only hit for orphan / legacy
			    assistant messages without grouped tool messages). */}
			<div className="flex flex-row-reverse items-center gap-2 min-w-0">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<Bot className="size-3.5 text-primary" />
				</div>
				<span className="text-xs font-semibold">AI Assistant</span>
				{message.model && !isLive && (
					<span className="text-[10px] text-muted-foreground/70 truncate">
						· {message.model}
						{message.usageMode === "byok" ? " · 🔑" : ""}
					</span>
				)}
				{wasCancelled && (
					<span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
						· cancelled
					</span>
				)}
			</div>

			{/* Body */}
			<div className="w-full min-w-0">
				<ReasoningPanel
					state={thinkingState}
					activeTool={message.activeTool ?? null}
					reasoning={message.reasoning ?? null}
				/>

				{hasContent ? (
					<Markdown source={message.content} isStreaming={isLive} />
				) : isLive ? (
					<span className="text-muted-foreground italic text-xs">
						Preparing response…
					</span>
				) : (
					<span className="text-muted-foreground italic text-xs">Empty message</span>
				)}

				{/* Footer: actions on the LEFT (hover), timestamp on the RIGHT (always) */}
				{!isLive && hasContent && (
					<div className="mt-1 flex items-center justify-between gap-2">
						<ChatMessageActions message={message} orgId={orgId} isLast={isLast} />
						<TimestampLabel ts={message.createdAt} />
					</div>
				)}
			</div>
		</div>
	);
}

// ─── User message ─────────────────────────────────────────────────────────────

function UserMessage({
	message,
	orgId,
	isLast,
}: {
	message: AIMessage;
	orgId: string;
	isLast: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(message.content);
	const [busy, setBusy] = useState(false);
	const editAndResend = useMutation(anyApi.ai.messages.editAndResend);
	const editTextareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (editing) {
			const el = editTextareaRef.current;
			if (el) {
				el.focus();
				const len = el.value.length;
				el.setSelectionRange(len, len);
			}
		}
	}, [editing]);

	async function handleSave() {
		const trimmed = draft.trim();
		if (!trimmed || trimmed === message.content) {
			setEditing(false);
			return;
		}
		setBusy(true);
		try {
			await editAndResend({
				orgId: orgId as Id<"orgs">,
				messageId: message._id,
				body: trimmed,
			});
			setEditing(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't update message.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="group flex flex-col gap-1.5 px-3 py-2 items-start min-w-0">
			{/* Header row */}
			<div className="flex items-center gap-2 min-w-0">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
					<User className="size-3.5 text-muted-foreground" />
				</div>
				<span className="text-xs font-semibold">You</span>
			</div>

			{/* Body — fills the entire user-message column (after the
			    parent's `px-3` outer padding). The bubble shrinks-to-
			    content; alignment comes from the parent's `items-start`. */}
			<div className="w-full min-w-0">
				{editing ? (
					<div className="flex w-full min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-input bg-background px-3 py-2.5 shadow-xs">
						<textarea
							ref={editTextareaRef}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							rows={Math.min(6, draft.split("\n").length + 1)}
							className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
						/>
						<div className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setEditing(false);
									setDraft(message.content);
								}}
								disabled={busy}
								className="h-7 text-[11px]"
							>
								<X className="size-3" />
								Cancel
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={handleSave}
								disabled={busy || draft.trim().length === 0}
								className="h-7 text-[11px]"
							>
								{busy ? "Saving…" : "Save & re-send"}
							</Button>
						</div>
					</div>
				) : (
					<div
						className={cn(
							"max-w-full min-w-0 rounded-[var(--radius)] bg-muted/60 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
						)}
					>
						{message.content || (
							<span className="italic text-muted-foreground text-xs">
								Empty message
							</span>
						)}
					</div>
				)}

				{!editing && (
					<div className="mt-1 flex items-center justify-between gap-2">
						<ChatMessageActions
							message={message}
							orgId={orgId}
							isLast={isLast}
							onEdit={() => {
								setDraft(message.content);
								setEditing(true);
							}}
						/>
						<TimestampLabel ts={message.createdAt} />
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

/**
 * Right-aligned, always-visible timestamp label. Renders as a relative
 * label ("just now", "3 min ago", "2 h ago") and falls back to the local
 * time of day after 24 h. The full ISO timestamp is exposed via `title=`
 * so power users can hover for the exact value.
 */
function TimestampLabel({ ts }: { ts: number }) {
	const [now, setNow] = useState(() => Date.now());

	// Tick every 30 s so "3 min ago" stays accurate without hammering renders.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const label = formatRelative(ts, now);
	const iso = new Date(ts).toLocaleString();
	return (
		<time
			dateTime={new Date(ts).toISOString()}
			title={iso}
			className="text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap"
		>
			{label}
		</time>
	);
}

function formatRelative(ts: number, now: number): string {
	const diffMs = now - ts;
	const sec = Math.max(0, Math.floor(diffMs / 1000));
	if (sec < 10) return "just now";
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} min ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} h ago`;
	// Older than 24h — show local time of day.
	return new Date(ts).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

// ─── Tool-result display extraction ──────────────────────────────────────────

/**
 * Pull the `display` payload off an arbitrary tool-result object.
 *
 * A successful tool returns `{ ok: true, data, display? }`. A failed tool
 * returns `{ ok: false, error }`. We surface the display only when the
 * tool succeeded — failures get the 1-line tool summary already shown by
 * `ChatMessage` and don't need a card below them.
 *
 * Returns `string` for legacy text-only tools, the structured ToolDisplay
 * for migrated tools, or `undefined` when there's nothing to render.
 */
function extractToolDisplay(output: unknown): ToolDisplay | string | undefined {
	if (!output || typeof output !== "object") return undefined;
	const obj = output as Record<string, unknown>;
	// Failed tools — `{ ok: false }` — don't render a card.
	if (obj.ok === false) return undefined;
	const display = obj.display;
	if (display === undefined || display === null) return undefined;
	if (typeof display === "string") return display;
	if (typeof display === "object" && display !== null && "kind" in (display as object)) {
		return display as ToolDisplay;
	}
	return undefined;
}
