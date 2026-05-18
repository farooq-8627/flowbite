"use client";

/**
 * NotesPanel — embedded sticky board for an entity tab.
 *
 * Used inside Profile / Deal / Company / Project tabs. Self-contained:
 *   - Loads notes for `(entityType, entityId)` via `useNotesForEntity`.
 *   - Loads org members + membership from the shared `OrgProvider` context
 *     (no per-panel subscriptions — see `useCurrentOrg`).
 *   - Resolves the SINGLE entity's display info ONCE via the batched
 *     `useAttachmentDisplaysForOrg` hook (every card on the panel shares
 *     the same entity, so one row of the result feeds every card).
 *   - Renders `NotesSingleBoard` (single canvas, sticky-note layout).
 *
 * Cards inside this embed expose BOTH the category dot picker and the
 * entity-attach `+` button (`pickers="both"`) — there's no column-based
 * filtering here, so the user picks category from the card and can
 * re-attach the note to a different record from the same place.
 *
 * Adding a note here from a profile tab automatically appears on the
 * org-wide page — both views read the same `notes` table.
 */

import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg, useMe, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import { useAttachmentDisplaysForOrg, useNoteCategories, useNotesForEntity } from "../hooks";
import { NotesSingleBoard } from "./NotesSingleBoard";

export interface NotesPanelProps {
	entityType: string;
	entityId: string;
	personCode?: string;
	className?: string;
}

export function NotesPanel({ entityType, entityId, personCode, className }: NotesPanelProps) {
	const { orgId, orgSlug, membership: myMembership } = useCurrentOrg();
	const me = useMe();
	const members = useOrgMembers();
	const categories = useNoteCategories({ orgId });
	const notes = useNotesForEntity({ orgId, entityType, entityId });

	// Single-entity batched attachment lookup. Even though every note here
	// has the same (entityType, entityId), threading the result through
	// `NotesSingleBoard` lets the cards stay decoupled from data fetching.
	// We pass a 1-element array; the hook stabilises it internally.
	const attachmentTuple = useMemo(
		() => (entityType === "org" ? [] : [{ entityType, entityId }]),
		[entityType, entityId],
	);
	const attachmentDisplays = useAttachmentDisplaysForOrg({
		orgId,
		attachments: attachmentTuple,
	});

	const authorsById = useMemo(() => {
		const map = new Map<string, { name: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(String(m.user?._id), {
				name: m.user?.name ?? m.user?.email ?? "Member",
				avatarUrl: m.user?.avatarUrl,
			});
		}
		return map;
	}, [members]);

	const permissions = (myMembership?.permissions ?? []) as ReadonlyArray<string>;
	const canCreate = permissions.includes("notes.create");

	// Auto-focus claim: the single board hands us the new id when the `+`
	// button creates a card; we forward it back through `autoFocusNoteId`
	// and clear it once `NoteCard` signals consumed.
	const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			{!canCreate && (
				<div className="mb-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					Read-only — you don't have permission to add notes here.
				</div>
			)}
			<div className="flex min-h-[400px] min-w-0 flex-1">
				<NotesSingleBoard
					notes={notes}
					categories={categories}
					authorsById={authorsById}
					currentUserId={me?._id as Id<"users"> | undefined}
					permissions={permissions}
					orgSlug={orgSlug}
					defaultAttachment={{ entityType, entityId, personCode }}
					canCreate={canCreate}
					autoFocusNoteId={autoFocusNoteId}
					onAutoFocusConsumed={() => setAutoFocusNoteId(null)}
					onCreatedNote={(id) => setAutoFocusNoteId(id)}
					attachmentDisplays={attachmentDisplays}
				/>
			</div>
		</div>
	);
}
