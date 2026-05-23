"use client";
/**
 * core/ai/hooks/useRouteContext.ts
 *
 * Parses the current pathname and returns entity context for the AI chat.
 * FREE — no LLM tokens. Reads from already-cached Convex queries on the page.
 * Only injects into prompts when the user sends a message.
 *
 * Supported route prefixes:
 *   /profile/P-XXX     → person (lead OR contact)
 *   /deals/D-XXX       → deal
 *   /companies/C-XXX   → company
 *
 * Each route uses a parallel `useQuery` call with `"skip"` for the inactive
 * branches; Convex de-dupes skipped queries so this is cheaper than three
 * sequential effects.
 */
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import type { RouteEntityContext } from "../types";

/** Parse URL → entity code. Returns null when not on an entity page. */
function parseEntityRoute(
	pathname: string,
): { type: "person" | "deal" | "company"; code: string } | null {
	const personMatch = pathname.match(/\/profile\/(P-\d+)/);
	if (personMatch) return { type: "person", code: personMatch[1] };
	const dealMatch = pathname.match(/\/deals\/(D-\d+)/);
	if (dealMatch) return { type: "deal", code: dealMatch[1] };
	const companyMatch = pathname.match(/\/companies\/(C-\d+)/);
	if (companyMatch) return { type: "company", code: companyMatch[1] };
	return null;
}

export function useRouteContext(): RouteEntityContext | null {
	const pathname = usePathname();
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;

	const parsed = useMemo(() => parseEntityRoute(pathname), [pathname]);

	// Three parallel queries; only the matching one runs — others "skip".
	// Convex's reactive layer dedupes skipped queries so the inactive
	// branches don't open subscriptions.
	const person = useQuery(
		api.crm.people.queries.getByPersonCode,
		parsed?.type === "person" && orgId ? { orgId, personCode: parsed.code } : "skip",
	);
	const deal = useQuery(
		api.crm.entities.deals.queries.getByDealCode,
		parsed?.type === "deal" && orgId ? { orgId, dealCode: parsed.code } : "skip",
	);
	const company = useQuery(
		api.crm.entities.companies.queries.getByCompanyCode,
		parsed?.type === "company" && orgId ? { orgId, companyCode: parsed.code } : "skip",
	);

	return useMemo<RouteEntityContext | null>(() => {
		if (!parsed) return null;

		if (parsed.type === "person" && person) {
			const entityType = person.type as "lead" | "contact";
			const entity = person.entity as {
				_id: string;
				personCode?: string;
				displayName?: string;
				aiContext?: { summary?: string; keyFacts?: string[] };
			};
			return {
				entityType,
				entityId: entity._id,
				personCode: entity.personCode,
				name: entity.displayName,
				aiContextSummary: entity.aiContext?.summary,
				aiContextKeyFacts: entity.aiContext?.keyFacts,
			};
		}

		if (parsed.type === "deal" && deal) {
			return {
				entityType: "deal",
				entityId: deal._id as string,
				dealCode: deal.dealCode,
				personCode: deal.personCode,
				name: deal.title,
				aiContextSummary: deal.aiContext?.summary,
				aiContextKeyFacts: deal.aiContext?.keyFacts,
			};
		}

		if (parsed.type === "company" && company) {
			return {
				entityType: "company",
				entityId: company._id as string,
				name: company.name,
				aiContextSummary: company.aiContext?.summary,
				aiContextKeyFacts: company.aiContext?.keyFacts,
			};
		}

		return null;
	}, [parsed, person, deal, company]);
}
