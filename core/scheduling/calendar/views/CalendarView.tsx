"use client";

/**
 * CalendarView — org-wide calendar page.
 *
 * Architecture:
 *   - ONE Convex subscription: `useCalendarEvents({ orgId, rangeStart,
 *     rangeEnd, scope: "org", sources })`. Range is computed locally by
 *     `getRangeForView` so the subscription tracks the visible window
 *     only.
 *   - Sidebar + Main grid + Filters all derive from the same array.
 *   - Task mutations (complete/delete/update) re-use the optimistic-
 *     update hooks from the tasks module, so state updates feel instant.
 *
 * Permissions:
 *   - `tasks.view` is checked server-side in the calendar query.
 *   - `tasks.create` gates the "+ New event" button.
 *   - `tasks.manage` gates the in-popover Complete/Edit/Delete buttons.
 */

import { useConvex } from "convex/react";
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
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useCalendarEvents } from "@/core/scheduling/calendar/hooks";
import {
	useCalendarFilters,
	useCalendarViewMode,
} from "@/core/scheduling/calendar/hooks/useCalendarViewMode";
import { useCompleteTask, useDeleteTask, useUpdateTask } from "@/core/scheduling/tasks/hooks";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { CalendarMain } from "../components/CalendarMain";
import { CalendarSidebar } from "../components/CalendarSidebar";
import { CalendarToolbar } from "../components/CalendarToolbar";
import { EventForm } from "../components/EventForm";
import { getRangeForView } from "../lib/calendar-grid";

export function CalendarView() {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("tasks.create");
	const canManage = permissions.includes("tasks.manage");

	const { viewMode, setViewMode, selectedDate, setSelectedDate, today } = useCalendarViewMode();
	const { sources } = useCalendarFilters();

	// ── Range tracks viewMode + selectedDate ─────────────────────────
	const range = useMemo(() => getRangeForView(viewMode, selectedDate), [viewMode, selectedDate]);

	// ONE subscription for the entire calendar surface.
	const events = useCalendarEvents({
		orgId,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		scope: "org",
		sources,
	});

	// ── Search (client-side text match) ──────────────────────────────
	const [search, setSearch] = useState("");
	const filteredEvents = useMemo(() => {
		if (!search.trim()) return events;
		const q = search.trim().toLowerCase();
		return events?.filter((e) => e.title.toLowerCase().includes(q));
	}, [events, search]);

	// ── Form state (create + edit) ───────────────────────────────────
	const [formOpen, setFormOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{
		startsAt?: number;
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		assignedTo?: Id<"users">;
	} | null>(null);

	const openCreate = useCallback((date?: Date) => {
		setEditingTask(null);
		setCreateDefaults(date ? { startsAt: date.getTime() } : null);
		setFormOpen(true);
	}, []);

	// ── Task action handlers (Complete / Edit / Delete from popover) ─
	const completeTask = useCompleteTask();
	const deleteTask = useDeleteTask();
	const updateTask = useUpdateTask();
	const [deletingTaskId, setDeletingTaskId] = useState<Id<"tasks"> | null>(null);
	const [deletingTitle, setDeletingTitle] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	/** Drag-to-reschedule: one mutation per drop (per AGENTS.md rule). */
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
		async (event: { id: string; meta?: Record<string, unknown> }) => {
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

	// To edit a task from the calendar, fetch the full doc on demand.
	const convex = useConvex();
	const handleEditFromPopover = useCallback(
		async (event: { id: string; meta?: Record<string, unknown> }) => {
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
				setEditingTask(doc as Doc<"tasks">);
				setFormOpen(true);
			} catch {
				toast.error("Couldn't load task for editing");
			}
		},
		[orgId, convex],
	);

	const handleDeleteFromPopover = useCallback(
		(event: { id: string; title: string; meta?: Record<string, unknown> }) => {
			const taskId = parseTaskIdFromDtoId(event.id);
			if (!taskId) return;
			setDeletingTaskId(taskId as Id<"tasks">);
			setDeletingTitle(event.title);
		},
		[],
	);

	async function confirmDelete() {
		if (!deletingTaskId || !orgId) return;
		setDeleting(true);
		try {
			await deleteTask({ orgId, taskId: deletingTaskId });
			toast.success("Task deleted");
			setDeletingTaskId(null);
			setDeletingTitle(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete task");
		} finally {
			setDeleting(false);
		}
	}

	// ── Layout ───────────────────────────────────────────────────────
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<CalendarToolbar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				selectedDate={selectedDate}
				onSelectDate={setSelectedDate}
				onToday={today}
				search={{
					value: search,
					onChange: setSearch,
					placeholder: "Search events…",
				}}
			/>

			<div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 xl:grid-cols-[18rem_1fr]">
				<div className="hidden xl:block">
					<CalendarSidebar
						selectedDate={selectedDate}
						onSelectDate={setSelectedDate}
						canCreate={canCreate}
						onCreate={() => openCreate(selectedDate)}
					/>
				</div>

				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<CalendarMain
						viewMode={viewMode}
						selectedDate={selectedDate}
						events={filteredEvents}
						onSelectDate={setSelectedDate}
						onCreateAtDate={canCreate ? openCreate : undefined}
						onCreateAtDateTime={canCreate ? openCreate : undefined}
						canManageReminder={canManage}
						onCompleteReminder={handleCompleteFromPopover}
						onEditReminder={handleEditFromPopover}
						onDeleteReminder={handleDeleteFromPopover}
						onRescheduleReminder={canManage ? handleReschedule : undefined}
					/>
				</div>
			</div>

			<EventForm
				open={formOpen}
				onOpenChange={setFormOpen}
				task={editingTask}
				defaults={createDefaults ?? undefined}
			/>

			<AlertDialog
				open={!!deletingTaskId}
				onOpenChange={(v) => {
					if (!v) {
						setDeletingTaskId(null);
						setDeletingTitle(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this task?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingTitle ?? "Task"}. This can't be undone.
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

/** DTO ids look like "task:<convexId>". Strip the prefix for mutations. */
function parseTaskIdFromDtoId(id: string): string | null {
	if (id.startsWith("task:")) return id.slice("task:".length);
	if (id.startsWith("reminder:")) return id.slice("reminder:".length);
	return null;
}
