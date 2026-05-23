"use client";
/**
 * core/ai/components/composer/Suggestions.tsx
 *
 * Sprint 5 — clickable follow-up prompt chips rendered above the
 * composer. Reads `suggestions[]` from the latest assistant message;
 * clicking a chip fires `sendMessage(suggestion)` so the model
 * continues with that prompt as the next user turn.
 *
 * Display rules:
 *   - Render up to 3 chips.
 *   - Hide when the chat is mid-stream (`disabled`) — chips become
 *     stale fast while the model is still working.
 *   - Hide when no suggestions are present (most common case for
 *     legacy messages that pre-date the field).
 */

import { Sparkles } from "lucide-react";

interface Props {
	suggestions: readonly string[] | undefined;
	disabled?: boolean;
	onPick: (text: string) => void;
}

export function Suggestions({ suggestions, disabled, onPick }: Props) {
	if (disabled) return null;
	if (!suggestions || suggestions.length === 0) return null;

	const visible = suggestions.slice(0, 3);

	return (
		<div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pt-2">
			<Sparkles className="size-3 shrink-0 text-muted-foreground" />
			{visible.map((s) => (
				<button
					key={s}
					type="button"
					onClick={() => onPick(s)}
					className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/90 hover:border-ring/40 hover:bg-muted/40 transition-colors"
				>
					{s}
				</button>
			))}
		</div>
	);
}
