"use client";

/**
 * useCompaniesByPersonCodes — batched company lookup for table views.
 *
 * Replaces per-row `CompanyCell` subscriptions with one query that returns
 * `Record<personCode, { companyId, name, companyCode }>`.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type CompanyForPerson = { companyId: string; name: string; companyCode: string };

export function useCompaniesByPersonCodes(
	orgId: Id<"orgs"> | undefined,
	personCodes: string[],
): Record<string, CompanyForPerson> | undefined {
	const cacheKey = useMemo(() => {
		if (personCodes.length === 0) return "";
		return [...new Set(personCodes)].sort().join("|");
	}, [personCodes]);

	const stableCodes = useMemo(() => {
		if (cacheKey.length === 0) return [];
		return cacheKey.split("|");
	}, [cacheKey]);

	return useQuery(
		api.crm.entities.companies.queries.listCompaniesByPersonCodes,
		orgId && stableCodes.length > 0 ? { orgId, personCodes: stableCodes } : "skip",
	);
}
