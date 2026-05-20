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
 * RACE FIX (revised 2026-05-20):
 *   The old version of this view raced against `getEntityLabels` — that
 *   subscription resolved AFTER `listMyOrgs`, so `useEntityLabels()`
 *   briefly returned default slugs while the real (renamed) ones were
 *   still loading. Visiting `/inquiry` during that window resolved to
 *   `slot === null` and fired `notFound()` (the
 *   `NEXT_HTTP_ERROR_FALLBACK;404` digest the user sees in the dashboard
 *   error boundary).
 *
 *   The fix landed in `OrgProvider`: entity labels are now derived from
 *   `listMyOrgs` (which returns the full org doc, including the
 *   `entityLabels` field). One subscription, one truth — by the time
 *   `org` is defined, the renamed slugs are already in scope.
 *
 *   We still keep the default slugs in the slug→slot map so old bookmarks
 *   (`/leads` → `lead`) keep working after a rename.
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
	// labels arrive in the same payload (no separate subscription), so
	// once `org` is defined, `labels` reflects the renamed slugs.
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
