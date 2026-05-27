"use client";

/**
 * EntityCalendarPanel — calendar embedded on a deal / company detail page.
 *
 * STATUS: IMPLEMENTED.
 *
 * Identical shape to `PersonCalendarPanel` but scoped to a generic
 * (entityType, entityId) pair. Use this for:
 *   - deal detail page → entityType="deal", entityId=dealCode
 *   - company detail page → entityType="company", entityId=companyId
 *
 * Per SCHEDULING-IMPLEMENTATION.md §4.2, range is clamped to ±45 days
 * around the anchor (cap = 90 days total).
 */

import { addDays, startOfDay } from "date-fns";
import { CalendarPlusIcon } from "lucide-react";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useCalendarEvents } from "@/core/scheduling/calendar/hooks";
import {
	useCalendarFilters,
	useCalendarViewMode,
} from "@/core/scheduling/calendar/hooks/useCalendarViewMode";
import { useCompleteTask, useDeleteTask } from "@/core/scheduling/tasks/hooks";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { CalendarFilters } from "../components/CalendarFilters";
import { CalendarMain } from "../components/CalendarMain";
import { CalendarToolbar } from "../components/CalendarToolbar";
import { EventForm } from "../components/EventForm";

interface EntityCalendarPanelProps {
	entityType: string; // "deal" | "company" | …
	entityId: string;
	/** Optional personCode to pre-fill on new tasks (e.g. deal's primary contact). */
	personCode?: string;
	/** Optional dealCode for the EventForm to attach to. */
	dealCode?: string;
	className?: string;
}

const PANEL_WINDOW_DAYS = 45;

export function EntityCalendarPanel({
	entityType,
	entityId,
	personCode,
	dealCode,
	className,
}: EntityCalendarPanelProps) {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("tasks.create");
	const canManage = permissions.includes("tasks.manage");

	const { viewMode, setViewMode, selectedDate, setSelectedDate, today } = useCalendarViewMode();
	const { sources } = useCalendarFilters();

	const range = useMemo(() => {
		const start = startOfDay(addDays(selectedDate, -PANEL_WINDOW_DAYS));
		const end = startOfDay(addDays(selectedDate, PANEL_WINDOW_DAYS));
		return { rangeStart: start.getTime(), rangeEnd: end.getTime() };
	}, [selectedDate]);

	const events = useCalendarEvents({
		orgId,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		scope: "entity",
		entityType,
		entityId,
		sources,
	});

	const [formOpen, setFormOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{ startsAt?: number } | null>(null);
	const openCreate = useCallback((date?: Date) => {
		setEditingTask(null);
		setCreateDefaults(date ? { startsAt: date.getTime() } : null);
		setFormOpen(true);
	}, []);

	const completeTask = useCompleteTask();
	const deleteTask = useDeleteTask();
	const [deletingId, setDeletingId] = useState<Id<"tasks"> | null>(null);
	const [deletingTitle, setDeletingTitle] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	const onCompleteFromPopover = useCallback(
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

	const onEditFromPopover = useCallback((_event: { id: string }) => {
		toast.info("Open the task from the Tasks page to edit.");
	}, []);

	const onDeleteFromPopover = useCallback((event: { id: string; title: string }) => {
		const taskId = parseTaskIdFromDtoId(event.id);
		if (!taskId) return;
		setDeletingId(taskId as Id<"tasks">);
		setDeletingTitle(event.title);
	}, []);

	async function confirmDelete() {
		if (!deletingId || !orgId) return;
		setDeleting(true);
		try {
			await deleteTask({ orgId, taskId: deletingId });
			toast.success("Task deleted");
			setDeletingId(null);
			setDeletingTitle(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete task");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className={`flex h-full min-h-[28rem] min-w-0 flex-col ${className ?? ""}`}>
			<CalendarToolbar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				selectedDate={selectedDate}
				onSelectDate={setSelectedDate}
				onToday={today}
				filtersTrigger={<CalendarFilters direction="horizontal" />}
				primaryAction={
					canCreate ? (
						<Button size="sm" onClick={() => openCreate(selectedDate)} className="h-7">
							<CalendarPlusIcon className="me-1.5 size-3.5" />
							New
						</Button>
					) : undefined
				}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<CalendarMain
					viewMode={viewMode}
					selectedDate={selectedDate}
					events={events}
					onSelectDate={setSelectedDate}
					onCreateAtDate={canCreate ? openCreate : undefined}
					onCreateAtDateTime={canCreate ? openCreate : undefined}
					canManageReminder={canManage}
					onCompleteReminder={onCompleteFromPopover}
					onEditReminder={onEditFromPopover}
					onDeleteReminder={onDeleteFromPopover}
				/>
			</div>
			<EventForm
				open={formOpen}
				onOpenChange={setFormOpen}
				task={editingTask}
				defaults={
					editingTask
						? undefined
						: {
								startsAt: createDefaults?.startsAt,
								personCode,
								dealCode,
								entityType,
								entityId,
							}
				}
			/>
			<AlertDialog
				open={!!deletingId}
				onOpenChange={(v) => {
					if (!v) {
						setDeletingId(null);
						setDeletingTitle(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this task?</AlertDialogTitle>
						<AlertDialogDescription>{deletingTitle ?? "Task"}.</AlertDialogDescription>
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

function parseTaskIdFromDtoId(id: string): string | null {
	if (!id.startsWith("task:")) return null;
	return id.slice("task:".length);
}
