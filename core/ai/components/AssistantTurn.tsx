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
 * Pending two-step confirmations (a tool message with
 * `confirmationState === "pending"`) render INSIDE the timeline as a
 * row that includes the ChatConfirmation card body — so the approve /
 * reject buttons appear directly under the row title where the user is
 * already looking.
 */
import { Bot } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { AIMessage } from "../types";
import { ChatConfirmation } from "./ChatConfirmation";
import { ChatMessageActions } from "./ChatMessageActions";
import { Markdown } from "./markdown/Markdown";
import {
	ThinkingTimeline,
	type ThinkingState,
} from "./reasoning/ThinkingTimeline";

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

export function AssistantTurn({ assistant, tools, orgId, isLast }: Props) {
	const thinkingState = (assistant.thinkingState ?? "done") as ThinkingState;
	const isLive =
		thinkingState === "thinking" ||
		thinkingState === "calling_tool" ||
		thinkingState === "streaming";
	const hasContent =
		typeof assistant.content === "string" && assistant.content.trim().length > 0;
	const wasCancelled = !!assistant.aborted;

	// Pending two-step confirmations are rendered as a separate full card
	// (not inside the timeline) because the approve/reject UI deserves
	// prominence — losing it inside a collapsible would be a footgun.
	const pendingConfirmation = tools.find(
		(t) => (t as { confirmationState?: string }).confirmationState === "pending",
	);

	// Tool messages without a pending confirmation populate the timeline.
	const timelineTools = tools.filter(
		(t) => (t as { confirmationState?: string }).confirmationState !== "pending",
	);

	return (
		<div className="group flex flex-col gap-1.5 px-4 py-2">
			{/* Header row: avatar + author + model */}
			<div className="flex items-center gap-2">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<Bot className="size-3.5 text-primary" />
				</div>
				<span className="text-xs font-semibold">AI Assistant</span>
				{assistant.model && !isLive && (
					<span className="text-[10px] text-muted-foreground/70">
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

			<div className="ms-9 min-w-0">
				{/* Thinking timeline (single working dropdown w/ rail) */}
				<ThinkingTimeline
					state={thinkingState}
					activeTool={assistant.activeTool ?? null}
					reasoning={assistant.reasoning ?? null}
					toolMessages={timelineTools}
					orgId={orgId}
				/>

				{/* Pending confirmation — full card outside the timeline. */}
				{pendingConfirmation && (
					<div className="mb-2">
						<ChatConfirmation
							message={pendingConfirmation}
							orgId={orgId as unknown as Id<"orgs">}
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
				) : pendingConfirmation ? (
					// While a confirmation is pending the assistant body is
					// expected to be empty — render nothing rather than the
					// "Empty message" placeholder.
					null
				) : (
					<span className="text-muted-foreground italic text-xs">Empty message</span>
				)}

				{/* Footer: actions on the LEFT (hover), timestamp on the RIGHT (always) */}
				{!isLive && hasContent && (
					<div className="mt-1 flex items-center justify-between gap-2">
						<ChatMessageActions
							message={assistant}
							orgId={orgId}
							isLast={isLast}
						/>
						<TimestampLabel ts={assistant.createdAt} />
					</div>
				)}
			</div>
		</div>
	);
}
