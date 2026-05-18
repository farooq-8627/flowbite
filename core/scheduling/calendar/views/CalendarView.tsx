"use client";

/**
 * CalendarView — org-wide calendar page.
 *
 * STATUS: IMPLEMENTED.
 *
 * Architecture (per SCHEDULING-IMPLEMENTATION.md §1.1, §4.1):
 *   - ONE Convex subscription: `useCalendarEvents({ orgId, rangeStart,
 *     rangeEnd, scope: "org", sources })`. Range is computed locally by
 *     `getRangeForView` so the subscription tracks the visible window
 *     only.
 *   - Sidebar + Main grid + Filters all derive from the same array.
 *   - Reminder mutations (complete/delete) re-use the optimistic-update
 *     hooks from the reminders module, so state updates feel instant.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                                              CalendarToolbar
 *   ├──────────────┬──────────────────────────────────────────┤
 *   │ Sidebar      │ CalendarMain                             │
 *   │ (mini-cal +  │ (month / week / day / list)              │
 *   │  filters +   │                                          │
 *   │  + add)      │                                          │
 *   └──────────────┴──────────────────────────────────────────┘
 *
 * Permissions:
 *   - `reminders.view` is checked server-side in the calendar query.
 *     The sidebar is visible to anyone who reaches this page.
 *   - `reminders.create` gates the "+ New event" button.
 *   - `reminders.manage` gates the in-popover Complete/Edit/Delete
 *     buttons; the parent passes `canManageReminder` through to
 *     `<CalendarMain>`.
 *
 * UX notes (one-click low friction):
 *   - Clicking any day in the month grid both selects it AND auto-opens
 *     the new-event drawer with that date pre-filled.
 *   - The mini-cal in the sidebar mirrors `selectedDate`.
 *   - Today button + view-mode tabs let the user pivot without a reload.
 *   - Search filters the visible window (client-side text match on
 *     title) — the Convex query stays the same.
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
import {
	useCompleteReminder,
	useDeleteReminder,
	useUpdateReminder,
} from "@/core/scheduling/reminders/hooks";
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
	const canCreate = permissions.includes("reminders.create");
	const canManage = permissions.includes("reminders.manage");

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
	const [editingReminder, setEditingReminder] = useState<Doc<"reminders"> | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{
		startsAt?: number;
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		assignedTo?: Id<"users">;
	} | null>(null);

	const openCreate = useCallback((date?: Date) => {
		setEditingReminder(null);
		setCreateDefaults(date ? { startsAt: date.getTime() } : null);
		setFormOpen(true);
	}, []);

	// ── Reminder action handlers (Complete / Edit / Delete from popover) ─
	const completeReminder = useCompleteReminder();
	const deleteReminder = useDeleteReminder();
	const updateReminder = useUpdateReminder();
	const [deletingReminderId, setDeletingReminderId] = useState<Id<"reminders"> | null>(null);
	const [deletingTitle, setDeletingTitle] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	/** Drag-to-reschedule: one mutation per drop (per AGENTS.md rule). */
	const handleReschedule = useCallback(
		async (event: { id: string; startsAt: number }, newDate: Date) => {
			if (!orgId) return;
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) return;
			// Preserve the original time-of-day, just change the date.
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
		async (event: { id: string; meta?: Record<string, unknown> }) => {
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

	// To edit a reminder from the calendar, fetch the full doc on demand.
	const convex = useConvex();
	const handleEditFromPopover = useCallback(
		async (event: { id: string; meta?: Record<string, unknown> }) => {
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
				setEditingReminder(doc as Doc<"reminders">);
				setFormOpen(true);
			} catch {
				toast.error("Couldn't load reminder for editing");
			}
		},
		[orgId, convex],
	);

	const handleDeleteFromPopover = useCallback(
		(event: { id: string; title: string; meta?: Record<string, unknown> }) => {
			const reminderId = parseReminderIdFromDtoId(event.id);
			if (!reminderId) return;
			setDeletingReminderId(reminderId as Id<"reminders">);
			setDeletingTitle(event.title);
		},
		[],
	);

	async function confirmDelete() {
		if (!deletingReminderId || !orgId) return;
		setDeleting(true);
		try {
			await deleteReminder({ orgId, reminderId: deletingReminderId });
			toast.success("Reminder deleted");
			setDeletingReminderId(null);
			setDeletingTitle(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete reminder");
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
				{/* Sidebar — collapses on small viewports */}
				<div className="hidden xl:block">
					<CalendarSidebar
						selectedDate={selectedDate}
						onSelectDate={setSelectedDate}
						canCreate={canCreate}
						onCreate={() => openCreate(selectedDate)}
					/>
				</div>

				{/* Grid */}
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
				reminder={editingReminder}
				defaults={createDefaults ?? undefined}
			/>

			<AlertDialog
				open={!!deletingReminderId}
				onOpenChange={(v) => {
					if (!v) {
						setDeletingReminderId(null);
						setDeletingTitle(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingTitle ?? "Reminder"}. This can't be undone.
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

/** DTO ids look like "reminder:<convexId>". Strip the prefix for mutations. */
function parseReminderIdFromDtoId(id: string): string | null {
	if (!id.startsWith("reminder:")) return null;
	return id.slice("reminder:".length);
}
