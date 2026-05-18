"use client";

/**
 * FollowUpCard — compact card emphasising person/deal context + priority.
 *
 * STATUS: IMPLEMENTED.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ ✓  Title                            ●URGENT  Tomorrow  │   row 1: complete + title + priority chip + due
 *   │    Acme Corp · D-001 · FU-042                       ⋮  │   row 2: entity context + ⋮ menu
 *   └────────────────────────────────────────────────────────┘
 *
 * vs ReminderCard:
 *   - Priority chip is the primary visual hook (right of title), not buried.
 *   - PersonCode + dealCode are FIRST, time is secondary. Sales operators
 *     scan by "who" (Acme), not "when" (3pm).
 *   - The card itself respects the `isOverdue` state with a subtle red
 *     left-edge so urgent + overdue items pop without an extra row.
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
import { ReminderQuickComplete } from "@/core/scheduling/reminders/components/ReminderQuickComplete";
import { useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import {
	FOLLOWUP_PRIORITY_COLOR,
	FOLLOWUP_PRIORITY_LABEL,
	resolveFollowupPriority,
} from "../lib/followup-priority";

interface FollowUpCardProps {
	followup: Doc<"reminders">;
	onEdit?: (f: Doc<"reminders">) => void;
	onDelete?: (f: Doc<"reminders">) => void;
	/** Hide the person-code chip — useful when the panel already shows it. */
	hidePersonCode?: boolean;
	/** Hide the deal-code chip — useful inside a deal-tab panel. */
	hideDealCode?: boolean;
	className?: string;
}

function formatDueShort(ts: number, isCompleted: boolean): string {
	if (isCompleted) return format(ts, "MMM d");
	const distance = formatDistanceToNow(ts, { addSuffix: true });
	const absolute = isThisYear(ts) ? format(ts, "MMM d") : format(ts, "MMM d, yyyy");
	return `${distance} · ${absolute}`;
}

export function FollowUpCard({
	followup,
	onEdit,
	onDelete,
	hidePersonCode,
	hideDealCode,
	className,
}: FollowUpCardProps) {
	const me = useMe();
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("reminders.manage") || followup.assignedTo === me?._id;
	const isCompleted = followup.status === "completed";
	const isOverdue = !isCompleted && followup.dueAt < Date.now();
	const priority = resolveFollowupPriority(followup.priority);
	const priorityColor = FOLLOWUP_PRIORITY_COLOR[priority];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: card behaves as a button when onEdit is set; role + tabIndex + keyboard handler are wired below
		<div
			role={onEdit ? "button" : undefined}
			tabIndex={onEdit ? 0 : undefined}
			onClick={() => onEdit?.(followup)}
			onKeyDown={(e) => {
				if (!onEdit) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit(followup);
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
				<ReminderQuickComplete reminder={followup} hidden={!canManage} size="sm" />
			</div>

			{/* Body */}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{/* Row 1: title + priority chip + due */}
				<div className="flex items-start justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm font-medium",
							isCompleted && "line-through text-muted-foreground",
						)}
						title={followup.title}
					>
						{followup.title}
					</span>
					<div className="flex shrink-0 items-center gap-1.5">
						<span
							className="inline-flex h-4 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium uppercase"
							style={{
								color: priorityColor,
								borderColor: `${priorityColor}66`,
								backgroundColor: `${priorityColor}14`,
							}}
							title={`Priority: ${FOLLOWUP_PRIORITY_LABEL[priority]}`}
						>
							<span
								aria-hidden
								className="size-1.5 rounded-full"
								style={{ backgroundColor: priorityColor }}
							/>
							{FOLLOWUP_PRIORITY_LABEL[priority]}
						</span>
						<span
							className={cn(
								"text-[11px] tabular-nums",
								isOverdue ? "text-red-600 font-medium" : "text-muted-foreground",
							)}
							title={format(followup.dueAt, "PPP p")}
						>
							{formatDueShort(followup.dueAt, isCompleted)}
						</span>
					</div>
				</div>

				{/* Row 2: entity context */}
				<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
					{!hidePersonCode && followup.personCode && (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the linked badge from the parent card click
						// biome-ignore lint/a11y/useKeyWithClickEvents: span only stops propagation; keyboard handling lives on the inner Link
						<span onClick={(e) => e.stopPropagation()}>
							<IdentityBadge
								entityType="person"
								code={followup.personCode}
								layout="code"
								size="xs"
							/>
						</span>
					)}
					{!hideDealCode && followup.dealCode && (
						<>
							{!hidePersonCode && followup.personCode && <span aria-hidden>·</span>}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the linked badge from the parent card click */}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: span only stops propagation; keyboard handling lives on the inner Link */}
							<span onClick={(e) => e.stopPropagation()}>
								<IdentityBadge
									entityType="deal"
									code={followup.dealCode}
									layout="code"
									size="xs"
								/>
							</span>
						</>
					)}
					{followup.followUpCode && (
						<>
							{((!hidePersonCode && followup.personCode) ||
								(!hideDealCode && followup.dealCode)) && (
								<span aria-hidden>·</span>
							)}
							<span className="font-mono text-[10px] text-muted-foreground/80">
								{followup.followUpCode}
							</span>
						</>
					)}
					{followup.note && (
						<>
							<span aria-hidden>·</span>
							<span className="truncate" title={followup.note}>
								{followup.note}
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
								<DropdownMenuItem onSelect={() => onEdit(followup)}>
									<PencilIcon className="me-2 size-3.5" />
									Edit
								</DropdownMenuItem>
							)}
							{onDelete && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onSelect={() => onDelete(followup)}
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
