"use client";

/**
 * useReminderColumns — TanStack column defs for the reminders DataTable.
 *
 * STATUS: IMPLEMENTED.
 *
 * Columns:
 *   1. select (checkbox; reused from useEntityColumns pattern)
 *   2. complete (one-click ✓ — `<ReminderQuickComplete>`)
 *   3. title (primary text)
 *   4. status (`<ReminderStatusBadge>` — pending/today/overdue/completed)
 *   5. dueAt (relative time + absolute on hover)
 *   6. personCode (clickable `<IdentityBadge>` → /profile/:code)
 *   7. assignee (`<AssigneeCell>`)
 *   8. source (faceted filter — manual/note/whatsapp/etc.)
 *   9. createdAt (sortable, relative)
 *  10. actions (Edit / Delete via `<DataTableRowActions>`)
 *
 * KEY RULES:
 *   - All cell components are pre-built (`AssigneeCell` reads from
 *     `useOrgMembers()`, `ReminderQuickComplete` calls
 *     `useCompleteReminder` which has optimistic update). NO extra
 *     `useQuery` per cell.
 *   - The toolbar's faceted filters wire through `meta.variant` +
 *     `meta.options` — see DataTableToolbar's switch.
 *   - The actions column receives onEdit/onDelete from the parent view
 *     so the parent owns the drawer/dialog state.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow, isThisYear } from "date-fns";
import {
	BellIcon,
	BellOffIcon,
	BotMessageSquareIcon,
	BoxIcon,
	BrainCircuitIcon,
	CalendarClockIcon,
	HandHelpingIcon,
	MessageSquareTextIcon,
	StickyNoteIcon,
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
import { getReminderState, type ReminderState } from "../../lib/reminder-status";
import { ReminderQuickComplete } from "../ReminderQuickComplete";
import { ReminderStatusBadge } from "../ReminderStatusBadge";

export type ReminderRow = Doc<"reminders">;

/** Source values we surface in the faceted filter. Extend as we add more. */
const SOURCE_OPTIONS: Array<{ label: string; value: string; icon: typeof BellIcon }> = [
	{ label: "Manual", value: "manual", icon: HandHelpingIcon },
	{ label: "Note", value: "note", icon: StickyNoteIcon },
	{ label: "Message", value: "message", icon: MessageSquareTextIcon },
	{ label: "Calendar", value: "calendar", icon: CalendarClockIcon },
	{ label: "AI", value: "ai", icon: BrainCircuitIcon },
	{ label: "WhatsApp", value: "whatsapp", icon: BotMessageSquareIcon },
	{ label: "Other", value: "other", icon: BoxIcon },
];

const STATUS_OPTIONS: Array<{ label: string; value: ReminderState; icon: typeof BellIcon }> = [
	{ label: "Overdue", value: "overdue", icon: BellOffIcon },
	{ label: "Today", value: "today", icon: CalendarClockIcon },
	{ label: "Upcoming", value: "upcoming", icon: BellIcon },
	{ label: "Completed", value: "completed", icon: HandHelpingIcon },
];

function formatDueAt(dueAt: number, _now: number = Date.now()): string {
	const distance = formatDistanceToNow(dueAt, { addSuffix: true });
	const absolute = isThisYear(dueAt)
		? format(dueAt, "MMM d, h:mm a")
		: format(dueAt, "MMM d, yyyy h:mm a");
	return `${distance} · ${absolute}`;
}

interface UseReminderColumnsArgs {
	now: number;
	onEdit: (row: ReminderRow) => void;
	onDelete: (row: ReminderRow) => void;
	/** Current user id — used to gate the inline complete button. */
	currentUserId?: string;
}

export function useReminderColumns({
	now,
	onEdit,
	onDelete,
	currentUserId,
}: UseReminderColumnsArgs): ColumnDef<ReminderRow, unknown>[] {
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("reminders.manage");

	return useMemo<ColumnDef<ReminderRow, unknown>[]>(
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
					const r = row.original;
					const allowed = canManage || r.assignedTo === currentUserId;
					return <ReminderQuickComplete reminder={r} hidden={!allowed} size="sm" />;
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

			// ── 4. status (faceted filter on derived state) ──────────────
			{
				id: "status",
				accessorFn: (row) => getReminderState(row, now),
				meta: { label: "Status", variant: "multiSelect", options: STATUS_OPTIONS },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
				cell: ({ row }) => (
					<ReminderStatusBadge reminder={row.original} now={now} size="xs" />
				),
				enableColumnFilter: true,
				filterFn: (row, _columnId, filterValue) => {
					const state = getReminderState(row.original, now);
					if (Array.isArray(filterValue)) {
						return filterValue.length === 0 || filterValue.includes(state);
					}
					return state === filterValue;
				},
			},

			// ── 5. dueAt ─────────────────────────────────────────────────
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

			// ── 6. personCode ────────────────────────────────────────────
			{
				id: "personCode",
				accessorKey: "personCode",
				meta: { label: "Person", variant: "text" },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
				cell: ({ row }) =>
					row.original.personCode ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates linked badge from row click
						// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the Link inside the badge owns keyboard semantics
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

			// ── 7. assignee ──────────────────────────────────────────────
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

			// ── 8. source ────────────────────────────────────────────────
			{
				id: "source",
				accessorKey: "source",
				meta: { label: "Source", variant: "multiSelect", options: SOURCE_OPTIONS },
				header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
				cell: ({ row }) => (
					<span className="text-xs capitalize">{row.original.source}</span>
				),
				enableColumnFilter: true,
			},

			// ── 9. createdAt ─────────────────────────────────────────────
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

			// ── 10. actions (last) ───────────────────────────────────────
			{
				id: "actions",
				header: () => <span className="sr-only">Actions</span>,
				cell: ({ row }) => {
					const r = row.original;
					const allowed = canManage || r.assignedTo === currentUserId;
					if (!allowed) return null;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the actions menu from row click
						// biome-ignore lint/a11y/useKeyWithClickEvents: div only stops propagation; the inner DataTableRowActions owns keyboard semantics
						<div onClick={(e) => e.stopPropagation()}>
							<DataTableRowActions
								row={row}
								onEdit={() => onEdit(r)}
								onDelete={() => onDelete(r)}
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

/**
 * Tight short-form due rendering used in the table cell. Uses absolute
 * date for far-out reminders (over a week away) and relative time for
 * near-term ones — matches what humans read off a calendar.
 */
function formatDueAtShort(dueAt: number, now: number = Date.now()): string {
	const diff = dueAt - now;
	const absDiff = Math.abs(diff);
	const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
	if (absDiff < ONE_WEEK) {
		return formatDistanceToNow(dueAt, { addSuffix: true });
	}
	return isThisYear(dueAt) ? format(dueAt, "MMM d, h:mm a") : format(dueAt, "MMM d, yyyy");
}
