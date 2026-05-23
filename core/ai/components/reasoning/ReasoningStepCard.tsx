"use client";
/**
 * core/ai/components/reasoning/ReasoningStepCard.tsx
 *
 * Single card inside the reasoning panel. Renders a tool call (with
 * status icon) or a thinking paragraph. Compact by default — text wraps,
 * but the parent reasoning panel handles overall scroll.
 *
 * Status icon legend:
 *   spinner — tool call is in flight (status === "in_progress")
 *   ✓       — tool call succeeded
 *   ✗       — tool call failed (red)
 *   💭      — thinking / chain-of-thought paragraph
 */
import { CheckCircle2, Loader2, MessageSquareText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeBlock } from "../code/CodeBlock";
import type { ParsedStep } from "./parseReasoning";

interface Props {
	step: ParsedStep;
}

function prettify(name: string): string {
	return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ReasoningStepCard({ step }: Props) {
	if (step.kind === "thinking") {
		return (
			<div className="flex items-start gap-2 px-2 py-1.5 rounded-[var(--radius)] bg-background/60">
				<MessageSquareText className="size-3.5 mt-0.5 flex-none text-muted-foreground/70" />
				<div className="text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words min-w-0">
					{step.text}
				</div>
			</div>
		);
	}

	const isInProgress = step.status === "in_progress";
	const isError = step.status === "error";

	const Icon = isInProgress ? Loader2 : isError ? XCircle : CheckCircle2;

	return (
		<div
			className={cn(
				"px-2 py-1.5 rounded-[var(--radius)] bg-background/60",
				isError && "ring-1 ring-destructive/20",
			)}
		>
			<div className="flex items-center gap-2">
				<Icon
					className={cn(
						"size-3.5 flex-none",
						isInProgress && "animate-spin text-muted-foreground",
						!isInProgress && !isError && "text-emerald-500",
						isError && "text-destructive",
					)}
				/>
				<span className="font-mono text-[12px] truncate">
					{prettify(step.toolName)}
				</span>
				{isInProgress && (
					<span className="ms-auto text-[10px] uppercase tracking-wide text-muted-foreground">
						running
					</span>
				)}
			</div>
			{isError && step.error && (
				<div className="mt-1.5">
					<CodeBlock
						code={step.error}
						label="error"
						maxHeight={140}
					/>
				</div>
			)}
		</div>
	);
}
