"use client";

/**
 * useLeads — fetches leads list for the current org.
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function useLeads(filters?: { status?: string; assignedTo?: Id<"users"> }) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === orgSlug)?.org._id;

	const items = useQuery(
		api.crm.entities.leads.queries.list,
		orgId ? { orgId, ...filters } : "skip",
	);

	const normalized = useMemo(
		() => items?.map((item) => ({ ...item, id: item._id as string })),
		[items],
	);

	return { items: normalized, orgId, isLoading: items === undefined };
}
