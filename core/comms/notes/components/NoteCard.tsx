"use client";

/**
 * NoteCard — sticky-styled note card on the kanban board.
 *
 * Layout matches the spec the user asked for:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ ◎ author-avatar             [P-001] ◎assignee  ⋮          │  row 1: avatar TL · code+avatar+menu TR
 *   │                              (or)  [+ button]  ⋮          │
 *   │                                                          │
 *   │   Note body (click → inline textarea)                    │
 *   │                                                          │
 *   │   internal • timestamp                                   │  row 3: meta only — no author name
 *   └──────────────────────────────────────────────────────────┘
 *                                                          ↑ vertical grip on right edge (drag handle)
 *
 * Drag mechanics mirror EntityCard exactly: KanbanItem + KanbanItemHandle.
 * Wrapping the body in `pointerdown/click/keydown` event-stoppers keeps
 * inline edits / picker opens / menu clicks from accidentally starting a
 * drag. Drop is smooth because `useSetNoteCategory` is wrapped with an
 * optimistic update — the card stays in the new column until the server
 * confirms (the standard Convex pattern used by leads).
 *
 * Why no inline category dropdown anymore: drag is the canonical recategorize
 * action — it's the SAME UX as the entity boards. A dropdown duplicates the
 * affordance and confuses the model.
 */

import { GripVerticalIcon, Pin, Trash2, BellRingIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KanbanItem, KanbanItemHandle } from "@/components/ui/kanban";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
	useDeleteNote,
	useSetNoteCategory,
	useSetNoteEntity,
	useToggleNotePin,
	useUpdateNote,
} from "../hooks";
import { CategoryDotPicker } from "./CategoryDotPicker";
import { type EntityAttachment, EntityPickerPopover } from "./EntityPickerPopover";
import { NoteReminderDialog } from "./NoteReminderDialog";
import { resolveTextColor } from "./note-color-utils";

export interface NoteCardProps {
	note: Doc<"notes">;
	categories: Doc<"noteCategories">[] | undefined;
	authorName: string;
	authorAvatarUrl?: string;
	currentUserId: Id<"users"> | undefined;
	permissions: ReadonlyArray<string>;
	orgSlug?: string;
	isDragging?: boolean;
	className?: string;
	/**
	 * Which corner pickers to render. Context-dependent:
	 *   - `"category"` (default for embedded panels) — only the category
	 *     dot. The entity attachment is locked by the parent context (a
	 *     profile / deal / company tab), so the entity picker is hidden.
	 *   - `"entity"` — only the entity-attach `+` button. Used when the
	 *     category isn't user-pickable.
	 *   - `"both"` (default for the org-wide notes board) — show both, so
	 *     the user can recategorize AND retarget a card from one row.
	 */
	pickers?: "category" | "entity" | "both";
	/**
	 * When true, the card mounts in edit mode with the textarea focused and
	 * the existing content selected — used by the "create + auto-focus" flow
	 * so a freshly-spawned card lets the user type immediately, replacing
	 * the placeholder. Once the focus is applied the card calls
	 * `onAutoFocusConsumed` so the parent can clear the claim and avoid
	 * re-firing on subsequent renders.
	 */
	autoFocus?: boolean;
	onAutoFocusConsumed?: () => void;
	/**
	 * Search-match flag. When `true` and `highlightEpoch` changes, the card
	 * replays the `note-card-flash` outline animation — same UX as the
	 * entity boards. The card's background colour is the category colour, so
	 * we use `outline-color` (not `border-color`) for the flash; outline
	 * sits outside the box and never shifts layout or paints over the card.
	 */
	isHighlighted?: boolean;
	/** Incrementing counter that triggers the flash to replay on each search. */
	highlightEpoch?: number;
}

