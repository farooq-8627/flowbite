"use client";
/**
 * core/ai/components/reasoning/ReasoningPanel.tsx
 *
 * Single dropdown rendered above the assistant's streamed text. Inside,
 * a vertical list of compact cards reports tool calls + thinking chunks
 * in chronological order.
 *
 * Spec source: PHASE-3-AI-AUDIT.md §6 Week 1 detailed UX spec for 1.5a.
 *
 * State machine (driven by `aiMessages.thinkingState` from the
 * orchestrator):
 *
 *   thinking      → header "Thinking…" + spinner. Default open.
 *   calling_tool  → header "Calling `<tool>`…". Stays open.
 *   streaming     → AUTO-COLLAPSE the moment we transition INTO this
 *                   state — UNLESS the user pinned the panel open
 *                   manually during this turn.
 *   done          → header "Reasoning · N steps". Default closed.
 *   error         → header "Reasoning · failed". Default closed.
 *
 * Sticky-open rule. The auto-close on `streaming` only fires when the
 * user has not toggled the panel during the current turn. Once they
 * click open or click closed, that user choice wins for the rest of
 * the turn. The `userOverrideRef` flag resets each time a NEW turn
 * begins (state goes from `done`/`error` back into `thinking`).
 *
 * Compact body with internal scroll. The panel never grows past
 * `max-h-[60vh]`. Long reasoning content scrolls inside the panel —
 * never pushes the surrounding message taller. The vertical scrollbar
 * is hidden visually (`scrollbar-y-hidden`), so the panel reads as a
 * compact card.
 */
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseReasoning } from "./parseReasoning";
import { ReasoningStepCard } from "./ReasoningStepCard";

export type ThinkingState = "thinking" | "calling_tool" | "streaming" | "done" | "error";

interface Props {
	state: ThinkingState | undefined;
	activeTool?: string | null;
	reasoning?: string | null;
}

function prettifyToolName(name: string): string {
	return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ReasoningPanel({ state, activeTool, reasoning }: Props) {
	// Treat undefined as "done" — pre-Phase-3B messages had no thinkingState.
	const effectiveState: ThinkingState = state ?? "done";

	const isLive =
		effectiveState === "thinking" ||
		effectiveState === "calling_tool" ||
		effectiveState === "streaming";
	const isWorking = effectiveState === "thinking" || effectiveState === "calling_tool";

	// User-controlled flag. Starts false on each new live turn and flips to
	// true the first time the user clicks the toggle. Once true, automatic
	// open/close decisions stop firing and the user's manual choice wins.
	const userOverrideRef = useRef(false);

	// `prevStateRef` is used to detect transitions (e.g. calling_tool →
	// streaming triggers auto-collapse).
	const prevStateRef = useRef<ThinkingState>(effectiveState);

	const [expanded, setExpanded] = useState<boolean>(false);

	// Manual toggle — also flags userOverride so future auto-decisions
	// respect this choice.
	const handleToggle = () => {
		userOverrideRef.current = true;
		setExpanded((v) => !v);
	};

	useEffect(() => {
		const prev = prevStateRef.current;
		const curr = effectiveState;

		// Reset override at the start of a fresh turn — i.e. when we leave
		// a terminal state and re-enter a working state.
		if (
			(prev === "done" || prev === "error") &&
			(curr === "thinking" || curr === "calling_tool")
		) {
			userOverrideRef.current = false;
		}

		// Auto-open when work starts, unless the user has overridden.
		if (curr === "thinking" || curr === "calling_tool") {
			if (!userOverrideRef.current) setExpanded(true);
		}

		// Auto-close on transition into streaming. The model is now
		// answering — collapse so the user can read the response. Sticky
		// rule honoured.
		if (prev !== "streaming" && curr === "streaming") {
			if (!userOverrideRef.current) setExpanded(false);
		}

		// Auto-close on terminal states. Same sticky rule — if the user
		// pinned the panel open we leave it open.
		if (curr === "done" || curr === "error") {
			if (!userOverrideRef.current) setExpanded(false);
		}

		prevStateRef.current = curr;
	}, [effectiveState]);

	const steps = parseReasoning(reasoning, effectiveState, activeTool);
	const stepCount = steps.length;
	const hasContent = stepCount > 0;

	// Once the message is fully done with no reasoning to show, render
	// nothing. Same for error with no body.
	if (effectiveState === "done" && !hasContent) return null;
	if (effectiveState === "error" && !hasContent) return null;

	// Header label
	const label = (() => {
		switch (effectiveState) {
			case "thinking":
				return "Thinking…";
			case "calling_tool":
				return activeTool
					? `Calling \`${prettifyToolName(activeTool)}\`…`
					: "Calling tool…";
			case "streaming":
				return hasContent ? "Reasoning" : "Writing response…";
			case "error":
				return "Reasoning · failed";
			case "done":
				return stepCount > 0
					? `Reasoning · ${stepCount} step${stepCount === 1 ? "" : "s"}`
					: "Reasoning";
		}
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
					isWorking && "animate-pulse",
				)}
				aria-expanded={expanded}
				aria-label={expanded ? "Hide reasoning" : "Show reasoning"}
			>
				{isWorking ? (
					<Loader2 className="size-3 animate-spin flex-none" />
				) : (
					<Caret className="size-3 flex-none transition-transform" />
				)}
				<span className="font-medium">
					{label.split(/(`[^`]+`)/g).map((part, i) => {
						const partKey = `${i}-${part}`;
						return part.startsWith("`") && part.endsWith("`") ? (
							<code
								key={partKey}
								className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
							>
								{part.slice(1, -1)}
							</code>
						) : (
							<span key={partKey}>{part}</span>
						);
					})}
				</span>
			</button>

			{expanded && hasContent && (
				<div
					className={cn(
						"reasoning-panel-body mt-1 ms-4 max-w-full min-w-0 rounded-[var(--radius)] border border-border/50 bg-muted/30",
						"text-[12px] leading-relaxed",
					)}
				>
					<div className="max-h-[60vh] overflow-y-auto p-2 flex flex-col gap-1.5">
						{steps.map((step, i) => (
							<ReasoningStepCard
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only reasoning log; items never reorder
								key={`${step.kind}-${i}`}
								step={step}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
