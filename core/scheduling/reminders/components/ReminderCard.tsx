"use client";

/**
 * ReminderCard — compact card used inside RemindersPanel + dashboard widgets.
 *
 * STATUS: IMPLEMENTED.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ ✓  Title                          ●Due today │   row 1: complete + title + status
 *   │    Due in 3h · P-001                       ⋮ │   row 2: meta + ⋮ menu
 *   └──────────────────────────────────────────────┘
 *
 * One-click flow:
 *   - Tap the leading ✓ → marks the reminder completed (optimistic).
 *   - Tap the row → opens the edit drawer (caller passes onEdit).
 *   - Tap the ⋮ → opens the menu with Edit + Delete.
 *
 * Reuses:
 *   - `<ReminderQuickComplete>` (Slice A.5) for the leading button.
 *   - `<ReminderStatusBadge>` (Slice A.3) for the trailing badge.
 *   - `<IdentityBadge>` from core/entities/shared for the person-code chip.
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
import { ReminderQuickComplete } from "./ReminderQuickComplete";
import { ReminderStatusBadge } from "./ReminderStatusBadge";

interface ReminderCardProps {
	reminder: Doc<"reminders">;
	onEdit?: (r: Doc<"reminders">) => void;
	onDelete?: (r: Doc<"reminders">) => void;
	/** Hide the person-code chip — useful inside the profile panel where we already have context. */
	hidePersonCode?: boolean;
	className?: string;
}

function formatDueShort(ts: number): string {
	const distance = formatDistanceToNow(ts, { addSuffix: true });
	const absolute = isThisYear(ts) ? format(ts, "MMM d, h:mm a") : format(ts, "MMM d, yyyy");
	return `${distance} · ${absolute}`;
}

export function ReminderCard({
	reminder,
	onEdit,
	onDelete,
	hidePersonCode,
	className,
}: ReminderCardProps) {
	const me = useMe();
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("reminders.manage") || reminder.assignedTo === me?._id;
	const isCompleted = reminder.status === "completed";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: card behaves as a button when onEdit is set; role + tabIndex + keyboard handler are wired below
		<div
			role={onEdit ? "button" : undefined}
			tabIndex={onEdit ? 0 : undefined}
			onClick={() => onEdit?.(reminder)}
			onKeyDown={(e) => {
				if (!onEdit) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit(reminder);
				}
			}}
			className={cn(
				"group/card flex items-start gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 transition-colors",
				onEdit && "cursor-pointer hover:border-ring/40 hover:bg-accent/30",
				isCompleted && "opacity-70",
				className,
			)}
		>
			{/* ✓ Quick-complete */}
			<div className="mt-0.5">
				<ReminderQuickComplete reminder={reminder} hidden={!canManage} size="sm" />
			</div>

			{/* Body */}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-start justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm font-medium",
							isCompleted && "line-through text-muted-foreground",
						)}
						title={reminder.title}
					>
						{reminder.title}
					</span>
					<ReminderStatusBadge reminder={reminder} size="xs" />
				</div>

				<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
					<span title={format(reminder.dueAt, "PPP p")}>
						{formatDueShort(reminder.dueAt)}
					</span>
					{!hidePersonCode && reminder.personCode && (
						<>
							<span aria-hidden>·</span>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the linked badge from the parent card click */}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: span only stops propagation; keyboard handling lives on the inner Link */}
							<span onClick={(e) => e.stopPropagation()}>
								<IdentityBadge
									entityType="person"
									code={reminder.personCode}
									layout="code"
									size="xs"
								/>
							</span>
						</>
					)}
					{reminder.note && (
						<>
							<span aria-hidden>·</span>
							<span className="truncate" title={reminder.note}>
								{reminder.note}
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
								<DropdownMenuItem onSelect={() => onEdit(reminder)}>
									<PencilIcon className="me-2 size-3.5" />
									Edit
								</DropdownMenuItem>
							)}
							{onDelete && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onSelect={() => onDelete(reminder)}
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
