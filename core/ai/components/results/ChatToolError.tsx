"use client";

/**
 * core/ai/components/results/ChatToolError.tsx
 *
 * P1.11 (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`) — multi-tier tool
 * error rendering. Replaces the single flat markdown block we used to
 * show under failed tool calls with a structured envelope:
 *
 *   1. Always-visible rose headline (the `summary`).
 *   2. Optional collapsible "Show details" — the technical context
 *      (`details`).
 *   3. Optional numbered "How to do this manually" fallback so the
 *      user can complete the action without the AI (`manualSteps`).
 *   4. Optional clickable recovery chips that pre-fill the chat
 *      composer with a recovery intent (`recoveryActions`).
 *
 * Backwards compat: when a tool error's output only carries the legacy
 * `friendlyMarkdown` (no structured envelope), TimelineRow / AssistantTurn
 * keep using the markdown renderer. This component is rendered ONLY when
 * a `friendlyError` envelope is present.
 *
 * RTL-safe: all directional spacing uses logical properties (`ms-`,
 * `me-`, `ps-`, `pe-`).
 */

import { AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatToolErrorRecoveryAction = {
	label: string;
	intent: string;
};

export type ChatToolErrorEnvelope = {
	code: string;
	short: string;
	summary: string;
	details?: string;
	manualSteps?: string[];
	recoveryActions?: ChatToolErrorRecoveryAction[];
};

interface ChatToolErrorProps {
	envelope: ChatToolErrorEnvelope;
	/** Optional raw error string for engineers — surfaced under "View raw error". */
	rawError?: string;
	/** Optional callback when a recovery chip is clicked. */
	onRecoveryClick?: (intent: string) => void;
	className?: string;
}

export function ChatToolError({
	envelope,
	rawError,
	onRecoveryClick,
	className,
}: ChatToolErrorProps) {
	const { summary, details, manualSteps, recoveryActions, code } = envelope;
	const hasManualSteps = Array.isArray(manualSteps) && manualSteps.length > 0;
	const hasRecoveryActions = Array.isArray(recoveryActions) && recoveryActions.length > 0;

	return (
		<div
			className={cn(
				"my-2 rounded-[var(--radius)] border border-rose-200 bg-rose-50/50 px-3 py-3 text-sm",
				"dark:border-rose-900/40 dark:bg-rose-950/20",
				className,
			)}
			data-testid="chat-tool-error"
			data-code={code}
		>
			{/* Headline — always visible */}
			<div className="flex items-start gap-2">
				<AlertCircle
					className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400"
					aria-hidden
				/>
				<div className="flex-1">
					<p className="font-medium text-rose-900 dark:text-rose-100">{summary}</p>
				</div>
			</div>

			{/* Optional collapsible details body */}
			{details ? (
				<details className="group mt-2 ms-6">
					<summary className="cursor-pointer list-none text-xs text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100">
						<span className="inline-flex items-center gap-1">
							<ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
							Show details
						</span>
					</summary>
					<div className="mt-2 whitespace-pre-wrap text-xs text-rose-800 dark:text-rose-200/90">
						{details}
					</div>
				</details>
			) : null}

			{/* Optional manual steps — numbered list */}
			{hasManualSteps ? (
				<details className="group mt-2 ms-6">
					<summary className="cursor-pointer list-none text-xs font-medium text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100">
						<span className="inline-flex items-center gap-1">
							<ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
							How to do this manually
						</span>
					</summary>
					<ul className="mt-2 space-y-1 text-xs text-rose-800 dark:text-rose-200/90">
						{manualSteps!.map((step) => (
							<li key={`step-${step}`} className="leading-relaxed">
								{step}
							</li>
						))}
					</ul>
				</details>
			) : null}

			{/* Optional recovery actions — chip row */}
			{hasRecoveryActions ? (
				<div className="mt-2 ms-6 flex flex-wrap gap-1.5">
					{recoveryActions!.map((action) => (
						<Button
							key={`action-${action.intent}`}
							size="sm"
							variant="outline"
							className={cn(
								"h-7 gap-1 rounded-full border-rose-200 bg-white text-xs text-rose-700",
								"hover:bg-rose-100 hover:text-rose-900",
								"dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300",
								"dark:hover:bg-rose-900/40 dark:hover:text-rose-100",
							)}
							onClick={() => onRecoveryClick?.(action.intent)}
						>
							{action.label}
						</Button>
					))}
				</div>
			) : null}

			{/* Raw error — only when we have one and it differs from details */}
			{rawError && rawError !== details ? (
				<details className="group mt-2 ms-6">
					<summary className="cursor-pointer list-none text-[10px] uppercase tracking-wide text-rose-600/70 hover:text-rose-800 dark:text-rose-400/70 dark:hover:text-rose-300">
						<span className="inline-flex items-center gap-1">
							<ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
							View raw error (engineering)
						</span>
					</summary>
					<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-rose-100/60 p-2 text-[10px] text-rose-900 dark:bg-rose-950/40 dark:text-rose-100/80">
						{rawError}
					</pre>
				</details>
			) : null}
		</div>
	);
}
