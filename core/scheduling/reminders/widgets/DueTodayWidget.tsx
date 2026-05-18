"use client";

/**
 * DueTodayWidget — dashboard card surfacing top reminders due today.
 *
 * STATUS: IMPLEMENTED.
 *
 * Per SCHEDULING-IMPLEMENTATION.md §4.6:
 *   - Reuses the SAME `useRemindersDueToday` subscription as
 *     `<RemindersView>`. Convex deduplicates the network call so
 *     mounting the widget alongside the org page is free.
 *   - Renders the top N reminders (default 5) via `<ReminderCard>`.
 *   - "View all" link → /{orgSlug}/reminders.
 */

import { ArrowRightIcon, BellIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import { ReminderCard } from "@/core/scheduling/reminders/components/ReminderCard";
import { ReminderEmptyState } from "@/core/scheduling/reminders/components/ReminderEmptyState";
import { useRemindersDueToday } from "@/core/scheduling/reminders/hooks";
import { bucketByDue } from "@/core/scheduling/reminders/lib/reminder-buckets";

interface DueTodayWidgetProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string;
	limit?: number;
	className?: string;
}

export function DueTodayWidget({ orgId, orgSlug, limit = 5, className }: DueTodayWidgetProps) {
	const reminders = useRemindersDueToday({ orgId });
	const [now] = useState(() => Date.now());

	const top = useMemo(() => {
		if (!reminders) return undefined;
		const buckets = bucketByDue(reminders, now);
		const ordered = [...buckets.overdue, ...buckets.today];
		return ordered.slice(0, limit);
	}, [reminders, now, limit]);

	return (
		<Card className={className}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<div className="flex items-center gap-2">
					<BellIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Due today & overdue</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/reminders`}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					View all <ArrowRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="pt-0">
				{top === undefined ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : top.length === 0 ? (
					<ReminderEmptyState variant="panel" />
				) : (
					<div className="grid gap-2">
						{top.map((r) => (
							<ReminderCard key={r._id} reminder={r} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
