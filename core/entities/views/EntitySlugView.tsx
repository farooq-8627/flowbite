"use client";

import { useQuery } from "convex/react";
import { notFound } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
	useEntityLabels,
} from "@/core/shared/hooks/useEntityLabels";
import { CompaniesView } from "../companies/views/CompaniesView";
import { ContactsView } from "../contacts/views/ContactDetailView";
import { DealsView } from "../deals/views/DealDetailView";
import { LeadsView } from "../leads/views/LeadsView";

type Slot = "lead" | "contact" | "deal" | "company";

/**
 * EntitySlugView — the runtime resolver that turns a URL slug like
 * `/inquiries` (org-renamed "Leads") into the correct entity list view.
 *
 * RACE FIX:
 *   `useEntityLabels()` returns fallback defaults (`leads`, `contacts`, …)
 *   synchronously even while the real labels query is still loading.
 *   Calling `notFound()` during that window caused a
 *   `NEXT_HTTP_ERROR_FALLBACK;404` whenever the admin had renamed an entity
 *   (e.g. `leads` → `inquiries`). We now wait for the raw `getEntityLabels`
 *   query to finish before deciding slug-doesn't-match.
 */
export function EntitySlugView({ orgSlug, entitySlug }: { orgSlug: string; entitySlug: string }) {
	const labels = useEntityLabels();

	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const orgId = orgEntry?.org._id;

	// Raw labels query — `labels === undefined` => still loading.
	// `labels === null` => loaded but org not accessible / user not a member.
	const rawLabels = useQuery(api.orgs.queries.getEntityLabels, orgId ? { orgId } : "skip");

	const hiddenSlots = useMemo<Set<Slot>>(() => {
		const modules = orgEntry?.org.settings?.modules ?? [];
		const hidden = new Set<Slot>();
		for (const mod of modules) {
			if (mod.hidden && isSlot(mod.slot)) hidden.add(mod.slot);
		}
		return hidden;
	}, [orgEntry]);

	// Resolve slug → slot via the org's configured labels.
	const slot = useMemo<Slot | null>(() => {
		const map = buildSlugToSlotMap(labels);
		return map[entitySlug] ?? null;
	}, [labels, entitySlug]);

	// Wait for BOTH queries before deciding: list of orgs AND (once orgId is
	// known) the real labels. This prevents a notFound flash for renamed slugs.
	if (orgs === undefined) return null;
	if (orgId && rawLabels === undefined) return null;

	if (!slot || hiddenSlots.has(slot)) {
		notFound();
	}

	switch (slot) {
		case "lead":
			return <LeadsView orgSlug={orgSlug} />;
		case "contact":
			return <ContactsView orgSlug={orgSlug} />;
		case "deal":
			return <DealsView orgSlug={orgSlug} />;
		case "company":
			return <CompaniesView orgSlug={orgSlug} />;
	}
}

function isSlot(value: string): value is Slot {
	return value === "lead" || value === "contact" || value === "deal" || value === "company";
}

/**
 * Build a slug→slot map from the merged labels. Always includes the DEFAULT
 * slugs too, so renaming an entity doesn't break the old URL for users who
 * bookmarked it (both `/leads` and `/inquiries` resolve to `lead`).
 */
function buildSlugToSlotMap(labels: EntityLabels): Record<string, Slot> {
	const map: Record<string, Slot> = {
		// defaults — keep old bookmarks alive after rename
		[ENTITY_LABEL_DEFAULTS.lead.slug]: "lead",
		[ENTITY_LABEL_DEFAULTS.contact.slug]: "contact",
		[ENTITY_LABEL_DEFAULTS.deal.slug]: "deal",
		[ENTITY_LABEL_DEFAULTS.company.slug]: "company",
		// current (possibly renamed) slugs
		[labels.lead.slug]: "lead",
		[labels.contact.slug]: "contact",
		[labels.deal.slug]: "deal",
		[labels.company.slug]: "company",
	};
	return map;
}
