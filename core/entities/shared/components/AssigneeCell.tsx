"use client";

/**
 * AssigneeCell — resolves an `assignedTo` user id to a PersonDisplay.
 *
 * Reads the member list from the shared `OrgProvider` context (no own
 * subscription) so any number of cells on the same page resolves to a
 * single Convex `listMembers` subscription, not N.
 *
 * When `userId` is undefined → "Unassigned" muted text.
 * When the user can't be resolved → muted dash placeholder.
 */

import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { PersonDisplay } from "@/core/entities/shared/components/PersonDisplay";
import type { PersonRef } from "@/core/entities/shared/types";
import { useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";

interface AssigneeCellProps {
	/**
	 * @deprecated `AssigneeCell` no longer fetches per-cell. Member data
	 * comes from `<OrgProvider>` via `useOrgMembers()`. The prop is kept
	 * for backwards-compatibility with call sites that still pass it but
	 * has no runtime effect.
	 */
	orgId?: Id<"orgs">;
	userId?: Id<"users"> | string;
	/** Override which sections of the person to display. */
	show?: Array<"avatar" | "name" | "email" | "personCode" | "status">;
}

export function AssigneeCell({ userId, show = ["avatar", "name"] }: AssigneeCellProps) {
	const members = useOrgMembers();

	const person = useMemo<PersonRef | null>(() => {
		if (!userId) return null;
		const match = members?.find((m) => m.userId === userId);
		if (!match) return null;
		return {
			id: match.userId as string,
			type: "user",
			displayName: match.user?.name ?? match.user?.email ?? "Unknown",
			email: match.user?.email,
			avatarUrl: match.user?.avatarUrl,
		};
	}, [members, userId]);

	if (!userId) {
		return <span className="text-xs text-muted-foreground">Unassigned</span>;
	}

	if (!person) {
		// Still loading or user not found — show nothing rather than a noisy id
		return <span className="text-xs text-muted-foreground">—</span>;
	}

	return <PersonDisplay person={person} show={show} size="xs" />;
}
