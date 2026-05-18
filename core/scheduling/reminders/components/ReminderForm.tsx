"use client";

/**
 * ReminderForm — drawer for create + edit.
 *
 * STATUS: IMPLEMENTED.
 *
 * Re-uses:
 *   - `core/entities/scaffolds/EntityFormDrawer` for the chrome (Sheet,
 *     keyboard Enter-to-next-field, submit footer).
 *   - `core/entities/shared/components/PersonSelect` for assignee picker
 *     (reads `useOrgMembers` from `<OrgProvider>`, no own subscription).
 *   - `useCreateReminder` / `useUpdateReminder` from `../hooks` —
 *     `useUpdateReminder` is wrapped with `withOptimisticUpdate` so the
 *     drawer feels instant.
 *
 * UX choices (one-click, low friction):
 *   - DEFAULTS that match what people actually want:
 *       title       = ""           (focused on open)
 *       dueAt       = tomorrow at 9 AM local
 *       assignedTo  = current user
 *       source      = "manual"
 *       personCode  = supplied by parent (entity tab) or required field
 *   - QUICK PRESETS: "Today 5pm", "Tomorrow 9am", "Next Monday 9am",
 *     "+1 hr", "+3 hrs", "+1 day". Click → due-at jumps to that.
 *   - Submit on Enter inside the title field (EntityFormDrawer handles
 *     this via the FIELD_SELECTOR; the next-field is dueAt → assignee
 *     → submit).
 *   - When editing, the drawer pre-fills every field from the row.
 *
 * Convex contract:
 *   - `create({ orgId, personCode, dealCode?, entityType, entityId, title,
 *     note?, dueAt, assignedTo, source })`
 *   - `update({ orgId, reminderId, title?, note?, dueAt?, assignedTo? })`
 */

import { addDays, addHours, format, nextMonday, set, startOfTomorrow } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import {
	type EntityCodeSelection,
	EntityCodeSelector,
} from "@/core/entities/shared/components/EntityCodeSelector";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import type { PersonRef } from "@/core/entities/shared/types";
import { useCreateReminder, useUpdateReminder } from "@/core/scheduling/reminders/hooks";
import { useCurrentOrg, useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReminderFormBaseProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/**
	 * When set, the form is in EDIT mode for this reminder.
	 * When unset, the form is in CREATE mode and the parent supplies a
	 * `defaults` object with the entity / personCode pre-bound.
	 */
	reminder?: Doc<"reminders"> | null;
	defaults?: {
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		title?: string;
		dueAt?: number;
		assignedTo?: Id<"users">;
		source?: ReminderSource;
	};
	/** Submit-button label override. Calendar uses "Save as Reminder". */
	submitLabel?: string;
}

/**
 * Closed union — must match the Convex validator on `reminders.create`.
 * See CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md §1 for the rationale and the
 * 2026-05-19 schema migration that backfilled legacy values.
 */
type ReminderSource = "manual" | "followup" | "calendar" | "ai" | "note" | "system";

const REMINDER_SOURCE_VALUES: ReminderSource[] = [
	"manual",
	"followup",
	"calendar",
	"ai",
	"note",
	"system",
];

/** Type guard — narrow an arbitrary string to a `ReminderSource`. */
function isReminderSource(value: unknown): value is ReminderSource {
	return typeof value === "string" && (REMINDER_SOURCE_VALUES as string[]).includes(value);
}

