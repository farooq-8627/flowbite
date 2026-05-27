"use client";

/**
 * TasksView — unified tasks workspace.
 *
 * Single page, three views toggled via the toolbar (URL-persisted):
 *   • list      — DataTable + stats (was the original RemindersView)
 *   • calendar  — Embedded CalendarMain showing tasks + activity + deal-close
 *   • today     — Dense at-a-glance dashboard (today + overdue, week ahead)
 *
 * Replaces both `RemindersView` + `FollowUpsView`. The cadence semantics
 * that lived on the followups page are preserved — operators wanting the
 * cadence lens filter the type column to "Follow-up" or use the cadence
 * panel embedded in deal/company tabs.
 */

import { useConvex } from "convex/react";
import {
	CalendarDaysIcon,
	CheckCircle2Icon,
	ClockIcon,
	FlameIcon,
	HourglassIcon,
	LayoutDashboardIcon,
	ListIcon,
	PlusIcon,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/core/data-display/datatable/components/DataTable";
import { DataTableToolbar } from "@/core/data-display/datatable/components/DataTableToolbar";
import { DataTableViewOptions } from "@/core/data-display/datatable/components/DataTableViewOptions";
import { useDataTable } from "@/core/data-display/datatable/hooks/useDataTable";
import { CalendarMain } from "@/core/scheduling/calendar/components/CalendarMain";
import { CalendarToolbar } from "@/core/scheduling/calendar/components/CalendarToolbar";
import { useCalendarEvents } from "@/core/scheduling/calendar/hooks";
import {
	useCalendarFilters,
	useCalendarViewMode,
} from "@/core/scheduling/calendar/hooks/useCalendarViewMode";
import { getRangeForView } from "@/core/scheduling/calendar/lib/calendar-grid";
import { WeekAheadWidget } from "@/core/scheduling/calendar/widgets/WeekAheadWidget";
import {
	useCompleteTask,
	useDeleteTask,
	useTasksAllForOrg,
	useTasksNextUpcoming,
	useUpdateTask,
} from "@/core/scheduling/tasks/hooks";
import { bucketTasksByDue } from "@/core/scheduling/tasks/lib/task-buckets";
import { EntityPageLayout } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTaskColumns } from "../components/columns/useTaskColumns";
import { TaskCard } from "../components/TaskCard";
import { TaskEmptyState } from "../components/TaskEmptyState";
import { TaskForm } from "../components/TaskForm";

type TaskRow = Doc<"tasks">;
type ScopeTab = "today" | "open" | "completed" | "all";

const VIEW_VALUES = ["list", "calendar", "today"] as const;
type TaskViewMode = (typeof VIEW_VALUES)[number];

// ─── Component ───────────────────────────────────────────────────────────────

