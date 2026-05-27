"use client";

/**
 * TaskForm — drawer for create + edit. The single canonical task form.
 *
 * Replaces ReminderForm + FollowUpForm (and EventForm-as-task-create).
 * The type chip is the FIRST primary control: selecting "Follow-up"
 * pulls org-default cadence (priority + due offset) from
 * `org.settings.taskDefaults`; selecting "Call/Email/Meeting/To-do"
 * lets the operator pick those explicitly.
 *
 * UX choices (one-click, low friction):
 *   - DEFAULTS that match what people actually want:
 *       title       = ""  (focused on open)
 *       type        = "todo"  (or `defaults.type` from caller)
 *       dueAt       = tomorrow at 9 AM local
 *       assignedTo  = current user
 *       priority    = "normal"  (followup type pulls from org settings)
 *   - QUICK PRESETS for due-at; "Use default (+Nd)" appears for followup type.
 *   - Priority chip is ALWAYS visible (production-grade — every task has urgency).
 *   - The type chip is a visual selector (icon + label), not a Select dropdown,
 *     so the operator scans it at a glance.
 *   - Submit on Enter inside the title field (EntityFormDrawer FIELD_SELECTOR
 *     advances title → dueAt → assignee → submit).
 *   - When editing, the drawer pre-fills every field from the row.
 *
 * Convex contract:
 *   - `create({ orgId, type, personCode?, dealCode?, entityType?, entityId?,
 *              title, note?, dueAt?, assignedTo?, priority? })`
 *   - `update({ orgId, taskId, title?, note?, dueAt?, assignedTo?,
 *              type?, priority? })`
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
import { cn } from "@/lib/utils";
import { useCreateTask, useUpdateTask } from "../hooks";
import {
	resolveTaskPriority,
	TASK_PRIORITY_COLOR,
	TASK_PRIORITY_LABEL,
	TASK_PRIORITY_VALUES,
	type TaskPriority,
} from "../lib/task-priority";
import {
	resolveTaskType,
	TASK_TYPE_COLOR,
	TASK_TYPE_ICON,
	TASK_TYPE_LABEL,
	TASK_TYPE_VALUES,
	type TaskType,
} from "../lib/task-type";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Edit mode when set; create mode when unset. */
	task?: Doc<"tasks"> | null;
	/** Pre-bound context from the surface that opened the form. */
	defaults?: {
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		title?: string;
		dueAt?: number;
		assignedTo?: Id<"users">;
		type?: TaskType;
		priority?: TaskPriority;
	};
	/** Optional submit-button label override. */
	submitLabel?: string;
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

