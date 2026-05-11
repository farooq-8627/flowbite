"use client";

// STATUS: NOT_STARTED — Phase 2 frontend (Slice 1)
//
// Placeholder for the Leads list + Lead detail views. Replaced by real
// scaffold-driven views in Slice 1 of ENTITY_SCAFFOLDS_ARCHITECTURE.md.
//
// Labels read from `useEntityLabels()` — renaming "Leads" → "Inquiries" in
// Settings updates the placeholder instantly.

import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

export function LeadsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-entity="lead"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.lead.plural} — coming soon
		</div>
	);
}

export function LeadDetailView({ orgSlug, leadId }: { orgSlug: string; leadId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={leadId}
			data-entity="lead"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.lead.singular} {leadId} — coming soon
		</div>
	);
}
