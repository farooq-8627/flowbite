"use client";
/**
 * core/ai/hooks/useRouteContext.ts
 *
 * Parses the current pathname and returns entity context for the AI chat.
 * FREE — no LLM tokens. Reads from already-cached Convex queries on the page.
 * Only injects into prompts when the user sends a message.
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

	// Conditionally query — person codes (leads + contacts)
	const person = useQuery(
		api.crm.people.queries.getByPersonCode,
		parsed?.type === "person" && orgId ? { orgId, personCode: parsed.code } : "skip",
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

		return null;
	}, [parsed, person]);
}
