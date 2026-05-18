"use client";

/**
 * ReminderQuickComplete — one-click complete button.
 *
 * STATUS: IMPLEMENTED.
 *
 * UX contract (mirrors product brief — single-click low friction):
 *   - One click → optimistically flips the reminder to "completed".
 *   - The mutation runs `useCompleteReminder` (optimistic update built-in)
 *     so the row visibly toggles before the network round-trip lands.
 *   - On error we surface a toast with the real error message and the
 *     UI state self-corrects on the next subscription tick.
 *   - The button is disabled the moment a click is registered until the
 *     mutation resolves so a frantic user can't trigger it twice.
 *   - Once completed, the button stays visible as a quiet "✓ done"
 *     indicator but is non-interactive — re-opening a completed reminder
 *     happens through the edit drawer (low-frequency action, no need to
 *     occupy a one-click slot).
 *   - `aria-pressed` reflects the current state for screen readers.
 *
 * Visual contract:
 *   ┌─────┐
 *   │  ○  │   pending   → muted check (border + ring on hover)
 *   └─────┘
 *   ┌─────┐
 *   │  ✓  │   completed → solid green check (already done)
 *   └─────┘
 */

import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useCompleteReminder } from "../hooks";

interface ReminderQuickCompleteProps {
	reminder: Doc<"reminders">;
	/** When true, the button is hidden (caller has no permission). */
	hidden?: boolean;
	size?: "xs" | "sm";
	className?: string;
}

const SIZE_CLASS: Record<NonNullable<ReminderQuickCompleteProps["size"]>, string> = {
	xs: "size-5",
	sm: "size-6",
};

const ICON_SIZE: Record<NonNullable<ReminderQuickCompleteProps["size"]>, string> = {
	xs: "size-3",
	sm: "size-3.5",
};

export function ReminderQuickComplete({
	reminder,
	hidden,
	size = "xs",
	className,
}: ReminderQuickCompleteProps) {
	const completeReminder = useCompleteReminder();
	const [pending, setPending] = useState(false);

	if (hidden) return null;

	const isCompleted = reminder.status === "completed";

	async function onClick() {
		if (pending || isCompleted) return;
		setPending(true);
		try {
			await completeReminder({
				orgId: reminder.orgId,
				reminderId: reminder._id,
			});
			toast.success("Reminder completed");
		} catch (err) {
			toast.mutationError(err, "Couldn't complete reminder");
		} finally {
			setPending(false);
		}
	}

	const label = isCompleted ? "Already completed" : "Complete reminder";
	const Icon = isCompleted ? CheckCircle2Icon : CircleIcon;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={label}
					aria-pressed={isCompleted}
					disabled={pending || isCompleted}
					onClick={(e) => {
						// Keep clicks on the button from bubbling into row
						// click handlers (DataTable rows are made clickable
						// to open the edit drawer).
						e.stopPropagation();
						void onClick();
					}}
					className={cn(
						SIZE_CLASS[size],
						"shrink-0 transition-colors",
						isCompleted
							? "text-emerald-600 hover:text-emerald-700 disabled:opacity-100"
							: "text-muted-foreground hover:text-foreground",
						className,
					)}
				>
					<Icon className={ICON_SIZE[size]} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" className="text-xs">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
