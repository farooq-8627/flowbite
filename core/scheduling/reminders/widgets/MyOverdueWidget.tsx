"use client";

/**
 * MyOverdueWidget — dashboard card focused on the assignee's own overdue list.
 *
 * STATUS: IMPLEMENTED.
 *
 * Per SCHEDULING-IMPLEMENTATION.md §4.6 — reuses the same
 * `useRemindersDueToday` subscription as the other widgets / org page so
 * Convex's dedup keeps total calls flat.
 *
 * The server filter:
 *   - For members WITHOUT `reminders.manage` → returns reminders where
 *     `assignedTo === userId`. So this widget already shows "my overdue".
 *   - For members WITH `reminders.manage` → returns the entire org's
 *     reminders. We narrow client-side to `assignedTo === userId`.
 */

import { ArrowRightIcon, FlameIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import { ReminderCard } from "@/core/scheduling/reminders/components/ReminderCard";
import { useRemindersDueToday } from "@/core/scheduling/reminders/hooks";
import { bucketByDue } from "@/core/scheduling/reminders/lib/reminder-buckets";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";

interface MyOverdueWidgetProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string;
	limit?: number;
	className?: string;
}

export function MyOverdueWidget({ orgId, orgSlug, limit = 3, className }: MyOverdueWidgetProps) {
	const me = useMe();
	const reminders = useRemindersDueToday({ orgId });
	const [now] = useState(() => Date.now());

	const myOverdue = useMemo(() => {
		if (!reminders || !me?._id) return undefined;
		const buckets = bucketByDue(reminders, now);
		return buckets.overdue.filter((r) => r.assignedTo === me._id);
	}, [reminders, me?._id, now]);

	const total = myOverdue?.length ?? 0;

	return (
		<Card className={className}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<div className="flex items-center gap-2">
					<FlameIcon className="size-4 text-red-500" aria-hidden />
					<CardTitle className="text-base">My overdue</CardTitle>
				</div>
				{total > 0 && (
					<Link
						href={`/${orgSlug}/reminders?status=overdue&assigned=me`}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						View {total} <ArrowRightIcon className="size-3" />
					</Link>
				)}
			</CardHeader>
			<CardContent className="pt-0">
				{myOverdue === undefined ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : myOverdue.length === 0 ? (
					<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
						You're caught up. 🎉
					</p>
				) : (
					<div className="grid gap-2">
						{myOverdue.slice(0, limit).map((r) => (
							<ReminderCard key={r._id} reminder={r} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
