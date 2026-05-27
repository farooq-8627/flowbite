"use client";

/**
 * TasksPanel — compact task list embedded in entity profile / deal /
 * company tabs.
 *
 * Replaces both `RemindersPanel` and `FollowUpsPanel`. Built around ONE
 * subscription:
 *   - profile tab: `useTasksForPerson({ orgId, personCode, type? })`
 *   - deal/company tab: `useTasksForEntity({ orgId, entityType, entityId, type? })`
 *
 * Modes:
 *   - `default` (no `type` prop): renders the 4-state buckets
 *     (Overdue / Today / Upcoming / Completed) — used by the "Tasks" tab.
 *   - `cadence` (when `type === "followup"`): renders the 5-bucket
 *     Pipedrive-style cadence layout — used by the "Follow-ups" surface
 *     where mounted (deals/companies cadence-tab).
 *
 * UX:
 *   - Header: "Tasks (3 open)" + "+ Add" inline button.
 *   - Body: bucketed sections; cards via `<TaskCard>`.
 *   - Empty state: panel-variant `<TaskEmptyState>` with create CTA.
 *   - Click any card → opens edit drawer.
 *   - One-click ✓ on each card → completes (optimistic).
 *
 * Performance contract (per AGENTS.md "Per-row data on a list view
 * comes from one batched query"):
 *   - personCode-indexed query (or in-memory entity filter for
 *     deal/company) — no full-table scan.
 *   - No per-row queries; everything reads the single result + context.
 */

import { CalendarPlusIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TaskCard } from "../components/TaskCard";
import { TaskEmptyState } from "../components/TaskEmptyState";
import { TaskForm } from "../components/TaskForm";
import { useDeleteTask, useTasksForEntity, useTasksForPerson } from "../hooks";
import {
	bucketTasksByDue,
	bucketTasksCadence,
	openCadenceCount,
	openCount,
	TASK_BUCKET_ORDER,
	TASK_CADENCE_BUCKET_LABEL,
	TASK_CADENCE_BUCKET_ORDER,
} from "../lib/task-buckets";
import { TASK_STATE_LABEL } from "../lib/task-status";
import type { TaskType } from "../lib/task-type";

type Task = Doc<"tasks">;

type TasksPanelProps =
	| {
			/** Profile tab — tasks for a person (lead/contact merged via personCode). */
			personCode: string;
			entityType?: never;
			entityId?: never;
			/** Filter to a specific type (used by the "Follow-ups" cadence sub-tab). */
			type?: TaskType;
			/** Pre-bound deal context when the panel mounts inside a deal-aware view. */
			defaults?: { dealCode?: string };
			/** Override the section label — defaults to "Tasks". */
			label?: string;
			className?: string;
	  }
	| {
			/** Deal / company detail tab. */
			personCode?: never;
			entityType: "deal" | "company";
			entityId: string;
			type?: TaskType;
			/** Optional fallback personCode when the entity has a primary contact. */
			defaults?: { personCode?: string };
			label?: string;
			className?: string;
	  };

