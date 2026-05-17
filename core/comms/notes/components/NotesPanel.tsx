"use client";

/**
 * NotesPanel — embedded sticky board for an entity tab.
 *
 * Used inside Profile / Deal / Company tabs. Self-contained:
 *   - Loads notes for `(entityType, entityId)` via `useNotesForEntity`.
 *   - Loads org members for the author map.
 *   - Loads current user + membership for RBAC.
 *   - Renders a single category Kanban with per-column +-button.
 *
 * Adding a note here from a profile tab automatically appears on the
 * org-wide page — both views read the same `notes` table.
 */

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import { useNoteCategories, useNotesForEntity } from "../hooks";
import { NotesCategoryKanban } from "./NotesCategoryKanban";

export interface NotesPanelProps {
	entityType: string;
	entityId: string;
	personCode?: string;
	className?: string;
}

export function NotesPanel({ entityType, entityId, personCode, className }: NotesPanelProps) {
	const { orgId, orgSlug } = useCurrentOrg();
	const me = useQuery(api.users.queries.me);
	const myMembership = useQuery(api.orgs.queries.getMyMembership, orgId ? { orgId } : "skip");
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const categories = useNoteCategories({ orgId });
	const notes = useNotesForEntity({ orgId, entityType, entityId });

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

	// Auto-focus claim mirrors NotesView. The kanban hands us the new id when
	// a column `+` button creates a card; we forward it back through
	// `autoFocusNoteId`, and clear it once NoteCard signals consumed.
	const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			{!canCreate && (
				<div className="mb-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					Read-only — you don't have permission to add notes here.
				</div>
			)}
			<div className="flex min-h-[400px] min-w-0 flex-1">
				<NotesCategoryKanban
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
				/>
			</div>
		</div>
	);
}
