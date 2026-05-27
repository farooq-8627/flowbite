"use client";

/**
 * TaskTypeBadge — visual chip showing a task's type.
 *
 * Type is the first-class discriminator on every task (replaces the
 * legacy reminders `source` field). Closed union: todo / call / email /
 * meeting / followup. Each carries an icon + colour from
 * `task-type.ts`. Used inside TaskForm (chip selector), TaskCard, and
 * the columns/useTaskColumns DataTable cell.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	resolveTaskType,
	TASK_TYPE_COLOR,
	TASK_TYPE_ICON,
	TASK_TYPE_LABEL,
} from "../lib/task-type";

interface TaskTypeBadgeProps {
	/** Either the type itself or any object with a `type` field. */
	type?: string;
	size?: "xs" | "sm";
	/** When true, render only the icon (used in dense table cells). */
	iconOnly?: boolean;
	className?: string;
}

const SIZE_CLASS: Record<NonNullable<TaskTypeBadgeProps["size"]>, string> = {
	xs: "h-4 px-1.5 py-0 text-[10px] gap-1",
	sm: "h-5 px-2 py-0.5 text-[11px] gap-1.5",
};

const ICON_CLASS: Record<NonNullable<TaskTypeBadgeProps["size"]>, string> = {
	xs: "size-2.5",
	sm: "size-3",
};

export function TaskTypeBadge({ type, size = "xs", iconOnly, className }: TaskTypeBadgeProps) {
	const resolved = resolveTaskType(type);
	const color = TASK_TYPE_COLOR[resolved];
	const label = TASK_TYPE_LABEL[resolved];
	const Icon = TASK_TYPE_ICON[resolved];

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
			<Icon className={ICON_CLASS[size]} aria-hidden />
			{!iconOnly && <span className="truncate">{label}</span>}
		</Badge>
	);
}
