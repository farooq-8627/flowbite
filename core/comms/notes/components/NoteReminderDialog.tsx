"use client";

/**
 * NoteReminderDialog — quick-create a reminder from a note.
 *
 * Opens from the note card's ⋮ menu → "Set reminder". Defaults are
 * sensible so the user can submit in one click:
 *   - title  → first 60 chars of the note body (or its title if set).
 *   - dueAt  → tomorrow 9:00 AM (local time).
 *   - assignedTo → the current user.
 *   - personCode → the note's personCode if set; otherwise blank (reminders
 *     require a personCode, so the dialog disables submit when neither the
 *     note nor the parent context provides one).
 *
 * The reminder is persisted via `useCreateReminder` — the same backend
 * mutation the future Reminders module will use. So when the full
 * Reminders UI is built, every reminder created here will already show up
 * in `RemindersView` / `RemindersPanel` without any extra wiring.
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
import { useCreateReminder } from "@/core/scheduling/reminders/hooks";
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

interface NoteReminderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	note: Doc<"notes">;
}

export function NoteReminderDialog({ open, onOpenChange, note }: NoteReminderDialogProps) {
	const me = useMe();
	const createReminder = useCreateReminder();

	const defaultTitle =
		(note.title ?? note.content ?? "").trim().slice(0, TITLE_MAX) || "Follow up";
	const defaultDueAt = tomorrowAt9amLocal();

	const [title, setTitle] = useState(defaultTitle);
	const [dueAtLocal, setDueAtLocal] = useState(toLocalInputValue(defaultDueAt));
	const [submitting, setSubmitting] = useState(false);

	// Re-seed defaults whenever the dialog opens for a different note. We
	// recompute the defaults inside the effect (rather than depending on
	// the values themselves) so we don't reset the user's mid-edit state
	// on every parent re-render. note.title/content are tracked via
	// note._id — when the dialog opens for a fresh note row, we re-seed.
	useEffect(() => {
		if (!open) return;
		const t = (note.title ?? note.content ?? "").trim().slice(0, TITLE_MAX) || "Follow up";
		setTitle(t);
		setDueAtLocal(toLocalInputValue(tomorrowAt9amLocal()));
	}, [open, note.title, note.content]);

	const personCode = note.personCode;
	const canSubmit =
		!submitting &&
		title.trim().length > 0 &&
		title.trim().length <= TITLE_MAX &&
		Boolean(personCode) &&
		Boolean(me?._id);

	async function handleSubmit() {
		if (!canSubmit || !me?._id || !personCode) return;
		const dueAt = new Date(dueAtLocal).getTime();
		if (Number.isNaN(dueAt)) {
			toast.error("Pick a valid due date");
			return;
		}
		setSubmitting(true);
		try {
			await createReminder({
				orgId: note.orgId,
				personCode,
				entityType: note.entityType,
				entityId: note.entityId,
				title: title.trim(),
				dueAt,
				assignedTo: me._id,
				source: "note",
			});
			toast.success("Reminder set.");
			onOpenChange(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't create reminder.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Set reminder</DialogTitle>
					<DialogDescription>
						Schedule a follow-up tied to this note. The reminder will appear in the
						org's Reminders inbox and on the person's profile.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 py-2">
					<div className="grid gap-1.5">
						<Label htmlFor="reminder-title">Title</Label>
						<Input
							id="reminder-title"
							value={title}
							maxLength={TITLE_MAX}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Follow up"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="reminder-due-at">Due</Label>
						<Input
							id="reminder-due-at"
							type="datetime-local"
							value={dueAtLocal}
							onChange={(e) => setDueAtLocal(e.target.value)}
						/>
					</div>
					{!personCode && (
						<p className="text-xs text-muted-foreground">
							This note isn't attached to a profile yet. Attach it to a record first —
							reminders need a personCode.
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
						{submitting ? "Saving…" : "Set reminder"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
