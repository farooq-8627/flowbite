"use client";

/**
 * NotesView — org-wide sticky-note board at `/{locale}/{orgSlug}/notes`.
 *
 * The chrome (toolbar + primary action + view toggle + body padding)
 * matches the entity boards to the pixel, by reusing `EntityPageLayout`
 * directly and wrapping the kanban in the SAME padding box that
 * `EntityListPage` uses for its board branch (`py-3 xl:p-4`). The kanban
 * itself is `NotesCategoryKanban` which composes the shared `KanbanBoard`
 * primitive — so card drag, column drag, drop animation, and grip handle
 * all behave identically to the entity boards (no parallel impl).
 *
 * Notes-specific bits:
 *   - `+ Add Note` toolbar pill creates a card in the org's default
 *     category at the top of its column. No drawer / no modal.
 *   - The view-options popover hides / shows category columns. Trigger
 *     button uses the SAME styling as entity `ViewOptionsMenu` (Settings2
 *     icon, outline variant, "View" label).
 *   - Each column header has a `+` button that spawns an inline composer
 *     at the TOP of that column's card list — wired through the new
 *     `addCardSlot="header"` prop on `KanbanBoard`.
 */

import { useMutation, useQuery } from "convex/react";
import { PlusIcon, Settings2 } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	EntityPageLayout,
	type PrimaryActionConfig,
	type ViewKind,
} from "@/core/shell/shared/entity-layout";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import { toast } from "@/lib/toast";
import { NotesCategoryKanban } from "../components/NotesCategoryKanban";
import {
	useDefaultNoteCategory,
	useEnsureNoteCategories,
	useNoteCategories,
	useNotesForOrg,
} from "../hooks";

/**
 * String fields scored by `rankBySearch` for the notes board search. We
 * include `personCode` so users can find a card by the entity it's
 * attached to (e.g. typing "P-001" floats every note about that person to
 * the top of its column).
 */
const NOTE_SEARCH_FIELDS = ["content", "title", "personCode", "entityId"] as const;

export function NotesView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const me = useQuery(api.users.queries.me);
	const myMembership = useQuery(api.orgs.queries.getMyMembership, orgId ? { orgId } : "skip");
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");

	const categories = useNoteCategories({ orgId });
	const defaultCategory = useDefaultNoteCategory({ orgId });
	const ensureCategories = useEnsureNoteCategories();
	const createNote = useMutation(api.crm.shared.notes.mutations.create);

	useEffect(() => {
		if (!orgId) return;
		if (categories === undefined) return;
		if (categories.length > 0) return;
		ensureCategories({ orgId }).catch(() => {});
	}, [orgId, categories, ensureCategories]);

	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	const [hiddenCols, setHiddenCols] = useQueryState(
		"hide",
		parseAsArrayOf(parseAsString).withDefault([]),
	);

	const notes = useNotesForOrg({ orgId });

	// Ranked search — matches float to the top of their column, non-matches
	// keep their original position underneath. Same UX as the entity boards
	// (LeadsView / ContactDetailView / etc.). The `matchedIds` set drives the
	// per-card `note-card-flash` highlight; an incrementing `flashEpoch`
	// retriggers the animation each time the query changes.
	const rankedNotes = useMemo(() => {
		if (!notes) return { items: undefined as Doc<"notes">[] | undefined, matchedIds: new Set<string>() };
		const searchable = notes.map(
			(n) => ({ ...n, id: String(n._id) }) as unknown as SearchableItem,
		);
		const ranked = rankBySearch(searchable, search, NOTE_SEARCH_FIELDS);
		return {
			items: ranked.items.map((it) => {
				const { id: _id, ...rest } = it as Record<string, unknown> & { id: string };
				return rest as unknown as Doc<"notes">;
			}),
			matchedIds: ranked.matchedIds,
		};
	}, [notes, search]);

	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	const authorsById = useMemo(() => {
		const map = new Map<string, { name: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(String(m.user._id), {
				name: m.user.name ?? m.user.email ?? "Member",
				avatarUrl: m.user.avatarUrl,
			});
		}
		return map;
	}, [members]);

	const permissions = (myMembership?.permissions ?? []) as ReadonlyArray<string>;
	const canCreate = permissions.includes("notes.create");
	const canManageCategories = permissions.includes("notes.categories.manage");

	const handleQuickAdd = useCallback(async () => {
		if (!orgId) return;
		const targetCategory = defaultCategory?._id;
		if (!targetCategory) {
			toast.warning("Set a default category in Settings → CRM → Note Categories.");
			return;
		}
		try {
			const newId = await createNote({
				orgId,
				entityType: "org",
				entityId: orgSlug ?? "org",
				content: "New note",
				categoryId: targetCategory,
				authorType: "user",
				isInternal: false,
			});
			// Hand the new id to the kanban so the freshly-rendered card
			// auto-focuses + selects its placeholder text. NoteCard signals
			// back via `onAutoFocusConsumed` once the focus is applied.
			setAutoFocusNoteId(String(newId));
		} catch (err) {
			toast.mutationError(err, "Couldn't create note.");
		}
	}, [orgId, orgSlug, defaultCategory, createNote]);

	const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);

	const primaryAction: PrimaryActionConfig | undefined = canCreate
		? {
				label: "Add Note",
				icon: PlusIcon,
				permission: "notes.create",
				onClick: handleQuickAdd,
			}
		: undefined;

	// Notes only has a board view — pass `views=["board"]` so the toggle hides itself.
	const view: ViewKind = "board";

	return (
		<EntityPageLayout
			views={["board"]}
			view={view}
			onViewChange={() => {}}
			primaryAction={primaryAction}
			orgId={orgId}
			search={{
				value: search,
				onChange: setSearch,
				placeholder: "Search notes…",
			}}
			toolbarExtras={
				<NotesViewOptions
					categories={categories}
					hiddenCols={hiddenCols}
					onChange={(next) => setHiddenCols(next.length === 0 ? null : next)}
				/>
			}
		>
			{/* Same outer padding box as EntityListPage's board branch. */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-3 xl:p-4">
				<div className="flex min-h-0 min-w-0 flex-1">
					<NotesCategoryKanban
						notes={rankedNotes.items}
						categories={categories}
						authorsById={authorsById}
						currentUserId={me?._id as Id<"users"> | undefined}
						permissions={permissions}
						orgSlug={orgSlug}
						defaultAttachment={{
							entityType: "org",
							entityId: orgSlug ?? "org",
						}}
						canCreate={canCreate}
						canManageCategories={canManageCategories}
						hiddenCategoryIds={hiddenCols as Id<"noteCategories">[]}
						autoFocusNoteId={autoFocusNoteId}
						onAutoFocusConsumed={() => setAutoFocusNoteId(null)}
						onCreatedNote={(id) => setAutoFocusNoteId(id)}
						matchedNoteIds={rankedNotes.matchedIds}
						highlightEpoch={flashEpoch}
					/>
				</div>
			</div>
		</EntityPageLayout>
	);
}

