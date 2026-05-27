"use client";

/**
 * NextTaskFallback — shown inside `<TasksCard />` when there are no
 * overdue / due-today tasks.
 *
 * Two states:
 *   - `next` is undefined → friendly empty state ("Take a breath. ✨")
 *   - `next` is set → linkable card showing the next upcoming task
 *     with a relative time ("in 3 days") and the canonical absolute
 *     time. The link drills into the person profile + tasks panel.
 *
 * Pure presentational — no Convex calls, no state.
 */

import { format, formatDistanceToNow } from "date-fns";
import { Clock } from "lucide-react";
import Link from "next/link";

interface NextTaskFallbackProps {
	next:
		| {
				_id: string;
				title: string;
				dueAt: number;
				personCode?: string;
		  }
		| undefined;
	orgSlug: string;
}

export function NextTaskFallback({ next, orgSlug }: NextTaskFallbackProps) {
	if (!next) {
		return (
			<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
				Nothing due today and nothing overdue. Take a breath. ✨
			</p>
		);
	}
	const distance = formatDistanceToNow(next.dueAt, { addSuffix: true });
	const href = next.personCode
		? `/${orgSlug}/profile/${next.personCode}#tasks.list`
		: `/${orgSlug}/tasks`;
	return (
		<div className="flex flex-col gap-2">
			<p className="text-[11px] text-muted-foreground">Nothing due today. Your next task:</p>
			<Link
				href={href}
				className="flex flex-col gap-1 rounded-[var(--radius)] border bg-card px-3 py-2 transition-colors hover:border-ring/40 hover:bg-accent/30"
			>
				<span className="truncate text-sm font-medium" title={next.title}>
					{next.title}
				</span>
				<span className="flex items-center gap-2 text-[11px] text-muted-foreground">
					<Clock className="size-3" />
					<span>{distance}</span>
					{next.personCode && (
						<>
							<span aria-hidden>·</span>
							<span className="font-mono tabular-nums">{next.personCode}</span>
						</>
					)}
				</span>
				<span className="text-[10px] text-muted-foreground">
					{format(next.dueAt, "EEE, MMM d 'at' h:mm a")}
				</span>
			</Link>
		</div>
	);
}
