"use client";

/**
 * TasksCard — dashboard card showing today + overdue tasks, with an
 * inline "+ New" button that opens the TaskForm drawer.
 *
 * Replaces the legacy RemindersCard per TASKS-RENAME-PLAN.md (Stage 4B).
 *
 * Two tabs:
 *   - **Today & overdue** — capped at 8 cards. When empty, shows
 *     `<NextTaskFallback />` with the next upcoming task.
 *   - **Mine** — overdue items assigned to the current user. Capped at 6.
 */

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskCard } from "@/core/scheduling/tasks/components/TaskCard";
import { TaskForm } from "@/core/scheduling/tasks/components/TaskForm";
import { useTasksDueAndOverdue, useTasksNextUpcoming } from "@/core/scheduling/tasks/hooks";
import { bucketTasksByDue } from "@/core/scheduling/tasks/lib/task-buckets";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { NextTaskFallback } from "./NextTaskFallback";

interface TasksCardProps {
	orgId: Id<"orgs">;
	orgSlug: string;
}

export function TasksCard({ orgId, orgSlug }: TasksCardProps) {
	const me = useMe();
	const tasks = useTasksDueAndOverdue({ orgId });
	// Only subscribe to `getNextUpcoming` when the main bucket is empty
	// (concurrency fix carried forward from the legacy RemindersCard —
	// avoids a 2-call/min/user idle-dashboard hotspot).
	const bucketEmpty = tasks !== undefined && tasks.length === 0;
	const nextUpcoming = useTasksNextUpcoming({ orgId, limit: 1, enabled: bucketEmpty });
	const [now] = useState(() => Date.now());
	const [drawerOpen, setDrawerOpen] = useState(false);

	const { todayAndOverdue, myOverdue } = useMemo(() => {
		if (!tasks) return { todayAndOverdue: [], myOverdue: [] };
		const buckets = bucketTasksByDue(tasks, now);
		const all = [...buckets.overdue, ...buckets.today];
		const mine = buckets.overdue.filter((t) => t.assignedTo === me?._id);
		return { todayAndOverdue: all.slice(0, 8), myOverdue: mine.slice(0, 6) };
	}, [tasks, now, me?._id]);

	const next = nextUpcoming?.[0];
	const isLoading = tasks === undefined;

	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<CardTitle className="text-base">Tasks</CardTitle>
				<div className="flex items-center gap-1">
					<Link
						href={`/${orgSlug}/tasks`}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						View all
					</Link>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						data-tour="quick-add-task"
						onClick={() => setDrawerOpen(true)}
					>
						<PlusIcon className="me-1 size-3" />
						New
					</Button>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col pt-0">
				<Tabs defaultValue="due" className="flex flex-1 flex-col">
					<TabsList className="h-7 text-xs self-start">
						<TabsTrigger value="due" className="text-xs h-6 px-2">
							Today &amp; overdue ({todayAndOverdue.length})
						</TabsTrigger>
						<TabsTrigger value="mine" className="text-xs h-6 px-2">
							Mine ({myOverdue.length})
						</TabsTrigger>
					</TabsList>
					<TabsContent value="due" className="mt-2 flex-1 min-h-0">
						{isLoading ? (
							<p className="text-xs text-muted-foreground">Loading…</p>
						) : todayAndOverdue.length === 0 ? (
							<NextTaskFallback next={next} orgSlug={orgSlug} />
						) : (
							<div className="grid gap-1.5">
								{todayAndOverdue.map((t) => (
									<TaskCard key={t._id} task={t} />
								))}
							</div>
						)}
					</TabsContent>
					<TabsContent value="mine" className="mt-2 flex-1 min-h-0">
						{myOverdue.length === 0 ? (
							<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
								You're caught up. 🎉
							</p>
						) : (
							<div className="grid gap-1.5">
								{myOverdue.map((t) => (
									<TaskCard key={t._id} task={t} />
								))}
							</div>
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
			<TaskForm open={drawerOpen} onOpenChange={setDrawerOpen} />
		</Card>
	);
}
