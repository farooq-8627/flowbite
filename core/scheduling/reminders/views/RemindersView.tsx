"use client";

/**
 * RemindersView — unified reminders workspace.
 *
 * STATUS: IMPLEMENTED.
 *
 * Single page, three views toggled via the toolbar (URL-persisted):
 *   • list      — DataTable + stats (the original RemindersView)
 *   • calendar  — Embedded CalendarMain showing reminders + activity + deal-close
 *   • today     — Dense at-a-glance dashboard (today + overdue, week ahead)
 *
 * Why all three live here
 * ───────────────────────
 *   - The user's "Reminders" task fundamentally has three workflows:
 *     looking at the queue (list), rescheduling (calendar), and quick
 *     review (today). Splitting them across two sidebar items doubled
 *     the cognitive load with no benefit — they all read the same
 *     reminders.
 *   - Convex de-duplicates overlapping subscriptions, so mounting
 *     `useRemindersAllForOrg` (list) and `useCalendarEvents` (calendar)
 *     simultaneously is free — they share one network call inside the
 *     Convex client.
 *   - Today mode reuses the dashboard's `RemindersWidget` shape so the
 *     layout users learn on the dashboard transfers verbatim here.
 *
 * Every write mutation still goes through the same hooks; this view is
 * pure UI orchestration.
 */

import { useConvex } from "convex/react";
import {
	BellPlusIcon,
	CalendarDaysIcon,
	CheckCircle2Icon,
	ClockIcon,
	FlameIcon,
	HourglassIcon,
	LayoutDashboardIcon,
	ListIcon,
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
	useCompleteReminder,
	useDeleteReminder,
	useRemindersAllForOrg,
	useRemindersNextUpcoming,
	useUpdateReminder,
} from "@/core/scheduling/reminders/hooks";
import { bucketByDue } from "@/core/scheduling/reminders/lib/reminder-buckets";
import { EntityPageLayout } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useReminderColumns } from "../components/columns/useReminderColumns";
import { ReminderCard } from "../components/ReminderCard";
import { ReminderEmptyState } from "../components/ReminderEmptyState";
import { ReminderForm } from "../components/ReminderForm";

type ReminderRow = Doc<"reminders">;
type ScopeTab = "today" | "open" | "completed" | "all";

const VIEW_VALUES = ["list", "calendar", "today"] as const;
type ReminderViewMode = (typeof VIEW_VALUES)[number];

// ─── Component ───────────────────────────────────────────────────────────────

