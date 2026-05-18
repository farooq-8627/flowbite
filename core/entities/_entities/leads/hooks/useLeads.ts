"use client";

/**
 * useLeads — fetches leads list for the current org.
 *
 * Resolves orgId from the shared OrgProvider context instead of firing its own
 * `listMyOrgs` subscription per call site. With this hook used inside list
 * cells, board cells, and various detail panels, removing the duplicate
 * subscription saves dozens of identity round-trips per render.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function useLeads(filters?: { status?: string; assignedTo?: Id<"users"> }) {
	const { orgId } = useCurrentOrg();

	const items = useQuery(
		api.crm.entities.leads.queries.list,
		orgId ? { orgId, ...filters } : "skip",
	);

	const normalized = useMemo(
		() =>
			items
				?.map((item) => ({ ...item, id: item._id as string }))
				// Newest first by default — Convex returns results in insertion
				// order, but the user expects "the lead I just added is on top".
				// Stable sort by `_creationTime` desc.
				.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0)),
		[items],
	);

	return { items: normalized, orgId, isLoading: items === undefined };
}
