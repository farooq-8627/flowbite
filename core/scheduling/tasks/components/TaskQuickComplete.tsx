"use client";

/**
 * TaskQuickComplete — one-click complete button.
 *
 * UX contract (mirrors product brief — single-click low friction):
 *   - One click → optimistically flips the task to "completed".
 *   - The mutation runs `useCompleteTask` (optimistic update built-in)
 *     so the row visibly toggles before the network round-trip lands.
 *   - On error we surface a toast and the UI self-corrects on the next
 *     subscription tick.
 *   - The button is disabled the moment a click is registered until the
 *     mutation resolves so a frantic user can't trigger it twice.
 *   - Once completed, the button stays visible as a quiet "✓ done"
 *     indicator but is non-interactive — re-opening a completed task
 *     happens through the edit drawer.
 *   - `aria-pressed` reflects the current state for screen readers.
 */

import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useCompleteTask } from "../hooks";

interface TaskQuickCompleteProps {
	task: Doc<"tasks">;
	/** When true, the button is hidden (caller has no permission). */
	hidden?: boolean;
	size?: "xs" | "sm";
	className?: string;
}

const SIZE_CLASS: Record<NonNullable<TaskQuickCompleteProps["size"]>, string> = {
	xs: "size-5",
	sm: "size-6",
};

const ICON_SIZE: Record<NonNullable<TaskQuickCompleteProps["size"]>, string> = {
	xs: "size-3",
	sm: "size-3.5",
};

export function TaskQuickComplete({
	task,
	hidden,
	size = "xs",
	className,
}: TaskQuickCompleteProps) {
	const completeTask = useCompleteTask();
	const [pending, setPending] = useState(false);

	if (hidden) return null;

	const isCompleted = task.status === "completed";

	async function onClick() {
		if (pending || isCompleted) return;
		setPending(true);
		try {
			await completeTask({ orgId: task.orgId, taskId: task._id });
			toast.success("Task completed");
		} catch (err) {
			toast.mutationError(err, "Couldn't complete task");
		} finally {
			setPending(false);
		}
	}

	const label = isCompleted ? "Already completed" : "Complete task";
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