function defaultDueAt(): Date {
	return morningOf(startOfTomorrow());
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TaskForm({ open, onOpenChange, task, defaults, submitLabel }: TaskFormProps) {
	const { orgId, fullOrgEntry } = useCurrentOrg();
	const me = useMe();
	const createTask = useCreateTask();
	const updateTask = useUpdateTask();

	const isEditing = !!task;

	// Read org-level defaults (followup cadence) so the "Use default"
	// preset and the initial priority chip reflect the org owner's
	// chosen cadence when type === "followup".
	const orgTaskDefaults =
		(
			fullOrgEntry?.org?.settings as {
				taskDefaults?: { defaultDueOffsetDays?: number; defaultPriority?: TaskPriority };
				// Honour the legacy field as a fallback during the rename transition.
				followupDefaults?: {
					defaultDueOffsetDays?: number;
					defaultPriority?: TaskPriority;
				};
			}
		)?.taskDefaults ??
		(
			fullOrgEntry?.org?.settings as {
				followupDefaults?: {
					defaultDueOffsetDays?: number;
					defaultPriority?: TaskPriority;
				};
			}
		)?.followupDefaults ??
		{};
	const orgOffsetDays = Math.max(1, Math.min(365, orgTaskDefaults.defaultDueOffsetDays ?? 3));
	const orgDefaultPriority: TaskPriority = orgTaskDefaults.defaultPriority ?? "normal";

	// ── State ─────────────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [type, setType] = useState<TaskType>(defaults?.type ?? "todo");
	const [priority, setPriority] = useState<TaskPriority>(defaults?.priority ?? "normal");
	const [dueAtLocal, setDueAtLocal] = useState(toLocalInputValue(defaultDueAt()));
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [entitySelection, setEntitySelection] = useState<EntityCodeSelection | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const titleInputRef = useRef<HTMLInputElement>(null);

	// Lock the entity picker when the parent has pre-bound the entity.
	const entityLocked = !!(
		defaults?.personCode ||
		defaults?.dealCode ||
		(defaults?.entityType && defaults?.entityId)
	);

	// ── Re-seed defaults whenever the drawer opens for a fresh row ────
	useEffect(() => {
		if (!open) return;
		if (task) {
			setTitle(task.title);
			setNote(task.note ?? "");
			setType(resolveTaskType(task.type));
			setPriority(resolveTaskPriority(task.priority));
			setDueAtLocal(toLocalInputValue(new Date(task.dueAt)));
			setAssignee({
				id: task.assignedTo as string,
				type: "user",
				displayName: "",
			});
			if (task.entityType === "deal" && task.entityId) {
				setEntitySelection({
					kind: "deal",
					code: task.entityId,
					personCode: task.personCode,
				});
			} else if (task.entityType === "company" && task.entityId) {
				setEntitySelection({ kind: "company", code: task.entityId });
			} else if (task.personCode) {
				setEntitySelection({ kind: "person", personCode: task.personCode });
			} else {
				setEntitySelection(null);
			}
		} else {
			setTitle(defaults?.title ?? "");
			setNote("");
			const initialType = defaults?.type ?? "todo";
			setType(initialType);
			setPriority(
				defaults?.priority ?? (initialType === "followup" ? orgDefaultPriority : "normal"),
			);
			const initialDue = defaults?.dueAt
				? new Date(defaults.dueAt)
				: initialType === "followup"
					? morningOf(addDays(new Date(), orgOffsetDays))
					: defaultDueAt();
			setDueAtLocal(toLocalInputValue(initialDue));
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
		task,
		defaults?.title,
		defaults?.dueAt,
		defaults?.assignedTo,
		defaults?.personCode,
		defaults?.dealCode,
		defaults?.entityType,
		defaults?.entityId,
		defaults?.type,
		defaults?.priority,
		me?._id,
		me?.name,
		me?.email,
		me?.avatarUrl,
		orgDefaultPriority,
		orgOffsetDays,
	]);

	// ── Derived ───────────────────────────────────────────────────────
	const resolvedPersonCode = useMemo(() => {
		if (defaults?.personCode) return defaults.personCode;
		if (!entitySelection) return "";
		if (entitySelection.kind === "person") return entitySelection.personCode;
		if (entitySelection.kind === "deal") return entitySelection.personCode ?? "";
		return "";
	}, [defaults?.personCode, entitySelection]);

	// followup type REQUIRES a personCode; other types don't.
	const requiresPerson = type === "followup";

	const canSubmit = useMemo(() => {
		if (submitting) return false;
		if (title.trim().length === 0) return false;
		if (!assignee) return false;
		if (requiresPerson && !resolvedPersonCode) return false;
		const dueTs = new Date(dueAtLocal).getTime();
		if (Number.isNaN(dueTs)) return false;
		return true;
	}, [submitting, title, assignee, resolvedPersonCode, dueAtLocal, requiresPerson]);

	// ── Quick-date presets (extend with org-default for followup) ─────
	const PRESETS = useMemo(() => {
		const base: Array<{ label: string; build: () => Date }> = [
			{ label: "Tomorrow 9am", build: defaultDueAt },
			{
				label: "Today 5pm",
				build: () =>
					set(new Date(), { hours: 17, minutes: 0, seconds: 0, milliseconds: 0 }),
			},
			{
				label: "Next Mon 9am",
				build: () => morningOf(nextMonday(new Date())),
			},
			{ label: "+1 hr", build: () => addHours(new Date(), 1) },
			{ label: "+3 hrs", build: () => addHours(new Date(), 3) },
			{ label: "+1 day", build: () => addDays(new Date(), 1) },
		];
		if (type === "followup") {
			base.unshift({
				label: `Default (+${orgOffsetDays}d)`,
				build: () => morningOf(addDays(new Date(), orgOffsetDays)),
			});
		}
		return base;
	}, [type, orgOffsetDays]);

	// ── Submit ────────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || !orgId) return;
		const dueTs = new Date(dueAtLocal).getTime();
		setSubmitting(true);
		try {
			if (isEditing && task) {
				await updateTask({
					orgId,
					taskId: task._id,
					title: title.trim(),
					note: note.trim() || undefined,
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
					type,
					priority,
				});
				toast.success("Task updated");
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
					} else if (resolvedPersonCode) {
						entityType = "person";
						entityId = resolvedPersonCode;
					}
				}
				await createTask({
					orgId,
					type,
					...(resolvedPersonCode ? { personCode: resolvedPersonCode } : {}),
					...(dealCode ? { dealCode } : {}),
					...(entityType ? { entityType } : {}),
					...(entityId ? { entityId } : {}),
					title: title.trim(),
					...(note.trim() ? { note: note.trim() } : {}),
					dueAt: dueTs,
					assignedTo: assignee!.id as Id<"users">,
					priority,
				});
				toast.success("Task created");
			}
			onOpenChange(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't save task");
		} finally {
			setSubmitting(false);
		}
	}

	const titleText = isEditing ? "Edit task" : "New task";
	const description = isEditing
		? "Update the task. Changes appear instantly across the calendar and dashboards."
		: "Track a call, email, meeting, follow-up, or to-do. Tasks land on the assignee's queue and the org calendar.";

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
			submitLabel={submitLabel ?? (isEditing ? "Save changes" : "Create task")}
		>
			<div className="space-y-4">
				{/* Type chip selector */}
				<div className="grid gap-1.5">
					<Label>Type</Label>
					<div className="flex flex-wrap gap-1.5" data-form-skip-enter>
						{TASK_TYPE_VALUES.map((t) => {
							const Icon = TASK_TYPE_ICON[t];
							const color = TASK_TYPE_COLOR[t];
							const active = t === type;
							return (
								<button
									key={t}
									type="button"
									onClick={() => setType(t)}
									aria-pressed={active}
									className={cn(
										"inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
										active
											? "font-medium"
											: "text-muted-foreground hover:text-foreground",
									)}
									style={
										active
											? {
													color,
													borderColor: `${color}66`,
													backgroundColor: `${color}14`,
												}
											: undefined
									}
								>
									<Icon className="size-3.5" aria-hidden />
									{TASK_TYPE_LABEL[t]}
								</button>
							);
						})}
					</div>
				</div>

				{/* Title */}
				<div className="grid gap-1.5">
					<Label htmlFor="task-title">Title</Label>
					<Input
						id="task-title"
						ref={titleInputRef}
						value={title}
						maxLength={200}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="What needs doing?"
					/>
				</div>

				{/* Due-at + presets */}
				<div className="grid gap-1.5">
					<Label htmlFor="task-due-at">Due</Label>
					<Input
						id="task-due-at"
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

				{/* Priority — always visible (production-grade — every task carries urgency) */}
				<div className="grid gap-1.5">
					<Label htmlFor="task-priority">Priority</Label>
					<Select
						value={priority}
						onValueChange={(v) => setPriority(resolveTaskPriority(v))}
					>
						<SelectTrigger id="task-priority">
							<SelectValue placeholder="Choose priority" />
						</SelectTrigger>
						<SelectContent>
							{TASK_PRIORITY_VALUES.map((p) => (
								<SelectItem key={p} value={p}>
									<span className="flex items-center gap-2">
										<span
											aria-hidden
											className="size-2 rounded-full"
											style={{ backgroundColor: TASK_PRIORITY_COLOR[p] }}
										/>
										{TASK_PRIORITY_LABEL[p]}
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
						{requiresPerson &&
						entitySelection?.kind === "deal" &&
						!entitySelection.personCode ? (
							<p className="text-[11px] text-amber-600">
								Follow-ups need a person. Pick a profile so we can attach this
								follow-up to a contact.
							</p>
						) : requiresPerson && entitySelection?.kind === "company" ? (
							<p className="text-[11px] text-amber-600">
								Follow-ups need a person. Pick a profile or deal — companies on
								their own can't receive a follow-up.
							</p>
						) : (
							<p className="text-[11px] text-muted-foreground">
								Profiles search merges leads + contacts on personCode (P-001). Deals
								(D-…) and companies (CO-…) are also searchable. Optional for
								personal to-dos.
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
					<Label htmlFor="task-note">Note (optional)</Label>
					<Textarea
						id="task-note"
						value={note}
						maxLength={1000}
						rows={3}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Anything you want to remember…"
					/>
				</div>

				{/* Confirmation row — shows the parsed datetime + priority */}
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
							style={{ backgroundColor: TASK_PRIORITY_COLOR[priority] }}
						/>
						{TASK_PRIORITY_LABEL[priority]} priority
					</span>
				</div>
			</div>
		</EntityFormDrawer>
	);
}