export function NoteCard({
	note,
	categories,
	authorName,
	authorAvatarUrl,
	currentUserId,
	permissions,
	orgSlug,
	isDragging,
	className,
	pickers = "both",
	autoFocus = false,
	onAutoFocusConsumed,
	isHighlighted = false,
	highlightEpoch,
}: NoteCardProps) {
	const [editing, setEditing] = useState(autoFocus);
	const [draft, setDraft] = useState(note.content);
	const [reminderOpen, setReminderOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);

	const togglePin = useToggleNotePin();
	const setEntity = useSetNoteEntity();
	const setCategory = useSetNoteCategory();
	const deleteNote = useDeleteNote();
	const updateNote = useUpdateNote();

	useEffect(() => {
		if (!editing) setDraft(note.content);
	}, [note.content, editing]);

	useEffect(() => {
		if (editing && textareaRef.current) {
			textareaRef.current.focus();
			const len = textareaRef.current.value.length;
			textareaRef.current.setSelectionRange(len, len);
		}
	}, [editing]);

	// Auto-focus path: when the parent has just created this card, jump
	// straight into edit mode, focus the textarea, and select the existing
	// placeholder content so the user's first keystroke replaces it. We only
	// run this once per mount — the `consumedRef` guard makes sure stale
	// `autoFocus=true` props (rare, but possible if the parent re-renders
	// before clearing) don't keep stealing focus from the user.
	const autoFocusConsumedRef = useRef(false);
	useEffect(() => {
		if (!autoFocus || autoFocusConsumedRef.current) return;
		autoFocusConsumedRef.current = true;
		setEditing(true);
		// Run after the textarea has rendered.
		queueMicrotask(() => {
			const ta = textareaRef.current;
			if (ta) {
				ta.focus();
				ta.select();
			}
			onAutoFocusConsumed?.();
		});
	}, [autoFocus, onAutoFocusConsumed]);

	// Search-match flash — toggles the `note-card-flash` class off-then-on so
	// the CSS animation restarts without re-mounting the card (re-mount would
	// tear down the dnd-kit sortable registration). Driven by `highlightEpoch`
	// so the same card can flash on every fresh search query.
	useEffect(() => {
		if (!isHighlighted || !highlightEpoch) return;
		const el = rootRef.current;
		if (!el) return;
		el.classList.remove("note-card-flash");
		// Force reflow so the animation restarts from the beginning.
		void el.offsetWidth;
		el.classList.add("note-card-flash");
		const t = window.setTimeout(() => el.classList.remove("note-card-flash"), 1600);
		return () => window.clearTimeout(t);
	}, [isHighlighted, highlightEpoch]);

	const category = categories?.find((c) => c._id === note.categoryId);
	const bgColor = category?.bgColor ?? "#fde68a";
	const textColor = resolveTextColor(bgColor, category?.textColor);

	const isOwn = currentUserId !== undefined && String(note.authorId) === String(currentUserId);
	const has = (key: string) => permissions.includes(key);
	const canEdit = has("notes.deleteAny") || (isOwn && has("notes.updateOwn"));
	const canPin = has("notes.pin");
	const canDelete = has("notes.deleteAny") || (isOwn && has("notes.deleteOwn"));

	const currentAttachment: EntityAttachment | null =
		note.entityType === "org"
			? { entityType: "org", entityId: note.entityId, personCode: note.personCode }
			: ({
					entityType: note.entityType as EntityAttachment["entityType"],
					entityId: note.entityId,
					personCode: note.personCode,
				} satisfies EntityAttachment);

	const isAttachedToEntity = note.entityType !== "org";
	const attachedCode = note.personCode;

	// ── Handlers ─────────────────────────────────────────────────────────────

	async function commitEdit() {
		const next = draft.trim();
		if (next === note.content || next.length === 0) {
			setEditing(false);
			setDraft(note.content);
			return;
		}
		try {
			await updateNote({ orgId: note.orgId, noteId: note._id, content: next });
		} catch (err) {
			toast.mutationError(err, "Couldn't update note.");
		}
		setEditing(false);
	}

	async function handlePickEntity(next: EntityAttachment) {
		try {
			await setEntity({
				orgId: note.orgId,
				noteId: note._id,
				entityType: next.entityType,
				entityId: next.entityId,
				personCode: next.personCode,
			});
		} catch (err) {
			toast.mutationError(err, "Couldn't reattach note.");
		}
	}

	async function handlePickCategory(categoryId: Id<"noteCategories">) {
		if (categoryId === note.categoryId) return;
		try {
			// No sortOrder param → server stamps a top-of-column position so
			// the recategorized card lands at the top of the new column. The
			// optimistic update mirrors that visually.
			await setCategory({
				orgId: note.orgId,
				noteId: note._id,
				categoryId,
			});
		} catch (err) {
			toast.mutationError(err, "Couldn't change category.");
		}
	}

	async function handleTogglePin() {
		try {
			await togglePin({ orgId: note.orgId, noteId: note._id });
		} catch (err) {
			toast.mutationError(err, "Couldn't change pin state.");
		}
	}

	async function handleDelete() {
		if (!window.confirm("Delete this note? This cannot be undone.")) return;
		try {
			await deleteNote({ orgId: note.orgId, noteId: note._id });
			toast.success("Note deleted.");
		} catch (err) {
			toast.mutationError(err, "Couldn't delete note.");
		}
	}

	const initials = authorName
		.split(/\s+/)
		.map((s) => s[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	return (
		<KanbanItem value={String(note._id)} asChild>
			<div
				ref={rootRef}
				className={cn(
					"group/note relative flex w-full flex-col gap-2 rounded-[var(--radius)] ps-2.5 pe-5 py-2.5 ring-1 ring-black/5 shadow-xs transition-shadow",
					"border-1 border-transparent",
					!isDragging && "hover:shadow-md",
					isDragging && "rotate-1 shadow-lg",
					className,
				)}
				style={{ backgroundColor: bgColor, color: textColor }}
			>
				{/* ── Row 1: author avatar (TL) | code/+ + menu (TR) ── */}
				<div className="flex items-start justify-between gap-2">
					{/* Top-left: author avatar (no name). Pin chip sits beside the
					    avatar — that's where the user expects to see it (the old
					    top-right corner pip was visually noisy and clipped under
					    the kanban gap). */}
					<div className="flex items-center gap-1.5">
						<Avatar className="size-6 ring-1 ring-black/10">
							{authorAvatarUrl && (
								<AvatarImage src={authorAvatarUrl} alt={authorName} />
							)}
							<AvatarFallback
								className="text-[10px] font-medium"
								style={{
									backgroundColor: "rgba(0,0,0,0.08)",
									color: textColor,
								}}
							>
								{initials || "?"}
							</AvatarFallback>
						</Avatar>
						{note.isPinned && (
							<span
								role="img"
								aria-label="Pinned"
								title="Pinned"
								className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs"
							>
								<Pin className="size-2.5" />
							</span>
						)}
					</div>

					{/* Top-right: corner pickers (category dot + entity attach) and ⋮ menu.
					    Picker visibility depends on `pickers`:
					      - "category" → only the category dot. Used inside profile/deal
					        panels where the entity is locked by context.
					      - "entity"   → only the entity-attach `+` (legacy behaviour).
					      - "both"     → both, used on the org-wide notes board.
					    Wrap in a stop-propagation div so clicks don't start a drag. */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the picker / menu from drag listeners */}
					<div
						className="flex items-center gap-1"
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						{(pickers === "category" || pickers === "both") && canEdit && (
							<CategoryDotPicker
								categories={categories}
								currentCategoryId={note.categoryId}
								onPick={handlePickCategory}
								size={14}
								ringed
							/>
						)}
						{(pickers === "entity" || pickers === "both") &&
							(isAttachedToEntity && attachedCode ? (
								<>
									<IdentityBadge
										entityType={
											note.entityType === "company"
												? "company"
												: note.entityType === "deal"
													? "deal"
													: "person"
										}
										code={attachedCode}
										layout="code"
										size="xs"
									/>
									<EntityPickerPopover
										orgId={note.orgId}
										orgSlug={orgSlug}
										currentAttachment={currentAttachment}
										onPick={handlePickEntity}
										ariaLabel="Change attachment"
										className="size-5"
									/>
								</>
							) : (
								<EntityPickerPopover
									orgId={note.orgId}
									orgSlug={orgSlug}
									currentAttachment={currentAttachment}
									onPick={handlePickEntity}
									ariaLabel="Attach to record"
									className="size-5"
								/>
							))}
						{(canPin || canDelete || canEdit) && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Note actions"
										className="size-5 text-current/70 hover:bg-foreground/10 hover:text-current"
									>
										<span aria-hidden className="text-xs leading-none">
											⋮
										</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-44 text-xs">
									{canPin && (
										<DropdownMenuItem onSelect={handleTogglePin}>
											<Pin className="me-2 size-3.5" />
											{note.isPinned ? "Unpin" : "Pin"}
										</DropdownMenuItem>
									)}
									<DropdownMenuItem onSelect={() => setReminderOpen(true)}>
										<BellRingIcon className="me-2 size-3.5" />
										Set reminder
									</DropdownMenuItem>
									{canEdit && (
										<DropdownMenuItem
											onSelect={() =>
												updateNote({
													orgId: note.orgId,
													noteId: note._id,
													isInternal: !note.isInternal,
												}).catch((err) =>
													toast.mutationError(
														err,
														"Couldn't change visibility.",
													),
												)
											}
										>
											{note.isInternal ? "Mark public" : "Mark internal"}
										</DropdownMenuItem>
									)}
									{canDelete && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onSelect={handleDelete}
												className="text-destructive"
											>
												<Trash2 className="me-2 size-3.5" />
												Delete
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>

				{/* Title (optional) */}
				{note.title && (
					<h3 className="truncate text-sm font-semibold leading-tight">{note.title}</h3>
				)}

				{/* Body — click-to-edit textarea. Inside its own event-stop wrapper. */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps text edits from starting a drag */}
				<div
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					{editing && canEdit ? (
						<textarea
							ref={textareaRef}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onBlur={commitEdit}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									e.preventDefault();
									setEditing(false);
									setDraft(note.content);
								}
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									commitEdit();
								}
							}}
							rows={Math.max(2, Math.min(10, draft.split("\n").length + 1))}
							className="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug outline-none focus:ring-0"
							style={{ color: textColor }}
						/>
					) : (
						<button
							type="button"
							onClick={() => canEdit && setEditing(true)}
							className={cn(
								"w-full cursor-text whitespace-pre-wrap break-words text-start text-[13px] leading-snug",
								!canEdit && "cursor-default",
							)}
						>
							{note.content}
						</button>
					)}
				</div>

				{/* Footer — internal pill only. No author name (avatar carries identity). */}
				{note.isInternal && (
					<div className="mt-0.5 flex items-center gap-2 text-[11px] opacity-80">
						<Badge
							variant="outline"
							className="ms-auto h-4 gap-1 border-current/30 px-1.5 py-0 text-[10px]"
						>
							Internal
						</Badge>
					</div>
				)}

				{/* ── Vertical drag grip — right-edge, the ONLY drag handle ── */}
				<KanbanItemHandle asChild>
					<button
						type="button"
						aria-label="Drag note"
						className={cn(
							"absolute inset-y-0 end-0 flex w-4 cursor-grab items-center justify-center rounded-e-[var(--radius)] text-current/40 transition-colors",
							"hover:bg-foreground/10 hover:text-current/80 focus-visible:bg-foreground/10 focus-visible:outline-none",
							"data-dragging:cursor-grabbing",
						)}
					>
						<GripVerticalIcon className="size-3" />
					</button>
				</KanbanItemHandle>

				{/* Reminder quick-create dialog — opened from the ⋮ menu. Wired
				    to the existing `useCreateReminder` hook so a real reminder
				    row is persisted today; the full Reminders UI (panel, form,
				    detail) lands later and will surface the same row through
				    its own listForPerson query. */}
				<NoteReminderDialog
					open={reminderOpen}
					onOpenChange={setReminderOpen}
					note={note}
				/>
			</div>
		</KanbanItem>
	);
}
