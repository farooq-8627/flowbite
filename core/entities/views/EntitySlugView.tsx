"use client";

import { notFound } from "next/navigation";
import { useMemo } from "react";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
	useEntityLabels,
} from "@/core/shell/shared/hooks/useEntityLabels";
import { CompaniesView } from "../_entities/companies/views/CompaniesView";
import { ContactsView } from "../_entities/contacts/views/ContactDetailView";
import { DealsView } from "../_entities/deals/views/DealDetailView";
import { LeadsView } from "../_entities/leads/views/LeadsView";

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
 *   (e.g. `leads` → `inquiries`). We wait for the org context to settle
 *   before deciding slug-doesn't-match. Now reads from `OrgProvider`
 *   instead of firing its own `listMyOrgs` + `getEntityLabels` queries.
 */
export function EntitySlugView({ orgSlug, entitySlug }: { orgSlug: string; entitySlug: string }) {
	const { org, orgId, fullOrgEntry, isLoading } = useCurrentOrg();
	const labels = useEntityLabels();

	const hiddenSlots = useMemo<Set<Slot>>(() => {
		const modules = fullOrgEntry?.org.settings?.modules ?? [];
		const hidden = new Set<Slot>();
		for (const mod of modules) {
			if (mod.hidden && isSlot(mod.slot)) hidden.add(mod.slot);
		}
		return hidden;
	}, [fullOrgEntry]);

	// Resolve slug → slot via the org's configured labels.
	const slot = useMemo<Slot | null>(() => {
		const map = buildSlugToSlotMap(labels);
		return map[entitySlug] ?? null;
	}, [labels, entitySlug]);

	// Wait for the org context to settle. `isLoading` covers `listMyOrgs`;
	// once `orgId` is known the labels subscription kicks in. While the
	// labels are still `undefined`, `useEntityLabels()` returns the
	// merged-defaults shape, so `slot` will resolve to a valid slot for
	// any DEFAULT slug — that's enough to render the view safely.
	if (isLoading || (orgId && !org)) return null;

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
	return {
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
}
