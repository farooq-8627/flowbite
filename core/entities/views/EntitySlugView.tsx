"use client";

import { useQuery } from "convex/react";
import { notFound } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { CompaniesView } from "../companies/views/CompaniesView";
import { ContactsView } from "../contacts/views/ContactDetailView";
import { DealsView } from "../deals/views/DealDetailView";
import { LeadsView } from "../leads/views/LeadsView";

type Slot = "lead" | "contact" | "deal" | "company";

/**
 * EntitySlugView — the runtime resolver that turns a URL slug like
 * `/inquiries` (org-renamed "Leads") into the correct entity list view.
 *
 * Why this exists:
 *   - The file route `app/.../[orgSlug]/[entitySlug]/page.tsx` catches every
 *     list URL. It cannot know which entity a slug maps to — that mapping is
 *     DB-backed per org (and can be renamed).
 *   - This component reads `useEntityLabels()` (Convex-reactive, single source
 *     of truth) and routes to the right per-entity view component.
 *   - If an org has hidden the entity (via `orgSettings.modules[].hidden`)
 *     or the slug doesn't match any configured entity, we call `notFound()`.
 *
 * Consumer contract:
 *   - `orgSlug` is used by per-entity views that still need it for their own
 *     queries / links.
 *   - `entitySlug` is the URL segment (`leads`, `inquiries`, `opportunities`,
 *     etc.).
 */
export function EntitySlugView({ orgSlug, entitySlug }: { orgSlug: string; entitySlug: string }) {
	const labels = useEntityLabels();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
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
		const map: Record<string, Slot> = {
			[labels.lead.slug]: "lead",
			[labels.contact.slug]: "contact",
			[labels.deal.slug]: "deal",
			[labels.company.slug]: "company",
		};
		return map[entitySlug] ?? null;
	}, [labels, entitySlug]);

	// Wait for the labels query — avoid a 404 flash during the initial render.
	if (orgs === undefined) return null;

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
