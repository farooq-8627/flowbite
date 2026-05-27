"use client";

/**
 * MyOverdueWidget — dashboard card focused on the assignee's own overdue list.
 *
 * Reuses the same `useTasksDueToday` subscription as the other widgets
 * / org page so Convex's dedup keeps total calls flat.
 *
 * The server filter:
 *   - For members WITHOUT `tasks.manage` → returns tasks where
 *     `assignedTo === userId`. So this widget already shows "my overdue".
 *   - For members WITH `tasks.manage` → returns the entire org's tasks.
 *     We narrow client-side to `assignedTo === userId`.
 */

import { ArrowRightIcon, FlameIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskCard } from "@/core/scheduling/tasks/components/TaskCard";
import { useTasksDueToday } from "@/core/scheduling/tasks/hooks";
import { bucketTasksByDue } from "@/core/scheduling/tasks/lib/task-buckets";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";

interface MyOverdueWidgetProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string;
	limit?: number;
	className?: string;
}

export function MyOverdueWidget({ orgId, orgSlug, limit = 3, className }: MyOverdueWidgetProps) {
	const me = useMe();
	const tasks = useTasksDueToday({ orgId });
	const [now] = useState(() => Date.now());

	const myOverdue = useMemo(() => {
		if (!tasks || !me?._id) return undefined;
		const buckets = bucketTasksByDue(tasks, now);
		return buckets.overdue.filter((t) => t.assignedTo === me._id);
	}, [tasks, me?._id, now]);

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
						href={`/${orgSlug}/tasks?status=overdue&assigned=me`}
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
						{myOverdue.slice(0, limit).map((t) => (
							<TaskCard key={t._id} task={t} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
