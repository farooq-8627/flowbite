"use client";

/**
 * EventDetailPopover — popover surfacing one event's details + actions.
 *
 * STATUS: IMPLEMENTED.
 *
 * The popover is a *controlled* component owned by `<CalendarMain>`.
 * The grid keeps a `selectedEvent` ref and renders this popover anchored
 * to the click coordinates. Why owned by the parent? So clicking a
 * different chip cleanly transitions the popover (no per-chip popover
 * state to leak / stack).
 *
 * Content:
 *   - Title row + coloured source badge.
 *   - Date (+ time) — relative + absolute side-by-side.
 *   - PersonCode chip if present (clickable → /profile/:code).
 *   - Click-through button: "Open profile" / "Open deal" / "Open record".
 *   - For reminders only: "Edit" + "Delete" + "Complete" buttons.
 *
 * Permissions for the reminder-specific buttons are deferred to the
 * caller (`<CalendarMain>` decides whether to render them based on
 * `useOrgPermissions`).
 */

import { format, formatDistanceToNow } from "date-fns";
import {
	BellIcon,
	CalendarRangeIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
	HandshakeIcon,
	PencilIcon,
	TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { cn } from "@/lib/utils";

interface EventDetailPopoverProps {
	event: CalendarEventDTO | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Anchor element for popover positioning. */
	anchor?: HTMLElement | null;
	canManageReminder?: boolean;
	onEditReminder?: (event: CalendarEventDTO) => void;
	onDeleteReminder?: (event: CalendarEventDTO) => void;
	onCompleteReminder?: (event: CalendarEventDTO) => void;
}

const SOURCE_ICON = {
	reminder: BellIcon,
	activity: CalendarRangeIcon,
	deal: HandshakeIcon,
} as const;

const SOURCE_LABEL = {
	reminder: "Reminder",
	activity: "Activity",
	deal: "Deal close",
} as const;

export function EventDetailPopover({
	event,
	open,
	onOpenChange,
	anchor,
	canManageReminder,
	onEditReminder,
	onDeleteReminder,
	onCompleteReminder,
}: EventDetailPopoverProps) {
	const id = useId();
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	if (!event) return null;

	const Icon = SOURCE_ICON[event.source];
	const SourceLabel = SOURCE_LABEL[event.source];

	const detailHref = (() => {
		if (!orgSlug) return null;
		const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;
		if (event.source === "deal" && event.entityId) {
			return `${prefix}/deals/${event.entityId}`;
		}
		if (event.personCode) {
			return `${prefix}/profile/${event.personCode}`;
		}
		return null;
	})();

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			{/* Anchorless positioning — controlled by external ref the parent owns. */}
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-80 space-y-3 p-3 text-xs"
				style={anchor ? undefined : { position: "absolute" }}
				aria-labelledby={`${id}-title`}
			>
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-start gap-2">
						<span
							className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-white"
							style={{ backgroundColor: event.color }}
						>
							<Icon className="size-3.5" aria-hidden />
						</span>
						<div className="flex flex-col">
							<h4 id={`${id}-title`} className="text-sm font-semibold leading-tight">
								{event.title}
							</h4>
							<span className="text-[11px] capitalize text-muted-foreground">
								{SourceLabel}
								{event.meta?.followUpCode ? ` · ${event.meta.followUpCode}` : ""}
								{event.meta?.dealCode ? ` · ${event.meta.dealCode}` : ""}
							</span>
						</div>
					</div>
				</div>

				<dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
					<dt>When</dt>
					<dd className="text-foreground">
						<span className="font-medium">
							{format(event.startsAt, "EEE, MMM d, yyyy 'at' h:mm a")}
						</span>
						<span className="ms-1.5 text-muted-foreground">
							({formatDistanceToNow(event.startsAt, { addSuffix: true })})
						</span>
					</dd>

					{event.personCode && (
						<>
							<dt>Person</dt>
							<dd className="text-foreground">
								<Badge
									variant="outline"
									className="h-4 px-1.5 font-mono text-[10px]"
								>
									{event.personCode}
								</Badge>
							</dd>
						</>
					)}

					{event.meta?.value !== undefined && event.source === "deal" && (
						<>
							<dt>Value</dt>
							<dd className="text-foreground">
								{Number(event.meta.value).toLocaleString()}{" "}
								{event.meta.currency ? String(event.meta.currency) : ""}
							</dd>
						</>
					)}

					{event.meta?.assignedTo && event.source === "reminder" && (
						<>
							<dt>Assignee</dt>
							<dd className="font-mono text-foreground">
								{String(event.meta.assignedTo)}
							</dd>
						</>
					)}
				</dl>

				<div className="flex flex-wrap items-center gap-2 pt-1">
					{event.source === "reminder" && canManageReminder && (
						<>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => onCompleteReminder?.(event)}
							>
								<CheckCircle2Icon className="me-1.5 size-3.5" />
								Complete
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => onEditReminder?.(event)}
							>
								<PencilIcon className="me-1.5 size-3.5" />
								Edit
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className={cn(
									"h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10",
								)}
								onClick={() => onDeleteReminder?.(event)}
							>
								<TrashIcon className="me-1.5 size-3.5" />
								Delete
							</Button>
						</>
					)}
					{detailHref && (
						<Button asChild size="sm" variant="ghost" className="ms-auto h-7 text-xs">
							<Link href={detailHref}>
								<ExternalLinkIcon className="me-1.5 size-3.5" />
								Open
							</Link>
						</Button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