// ─── View options ────────────────────────────────────────────────────────────

interface NotesViewOptionsProps {
	categories:
		| ReadonlyArray<{
				_id: Id<"noteCategories">;
				name: string;
				bgColor: string;
				isArchived: boolean;
		  }>
		| undefined;
	hiddenCols: ReadonlyArray<string>;
	onChange: (next: string[]) => void;
}

/**
 * Same trigger style as the entity `ViewOptionsMenu` (outline button,
 * Settings2 icon, "View" label). The popover content is notes-specific —
 * it toggles category-column visibility. Uses `<label htmlFor>` rather
 * than wrapping a button in a button (that was the runtime error in v1).
 */
function NotesViewOptions({ categories, hiddenCols, onChange }: NotesViewOptionsProps) {
	const hidden = useMemo(() => new Set(hiddenCols), [hiddenCols]);

	const visibleCats = useMemo(
		() => (categories ?? []).filter((c) => !c.isArchived),
		[categories],
	);

	function toggle(id: string) {
		const next = new Set(hidden);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange(Array.from(next));
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					aria-label="View options"
					data-tour="view-options-trigger"
				>
					<Settings2 className="size-3.5" />
					<span className="hidden sm:inline">View</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-3" sideOffset={6}>
				<div className="space-y-1.5">
					<Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Show columns
					</Label>
					<div className="-mx-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
						{visibleCats.map((c) => {
							const id = String(c._id);
							const isHidden = hidden.has(id);
							const checkboxId = `vo-notes-${id}`;
							return (
								<label
									key={id}
									htmlFor={checkboxId}
									className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-xs hover:bg-accent"
								>
									<Checkbox
										id={checkboxId}
										checked={!isHidden}
										onCheckedChange={() => toggle(id)}
									/>
									<span
										aria-hidden
										className="inline-block size-2 shrink-0 rounded-full"
										style={{ backgroundColor: c.bgColor }}
									/>
									<span className="flex-1 truncate">{c.name}</span>
								</label>
							);
						})}
					</div>
				</div>
				{hidden.size > 0 && (
					<>
						<Separator className="my-3" />
						<button
							type="button"
							onClick={() => onChange([])}
							className="w-full rounded-[var(--radius)] px-2 py-1 text-start text-xs text-muted-foreground hover:bg-accent"
						>
							Show all
						</button>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
