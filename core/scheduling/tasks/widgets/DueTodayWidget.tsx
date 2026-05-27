"use client";

/**
 * DueTodayWidget — dashboard card surfacing top tasks due today.
 *
 * Reuses the SAME `useTasksDueToday` subscription as `<TasksView>`.
 * Convex deduplicates the network call so mounting the widget alongside
 * the org page is free.
 */

import { ArrowRightIcon, CalendarClockIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskCard } from "@/core/scheduling/tasks/components/TaskCard";
import { TaskEmptyState } from "@/core/scheduling/tasks/components/TaskEmptyState";
import { useTasksDueToday } from "@/core/scheduling/tasks/hooks";
import { bucketTasksByDue } from "@/core/scheduling/tasks/lib/task-buckets";

interface DueTodayWidgetProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string;
	limit?: number;
	className?: string;
}

export function DueTodayWidget({ orgId, orgSlug, limit = 5, className }: DueTodayWidgetProps) {
	const tasks = useTasksDueToday({ orgId });
	const [now] = useState(() => Date.now());

	const top = useMemo(() => {
		if (!tasks) return undefined;
		const buckets = bucketTasksByDue(tasks, now);
		const ordered = [...buckets.overdue, ...buckets.today];
		return ordered.slice(0, limit);
	}, [tasks, now, limit]);

	return (
		<Card className={className}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<div className="flex items-center gap-2">
					<CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Due today &amp; overdue</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/tasks`}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					View all <ArrowRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="pt-0">
				{top === undefined ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : top.length === 0 ? (
					<TaskEmptyState variant="panel" />
				) : (
					<div className="grid gap-2">
						{top.map((t) => (
							<TaskCard key={t._id} task={t} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
