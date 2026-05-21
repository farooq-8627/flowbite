"use client";

/**
 * useEntityDisplay — resolve `(entityType, entityId)` → display info.
 *
 * Single client-side hook used by every messages surface that previously
 * showed "Lead · P-005" / "Deal · D-042" raw codes. Returns:
 *   - `name`         — the human-friendly title (person displayName, deal title,
 *                      company name).
 *   - `secondary`    — phone or email for people, dealCode/companyCode otherwise.
 *   - `profileHref`  — `/{orgSlug}/profile/{personCode}` for people,
 *                      `/{orgSlug}/deals/{dealCode}` for deals,
 *                      `/{orgSlug}/companies/{companyCode}` for companies.
 *                      `null` when navigation isn't supported (project/task/org).
 *   - `kindLabel`    — "Lead" / "Contact" / "Deal" / "Company" — small badge
 *                      text. Used as the secondary line when there's no
 *                      email/phone.
 *   - `isLoading`    — `true` while any underlying query is in flight.
 *
 * The hook intentionally fires only the query that matches `entityType` —
 * it never calls all four resolvers in parallel. Convex caches identical
 * subscriptions, so multiple components rendering the same conversation
 * (sidebar row + thread header) share one network round-trip.
 *
 * Ref: AGENTS.md decision #2 (entity labels are NEVER hardcoded — always
 * DB-backed) and decision #12 (personCode is the stable identity).
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatEntityType } from "@/core/comms/messages/hooks";

export type EntityDisplay = {
	name: string;
	secondary?: string;
	profileHref: string | null;
	kindLabel: string;
	avatarUrl?: string;
	isLoading: boolean;
};

const KIND_LABEL: Record<ChatEntityType, string> = {
	lead: "Lead",
	contact: "Contact",
	person: "Person",
	deal: "Deal",
	company: "Company",
	user: "DM",
	project: "Project",
	task: "Task",
};

export function useEntityDisplay(args: {
	orgId?: Id<"orgs">;
	entityType?: ChatEntityType | string;
	entityId?: string;
}): EntityDisplay {
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;
	const { orgId, entityType, entityId } = args;

	const isPerson = entityType === "lead" || entityType === "contact" || entityType === "person";
	const isDeal = entityType === "deal";
	const isCompany = entityType === "company";

	const personDoc = useQuery(
		api.crm.people.queries.getByPersonCode,
		orgId && entityId && isPerson ? { orgId, personCode: entityId } : "skip",
	);
	const dealDoc = useQuery(
		api.crm.entities.deals.queries.getByDealCode,
		orgId && entityId && isDeal ? { orgId, dealCode: entityId } : "skip",
	);
	const companyDoc = useQuery(
		api.crm.entities.companies.queries.getByCompanyCode,
		orgId && entityId && isCompany ? { orgId, companyCode: entityId } : "skip",
	);

	return useMemo<EntityDisplay>(() => {
		const fallbackKind =
			entityType && entityType in KIND_LABEL
				? KIND_LABEL[entityType as ChatEntityType]
				: "Thread";
		const fallback: EntityDisplay = {
			name: entityId ?? fallbackKind,
			secondary: undefined,
			profileHref: null,
			kindLabel: fallbackKind,
			avatarUrl: undefined,
			isLoading: false,
		};

		if (!orgId || !entityType || !entityId) return fallback;

		if (isPerson) {
			if (personDoc === undefined) return { ...fallback, isLoading: true };
			if (personDoc === null) return fallback;
			// `getByPersonCode` returns `{ entity, type }` — the full lead/contact
			// row lives under `entity`, not on the top object.
			const wrap = personDoc as {
				entity: {
					displayName?: string;
					email?: string;
					phone?: string;
					avatarUrl?: string;
				};
				type: "lead" | "contact";
			};
			const p = wrap.entity ?? {};
			const kind = wrap.type === "lead" ? KIND_LABEL.lead : KIND_LABEL.contact;
			return {
				name: p.displayName ?? (entityId as string),
				secondary: p.phone ?? p.email,
				profileHref: orgSlug ? `/${orgSlug}/profile/${entityId}` : null,
				kindLabel: kind,
				avatarUrl: p.avatarUrl,
				isLoading: false,
			};
		}

		if (isDeal) {
			if (dealDoc === undefined) return { ...fallback, isLoading: true };
			if (dealDoc === null) return fallback;
			const d = dealDoc as { title?: string; dealCode?: string };
			return {
				name: d.title ?? (entityId as string),
				secondary: d.dealCode,
				profileHref: orgSlug ? `/${orgSlug}/deals/${entityId}` : null,
				kindLabel: KIND_LABEL.deal,
				isLoading: false,
			};
		}

		if (isCompany) {
			if (companyDoc === undefined) return { ...fallback, isLoading: true };
			if (companyDoc === null) return fallback;
			const c = companyDoc as { name?: string; companyCode?: string };
			return {
				name: c.name ?? (entityId as string),
				secondary: c.companyCode,
				profileHref: orgSlug ? `/${orgSlug}/companies/${entityId}` : null,
				kindLabel: KIND_LABEL.company,
				isLoading: false,
			};
		}

		// project/task — Phase 4. Fall back to "Kind · code".
		return fallback;
	}, [
		orgId,
		entityType,
		entityId,
		isPerson,
		isDeal,
		isCompany,
		personDoc,
		dealDoc,
		companyDoc,
		orgSlug,
	]);
}
