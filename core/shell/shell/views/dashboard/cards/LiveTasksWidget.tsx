"use client";

/**
 * LiveTasksWidget — Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29).
 *
 * Replaces the legacy `<TasksCard>` 8-row capped list with the same
 * `<TasksDataTable>` the /tasks page uses, in compact mode. Surfaces:
 *   - The next 10 actionable rows (overdue + today + upcoming).
 *   - Quick-complete on each row (1-click ✓ via `<TaskQuickComplete>`).
 *   - Row-click → opens the full `<TaskForm>` drawer.
 *   - "+ New" header button → opens the same drawer for create.
 *   - "Open all →" link → /{orgSlug}/tasks.
 *
 * Why a live table on the dashboard
 * ────────────────────────────────
 * The user's complaint (DASHBOARD-V2-PLAN.md §0 row "Tasks should be the
 * live table from /tasks page") was that the legacy 8-row card felt
 * cosmetic — it didn't expose enough real data to be useful, and you
 * couldn't act on a row inline. The compact `<TasksDataTable>` shape
 * mirrors the /tasks page so power users get a familiar surface and
 * casual users see the same rich badges + assignee avatars they see
 * everywhere else.
 *
 * Data shape — `useTasksAllForOrg` returns the FULL org task list. We
 * sort + slice client-side because:
 *   - The hook is already cached at the dashboard level (the calendar
 *     widget + tasks panel both subscribe to the same query).
 *   - Sort order is "overdue first, then today, then upcoming, then
 *     completed" — derived from `getTaskState`. Doing it client-side
 *     means the dashboard renders the moment the underlying tasks
 *     query resolves; no extra round-trip.
 */

import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { TaskForm } from "@/core/scheduling/tasks/components/TaskForm";
import { TasksDataTable } from "@/core/scheduling/tasks/components/TasksDataTable";
import { useTasksAllForOrg } from "@/core/scheduling/tasks/hooks";
import { bucketTasksByDue } from "@/core/scheduling/tasks/lib/task-buckets";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";

type TaskRow = Doc<"tasks">;

interface LiveTasksWidgetProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	/** Max rows rendered. Default 10 (per DASHBOARD-V2-PLAN.md Stage 3). */
	limit?: number;
}

export function LiveTasksWidget({ orgId, orgSlug, limit = 10 }: LiveTasksWidgetProps) {
	const tasks = useTasksAllForOrg({ orgId });
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("tasks.create");

	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
	const [now] = useState(() => Date.now());

	// Order: overdue → today → upcoming → completed. Slice to `limit`.
	// Same bucket helper the /tasks page uses, so the dashboard never
	// surfaces a different sort than the destination route.
	const { rows, openCount } = useMemo(() => {
		if (!tasks) return { rows: [] as TaskRow[], openCount: 0 };
		const buckets = bucketTasksByDue(tasks, now);
		const ordered = [
			...buckets.overdue,
			...buckets.today,
			...buckets.upcoming,
			...buckets.completed,
		];
		const open = buckets.overdue.length + buckets.today.length + buckets.upcoming.length;
		return { rows: ordered.slice(0, limit), openCount: open };
	}, [tasks, now, limit]);

	function openCreate() {
		setEditingTask(null);
		setDrawerOpen(true);
	}

	function openEdit(task: TaskRow) {
		setEditingTask(task);
		setDrawerOpen(true);
	}

	const isLoading = tasks === undefined;
	const totalCount = tasks?.length ?? 0;

	return (
		<Card className="flex h-full flex-col min-w-0 overflow-hidden">
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-baseline gap-2">
					<CardTitle className="text-base">Tasks</CardTitle>
					<span className="text-xs text-muted-foreground">
						{isLoading
							? "loading…"
							: openCount === 0
								? totalCount === 0
									? "—"
									: "all clear"
								: `${openCount} open`}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
					>
						<Link href={`/${orgSlug}/tasks`} aria-label="Open all tasks">
							Open all
							<ArrowRightIcon className="size-3" aria-hidden />
						</Link>
					</Button>
					{canCreate && (
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							onClick={openCreate}
							data-tour="quick-add-task"
						>
							<PlusIcon className="me-1 size-3" />
							New
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col pt-0">
				{isLoading ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : (
					<TasksDataTable data={rows} compact onEdit={openEdit} now={now} />
				)}
			</CardContent>
			<TaskForm open={drawerOpen} onOpenChange={setDrawerOpen} task={editingTask} />
		</Card>
	);
}
