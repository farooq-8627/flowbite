"use client";

// STATUS: NOT_STARTED — Phase 2 frontend (Slice 3)
//
// Placeholder for the Companies list view. Replaced by a real scaffold-driven
// view in Slice 3 of ENTITY_SCAFFOLDS_ARCHITECTURE.md.
//
// Labels read from `useEntityLabels()` — renaming "Companies" → "Accounts" in
// Settings updates the placeholder instantly. Companies can also be hidden
// entirely via `orgSettings.modules[].hidden` (e.g. for freelancers). When
// hidden, the sidebar item disappears and EntitySlugView short-circuits to 404.

import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

export function CompaniesView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-entity="company"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.company.plural} — coming soon
		</div>
	);
}

export function CompanyDetailView({ orgSlug, companyId }: { orgSlug: string; companyId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={companyId}
			data-entity="company"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.company.singular} {companyId} — coming soon
		</div>
	);
}
