"use client";

/**
 * useTaskColumns — TanStack column defs for the tasks DataTable.
 *
 * Columns:
 *   1. select (checkbox)
 *   2. complete (one-click ✓ — `<TaskQuickComplete>`)
 *   3. title (primary text)
 *   4. type (`<TaskTypeBadge>` — todo/call/email/meeting/followup)
 *   5. status (`<TaskStatusBadge>` — pending/today/overdue/completed)
 *   6. priority (chip)
 *   7. dueAt (relative time + absolute on hover)
 *   8. personCode (clickable `<IdentityBadge>` → /profile/:code)
 *   9. dealCode (clickable when present)
 *  10. assignee (`<AssigneeCell>`)
 *  11. createdAt (sortable, relative)
 *  12. actions (Edit / Delete via `<DataTableRowActions>`)
 *
 * KEY RULES (per AGENTS.md "per-row data on a list view comes from one
 * batched query"):
 *   - All cell components are pre-built; no per-row useQuery anywhere.
 *   - The toolbar's faceted filters wire through `meta.variant` +
 *     `meta.options`.
 *   - The actions column receives onEdit/onDelete from the parent view
 *     so the parent owns the drawer/dialog state.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow, isThisYear } from "date-fns";
import {
	BellIcon,
	BellOffIcon,
	CalendarClockIcon,
	HandHelpingIcon,
	MailIcon,
	PhoneIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import { DataTableColumnHeader } from "@/core/data-display/datatable/components/DataTableColumnHeader";
import { DataTableRowActions } from "@/core/data-display/datatable/components/DataTableRowActions";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import {
	resolveTaskPriority,
	TASK_PRIORITY_COLOR,
	TASK_PRIORITY_LABEL,
	TASK_PRIORITY_VALUES,
	TASK_PRIORITY_WEIGHT,
	type TaskPriority,
} from "../../lib/task-priority";
import { getTaskState, type TaskState } from "../../lib/task-status";
import { TASK_TYPE_LABEL, type TaskType } from "../../lib/task-type";
import { TaskQuickComplete } from "../TaskQuickComplete";
import { TaskStatusBadge } from "../TaskStatusBadge";
import { TaskTypeBadge } from "../TaskTypeBadge";

export type TaskRow = Doc<"tasks">;

const TYPE_OPTIONS: Array<{ label: string; value: TaskType; icon: typeof BellIcon }> = [
	{ label: TASK_TYPE_LABEL.todo, value: "todo", icon: BellIcon },
	{ label: TASK_TYPE_LABEL.call, value: "call", icon: PhoneIcon },
	{ label: TASK_TYPE_LABEL.email, value: "email", icon: MailIcon },
	{ label: TASK_TYPE_LABEL.meeting, value: "meeting", icon: UsersIcon },
	{ label: TASK_TYPE_LABEL.followup, value: "followup", icon: CalendarClockIcon },
];

const STATUS_OPTIONS: Array<{ label: string; value: TaskState; icon: typeof BellIcon }> = [
	{ label: "Overdue", value: "overdue", icon: BellOffIcon },
	{ label: "Today", value: "today", icon: CalendarClockIcon },
	{ label: "Upcoming", value: "upcoming", icon: BellIcon },
	{ label: "Completed", value: "completed", icon: HandHelpingIcon },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: TaskPriority; icon: typeof BellIcon }> =
	TASK_PRIORITY_VALUES.map((p) => ({ label: TASK_PRIORITY_LABEL[p], value: p, icon: BellIcon }));

function formatDueAt(dueAt: number, _now: number = Date.now()): string {
	const distance = formatDistanceToNow(dueAt, { addSuffix: true });
	const absolute = isThisYear(dueAt)
		? format(dueAt, "MMM d, h:mm a")
		: format(dueAt, "MMM d, yyyy h:mm a");
	return `${distance} · ${absolute}`;
}

function formatDueAtShort(dueAt: number, now: number = Date.now()): string {
	const diff = dueAt - now;
	const absDiff = Math.abs(diff);
	const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
	if (absDiff < ONE_WEEK) {
		return formatDistanceToNow(dueAt, { addSuffix: true });
	}
	return isThisYear(dueAt) ? format(dueAt, "MMM d, h:mm a") : format(dueAt, "MMM d, yyyy");
}

interface UseTaskColumnsArgs {
	now: number;
	onEdit: (row: TaskRow) => void;
	onDelete: (row: TaskRow) => void;
	/** Current user id — used to gate the inline complete button. */
	currentUserId?: string;
}

