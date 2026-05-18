"use client";

/**
 * usePerson — resolves a personCode to a fresh PersonRef via the people query.
 *
 * Reads orgId from the shared OrgProvider context (no per-call `listMyOrgs`
 * subscription).
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import type { PersonRef } from "../types";

export function usePerson(personCode: string | undefined, orgId?: Id<"orgs">): PersonRef | null {
	const { orgId: contextOrgId } = useCurrentOrg();
	const resolvedOrgId = orgId ?? contextOrgId;

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
