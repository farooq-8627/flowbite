"use client";

/**
 * FollowUpForm — opinionated drawer for follow-up create + edit.
 *
 * STATUS: IMPLEMENTED.
 *
 * Doctrine: follow-ups are reminders with `source === "followup"`. This
 * form persists through the dedicated `createFollowup` mutation (sets
 * source = followup + reads org.settings.followupDefaults for fallback
 * dueAt + priority + logs `followup_created`). Edit uses the shared
 * `reminders.update` so optimistic patches flow through one cache layer.
 *
 * Differences vs the generic ReminderForm:
 *   - Submit label: "Create follow-up" / "Save follow-up".
 *   - Priority chip is a primary control (between dueAt and assignee),
 *     not buried in an "Advanced" section.
 *   - Quick-date presets include a "Use default" chip computed from
 *     `org.settings.followupDefaults.defaultDueOffsetDays`.
 *   - The `source` selector is hidden — follow-ups always have
 *     `source = "followup"`.
 *   - On create, the form reads default priority from
 *     `org.settings.followupDefaults.defaultPriority` (falls back to "normal").
 *
 * Reuses:
 *   - `EntityFormDrawer` for the drawer chrome.
 *   - `EntityCodeSelector` to attach to a profile / deal / company.
 *   - `PersonSelect` for the assignee.
 *   - `useCreateFollowup` / `useUpdateFollowup` from `../hooks`.
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
import { useCurrentOrg, useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { useCreateFollowup, useUpdateFollowup } from "../hooks";
import {
	FOLLOWUP_PRIORITY_COLOR,
	FOLLOWUP_PRIORITY_LABEL,
	FOLLOWUP_PRIORITY_VALUES,
	type FollowupPriority,
	resolveFollowupPriority,
} from "../lib/followup-priority";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FollowUpFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Edit mode when set; create mode when unset. */
	followup?: Doc<"reminders"> | null;
	/** Pre-bound entity context from the surface that opened the form. */
	defaults?: {
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		title?: string;
		dueAt?: number;
		assignedTo?: Id<"users">;
		priority?: FollowupPriority;
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date for `<input type="datetime-local">` (no timezone suffix). */
function toLocalInputValue(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function morningOf(date: Date): Date {
	return set(date, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FollowUpForm({ open, onOpenChange, followup, defaults }: FollowUpFormProps) {
	const { orgId, fullOrgEntry } = useCurrentOrg();
	const me = useMe();
	const createFollowup = useCreateFollowup();
	const updateFollowup = useUpdateFollowup();

	const isEditing = !!followup;

	// Read org-level defaults so the "Use default" preset and the initial
	// priority chip reflect the org owner's chosen cadence.
	const orgFollowupDefaults =
		(
			fullOrgEntry?.org?.settings as {
				followupDefaults?: {
					defaultDueOffsetDays?: number;
					defaultPriority?: FollowupPriority;
				};
			}
		)?.followupDefaults ?? {};
	const orgOffsetDays = Math.max(1, Math.min(365, orgFollowupDefaults.defaultDueOffsetDays ?? 3));
	const orgDefaultPriority = orgFollowupDefaults.defaultPriority ?? "normal";

	const orgDefaultDueAt = useMemo(() => {
		// today + N days, at 9 AM local. Same shape as the server-side
		// fallback in `createFollowup`, modulo time-of-day.
		return morningOf(addDays(new Date(), orgOffsetDays)).getTime();
	}, [orgOffsetDays]);

	// ── State ─────────────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [dueAtLocal, setDueAtLocal] = useState(toLocalInputValue(new Date(orgDefaultDueAt)));
	const [priority, setPriority] = useState<FollowupPriority>(orgDefaultPriority);
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [entitySelection, setEntitySelection] = useState<EntityCodeSelection | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const titleInputRef = useRef<HTMLInputElement>(null);

	// Lock the entity picker when the parent has pre-bound it (panel
	// opened from a profile / deal / company tab).
	const entityLocked = !!(
		defaults?.personCode ||
		defaults?.dealCode ||
		(defaults?.entityType && defaults?.entityId)
	);

	// ── Re-seed defaults whenever the drawer opens for a fresh row ────
	useEffect(() => {
		if (!open) return;
		if (followup) {
			setTitle(followup.title);
			setNote(followup.note ?? "");
			setDueAtLocal(toLocalInputValue(new Date(followup.dueAt)));
			setPriority(resolveFollowupPriority(followup.priority));
			setAssignee({
				id: followup.assignedTo as string,
				type: "user",
				displayName: "",
			});
			if (followup.entityType === "deal" && followup.entityId) {
				setEntitySelection({
					kind: "deal",
					code: followup.entityId,
					personCode: followup.personCode,
				});
			} else if (followup.entityType === "company" && followup.entityId) {
				setEntitySelection({ kind: "company", code: followup.entityId });
			} else {
				setEntitySelection({ kind: "person", personCode: followup.personCode });
			}
		} else {
			setTitle(defaults?.title ?? "");
			setNote("");
			setDueAtLocal(
				toLocalInputValue(
					defaults?.dueAt ? new Date(defaults.dueAt) : new Date(orgDefaultDueAt),
				),
			);
			setPriority(defaults?.priority ?? orgDefaultPriority);
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
			if (defaults?.entityType === "deal" && defaults?.entityId) {
				setEntitySelection({
					kind: "deal",
					code: defaults.entityId,
					personCode: defaults.personCode,
				});
			} else if (defaults?.entityType === "company" && defaults?.entityId) {
				setEntitySelection({ kind: "company", code: defaults.entityId });
			} else if (defaults?.dealCode) {
				setEntitySelection({
					kind: "deal",
					code: defaults.dealCode,
					personCode: defaults.personCode,
				});
			} else if (defaults?.personCode) {
				setEntitySelection({ kind: "person", personCode: defaults.personCode });
			} else {
				setEntitySelection(null);
			}
		}
		const t = setTimeout(() => titleInputRef.current?.focus(), 30);
		return () => clearTimeout(t);
	}, [
		open,
		followup,
		defaults?.title,
		defaults?.dueAt,
		defaults?.assignedTo,
		defaults?.personCode,
		defaults?.dealCode,
		defaults?.entityType,
		defaults?.entityId,
		defaults?.priority,
		me?._id,
		me?.name,
		me?.email,
		me?.avatarUrl,
		orgDefaultPriority,
		orgDefaultDueAt,
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
		if (!resolvedPersonCode) return false;
		const dueTs = new Date(dueAtLocal).getTime();
		if (Number.isNaN(dueTs)) return false;
		return true;
	}, [submitting, title, assignee, resolvedPersonCode, dueAtLocal]);

	// ── Quick-date presets ────────────────────────────────────────────
	const PRESETS = useMemo(
		() => [
			{
				label: `Default (+${orgOffsetDays}d)`,
				build: () => morningOf(addDays(new Date(), orgOffsetDays)),
			},
			{ label: "Tomorrow 9am", build: () => morningOf(startOfTomorrow()) },
			{
				label: "+3 days",
				build: () => morningOf(addDays(new Date(), 3)),
			},
			{
				label: "+1 week",
				build: () => morningOf(addDays(new Date(), 7)),
			},
			{
				label: "Next Mon 9am",
				build: () => morningOf(nextMonday(new Date())),
			},
			{ label: "+1 hr", build: () => addHours(new Date(), 1) },
		],
		[orgOffsetDays],
	);

	// ── Submit ────────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || !orgId) return;
		const dueTs = new Date(dueAtLocal).getTime();
		setSubmitting(true);
		try {
			if (isEditing && followup) {
				await updateFollowup({
					orgId,
					reminderId: followup._id,
					title: title.trim(),
					note: note.trim() || undefined,
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
					priority,
				});
				toast.success("Follow-up updated");
			} else {
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
				await createFollowup({
					orgId,
					personCode: resolvedPersonCode,
					dealCode,
					entityType,
					entityId,
					title: title.trim(),
					note: note.trim() || undefined,
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
					priority,
				});
				toast.success("Follow-up created");
			}
			onOpenChange(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't save follow-up");
		} finally {
			setSubmitting(false);
		}
	}

	const titleText = isEditing ? "Edit follow-up" : "New follow-up";
	const description = isEditing
		? "Update the follow-up. Changes appear instantly on the cadence list and the calendar."
		: "Schedule a follow-up. It will appear on the assignee's queue, the org calendar, and the timeline.";

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
			submitLabel={isEditing ? "Save follow-up" : "Create follow-up"}
		>
			<div className="space-y-4">
				{/* Title */}
				<div className="grid gap-1.5">
					<Label htmlFor="followup-title">Title</Label>
					<Input
						id="followup-title"
						ref={titleInputRef}
						value={title}
						maxLength={200}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Follow up with…"
					/>
				</div>

				{/* Due-at + presets */}
				<div className="grid gap-1.5">
					<Label htmlFor="followup-due-at">Due</Label>
					<Input
						id="followup-due-at"
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

				{/* Priority — primary control on the follow-ups surface */}
				<div className="grid gap-1.5">
					<Label htmlFor="followup-priority">Priority</Label>
					<Select
						value={priority}
						onValueChange={(v) => setPriority(resolveFollowupPriority(v))}
					>
						<SelectTrigger id="followup-priority">
							<SelectValue placeholder="Choose priority" />
						</SelectTrigger>
						<SelectContent>
							{FOLLOWUP_PRIORITY_VALUES.map((p) => (
								<SelectItem key={p} value={p}>
									<span className="flex items-center gap-2">
										<span
											aria-hidden
											className="size-2 rounded-full"
											style={{ backgroundColor: FOLLOWUP_PRIORITY_COLOR[p] }}
										/>
										{FOLLOWUP_PRIORITY_LABEL[p]}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
								the follow-up to a person.
							</p>
						) : entitySelection?.kind === "company" ? (
							<p className="text-[11px] text-amber-600">
								Follow-ups need a person. Pick a profile or deal — companies on
								their own can't receive a follow-up.
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
					<Label htmlFor="followup-note">Note (optional)</Label>
					<Textarea
						id="followup-note"
						value={note}
						maxLength={1000}
						rows={3}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Anything you want to remember for the next touch…"
					/>
				</div>

				{/* Confirmation row */}
				<div className="rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
					Due:{" "}
					<span className="font-medium text-foreground">
						{(() => {
							const ts = new Date(dueAtLocal).getTime();
							if (Number.isNaN(ts)) return "Invalid date";
							return format(ts, "EEEE, MMM d, yyyy 'at' h:mm a");
						})()}
					</span>
					<span className="ms-2">·</span>
					<span className="ms-2 inline-flex items-center gap-1.5">
						<span
							aria-hidden
							className="size-1.5 rounded-full"
							style={{ backgroundColor: FOLLOWUP_PRIORITY_COLOR[priority] }}
						/>
						{FOLLOWUP_PRIORITY_LABEL[priority]} priority
					</span>
				</div>
			</div>
		</EntityFormDrawer>
	);
}
