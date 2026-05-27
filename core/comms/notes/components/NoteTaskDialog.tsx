"use client";

/**
 * NoteTaskDialog — quick-create a task from a note.
 *
 * Opens from the note card's ⋮ menu → "Add task". Defaults are sensible
 * so the user can submit in one click:
 *   - title       → first 80 chars of the note body (or its title if set).
 *   - dueAt       → tomorrow 9:00 AM (local time).
 *   - assignedTo  → the current user.
 *   - personCode  → the note's personCode if set; otherwise blank
 *                   (followup-type tasks require a personCode, but todos
 *                   don't — the dialog disables submit when neither the
 *                   note nor the parent context provides one only for
 *                   follow-up type).
 *
 * The task is persisted via `useCreateTask` — the same backend mutation
 * the canonical tasks UI uses. Created tasks appear in TasksView,
 * TasksPanel on the profile, and dashboard widgets immediately.
 *
 * Replaces NoteReminderDialog per TASKS-RENAME-PLAN.md (Stage 4B).
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCreateTask } from "@/core/scheduling/tasks/hooks";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";

const TITLE_MAX = 80;

function tomorrowAt9amLocal(): Date {
	const t = new Date();
	t.setDate(t.getDate() + 1);
	t.setHours(9, 0, 0, 0);
	return t;
}

/**
 * Format a Date for `<input type="datetime-local">`. The element expects
 * `yyyy-MM-ddTHH:mm` in LOCAL time (no timezone suffix).
 */
function toLocalInputValue(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NoteTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	note: Doc<"notes">;
}

export function NoteTaskDialog({ open, onOpenChange, note }: NoteTaskDialogProps) {
	const me = useMe();
	const createTask = useCreateTask();

	const defaultTitle =
		(note.title ?? note.content ?? "").trim().slice(0, TITLE_MAX) || "Follow up";
	const defaultDueAt = tomorrowAt9amLocal();

	const [title, setTitle] = useState(defaultTitle);
	const [dueAtLocal, setDueAtLocal] = useState(toLocalInputValue(defaultDueAt));
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		const t = (note.title ?? note.content ?? "").trim().slice(0, TITLE_MAX) || "Follow up";
		setTitle(t);
		setDueAtLocal(toLocalInputValue(tomorrowAt9amLocal()));
	}, [open, note.title, note.content]);

	const personCode = note.personCode;
	// followup type requires a personCode; but a generic todo from a note
	// can default to type=todo when there's no person attached.
	const taskType: "followup" | "todo" = personCode ? "followup" : "todo";
	const canSubmit =
		!submitting &&
		title.trim().length > 0 &&
		title.trim().length <= TITLE_MAX &&
		Boolean(me?._id);

	async function handleSubmit() {
		if (!canSubmit || !me?._id) return;
		const dueAt = new Date(dueAtLocal).getTime();
		if (Number.isNaN(dueAt)) {
			toast.error("Pick a valid due date");
			return;
		}
		setSubmitting(true);
		try {
			await createTask({
				orgId: note.orgId,
				type: taskType,
				...(personCode ? { personCode } : {}),
				...(note.entityType ? { entityType: note.entityType } : {}),
				...(note.entityId ? { entityId: note.entityId } : {}),
				title: title.trim(),
				dueAt,
				assignedTo: me._id,
			});
			toast.success("Task added.");
			onOpenChange(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't create task.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add task</DialogTitle>
					<DialogDescription>
						Schedule a task tied to this note. It will appear in the org's Tasks list
						and on the person's profile.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 py-2">
					<div className="grid gap-1.5">
						<Label htmlFor="task-title">Title</Label>
						<Input
							id="task-title"
							value={title}
							maxLength={TITLE_MAX}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Follow up"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="task-due-at">Due</Label>
						<Input
							id="task-due-at"
							type="datetime-local"
							value={dueAtLocal}
							onChange={(e) => setDueAtLocal(e.target.value)}
						/>
					</div>
					{!personCode && (
						<p className="text-xs text-muted-foreground">
							This note isn't attached to a profile. The task will be created as a
							personal to-do.
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
						{submitting ? "Saving…" : "Add task"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
