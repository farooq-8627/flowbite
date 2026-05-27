"use client";

/**
 * TaskCard — compact card used inside TasksPanel + dashboard widgets.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ ✓  Title                            ●Type  ●URGENT  Today │   row 1
 *   │    Acme · D-001 · T-042 · note                          ⋮ │   row 2
 *   └───────────────────────────────────────────────────────────┘
 *
 * One-click flow:
 *   - Tap the leading ✓ → marks the task completed (optimistic).
 *   - Tap the row → opens the edit drawer (caller passes onEdit).
 *   - Tap the ⋮ → opens the menu with Edit + Delete.
 */

import { format, formatDistanceToNow, isThisYear } from "date-fns";
import { MoreVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Doc } from "@/convex/_generated/dataModel";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import {
	resolveTaskPriority,
	TASK_PRIORITY_COLOR,
	TASK_PRIORITY_LABEL,
} from "../lib/task-priority";
import { TaskQuickComplete } from "./TaskQuickComplete";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskTypeBadge } from "./TaskTypeBadge";

interface TaskCardProps {
	task: Doc<"tasks">;
	onEdit?: (t: Doc<"tasks">) => void;
	onDelete?: (t: Doc<"tasks">) => void;
	/** Hide the person-code chip — useful inside the profile panel. */
	hidePersonCode?: boolean;
	/** Hide the deal-code chip — useful inside a deal-tab panel. */
	hideDealCode?: boolean;
	/** Hide the priority chip — used in dense layouts. */
	hidePriority?: boolean;
	/** Hide the type chip — used when the surrounding view is type-scoped. */
	hideType?: boolean;
	className?: string;
}

function formatDueShort(ts: number): string {
	const distance = formatDistanceToNow(ts, { addSuffix: true });
	const absolute = isThisYear(ts) ? format(ts, "MMM d, h:mm a") : format(ts, "MMM d, yyyy");
	return `${distance} · ${absolute}`;
}

export function TaskCard({
	task,
	onEdit,
	onDelete,
	hidePersonCode,
	hideDealCode,
	hidePriority,
	hideType,
	className,
}: TaskCardProps) {
	const me = useMe();
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("tasks.manage") || task.assignedTo === me?._id;
	const isCompleted = task.status === "completed";
	const isOverdue = !isCompleted && task.dueAt < Date.now();
	const priority = resolveTaskPriority(task.priority);
	const priorityColor = TASK_PRIORITY_COLOR[priority];
	const showPriorityChip = !hidePriority && task.priority;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: card behaves as a button when onEdit is set; role + tabIndex + keyboard handler are wired below
		<div
			role={onEdit ? "button" : undefined}
			tabIndex={onEdit ? 0 : undefined}
			onClick={() => onEdit?.(task)}
			onKeyDown={(e) => {
				if (!onEdit) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit(task);
				}
			}}
			className={cn(
				"group/card relative flex items-start gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 transition-colors",
				onEdit && "cursor-pointer hover:border-ring/40 hover:bg-accent/30",
				isCompleted && "opacity-70",
				isOverdue && "border-red-500/30",
				className,
			)}
			style={
				isOverdue
					? {
							borderInlineStartWidth: "2px",
							borderInlineStartColor: "rgb(220 38 38 / 0.6)",
						}
					: undefined
			}
		>
			{/* ✓ Quick-complete */}
			<div className="mt-0.5">
				<TaskQuickComplete task={task} hidden={!canManage} size="sm" />
			</div>

			{/* Body */}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{/* Row 1: title + chips + status */}
				<div className="flex items-start justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm font-medium",
							isCompleted && "line-through text-muted-foreground",
						)}
						title={task.title}
					>
						{task.title}
					</span>
					<div className="flex shrink-0 items-center gap-1.5">
						{!hideType && <TaskTypeBadge type={task.type} size="xs" />}
						{showPriorityChip && (
							<span
								className="inline-flex h-4 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium uppercase"
								style={{
									color: priorityColor,
									borderColor: `${priorityColor}66`,
									backgroundColor: `${priorityColor}14`,
								}}
								title={`Priority: ${TASK_PRIORITY_LABEL[priority]}`}
							>
								<span
									aria-hidden
									className="size-1.5 rounded-full"
									style={{ backgroundColor: priorityColor }}
								/>
								{TASK_PRIORITY_LABEL[priority]}
							</span>
						)}
						<TaskStatusBadge task={task} size="xs" />
					</div>
				</div>

				{/* Row 2: due time + entity context */}
				<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
					<span title={format(task.dueAt, "PPP p")}>{formatDueShort(task.dueAt)}</span>
					{!hidePersonCode && task.personCode && (
						<>
							<span aria-hidden>·</span>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates linked badge from row click */}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: span only stops propagation; keyboard handling lives on the inner Link */}
							<span onClick={(e) => e.stopPropagation()}>
								<IdentityBadge
									entityType="person"
									code={task.personCode}
									layout="code"
									size="xs"
								/>
							</span>
						</>
					)}
					{!hideDealCode && task.dealCode && (
						<>
							<span aria-hidden>·</span>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates linked badge from row click */}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: span only stops propagation; keyboard handling lives on the inner Link */}
							<span onClick={(e) => e.stopPropagation()}>
								<IdentityBadge
									entityType="deal"
									code={task.dealCode}
									layout="code"
									size="xs"
								/>
							</span>
						</>
					)}
					{task.taskCode && (
						<>
							<span aria-hidden>·</span>
							<span className="font-mono text-[10px] text-muted-foreground/80">
								{task.taskCode}
							</span>
						</>
					)}
					{task.note && (
						<>
							<span aria-hidden>·</span>
							<span className="truncate" title={task.note}>
								{task.note}
							</span>
						</>
					)}
				</div>
			</div>

			{/* ⋮ Menu */}
			{canManage && (
				// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the menu trigger from the parent card click
				// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the Button inside owns keyboard semantics
				<div className="ms-auto" onClick={(e) => e.stopPropagation()}>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
								aria-label="More actions"
							>
								<MoreVerticalIcon className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="text-xs">
							{onEdit && (
								<DropdownMenuItem onSelect={() => onEdit(task)}>
									<PencilIcon className="me-2 size-3.5" />
									Edit
								</DropdownMenuItem>
							)}
							{onDelete && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onSelect={() => onDelete(task)}
										className="text-destructive focus:text-destructive"
									>
										<TrashIcon className="me-2 size-3.5" />
										Delete
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}
		</div>
	);
}