export function TasksPanel(props: TasksPanelProps) {
	const { className, label, type } = props;
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("tasks.create");

	const isPersonPanel = "personCode" in props && !!props.personCode;
	const personTasks = useTasksForPerson({
		orgId: isPersonPanel ? orgId : undefined,
		personCode: isPersonPanel ? (props as { personCode: string }).personCode : "",
		...(type ? { type } : {}),
	});
	const entityTasks = useTasksForEntity({
		orgId: !isPersonPanel ? orgId : undefined,
		entityType: !isPersonPanel ? (props as { entityType: string }).entityType : undefined,
		entityId: !isPersonPanel ? (props as { entityId: string }).entityId : undefined,
		...(type ? { type } : {}),
	});
	const tasks = isPersonPanel ? personTasks : entityTasks;
	const isLoading = tasks === undefined;

	// ── State ────────────────────────────────────────────────────────
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editing, setEditing] = useState<Task | null>(null);
	const [deletingTask, setDeletingTask] = useState<Task | null>(null);
	const [deleting, setDeleting] = useState(false);
	const deleteTask = useDeleteTask();
	const [now] = useState(() => Date.now());

	const isCadenceMode = type === "followup";

	const stateBuckets = useMemo(
		() => (isCadenceMode ? null : bucketTasksByDue(tasks ?? [], now)),
		[tasks, now, isCadenceMode],
	);
	const cadenceBuckets = useMemo(
		() => (isCadenceMode ? bucketTasksCadence(tasks ?? [], now) : null),
		[tasks, now, isCadenceMode],
	);

	const openTotal = isCadenceMode
		? cadenceBuckets
			? openCadenceCount(cadenceBuckets)
			: 0
		: stateBuckets
			? openCount(stateBuckets)
			: 0;

	// ── Handlers ─────────────────────────────────────────────────────
	const openCreate = useCallback(() => {
		setEditing(null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((t: Task) => {
		setEditing(t);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((t: Task) => {
		setDeletingTask(t);
	}, []);

	async function confirmDelete() {
		if (!deletingTask || !orgId) return;
		setDeleting(true);
		try {
			await deleteTask({ orgId, taskId: deletingTask._id });
			toast.success("Task deleted");
			setDeletingTask(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete task");
		} finally {
			setDeleting(false);
		}
	}

	// Build form defaults — pre-bind the entity / deal so the picker is
	// locked and the user can't accidentally re-target the task.
	const formDefaults = useMemo(() => {
		const base: {
			personCode?: string;
			dealCode?: string;
			entityType?: string;
			entityId?: string;
			type?: TaskType;
		} = {};
		if (type) base.type = type;
		if (isPersonPanel) {
			const p = props as { personCode: string; defaults?: { dealCode?: string } };
			base.personCode = p.personCode;
			base.entityType = "person";
			base.entityId = p.personCode;
			if (p.defaults?.dealCode) base.dealCode = p.defaults.dealCode;
		} else {
			const e = props as {
				entityType: "deal" | "company";
				entityId: string;
				defaults?: { personCode?: string };
			};
			if (e.defaults?.personCode) base.personCode = e.defaults.personCode;
			base.entityType = e.entityType;
			base.entityId = e.entityId;
		}
		return base;
	}, [isPersonPanel, props, type]);

	const headerLabel = label ?? (isCadenceMode ? "Follow-ups" : "Tasks");
	const openLabel = isCadenceMode ? "open follow-ups" : "open";
	const newLabel = isCadenceMode ? "Schedule" : "Add";

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-baseline gap-2">
					<h3 className="text-sm font-semibold">{headerLabel}</h3>
					<span className="text-xs text-muted-foreground">
						{openTotal === 0
							? `no ${openLabel}`
							: openTotal === 1
								? `1 ${openLabel.replace(" follow-ups", "follow-up").replace(" open", "open")}`
								: `${openTotal} ${openLabel}`}
					</span>
				</div>
				{canCreate && (
					<Button
						size="sm"
						variant="outline"
						onClick={openCreate}
						className="h-7 text-xs"
					>
						<CalendarPlusIcon className="me-1.5 size-3.5" />
						{newLabel}
					</Button>
				)}
			</div>

			{/* Body */}
			{isLoading ? (
				<p className="text-xs text-muted-foreground">Loading…</p>
			) : (tasks?.length ?? 0) === 0 ? (
				<TaskEmptyState variant="panel" onCreate={canCreate ? openCreate : undefined} />
			) : isCadenceMode && cadenceBuckets ? (
				<div className="grid gap-3">
					{TASK_CADENCE_BUCKET_ORDER.map((bucket) => {
						const items = cadenceBuckets[bucket];
						if (items.length === 0) return null;
						return (
							<BucketSection
								key={bucket}
								title={TASK_CADENCE_BUCKET_LABEL[bucket]}
								count={items.length}
								defaultOpen={bucket !== "completed"}
							>
								<div className="grid gap-2">
									{items.map((t) => (
										<TaskCard
											key={t._id}
											task={t}
											onEdit={openEdit}
											onDelete={askDelete}
											hidePersonCode={isPersonPanel}
											hideType
										/>
									))}
								</div>
							</BucketSection>
						);
					})}
				</div>
			) : stateBuckets ? (
				<div className="grid gap-3">
					{TASK_BUCKET_ORDER.map((bucket) => {
						const items = stateBuckets[bucket];
						if (items.length === 0) return null;
						const isCompletedBucket = bucket === "completed";
						return (
							<BucketSection
								key={bucket}
								title={TASK_STATE_LABEL[bucket]}
								count={items.length}
								defaultOpen={!isCompletedBucket}
							>
								<div className="grid gap-2">
									{items.map((t) => (
										<TaskCard
											key={t._id}
											task={t}
											onEdit={openEdit}
											onDelete={askDelete}
											hidePersonCode={isPersonPanel}
										/>
									))}
								</div>
							</BucketSection>
						);
					})}
				</div>
			) : null}

			{/* Drawer */}
			<TaskForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				task={editing}
				defaults={editing ? undefined : formDefaults}
			/>

			{/* Delete confirm */}
			<AlertDialog open={!!deletingTask} onOpenChange={(v) => !v && setDeletingTask(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this task?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingTask?.title}. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								void confirmDelete();
							}}
							disabled={deleting}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{deleting ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ─── Section accordion ───────────────────────────────────────────────────────

function BucketSection({
	title,
	count,
	defaultOpen,
	children,
}: {
	title: string;
	count: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen ?? true);
	return (
		<div className="grid gap-2">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
			>
				<span className="flex items-center gap-1.5">
					<ChevronDownIcon
						className={cn("size-3 transition-transform", !open && "-rotate-90")}
						aria-hidden
					/>
					<span>{title}</span>
					<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{count}</span>
				</span>
			</button>
			{open && children}
		</div>
	);
}