export function useTaskColumns({
	now,
	onEdit,
	onDelete,
	currentUserId,
}: UseTaskColumnsArgs): ColumnDef<TaskRow, unknown>[] {
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("tasks.manage");

	return useMemo<ColumnDef<TaskRow, unknown>[]>(
		() => [
			// ── 1. select ────────────────────────────────────────────────
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={table.getIsAllPageRowsSelected()}
						onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
						aria-label="Select all"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(v) => row.toggleSelected(!!v)}
						aria-label="Select row"
						onClick={(e) => e.stopPropagation()}
					/>
				),
				enableSorting: false,
				enableHiding: false,
				size: 32,
			},

			// ── 2. complete (one-click) ──────────────────────────────────
			{
				id: "complete",
				header: () => <span className="sr-only">Complete</span>,
				cell: ({ row }) => {
					const t = row.original;
					const allowed = canManage || t.assignedTo === currentUserId;
					return <TaskQuickComplete task={t} hidden={!allowed} size="sm" />;
				},
				enableSorting: false,
				enableHiding: false,
				size: 36,
			},

			// ── 3. title ─────────────────────────────────────────────────
			{
				id: "title",
				accessorKey: "title",
				meta: { label: "Title", variant: "text", placeholder: "Search titles…" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
				cell: ({ row }) => (
					<div className="flex flex-col gap-0.5">
						<span
							className="truncate font-medium text-foreground"
							title={row.original.title}
						>
							{row.original.title}
						</span>
						{row.original.note && (
							<span
								className="truncate text-[11px] text-muted-foreground"
								title={row.original.note}
							>
								{row.original.note}
							</span>
						)}
					</div>
				),
				enableColumnFilter: true,
			},

			// ── 4. type ──────────────────────────────────────────────────
			{
				id: "type",
				accessorKey: "type",
				meta: { label: "Type", variant: "multiSelect", options: TYPE_OPTIONS },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
				cell: ({ row }) => <TaskTypeBadge type={row.original.type} size="xs" />,
				enableColumnFilter: true,
			},

			// ── 5. status (faceted filter on derived state) ──────────────
			{
				id: "status",
				accessorFn: (row) => getTaskState(row, now),
				meta: { label: "Status", variant: "multiSelect", options: STATUS_OPTIONS },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
				cell: ({ row }) => <TaskStatusBadge task={row.original} now={now} size="xs" />,
				enableColumnFilter: true,
				filterFn: (row, _columnId, filterValue) => {
					const state = getTaskState(row.original, now);
					if (Array.isArray(filterValue)) {
						return filterValue.length === 0 || filterValue.includes(state);
					}
					return state === filterValue;
				},
			},

			// ── 6. priority ──────────────────────────────────────────────
			{
				id: "priority",
				accessorFn: (row) => resolveTaskPriority(row.priority),
				meta: { label: "Priority", variant: "multiSelect", options: PRIORITY_OPTIONS },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
				cell: ({ row }) => {
					const priority = resolveTaskPriority(row.original.priority);
					const color = TASK_PRIORITY_COLOR[priority];
					return (
						<span
							className="inline-flex h-4 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium uppercase"
							style={{
								color,
								borderColor: `${color}66`,
								backgroundColor: `${color}14`,
							}}
						>
							<span
								aria-hidden
								className="size-1.5 rounded-full"
								style={{ backgroundColor: color }}
							/>
							{TASK_PRIORITY_LABEL[priority]}
						</span>
					);
				},
				sortingFn: (rowA, rowB) => {
					const a = TASK_PRIORITY_WEIGHT[resolveTaskPriority(rowA.original.priority)];
					const b = TASK_PRIORITY_WEIGHT[resolveTaskPriority(rowB.original.priority)];
					return a - b;
				},
				enableColumnFilter: true,
			},

			// ── 7. dueAt ─────────────────────────────────────────────────
			{
				id: "dueAt",
				accessorKey: "dueAt",
				meta: { label: "Due", variant: "dateRange" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
				cell: ({ row }) => (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-xs">{formatDueAtShort(row.original.dueAt)}</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							{formatDueAt(row.original.dueAt, now)}
						</TooltipContent>
					</Tooltip>
				),
				enableColumnFilter: true,
				filterFn: (row, _columnId, filterValue) => {
					if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
					const [start, end] = filterValue as [number | undefined, number | undefined];
					const ts = row.original.dueAt;
					if (start && ts < start) return false;
					if (end && ts > end) return false;
					return true;
				},
			},

			// ── 8. personCode ────────────────────────────────────────────
			{
				id: "personCode",
				accessorKey: "personCode",
				meta: { label: "Person", variant: "text" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
				cell: ({ row }) =>
					row.original.personCode ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates linked badge from row click
						// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the Link inside owns keyboard semantics
						<div onClick={(e) => e.stopPropagation()}>
							<IdentityBadge
								entityType="person"
								code={row.original.personCode}
								layout="code"
								size="xs"
							/>
						</div>
					) : (
						<span className="text-xs text-muted-foreground">—</span>
					),
				enableColumnFilter: true,
			},

			// ── 9. dealCode ──────────────────────────────────────────────
			{
				id: "dealCode",
				accessorKey: "dealCode",
				meta: { label: "Deal", variant: "text" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Deal" />,
				cell: ({ row }) =>
					row.original.dealCode ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates linked badge from row click
						// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the Link inside owns keyboard semantics
						<div onClick={(e) => e.stopPropagation()}>
							<IdentityBadge
								entityType="deal"
								code={row.original.dealCode}
								layout="code"
								size="xs"
							/>
						</div>
					) : (
						<span className="text-xs text-muted-foreground">—</span>
					),
			},

			// ── 10. assignee ─────────────────────────────────────────────
			{
				id: "assignedTo",
				accessorKey: "assignedTo",
				meta: { label: "Assignee" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Assignee" />,
				cell: ({ row }) => (
					<AssigneeCell userId={row.original.assignedTo} show={["avatar", "name"]} />
				),
				enableSorting: true,
			},

			// ── 11. createdAt ────────────────────────────────────────────
			{
				id: "createdAt",
				accessorKey: "createdAt",
				meta: { label: "Created" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
				cell: ({ row }) => (
					<span
						className="text-xs text-muted-foreground"
						title={format(row.original.createdAt, "PPP p")}
					>
						{formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
					</span>
				),
			},

			// ── 12. actions (last) ───────────────────────────────────────
			{
				id: "actions",
				header: () => <span className="sr-only">Actions</span>,
				cell: ({ row }) => {
					const t = row.original;
					const allowed = canManage || t.assignedTo === currentUserId;
					if (!allowed) return null;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the actions menu from row click
						// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the inner DataTableRowActions owns keyboard semantics
						<div onClick={(e) => e.stopPropagation()}>
							<DataTableRowActions
								row={row}
								onEdit={() => onEdit(t)}
								onDelete={() => onDelete(t)}
							/>
						</div>
					);
				},
				enableSorting: false,
				enableHiding: false,
				size: 36,
			},
		],
		[canManage, currentUserId, now, onDelete, onEdit],
	);
}
