"use client";
/**
 * core/ai/components/reasoning/ThinkingTimeline.tsx
 *
 * The Claude/ChatGPT-style "Working" dropdown for an assistant turn.
 *
 * Visual layout (matches user spec — see /PHASE-3-AI-AUDIT.md §6 Week 1
 * UX spec 1.5a, refined 2026-05-23):
 *
 *   ✻ Working                                       ▾   ← single header
 *   │                                                   ← rail starts here
 *   ●  Search CRM for "sarah khan"          9 results  ┐
 *   │     ┌────────────────────────────────────────┐  │
 *   │     │ <EntityListResultCard …>               │  │ ← inline rich
 *   │     └────────────────────────────────────────┘  │   block per row
 *   │                                                  │
 *   ●  Activate Fields layer                            │
 *   │                                                   │
 *   ●  List lead fields                       7 fields  │
 *   │                                                   │
 *   ●  Update Sarah Khan                                ┘
 *
 * Each row gets its OWN block — the screenshot's pattern. The assistant
 * message's prose body sits OUTSIDE this dropdown, below it, in the
 * regular Markdown body of the assistant message.
 *
 * Behaviour (1.5a contract, preserved):
 *   - Auto-opens during `thinking` / `calling_tool`.
 *   - Auto-closes the moment the orchestrator transitions into
 *     `streaming` (the model is now writing the answer).
 *   - Sticky after a manual toggle for the rest of the turn.
 *   - On `done`: closed by default, but reopens if the user clicks the
 *     header (so they can review what happened).
 *
 * Body scroll:
 *   - max-h-[60vh]; long lists scroll INSIDE the dropdown.
 *   - Vertical scrollbar hidden via `.reasoning-panel-body` rule in
 *     globals.css (kept the existing class for CSS continuity).
 */
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../../types";
import { parseReasoning } from "./parseReasoning";
import { PendingTimelineRow, ThinkingTimelineRow, TimelineRow } from "./TimelineRow";

export type ThinkingState = "thinking" | "calling_tool" | "streaming" | "done" | "error";

interface Props {
	state: ThinkingState | undefined;
	activeTool?: string | null;
	reasoning?: string | null;
	/** Tool messages that belong to this assistant turn, in arrival order. */
	toolMessages: AIMessage[];
	orgId: string;
}

export function ThinkingTimeline({ state, activeTool, reasoning, toolMessages, orgId }: Props) {
	const effectiveState: ThinkingState = state ?? "done";
	const isLive =
		effectiveState === "thinking" ||
		effectiveState === "calling_tool" ||
		effectiveState === "streaming";
	const isWorking = effectiveState === "thinking" || effectiveState === "calling_tool";

	// Sticky-open semantics — see 1.5a in audit doc.
	const userOverrideRef = useRef(false);
	const prevStateRef = useRef<ThinkingState>(effectiveState);
	const [expanded, setExpanded] = useState(false);

	const handleToggle = () => {
		userOverrideRef.current = true;
		setExpanded((v) => !v);
	};

	useEffect(() => {
		const prev = prevStateRef.current;
		const curr = effectiveState;

		// New turn — reset the override flag so the next turn auto-opens.
		if (
			(prev === "done" || prev === "error") &&
			(curr === "thinking" || curr === "calling_tool")
		) {
			userOverrideRef.current = false;
		}

		if (curr === "thinking" || curr === "calling_tool") {
			if (!userOverrideRef.current) setExpanded(true);
		}
		if (prev !== "streaming" && curr === "streaming") {
			if (!userOverrideRef.current) setExpanded(false);
		}
		if (curr === "done" || curr === "error") {
			if (!userOverrideRef.current) setExpanded(false);
		}

		prevStateRef.current = curr;
	}, [effectiveState]);

	// Build the row list. Tool messages always come first (chronologically
	// the agent calls tools and THEN writes prose), with any free-form
	// "thinking" paragraphs the orchestrator emitted between them inserted
	// at the boundary.
	//
	// We also detect the in-flight tool that's been requested but whose
	// tool-message hasn't materialised yet. That's the brief race where
	// `→ Calling …` is in the reasoning text but no aiMessages doc exists
	// for the call. Rendered as a <PendingTimelineRow>.
	const thinkingSteps = parseReasoning(reasoning, effectiveState, activeTool)
		.filter((s) => s.kind === "thinking")
		.map((s) => (s.kind === "thinking" ? s.text : ""))
		.filter(Boolean);

	const seenToolNames = new Set(
		toolMessages
			.map((m) => (m.toolCalls as Array<{ name: string }> | null | undefined)?.[0]?.name)
			.filter((n): n is string => typeof n === "string"),
	);
	const showPendingPlaceholder =
		effectiveState === "calling_tool" &&
		typeof activeTool === "string" &&
		activeTool.length > 0 &&
		!seenToolNames.has(activeTool);

	const rowCount = toolMessages.length + thinkingSteps.length + (showPendingPlaceholder ? 1 : 0);
	const hasContent = rowCount > 0;

	// Once done with no content (a pure prose answer with no tool calls
	// and no chain-of-thought), render nothing.
	if (effectiveState === "done" && !hasContent) return null;
	if (effectiveState === "error" && !hasContent) return null;

	const headerLabel = (() => {
		if (effectiveState === "thinking") return "Working";
		if (effectiveState === "calling_tool") return "Working";
		if (effectiveState === "streaming") return hasContent ? "Working" : "Writing…";
		if (effectiveState === "error") return "Working · failed";
		return rowCount > 0 ? `Worked for ${rowCount} step${rowCount === 1 ? "" : "s"}` : "Worked";
	})();

	const Caret = expanded ? ChevronDown : ChevronRight;

	return (
		<div className="mb-2 max-w-full min-w-0">
			<button
				type="button"
				onClick={handleToggle}
				disabled={!hasContent && !isLive}
				className={cn(
					"group inline-flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-xs transition-colors",
					"text-muted-foreground hover:text-foreground hover:bg-muted/60",
					"disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
				)}
				aria-expanded={expanded}
				aria-label={expanded ? "Hide working steps" : "Show working steps"}
			>
				<Sparkles
					className={cn(
						"size-3.5 flex-none text-amber-500/80",
						isWorking && "animate-pulse",
					)}
				/>
				<span className="font-medium">{headerLabel}</span>
				<Caret className="size-3 flex-none transition-transform" />
			</button>

			{expanded && hasContent && (
				<div
					className={cn(
						"reasoning-panel-body mt-1.5 w-full max-w-full min-w-0 overflow-x-clip",
						"rounded-[var(--radius)] border border-border/50 bg-muted/20",
					)}
				>
					<div className="max-h-[60vh] overflow-y-auto overflow-x-clip p-3 min-w-0">
						{/* Free-form thinking paragraphs from the model, rendered
						    BEFORE the tool list — they typically describe what
						    the model is about to do. */}
						{thinkingSteps.map((text, i) => (
							<ThinkingTimelineRow
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only reasoning log; items never reorder
								key={`t-${i}`}
								text={text}
							/>
						))}

						{toolMessages.map((tm, i) => (
							<TimelineRow
								key={tm._id}
								toolMessage={tm}
								orgId={orgId}
								isLast={i === toolMessages.length - 1 && !showPendingPlaceholder}
							/>
						))}

						{showPendingPlaceholder && activeTool && (
							<PendingTimelineRow toolName={activeTool} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
