"use client";

/**
 * PersonCalendarPanel — calendar embedded in a person's profile tab.
 *
 * STATUS: IMPLEMENTED.
 *
 * Per SCHEDULING-IMPLEMENTATION.md §4.2 + §8 (avoids):
 *   - Renders only the `<CalendarMain>` grid + a slim toolbar — no
 *     sidebar in panels (no horizontal space).
 *   - The Convex query is scoped to `personCode`, so we never pull
 *     org-wide events into the panel.
 *   - Range is clamped to **±45 days** around the selected date — the
 *     90-day clamp from the spec is the upper bound; we use ±45 so the
 *     window fits inside the cap without exposing the user to a less
 *     responsive subscription.
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
import { useCompleteReminder, useDeleteReminder } from "@/core/scheduling/reminders/hooks";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { CalendarFilters } from "../components/CalendarFilters";
import { CalendarMain } from "../components/CalendarMain";
import { CalendarToolbar } from "../components/CalendarToolbar";
import { EventForm } from "../components/EventForm";

interface PersonCalendarPanelProps {
	personCode: string;
	className?: string;
}

const PANEL_WINDOW_DAYS = 45; // half of the 90-day cap

export function PersonCalendarPanel({ personCode, className }: PersonCalendarPanelProps) {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("reminders.create");
	const canManage = permissions.includes("reminders.manage");

	const { viewMode, setViewMode, selectedDate, setSelectedDate, today } = useCalendarViewMode();
	const { sources } = useCalendarFilters();

	// Range — clamp to ±45d around the anchor (cap = 90 days total).
	const range = useMemo(() => {
		const start = startOfDay(addDays(selectedDate, -PANEL_WINDOW_DAYS));
		const end = startOfDay(addDays(selectedDate, PANEL_WINDOW_DAYS));
		return { rangeStart: start.getTime(), rangeEnd: end.getTime() };
	}, [selectedDate]);

	const events = useCalendarEvents({
		orgId,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		scope: "person",
		personCode,
		sources,
	});

	// ── Form state ───────────────────────────────────────────────────
	const [formOpen, setFormOpen] = useState(false);
	const [editingReminder, setEditingReminder] = useState<Doc<"reminders"> | null>(null);
	const [createDefaults, setCreateDefaults] = useState<{ startsAt?: number } | null>(null);

	const openCreate = useCallback((date?: Date) => {
		setEditingReminder(null);
		setCreateDefaults(date ? { startsAt: date.getTime() } : null);
		setFormOpen(true);
	}, []);

	// ── Reminder action handlers ─────────────────────────────────────
	const completeReminder = useCompleteReminder();
	const deleteReminder = useDeleteReminder();
	const [deletingId, setDeletingId] = useState<Id<"reminders"> | null>(null);
	const [deletingTitle, setDeletingTitle] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	const onCompleteFromPopover = useCallback(
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

	const onEditFromPopover = useCallback((_event: { id: string }) => {
		toast.info("Open the reminder from the Reminders page to edit.");
	}, []);

	const onDeleteFromPopover = useCallback((event: { id: string; title: string }) => {
		const reminderId = parseReminderIdFromDtoId(event.id);
		if (!reminderId) return;
		setDeletingId(reminderId as Id<"reminders">);
		setDeletingTitle(event.title);
	}, []);

	async function confirmDelete() {
		if (!deletingId || !orgId) return;
		setDeleting(true);
		try {
			await deleteReminder({ orgId, reminderId: deletingId });
			toast.success("Reminder deleted");
			setDeletingId(null);
			setDeletingTitle(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete reminder");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div
			className={`flex h-[640px] min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border bg-background ${className ?? ""}`}
		>
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
				reminder={editingReminder}
				defaults={
					editingReminder
						? undefined
						: {
								startsAt: createDefaults?.startsAt,
								personCode,
								entityType: "person",
								entityId: personCode,
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
						<AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingTitle ?? "Reminder"}.
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

function parseReminderIdFromDtoId(id: string): string | null {
	if (!id.startsWith("reminder:")) return null;
	return id.slice("reminder:".length);
}
