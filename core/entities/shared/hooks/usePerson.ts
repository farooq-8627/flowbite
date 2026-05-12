"use client";

/**
 * usePerson — resolves a personCode to a fresh PersonRef via the people query.
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PersonRef } from "../types";

export function usePerson(personCode: string | undefined, orgId?: Id<"orgs">): PersonRef | null {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const resolvedOrgId = orgId ?? orgs?.find((o) => o.org.slug === orgSlug)?.org._id;

	const result = useQuery(
		api.crm.people.queries.getByPersonCode,
		resolvedOrgId && personCode ? { orgId: resolvedOrgId, personCode } : "skip",
	);

	return useMemo(() => {
		if (!result) return null;
		const { entity, type } = result;
		return {
			id: entity._id as string,
			type,
			personCode: entity.personCode,
			displayName: entity.displayName,
			email: entity.email,
			phone: entity.phone,
			avatarUrl: undefined,
			status:
				type === "lead"
					? ((entity as Record<string, unknown>).status as string | undefined)
					: undefined,
		};
	}, [result]);
}
