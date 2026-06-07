"use client";
/**
 * <StepUpCard> — S10 2FA confirm-twice surface.
 *
 * Rendered in `<AssistantTurn>` when the most recent assistant turn
 * carried a tool result whose envelope reports `status === "needs_step_up"`.
 *
 * Two-click contract: the first click flips the button into a "Click again
 * to confirm" state; the second click calls `aiStepUp.confirmStepUp`,
 * which issues a single-use token, appends a synthetic user message, and
 * re-runs the agent with the token attached. The wrapper consumes the
 * token before re-running the irreversible capability.
 *
 * The UI never sees the token — server-only.
 */

import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Props {
	orgId: string;
	conversationId: string;
	assistantMessageId: string;
	capability: string;
	args: Record<string, unknown>;
	headline: string;
}

export function StepUpCard({
	orgId,
	conversationId,
	assistantMessageId,
	capability,
	args,
	headline,
}: Props) {
	const confirmStepUp = useMutation(anyApi.aiStepUp.confirmStepUp);
	const [phase, setPhase] = useState<"idle" | "armed" | "submitting" | "done" | "cancelled">(
		"idle",
	);

	async function handle() {
		if (phase === "submitting" || phase === "done" || phase === "cancelled") return;
		if (phase === "idle") {
			setPhase("armed");
			return;
		}
		setPhase("submitting");
		try {
			await confirmStepUp({
				orgId: orgId as Id<"orgs">,
				conversationId: conversationId as Id<"aiConversations">,
				assistantMessageId: assistantMessageId as Id<"aiMessages">,
				capability,
				args,
			});
			setPhase("done");
		} catch (err) {
			toast.mutationError(err, "Could not confirm. Please try again.");
			setPhase("idle");
		}
	}

	function handleCancel() {
		if (phase === "submitting" || phase === "done") return;
		// Local dismiss only — nothing irreversible ran, so there is no
		// server state to roll back. The card collapses to a muted note;
		// the model is NOT re-invoked. The `useState` survives reactive
		// re-renders (the turn is keyed by a stable message id), so the
		// cancellation sticks for the session.
		setPhase("cancelled");
	}

	const description =
		phase === "armed"
			? "Click again to confirm. This action is irreversible."
			: phase === "submitting"
				? "Issuing step-up token…"
				: phase === "done"
					? "Token issued. The AI is re-running the action."
					: phase === "cancelled"
						? "Cancelled. The irreversible action was not run."
						: "This is irreversible. Confirm twice to proceed, or cancel.";

	return (
		<div
			className={cn(
				"mx-4 my-2 rounded-[var(--radius)] border p-3",
				phase === "done"
					? "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/10"
					: phase === "cancelled"
						? "border-border bg-muted/40"
						: "border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20",
			)}
		>
			<div className="mb-2 flex items-center gap-2">
				<ShieldAlert
					className={cn(
						"size-3.5",
						phase === "cancelled"
							? "text-muted-foreground"
							: "text-amber-600 dark:text-amber-400",
					)}
				/>
				<p className="text-[11px] font-semibold uppercase tracking-wide">
					{phase === "done"
						? "Confirmed"
						: phase === "cancelled"
							? "Cancelled"
							: "2FA confirmation required"}
				</p>
				<span className="ms-auto truncate text-[10px] text-muted-foreground">
					{capability}
				</span>
			</div>

			<p className="mb-3 text-sm font-medium">{headline}</p>
			<p className="mb-3 text-xs text-muted-foreground">{description}</p>

			{phase !== "done" && phase !== "cancelled" && (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant={phase === "armed" ? "destructive" : "default"}
						onClick={handle}
						disabled={phase === "submitting"}
					>
						{phase === "armed"
							? "Click again to confirm"
							: phase === "submitting"
								? "Working…"
								: "Confirm"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleCancel}
						disabled={phase === "submitting"}
					>
						Cancel
					</Button>
				</div>
			)}
		</div>
	);
}