const SOURCE_OPTIONS = [
	{ value: "manual", label: "Manual" },
	{ value: "note", label: "From note" },
	{ value: "message", label: "From message" },
	{ value: "calendar", label: "Calendar" },
	{ value: "ai", label: "AI suggestion" },
	{ value: "whatsapp", label: "WhatsApp" },
	{ value: "other", label: "Other" },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date for `<input type="datetime-local">` (no timezone suffix). */
function toLocalInputValue(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDueAt(): Date {
	// Tomorrow 9 AM local — matches the same default used by NoteReminderDialog.
	return set(startOfTomorrow(), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

const PRESETS: Array<{ label: string; build: () => Date }> = [
	{
		label: "Today 5pm",
		build: () => set(new Date(), { hours: 17, minutes: 0, seconds: 0, milliseconds: 0 }),
	},
	{ label: "Tomorrow 9am", build: defaultDueAt },
	{
		label: "Next Mon 9am",
		build: () =>
			set(nextMonday(new Date()), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }),
	},
	{ label: "+1 hr", build: () => addHours(new Date(), 1) },
	{ label: "+3 hrs", build: () => addHours(new Date(), 3) },
	{ label: "+1 day", build: () => addDays(new Date(), 1) },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ReminderForm({
	open,
	onOpenChange,
	reminder,
	defaults,
	submitLabel,
}: ReminderFormBaseProps) {
	const { orgId } = useCurrentOrg();
	const me = useMe();
	const createReminder = useCreateReminder();
	const updateReminder = useUpdateReminder();

	const isEditing = !!reminder;

	// ── State ─────────────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [dueAtLocal, setDueAtLocal] = useState(toLocalInputValue(defaultDueAt()));
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	/**
	 * Selection from EntityCodeSelector — the user can attach the reminder
	 * to a profile (lead/contact merged), a deal, or a company. Server
	 * still requires `personCode`; for a deal/company selection we either
	 * take the entity's primary personCode (deal) or leave it blank (the
	 * picker enforces "must pick a person" for company-only selections).
	 */
	const [entitySelection, setEntitySelection] = useState<EntityCodeSelection | null>(null);
	const [source, setSource] = useState<ReminderSource>("manual");
	const [submitting, setSubmitting] = useState(false);

	const titleInputRef = useRef<HTMLInputElement>(null);

	// Lock the entity picker when the parent has pre-bound the entity
	// (e.g. the form was opened from a deal or person profile tab).
	const entityLocked = !!(
		defaults?.personCode ||
		defaults?.dealCode ||
		(defaults?.entityType && defaults?.entityId)
	);

	// ── Re-seed defaults whenever the drawer opens for a fresh row ────
	useEffect(() => {
		if (!open) return;
		if (reminder) {
			setTitle(reminder.title);
			setNote(reminder.note ?? "");
			setDueAtLocal(toLocalInputValue(new Date(reminder.dueAt)));
			setAssignee({
				id: reminder.assignedTo as string,
				type: "user",
				displayName: "",
			});
			// Edit mode: hydrate the picker from the row's stored entity tuple.
			if (reminder.entityType === "deal" && reminder.entityId) {
				setEntitySelection({
					kind: "deal",
					code: reminder.entityId,
					personCode: reminder.personCode,
				});
			} else if (reminder.entityType === "company" && reminder.entityId) {
				setEntitySelection({
					kind: "company",
					code: reminder.entityId,
				});
			} else {
				setEntitySelection({
					kind: "person",
					personCode: reminder.personCode,
				});
			}
			setSource(isReminderSource(reminder.source) ? reminder.source : "manual");
		} else {
			setTitle(defaults?.title ?? "");
			setNote("");
			setDueAtLocal(
				toLocalInputValue(defaults?.dueAt ? new Date(defaults.dueAt) : defaultDueAt()),
			);
			setAssignee(
				defaults?.assignedTo
					? { id: defaults.assignedTo as string, type: "user", displayName: "" }
					: me?._id
						? {
								id: me._id as string,
								type: "user",
								displayName: me.name ?? me.email ?? "Me",
								email: me.email ?? undefined,
								avatarUrl: me.avatarUrl ?? undefined,
							}
						: null,
			);
			// Build the initial entity selection from the parent's `defaults`.
			// Order of preference: explicit entityType/Id → dealCode → personCode → null.
			if (defaults?.entityType === "deal" && defaults?.entityId) {
				setEntitySelection({
					kind: "deal",
					code: defaults.entityId,
					personCode: defaults.personCode,
				});
			} else if (defaults?.entityType === "company" && defaults?.entityId) {
				setEntitySelection({
					kind: "company",
					code: defaults.entityId,
				});
			} else if (defaults?.dealCode) {
				setEntitySelection({
					kind: "deal",
					code: defaults.dealCode,
					personCode: defaults.personCode,
				});
			} else if (defaults?.personCode) {
				setEntitySelection({
					kind: "person",
					personCode: defaults.personCode,
				});
			} else {
				setEntitySelection(null);
			}
			setSource(defaults?.source ?? "manual");
		}
		// Focus the title input on open so the user can type immediately.
		// Defer to next tick so the drawer's transition has applied.
		const t = setTimeout(() => titleInputRef.current?.focus(), 30);
		return () => clearTimeout(t);
	}, [
		open,
		reminder,
		defaults?.title,
		defaults?.dueAt,
		defaults?.assignedTo,
		defaults?.personCode,
		defaults?.dealCode,
		defaults?.entityType,
		defaults?.entityId,
		defaults?.source,
		me?._id,
		me?.name,
		me?.email,
		me?.avatarUrl,
	]);

	// ── Derived ───────────────────────────────────────────────────────
	const resolvedPersonCode = useMemo(() => {
		if (defaults?.personCode) return defaults.personCode;
		if (!entitySelection) return "";
		if (entitySelection.kind === "person") return entitySelection.personCode;
		if (entitySelection.kind === "deal") return entitySelection.personCode ?? "";
		return "";
	}, [defaults?.personCode, entitySelection]);

	const canSubmit = useMemo(() => {
		if (submitting) return false;
		if (title.trim().length === 0) return false;
		if (!assignee) return false;
		// A reminder must always be tied to a person — companies-only
		// attachments aren't allowed (the schema requires personCode).
		if (!resolvedPersonCode) return false;
		const dueTs = new Date(dueAtLocal).getTime();
		if (Number.isNaN(dueTs)) return false;
		return true;
	}, [submitting, title, assignee, resolvedPersonCode, dueAtLocal]);

	// ── Submit ────────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || !orgId) return;
		const dueTs = new Date(dueAtLocal).getTime();
		setSubmitting(true);
		try {
			if (isEditing && reminder) {
				await updateReminder({
					orgId,
					reminderId: reminder._id,
					title: title.trim(),
					note: note.trim() || undefined,
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
				});
				toast.success("Reminder updated");
			} else {
				// Resolve entityType/entityId from the picker selection,
				// falling back to the pre-bound `defaults` from the parent.
				let entityType = defaults?.entityType;
				let entityId = defaults?.entityId;
				let dealCode: string | undefined = defaults?.dealCode;
				if (!entityType || !entityId) {
					if (entitySelection?.kind === "deal") {
						entityType = "deal";
						entityId = entitySelection.code;
						dealCode = entitySelection.code;
					} else if (entitySelection?.kind === "company") {
						entityType = "company";
						entityId = entitySelection.code;
					} else {
						entityType = "person";
						entityId = resolvedPersonCode;
					}
				}
				await createReminder({
					orgId,
					personCode: resolvedPersonCode,
					dealCode,
					entityType,
					entityId,
					title: title.trim(),
					note: note.trim() || undefined,
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
					source,
				});
				toast.success("Reminder created");
			}
			onOpenChange(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't save reminder");
		} finally {
			setSubmitting(false);
		}
	}

	// ── Render ────────────────────────────────────────────────────────
	const titleText = isEditing ? "Edit reminder" : "New reminder";
	const description = isEditing
		? "Update the reminder. Changes appear instantly across the calendar and dashboards."
		: "Set a follow-up. It will appear on the assignee's reminders list and on the org calendar.";

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={titleText}
			description={description}
			size="md"
			onSubmit={handleSubmit}
			isSubmitting={submitting}
			submitDisabled={!canSubmit}
			submitLabel={submitLabel ?? (isEditing ? "Save changes" : "Create reminder")}
		>
			<div className="space-y-4">
				{/* Title */}
				<div className="grid gap-1.5">
					<Label htmlFor="reminder-title">Title</Label>
					<Input
						id="reminder-title"
						ref={titleInputRef}
						value={title}
						maxLength={200}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Follow up with…"
					/>
				</div>

				{/* Due-at + presets */}
				<div className="grid gap-1.5">
					<Label htmlFor="reminder-due-at">Due</Label>
					<Input
						id="reminder-due-at"
						type="datetime-local"
						value={dueAtLocal}
						onChange={(e) => setDueAtLocal(e.target.value)}
					/>
					<div className="flex flex-wrap gap-1.5" data-form-skip-enter>
						{PRESETS.map((p) => (
							<Button
								key={p.label}
								type="button"
								size="sm"
								variant="outline"
								className="h-6 px-2 text-[11px]"
								onClick={() => setDueAtLocal(toLocalInputValue(p.build()))}
							>
								{p.label}
							</Button>
						))}
					</div>
				</div>

				{/* Assignee */}
				<div className="grid gap-1.5">
					<Label>Assignee</Label>
					<PersonSelect
						scope="user"
						value={assignee}
						onChange={setAssignee}
						placeholder="Choose someone…"
					/>
				</div>

				{/* Entity attachment (only when not pre-bound) */}
				{!entityLocked && !isEditing && (
					<div className="grid gap-1.5">
						<Label>Attached to</Label>
						<EntityCodeSelector
							orgId={orgId}
							value={entitySelection}
							onChange={setEntitySelection}
							placeholder="Pick a profile, deal, or company…"
						/>
						{entitySelection?.kind === "deal" && !entitySelection.personCode ? (
							<p className="text-[11px] text-amber-600">
								This deal has no primary contact. Pick a profile so we can attach
								the reminder to a person.
							</p>
						) : entitySelection?.kind === "company" ? (
							<p className="text-[11px] text-amber-600">
								Reminders need a person. Pick a profile or deal — companies on their
								own can't receive a reminder.
							</p>
						) : (
							<p className="text-[11px] text-muted-foreground">
								Profiles search merges leads + contacts on personCode (P-001). Deals
								(D-…) and companies (CO-…) are also searchable.
							</p>
						)}
					</div>
				)}
				{entityLocked && !isEditing && entitySelection && (
					<div className="grid gap-1.5">
						<Label>Attached to</Label>
						<EntityCodeSelector
							orgId={orgId}
							value={entitySelection}
							onChange={() => undefined}
							disabled
							clearable={false}
						/>
					</div>
				)}

				{/* Note */}
				<div className="grid gap-1.5">
					<Label htmlFor="reminder-note">Note (optional)</Label>
					<Textarea
						id="reminder-note"
						value={note}
						maxLength={1000}
						rows={3}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Anything you want to remember…"
					/>
				</div>

				{/* Source (create only) */}
				{!isEditing && (
					<div className="grid gap-1.5">
						<Label htmlFor="reminder-source">Source</Label>
						<Select
							value={source}
							onValueChange={(v) => {
								if (isReminderSource(v)) setSource(v);
							}}
						>
							<SelectTrigger id="reminder-source">
								<SelectValue placeholder="Where is this from?" />
							</SelectTrigger>
							<SelectContent>
								{SOURCE_OPTIONS.map((s) => (
									<SelectItem key={s.value} value={s.value}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Confirmation row — shows the parsed datetime */}
				<div className="rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
					Due:{" "}
					<span className="font-medium text-foreground">
						{(() => {
							const ts = new Date(dueAtLocal).getTime();
							if (Number.isNaN(ts)) return "Invalid date";
							return format(ts, "EEEE, MMM d, yyyy 'at' h:mm a");
						})()}
					</span>
				</div>
			</div>
		</EntityFormDrawer>
	);
}
