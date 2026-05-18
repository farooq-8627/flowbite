"use client";

/**
 * NextReminderFallback — shown inside <RemindersCard /> when there are no
 * overdue / due-today reminders.
 *
 * STATUS: IMPLEMENTED.
 *
 * Two states:
 *   - `next` is undefined → friendly empty state ("Take a breath. ✨")
 *   - `next` is set → linkable card showing the next upcoming reminder
 *     with a relative time ("in 3 days") and the canonical absolute
 *     time. The link drills into the person profile + reminders panel
 *     so the user can act on it immediately.
 *
 * Pure presentational — no Convex calls, no state. Data comes from the
 * parent via the `next` prop.
 */

import { format, formatDistanceToNow } from "date-fns";
import { Clock } from "lucide-react";
import Link from "next/link";

interface NextReminderFallbackProps {
	next:
		| {
				_id: string;
				title: string;
				dueAt: number;
				personCode: string;
		  }
		| undefined;
	orgSlug: string;
}

export function NextReminderFallback({ next, orgSlug }: NextReminderFallbackProps) {
	if (!next) {
		return (
			<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
				Nothing due today and nothing overdue. Take a breath. ✨
			</p>
		);
	}
	const distance = formatDistanceToNow(next.dueAt, { addSuffix: true });
	return (
		<div className="flex flex-col gap-2">
			<p className="text-[11px] text-muted-foreground">
				Nothing due today. Your next reminder:
			</p>
			<Link
				href={`/${orgSlug}/profile/${next.personCode}#reminders.list`}
				className="flex flex-col gap-1 rounded-[var(--radius)] border bg-card px-3 py-2 transition-colors hover:border-ring/40 hover:bg-accent/30"
			>
				<span className="truncate text-sm font-medium" title={next.title}>
					{next.title}
				</span>
				<span className="flex items-center gap-2 text-[11px] text-muted-foreground">
					<Clock className="size-3" />
					<span>{distance}</span>
					<span aria-hidden>·</span>
					<span className="font-mono tabular-nums">{next.personCode}</span>
				</span>
				<span className="text-[10px] text-muted-foreground">
					{format(next.dueAt, "EEE, MMM d 'at' h:mm a")}
				</span>
			</Link>
		</div>
	);
}
