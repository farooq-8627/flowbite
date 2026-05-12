"use client";

/**
 * AssigneeCell — resolves an `assignedTo` user id to a PersonDisplay.
 *
 * Uses the org's member list (cached on the client by Convex) so we avoid a
 * round trip per row. Renders a thin avatar + name; clicking the avatar/name
 * links to the person's profile via PersonDisplay.
 *
 * When `userId` is undefined → "Unassigned" muted text.
 * When the user can't be resolved → shows the raw id (dev-mode fallback).
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PersonDisplay } from "@/core/entities/shared/components/PersonDisplay";
import type { PersonRef } from "@/core/entities/shared/types";

interface AssigneeCellProps {
	orgId?: Id<"orgs">;
	userId?: Id<"users"> | string;
	/** Override which sections of the person to display. */
	show?: Array<"avatar" | "name" | "email" | "personCode" | "status">;
}

export function AssigneeCell({ orgId, userId, show = ["avatar", "name"] }: AssigneeCellProps) {
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");

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
