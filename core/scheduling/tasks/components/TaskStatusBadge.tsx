"use client";

/**
 * TaskStatusBadge — visual chip showing a task's state.
 *
 * The state is computed with `getTaskState`, so callers can pass either
 * a full `Doc<"tasks">` or any object with `{ dueAt, status,
 * completedAt? }` (mirrors what the calendar DTO exposes).
 *
 * Visual contract:
 *   ┌──────────┐
 *   │ ● Today  │   ← coloured dot + label, sized to the badge variant
 *   └──────────┘
 *
 * The dot is intentional — colourblind-friendly. The label uses the
 * canonical `TASK_STATE_LABEL` so wording stays in lock-step everywhere.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	getTaskState,
	TASK_STATE_COLOR,
	TASK_STATE_LABEL,
	type TaskLike,
	type TaskState,
} from "../lib/task-status";

interface TaskStatusBadgeProps {
	/** Either the task itself, or a pre-computed state. */
	task?: TaskLike;
	state?: TaskState;
	/** Pin the clock — useful for tests / SSR. */
	now?: number;
	size?: "xs" | "sm";
	className?: string;
}

const SIZE_CLASS: Record<NonNullable<TaskStatusBadgeProps["size"]>, string> = {
	xs: "h-4 px-1.5 py-0 text-[10px] gap-1",
	sm: "h-5 px-2 py-0.5 text-[11px] gap-1.5",
};

const DOT_CLASS: Record<NonNullable<TaskStatusBadgeProps["size"]>, string> = {
	xs: "size-1.5",
	sm: "size-2",
};

export function TaskStatusBadge({
	task,
	state,
	now,
	size = "xs",
	className,
}: TaskStatusBadgeProps) {
	const resolved: TaskState = state ?? (task ? getTaskState(task, now) : "upcoming");
	const color = TASK_STATE_COLOR[resolved];
	const label = TASK_STATE_LABEL[resolved];

	return (
		<Badge
			variant="outline"
			className={cn(SIZE_CLASS[size], className)}
			style={{
				color,
				borderColor: `${color}66`,
				backgroundColor: `${color}14`,
			}}
			title={label}
		>
			<span
				aria-hidden
				className={cn("inline-block shrink-0 rounded-full", DOT_CLASS[size])}
				style={{ backgroundColor: color }}
			/>
			<span className="truncate">{label}</span>
		</Badge>
	);
}
