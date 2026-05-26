"use client";

/**
 * AIQuickComposerCard — Stage 5 (SPRINT-PLAN.md / DASHBOARD-AUDIT.md §4 D4).
 *
 * Pinned mini chat composer at the top of the dashboard. Drops the
 * typed prompt into the AI chat panel with a single click — no need to
 * open the side sheet first.
 *
 * Pattern
 * ───────
 *   - Self-contained textarea + send button. No Convex `useQuery`
 *     inside the card itself (per AGENTS.md performance rule —
 *     identity / membership data lives in OrgProvider context, not in
 *     per-card subscriptions).
 *   - On submit:
 *       1. `openChatPanel()` — fires `flowbite:ai-chat-open` so the
 *          DashboardLayoutClient slides the sheet in (idempotent if
 *          already open).
 *       2. `sendChatPrefill(intent)` — fires `flowbite:ai-chat-prefill`
 *          so the panel's `<ChatComposer>` receives the text + focuses
 *          the textarea ready to send. The user reviews + presses
 *          Enter.
 *   - We don't auto-send. The senior-CRM-specialist bar (per
 *     AI-AGENT-CAPABILITY-AUDIT.md) is "the user is in control" — the
 *     pulse ribbon is for proactive AI suggestions; this card is for
 *     user-initiated asks. Forcing an auto-send would surprise users
 *     who hit Enter accidentally on the dashboard.
 *
 * RTL-safe Tailwind only (`ms-`, `me-`, `ps-`, `pe-`). Border radius
 * via `var(--radius)`. App strings via `APP_CONFIG`.
 */

import { ArrowUp, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app-config";
import { openChatPanel, sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 120;

interface AIQuickComposerCardProps {
	/** Optional className for the root card; useful when the parent
	 * needs to constrain the width inside a grid cell. */
	className?: string;
}

const SUGGESTED_INTENTS = [
	"Summarise what changed in my workspace today",
	"Which leads should I follow up with first?",
	"Draft a follow-up note for my hottest deal",
];

export function AIQuickComposerCard({ className }: AIQuickComposerCardProps) {
	const [draft, setDraft] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const submit = useCallback((intent: string) => {
		const trimmed = intent.trim();
		if (trimmed.length === 0) return;
		// Open the chat panel first so the prefill listener (which
		// runs inside the panel-mounted ChatComposer) is registered
		// when the prefill event fires. The two events are dispatched
		// on the same tick — the openChatPanel listener flips state
		// synchronously so the panel mounts before the prefill arrives.
		openChatPanel();
		// Defer the prefill to the next microtask so the chat panel
		// has time to mount + register its listener before the event
		// fires. Without this, a fresh-mount scenario loses the prefill.
		queueMicrotask(() => sendChatPrefill(trimmed));
		setDraft("");
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
		}
	}, []);

	const handleSubmit = useCallback(() => {
		submit(draft);
	}, [draft, submit]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDraft(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
	};

	const canSend = draft.trim().length > 0;

	return (
		<section
			aria-label={`Ask ${APP_CONFIG.name} AI`}
			className={cn(
				"flex flex-col gap-3 rounded-[var(--radius)] border bg-card p-4 shadow-xs",
				className,
			)}
		>
			<header className="flex items-center gap-2">
				<span
					aria-hidden
					className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
				>
					<Sparkles className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold leading-tight">
						Ask {APP_CONFIG.name} AI
					</h3>
					<p className="text-xs text-muted-foreground">
						Type anything — we’ll pop the chat open with your prompt.
					</p>
				</div>
			</header>

			<div className="flex flex-col gap-2 rounded-[var(--radius)] border border-input bg-background px-3 py-2.5 transition-colors focus-within:border-ring">
				<textarea
					ref={textareaRef}
					value={draft}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					rows={1}
					placeholder="e.g. Schedule a follow-up with the Acme deal next Tuesday"
					className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
					style={{ minHeight: 24, maxHeight: MAX_HEIGHT_PX }}
				/>
				<div className="flex items-center justify-between gap-2">
					<span className="text-[11px] text-muted-foreground">
						Enter to send · Shift + Enter for newline
					</span>
					<Button
						size="icon"
						className="size-8 shrink-0 rounded-full"
						onClick={handleSubmit}
						disabled={!canSend}
						aria-label={`Send to ${APP_CONFIG.name} AI`}
					>
						<ArrowUp className="size-4" />
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{SUGGESTED_INTENTS.map((intent) => (
					<button
						key={intent}
						type="button"
						className="rounded-[var(--radius)] border border-dashed bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
						onClick={() => submit(intent)}
					>
						{intent}
					</button>
				))}
			</div>
		</section>
	);
}