export function TasksView({ orgSlug }: { orgSlug?: string }) {
	const { orgId } = useCurrentOrg();
	const me = useMe();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("tasks.create");
	const canManage = permissions.includes("tasks.manage");

	// View mode is URL-persisted so deep-links survive (?view=calendar).
	const [view, setView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEW_VALUES).withDefault("list"),
	);

	// ── Shared state ─────────────────────────────────────────────────
	const tasks = useTasksAllForOrg({ orgId });
	const isLoading = tasks === undefined;

	const [tab, setTab] = useState<ScopeTab>("today");
	const [search, setSearch] = useState("");
	const [now] = useState(() => Date.now());

	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{ startsAt?: number } | null>(null);

	const [deletingTask, setDeletingTask] = useState<TaskRow | null>(null);
	const deleteTask = useDeleteTask();
	const [deleting, setDeleting] = useState(false);

	// ── Derive buckets / stats (shared by list + today) ─────────────
	const allTasks = tasks ?? [];
	const buckets = useMemo(() => bucketTasksByDue(allTasks, now), [allTasks, now]);
	const stats = useMemo(
		() => ({
			total: allTasks.length,
			overdue: buckets.overdue.length,
			today: buckets.today.length,
			completed: buckets.completed.length,
		}),
		[allTasks.length, buckets.overdue.length, buckets.today.length, buckets.completed.length],
	);

	// ── Form handlers (shared) ──────────────────────────────────────
	const openCreate = useCallback((startsAt?: Date) => {
		setEditingTask(null);
		setCreateDefaults(startsAt ? { startsAt: startsAt.getTime() } : null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((row: TaskRow) => {
		setEditingTask(row);
		setCreateDefaults(null);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((row: TaskRow) => {
		setDeletingTask(row);
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

	// ── Render ──────────────────────────────────────────────────────
	const viewToggle = (
		<TasksViewToggle view={view as TaskViewMode} onChange={(v) => void setView(v)} />
	);

	return (
		<EntityPageLayout
			views={[]}
			view="list"
			onViewChange={() => undefined}
			orgId={orgId}
			search={
				view === "list"
					? {
							value: search,
							onChange: setSearch,
							placeholder: "Search tasks…",
						}
					: undefined
			}
			toolbarExtras={viewToggle}
			primaryAction={
				canCreate
					? {
							label: "New task",
							icon: PlusIcon,
							onClick: () => openCreate(),
							permission: "tasks.create",
						}
					: undefined
			}
		>
			{view === "list" && (
				<ListMode
					stats={stats}
					tab={tab}
					setTab={setTab}
					buckets={buckets}
					allTasks={allTasks}
					search={search}
					setSearch={setSearch}
					isLoading={isLoading}
					me={me?._id as string | undefined}
					now={now}
					onEdit={openEdit}
					onDelete={askDelete}
					onCreate={canCreate ? () => openCreate() : undefined}
				/>
			)}
			{view === "calendar" && (
				<CalendarMode
					orgId={orgId}
					canCreate={canCreate}
					canManage={canManage}
					onOpenCreate={openCreate}
					onOpenEdit={openEdit}
					onAskDelete={askDelete}
				/>
			)}
			{view === "today" && (
				<TodayMode
					orgId={orgId}
					orgSlug={orgSlug}
					stats={stats}
					buckets={buckets}
					me={me?._id as string | undefined}
					onCreate={canCreate ? () => openCreate() : undefined}
					onEdit={openEdit}
					onDelete={askDelete}
				/>
			)}

			{/* Shared drawer (create + edit) */}
			<TaskForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				task={editingTask}
				defaults={
					editingTask
						? undefined
						: {
								dueAt: createDefaults?.startsAt,
							}
				}
			/>

			{/* Shared delete confirm */}
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
		</EntityPageLayout>
	);
}

// ─── View toggle ─────────────────────────────────────────────────────────────

function TasksViewToggle({
	view,
	onChange,
}: {
	view: TaskViewMode;
	onChange: (v: TaskViewMode) => void;
}) {
	const options: Array<{ value: TaskViewMode; label: string; icon: typeof ListIcon }> = [
		{ value: "today", label: "Today", icon: LayoutDashboardIcon },
		{ value: "list", label: "List", icon: ListIcon },
		{ value: "calendar", label: "Calendar", icon: CalendarDaysIcon },
	];
	return (
		<div className="inline-flex h-8 items-center overflow-hidden rounded-[var(--radius)] border bg-background p-0.5">
			{options.map((opt) => {
				const Icon = opt.icon;
				const active = view === opt.value;
				return (
					<Button
						key={opt.value}
						type="button"
						variant="ghost"
						size="icon"
						aria-pressed={active}
						aria-label={opt.label}
						title={opt.label}
						onClick={() => onChange(opt.value)}
						className={cn(
							"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
							active
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" />
					</Button>
				);
			})}
		</div>
	);
}

// ─── List mode (DataTable view) ─────────────────────────────────────────────

interface ListModeProps {
	stats: { total: number; overdue: number; today: number; completed: number };
	tab: ScopeTab;
	setTab: (v: ScopeTab) => void;
	buckets: ReturnType<typeof bucketTasksByDue<TaskRow>>;
	allTasks: TaskRow[];
	search: string;
	setSearch: (v: string) => void;
	isLoading: boolean;
	me: string | undefined;
	now: number;
	onEdit: (r: TaskRow) => void;
	onDelete: (r: TaskRow) => void;
	onCreate?: () => void;
}

function ListMode({
	stats,
	tab,
	setTab,
	buckets,
	allTasks,
	search,
	setSearch,
	isLoading,
	me,
	now,
	onEdit,
	onDelete,
	onCreate,
}: ListModeProps) {
	const visibleTasks: TaskRow[] = useMemo(() => {
		switch (tab) {
			case "today":
				return [...buckets.today, ...buckets.overdue];
			case "open":
				return [...buckets.overdue, ...buckets.today, ...buckets.upcoming];
			case "completed":
				return buckets.completed;
			default:
				return allTasks;
		}
	}, [tab, buckets, allTasks]);

	const filteredTasks = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return visibleTasks;
		return visibleTasks.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				(t.note ?? "").toLowerCase().includes(q) ||
				t.taskCode.toLowerCase().includes(q) ||
				(t.personCode ?? "").toLowerCase().includes(q) ||
				(t.dealCode ?? "").toLowerCase().includes(q),
		);
	}, [visibleTasks, search]);

	const columns = useTaskColumns({
		now,
		onEdit,
		onDelete,
		currentUserId: me,
	});

	const { table } = useDataTable<TaskRow>({
		data: filteredTasks,
		columns,
		pageCount: Math.max(1, Math.ceil(filteredTasks.length / 25)),
		initialState: {
			pagination: { pageSize: 25, pageIndex: 0 },
			sorting: [{ id: "dueAt", desc: false }],
		},
		getRowId: (row) => row._id,
	});

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 xl:p-4">
			<div className="grid gap-2 grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Total"
					value={stats.total}
					icon={<HourglassIcon className="size-3.5" aria-hidden />}
					accent="text-foreground"
				/>
				<StatCard
					label="Overdue"
					value={stats.overdue}
					icon={<FlameIcon className="size-3.5" aria-hidden />}
					accent="text-red-600"
				/>
				<StatCard
					label="Due today"
					value={stats.today}
					icon={<ClockIcon className="size-3.5" aria-hidden />}
					accent="text-amber-600"
				/>
				<StatCard
					label="Completed"
					value={stats.completed}
					icon={<CheckCircle2Icon className="size-3.5" aria-hidden />}
					accent="text-emerald-600"
				/>
			</div>

			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as ScopeTab)}
				className="flex flex-1 flex-col gap-2 min-h-0 min-w-0"
			>
				<TabsList>
					<TabsTrigger value="today">
						Today
						{stats.today + stats.overdue > 0 && (
							<span className="ms-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
								{stats.today + stats.overdue}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="open">Open</TabsTrigger>
					<TabsTrigger value="completed">Completed</TabsTrigger>
					<TabsTrigger value="all">All</TabsTrigger>
				</TabsList>

				{isLoading ? (
					<TaskEmptyState variant="org" onCreate={onCreate} />
				) : allTasks.length === 0 ? (
					<TaskEmptyState variant="org" onCreate={onCreate} />
				) : filteredTasks.length === 0 ? (
					<TaskEmptyState
						variant="filtered"
						onResetFilters={() => {
							setSearch("");
							table.resetColumnFilters();
						}}
					/>
				) : (
					<DataTable
						table={table}
						pageSizeOptions={[10, 25, 50, 100]}
						onRowClick={onEdit}
					>
						<DataTableToolbar table={table}>
							<DataTableViewOptions table={table} />
						</DataTableToolbar>
					</DataTable>
				)}
			</Tabs>
		</div>
	);
}

// ─── Calendar mode (embedded CalendarMain) ──────────────────────────────────

interface CalendarModeProps {
	orgId: Id<"orgs"> | undefined;
	canCreate: boolean;
	canManage: boolean;
	onOpenCreate: (startsAt?: Date) => void;
	onOpenEdit: (row: TaskRow) => void;
	onAskDelete: (row: TaskRow) => void;
}

function CalendarMode({
	orgId,
	canCreate,
	canManage,
	onOpenCreate,
	onOpenEdit,
	onAskDelete,
}: CalendarModeProps) {
	const { viewMode, setViewMode, selectedDate, setSelectedDate, today } = useCalendarViewMode();
	const { sources } = useCalendarFilters();

	const range = useMemo(() => getRangeForView(viewMode, selectedDate), [viewMode, selectedDate]);

	const events = useCalendarEvents({
		orgId,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		scope: "org",
		sources,
	});

	const completeTask = useCompleteTask();
	const updateTask = useUpdateTask();
	const convex = useConvex();

	// Reschedule via drag (one mutation per drop).
	const handleReschedule = useCallback(
		async (event: { id: string; startsAt: number }, newDate: Date) => {
			if (!orgId) return;
			const taskId = parseTaskIdFromDtoId(event.id);
			if (!taskId) return;
			const original = new Date(event.startsAt);
			const newDueAt = new Date(newDate);
			newDueAt.setHours(original.getHours(), original.getMinutes(), 0, 0);
			try {
				await updateTask({
					orgId,
					taskId: taskId as Id<"tasks">,
					dueAt: newDueAt.getTime(),
				});
				toast.success("Task rescheduled");
			} catch (err) {
				toast.mutationError(err, "Couldn't reschedule");
			}
		},
		[orgId, updateTask],
	);

	const handleCompleteFromPopover = useCallback(
		async (event: { id: string }) => {
			if (!orgId) return;
			const taskId = parseTaskIdFromDtoId(event.id);
			if (!taskId) return;
			try {
				await completeTask({ orgId, taskId: taskId as Id<"tasks"> });
				toast.success("Task completed");
			} catch (err) {
				toast.mutationError(err, "Couldn't complete task");
			}
		},
		[orgId, completeTask],
	);

	const handleEditFromPopover = useCallback(
		async (event: { id: string }) => {
			if (!orgId) return;
			const taskId = parseTaskIdFromDtoId(event.id);
			if (!taskId) {
				toast.info("Only tasks can be edited from the calendar.");
				return;
			}
			try {
				const doc = await convex.query(api.crm.shared.tasks.queries.getById, {
					orgId,
					taskId: taskId as Id<"tasks">,
				});
				if (!doc) {
					toast.error("Task not found");
					return;
				}
				onOpenEdit(doc as Doc<"tasks">);
			} catch {
				toast.error("Couldn't load task for editing");
			}
		},
		[orgId, convex, onOpenEdit],
	);

	const handleDeleteFromPopover = useCallback(
		async (event: { id: string; title: string }) => {
			if (!orgId) return;
			const taskId = parseTaskIdFromDtoId(event.id);
			if (!taskId) return;
			try {
				const doc = await convex.query(api.crm.shared.tasks.queries.getById, {
					orgId,
					taskId: taskId as Id<"tasks">,
				});
				if (!doc) return;
				onAskDelete(doc as Doc<"tasks">);
			} catch {
				/* ignore */
			}
		},
		[orgId, convex, onAskDelete],
	);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<CalendarToolbar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				selectedDate={selectedDate}
				onSelectDate={setSelectedDate}
				onToday={today}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<CalendarMain
					viewMode={viewMode}
					selectedDate={selectedDate}
					events={events}
					onSelectDate={setSelectedDate}
					onCreateAtDate={canCreate ? onOpenCreate : undefined}
					onCreateAtDateTime={canCreate ? onOpenCreate : undefined}
					canManageReminder={canManage}
					onCompleteReminder={handleCompleteFromPopover}
					onEditReminder={handleEditFromPopover}
					onDeleteReminder={handleDeleteFromPopover}
					onRescheduleReminder={canManage ? handleReschedule : undefined}
				/>
			</div>
		</div>
	);
}

// ─── Today mode (compact dashboard-style) ───────────────────────────────────

interface TodayModeProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug?: string;
	stats: { total: number; overdue: number; today: number; completed: number };
	buckets: ReturnType<typeof bucketTasksByDue<TaskRow>>;
	me: string | undefined;
	onCreate?: () => void;
	onEdit: (r: TaskRow) => void;
	onDelete: (r: TaskRow) => void;
}

function TodayMode({
	orgId,
	orgSlug,
	stats,
	buckets,
	me,
	onCreate,
	onEdit,
	onDelete,
}: TodayModeProps) {
	const upcoming = useTasksNextUpcoming({ orgId, limit: 3 });

	const dueAndOverdue = useMemo(
		() => [...buckets.overdue, ...buckets.today].slice(0, 8),
		[buckets.overdue, buckets.today],
	);
	const myOverdue = useMemo(
		() => buckets.overdue.filter((t) => t.assignedTo === me).slice(0, 5),
		[buckets.overdue, me],
	);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 xl:p-4">
			{/* Stats */}
			<div className="grid gap-2 grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Total"
					value={stats.total}
					icon={<HourglassIcon className="size-3.5" aria-hidden />}
					accent="text-foreground"
				/>
				<StatCard
					label="Overdue"
					value={stats.overdue}
					icon={<FlameIcon className="size-3.5" aria-hidden />}
					accent="text-red-600"
				/>
				<StatCard
					label="Due today"
					value={stats.today}
					icon={<ClockIcon className="size-3.5" aria-hidden />}
					accent="text-amber-600"
				/>
				<StatCard
					label="Completed"
					value={stats.completed}
					icon={<CheckCircle2Icon className="size-3.5" aria-hidden />}
					accent="text-emerald-600"
				/>
			</div>

			{/* Today + Mine — TWO equal columns. */}
			<div className="grid gap-3 lg:grid-cols-2">
				<Card className="flex flex-col">
					<div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
						<div className="flex items-center gap-2">
							<ClockIcon className="size-4 text-amber-600" aria-hidden />
							<h3 className="text-sm font-semibold">Today &amp; overdue</h3>
						</div>
						{onCreate && (
							<Button
								size="sm"
								variant="ghost"
								className="h-6 text-xs"
								onClick={onCreate}
							>
								<PlusIcon className="me-1 size-3" />
								New
							</Button>
						)}
					</div>
					<div className="px-3 pb-3 pt-0">
						{dueAndOverdue.length === 0 ? (
							<EmptyTodayState
								upcoming={upcoming ?? []}
								onEdit={onEdit}
								onDelete={onDelete}
							/>
						) : (
							<div className="grid gap-1.5">
								{dueAndOverdue.map((t) => (
									<TaskCard
										key={t._id}
										task={t}
										onEdit={onEdit}
										onDelete={onDelete}
									/>
								))}
							</div>
						)}
					</div>
				</Card>

				<Card className="flex flex-col">
					<div className="flex items-center gap-2 px-4 pt-3 pb-2">
						<FlameIcon className="size-4 text-red-600" aria-hidden />
						<h3 className="text-sm font-semibold">Assigned to me</h3>
					</div>
					<div className="px-3 pb-3 pt-0">
						{myOverdue.length === 0 ? (
							<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
								You're caught up. 🎉
							</p>
						) : (
							<div className="grid gap-1.5">
								{myOverdue.map((t) => (
									<TaskCard
										key={t._id}
										task={t}
										onEdit={onEdit}
										onDelete={onDelete}
									/>
								))}
							</div>
						)}
					</div>
				</Card>
			</div>

			{orgSlug && <WeekAheadWidget orgId={orgId} orgSlug={orgSlug} />}
		</div>
	);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	icon,
	accent,
}: {
	label: string;
	value: number;
	icon: React.ReactNode;
	accent: string;
}) {
	return (
		<Card>
			<CardContent className="px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{label}
						</span>
						<span className={cn("text-xl font-bold leading-tight", accent)}>
							{value}
						</span>
					</div>
					<div className={cn("rounded-[var(--radius)] bg-muted p-1.5", accent)}>
						{icon}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function EmptyTodayState({
	upcoming,
	onEdit,
	onDelete,
}: {
	upcoming: ReadonlyArray<TaskRow>;
	onEdit: (r: TaskRow) => void;
	onDelete: (r: TaskRow) => void;
}) {
	if (upcoming.length === 0) {
		return (
			<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
				Nothing due today and no overdue items. Enjoy the calm. ✨
			</p>
		);
	}
	const next = upcoming[0]!;
	const rest = upcoming.slice(1);
	return (
		<div className="grid gap-2">
			<p className="text-[11px] text-muted-foreground">Nothing due today. Your next task:</p>
			<TaskCard task={next} onEdit={onEdit} onDelete={onDelete} />
			{rest.length > 0 && (
				<>
					<p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
						Then
					</p>
					<div className="grid gap-1.5">
						{rest.map((t) => (
							<TaskCard key={t._id} task={t} onEdit={onEdit} onDelete={onDelete} />
						))}
					</div>
				</>
			)}
		</div>
	);
}

/**
 * The calendar event-source DTO ids are namespaced — `task:<id>` for
 * task rows, `deal-close:<id>` for deal closures, etc. Carry forward
 * the parser pattern from the legacy `parseReminderIdFromDtoId`. The
 * calendar layer (Stage 4B step 9) updates the namespace from
 * `reminder:` to `task:` in lock-step with this consumer.
 */
function parseTaskIdFromDtoId(id: string): string | null {
	if (id.startsWith("task:")) return id.slice("task:".length);
	if (id.startsWith("reminder:")) return id.slice("reminder:".length);
	return null;
}