export function RemindersView({ orgSlug }: { orgSlug?: string }) {
	const { orgId } = useCurrentOrg();
	const me = useMe();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("reminders.create");
	const canManage = permissions.includes("reminders.manage");

	// View mode is URL-persisted so deep-links survive (?view=calendar).
	const [view, setView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEW_VALUES).withDefault("list"),
	);

	// ── Shared state ─────────────────────────────────────────────────
	const reminders = useRemindersAllForOrg({ orgId });
	const isLoading = reminders === undefined;

	const [tab, setTab] = useState<ScopeTab>("today");
	const [search, setSearch] = useState("");
	const [now] = useState(() => Date.now());

	// Reminder form (shared across all three views)
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingReminder, setEditingReminder] = useState<ReminderRow | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{ startsAt?: number } | null>(null);

	// Delete confirmation (shared)
	const [deletingReminder, setDeletingReminder] = useState<ReminderRow | null>(null);
	const deleteReminder = useDeleteReminder();
	const [deleting, setDeleting] = useState(false);

	// ── Derive buckets / stats (shared by list + today) ─────────────
	const allReminders = reminders ?? [];
	const buckets = useMemo(() => bucketByDue(allReminders, now), [allReminders, now]);
	const stats = useMemo(
		() => ({
			total: allReminders.length,
			overdue: buckets.overdue.length,
			today: buckets.today.length,
			completed: buckets.completed.length,
		}),
		[
			allReminders.length,
			buckets.overdue.length,
			buckets.today.length,
			buckets.completed.length,
		],
	);

	// ── Form handlers (shared) ──────────────────────────────────────
	const openCreate = useCallback((startsAt?: Date) => {
		setEditingReminder(null);
		setCreateDefaults(startsAt ? { startsAt: startsAt.getTime() } : null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((row: ReminderRow) => {
		setEditingReminder(row);
		setCreateDefaults(null);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((row: ReminderRow) => {
		setDeletingReminder(row);
	}, []);

	async function confirmDelete() {
		if (!deletingReminder || !orgId) return;
		setDeleting(true);
		try {
			await deleteReminder({ orgId, reminderId: deletingReminder._id });
			toast.success("Reminder deleted");
			setDeletingReminder(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete reminder");
		} finally {
			setDeleting(false);
		}
	}

	// ── Render ──────────────────────────────────────────────────────
	const viewToggle = (
		<RemindersViewToggle view={view as ReminderViewMode} onChange={(v) => void setView(v)} />
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
							placeholder: "Search reminders…",
						}
					: undefined
			}
			toolbarExtras={viewToggle}
			primaryAction={
				canCreate
					? {
							label: "New reminder",
							icon: BellPlusIcon,
							onClick: () => openCreate(),
							permission: "reminders.create",
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
					allReminders={allReminders}
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
			<ReminderForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				reminder={editingReminder}
				defaults={
					editingReminder
						? undefined
						: {
								dueAt: createDefaults?.startsAt,
								source: "manual",
							}
				}
			/>

			{/* Shared delete confirm */}
			<AlertDialog
				open={!!deletingReminder}
				onOpenChange={(v) => !v && setDeletingReminder(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingReminder?.title}. This can't be undone.
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

function RemindersViewToggle({
	view,
	onChange,
}: {
	view: ReminderViewMode;
	onChange: (v: ReminderViewMode) => void;
}) {
	const options: Array<{ value: ReminderViewMode; label: string; icon: typeof ListIcon }> = [
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

// ─── List mode (the original DataTable view) ────────────────────────────────

interface ListModeProps {
	stats: { total: number; overdue: number; today: number; completed: number };
	tab: ScopeTab;
	setTab: (v: ScopeTab) => void;
	buckets: ReturnType<typeof bucketByDue<ReminderRow>>;
	allReminders: ReminderRow[];
	search: string;
	setSearch: (v: string) => void;
	isLoading: boolean;
	me: string | undefined;
	now: number;
	onEdit: (r: ReminderRow) => void;
	onDelete: (r: ReminderRow) => void;
	onCreate?: () => void;
}

function ListMode({
	stats,
	tab,
	setTab,
	buckets,
	allReminders,
	search,
	setSearch,
	isLoading,
	me,
	now,
	onEdit,
	onDelete,
	onCreate,
}: ListModeProps) {
	const visibleReminders: ReminderRow[] = useMemo(() => {
		switch (tab) {
			case "today":
				return [...buckets.today, ...buckets.overdue];
			case "open":
				return [...buckets.overdue, ...buckets.today, ...buckets.upcoming];
			case "completed":
				return buckets.completed;
			default:
				return allReminders;
		}
	}, [tab, buckets, allReminders]);

	const filteredReminders = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return visibleReminders;
		return visibleReminders.filter(
			(r) =>
				r.title.toLowerCase().includes(q) ||
				(r.note ?? "").toLowerCase().includes(q) ||
				r.followUpCode.toLowerCase().includes(q) ||
				r.personCode.toLowerCase().includes(q),
		);
	}, [visibleReminders, search]);

	const columns = useReminderColumns({
		now,
		onEdit,
		onDelete,
		currentUserId: me,
	});

	const { table } = useDataTable<ReminderRow>({
		data: filteredReminders,
		columns,
		pageCount: Math.max(1, Math.ceil(filteredReminders.length / 25)),
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
					<ReminderEmptyState variant="org" onCreate={onCreate} />
				) : allReminders.length === 0 ? (
					<ReminderEmptyState variant="org" onCreate={onCreate} />
				) : filteredReminders.length === 0 ? (
					<ReminderEmptyState
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
						<DataTableToolbar
							table={table}
							// className="flex-wrap items-center [&>div:first-child]:flex-wrap [&>div:last-child]:ms-auto [&>div:last-child]:flex-none"
						>
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
	onOpenEdit: (row: ReminderRow) => void;
	onAskDelete: (row: ReminderRow) => void;
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

	const completeReminder = useCompleteReminder();
	const updateReminder = useUpdateReminder();
	const convex = useConvex();

	// Reschedule via drag (one mutation per drop)
	const handleReschedule = useCallback(
		async (event: { id: string; startsAt: number }, newDate: Date) => {
			if (!orgId) return;
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) return;
			const original = new Date(event.startsAt);
			const newDueAt = new Date(newDate);
			newDueAt.setHours(original.getHours(), original.getMinutes(), 0, 0);
			try {
				await updateReminder({
					orgId,
					reminderId: reminderId as Id<"reminders">,
					dueAt: newDueAt.getTime(),
				});
				toast.success("Reminder rescheduled");
			} catch (err) {
				toast.mutationError(err, "Couldn't reschedule");
			}
		},
		[orgId, updateReminder],
	);

	const handleCompleteFromPopover = useCallback(
		async (event: { id: string }) => {
			if (!orgId) return;
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) return;
			try {
				await completeReminder({ orgId, reminderId: reminderId as Id<"reminders"> });
				toast.success("Reminder completed");
			} catch (err) {
				toast.mutationError(err, "Couldn't complete reminder");
			}
		},
		[orgId, completeReminder],
	);

	const handleEditFromPopover = useCallback(
		async (event: { id: string }) => {
			if (!orgId) return;
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) {
				toast.info("Only reminders can be edited from the calendar.");
				return;
			}
			try {
				const doc = await convex.query(api.crm.shared.reminders.queries.getById, {
					orgId,
					reminderId: reminderId as Id<"reminders">,
				});
				if (!doc) {
					toast.error("Reminder not found");
					return;
				}
				onOpenEdit(doc as Doc<"reminders">);
			} catch {
				toast.error("Couldn't load reminder for editing");
			}
		},
		[orgId, convex, onOpenEdit],
	);

	const handleDeleteFromPopover = useCallback(
		async (event: { id: string; title: string }) => {
			if (!orgId) return;
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) return;
			try {
				const doc = await convex.query(api.crm.shared.reminders.queries.getById, {
					orgId,
					reminderId: reminderId as Id<"reminders">,
				});
				if (!doc) return;
				onAskDelete(doc as Doc<"reminders">);
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
	buckets: ReturnType<typeof bucketByDue<ReminderRow>>;
	me: string | undefined;
	onCreate?: () => void;
	onEdit: (r: ReminderRow) => void;
	onDelete: (r: ReminderRow) => void;
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
	const upcoming = useRemindersNextUpcoming({ orgId, limit: 3 });

	const dueAndOverdue = useMemo(
		() => [...buckets.overdue, ...buckets.today].slice(0, 8),
		[buckets.overdue, buckets.today],
	);
	const myOverdue = useMemo(
		() => buckets.overdue.filter((r) => r.assignedTo === me).slice(0, 5),
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

			{/* Today + Mine — TWO equal columns; cards size to content (no
			    full-height stretch onto Week-Ahead row below) */}
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
								<BellPlusIcon className="me-1 size-3" />
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
								{dueAndOverdue.map((r) => (
									<ReminderCard
										key={r._id}
										reminder={r}
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
								{myOverdue.map((r) => (
									<ReminderCard
										key={r._id}
										reminder={r}
										onEdit={onEdit}
										onDelete={onDelete}
									/>
								))}
							</div>
						)}
					</div>
				</Card>
			</div>

			{/* Week ahead — its own row, full width.
			    Inside the widget the cells use natural height (no h-full),
			    so they don't inflate when the row has spare vertical space. */}
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
						<span className={`text-xl font-bold leading-tight ${accent}`}>{value}</span>
					</div>
					<div className={`rounded-[var(--radius)] bg-muted p-1.5 ${accent}`}>{icon}</div>
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
	upcoming: ReadonlyArray<ReminderRow>;
	onEdit: (r: ReminderRow) => void;
	onDelete: (r: ReminderRow) => void;
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
			<p className="text-[11px] text-muted-foreground">
				Nothing due today. Your next reminder:
			</p>
			<ReminderCard reminder={next} onEdit={onEdit} onDelete={onDelete} />
			{rest.length > 0 && (
				<>
					<p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
						Then
					</p>
					<div className="grid gap-1.5">
						{rest.map((r) => (
							<ReminderCard
								key={r._id}
								reminder={r}
								onEdit={onEdit}
								onDelete={onDelete}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function parseReminderIdFromDtoId(id: string): string | null {
	if (!id.startsWith("reminder:")) return null;
	return id.slice("reminder:".length);
}
