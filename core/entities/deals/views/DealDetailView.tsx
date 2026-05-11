"use client";

// STATUS: NOT_STARTED — Phase 2 frontend (Slice 4)
//
// Placeholder for the Deals list + Deal detail views. Replaced by real scaffolds
// in Slice 4 of ENTITY_SCAFFOLDS_ARCHITECTURE.md.
//
// Both views pull their visible label from `useEntityLabels()` so renaming
// "Deals" → "Opportunities" in Settings updates the placeholder instantly.
//
// Default list view for this entity is **board (kanban)**. The list view is a
// secondary option via a toolbar toggle on the real scaffold.

import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

export function DealsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-entity="deal"
			data-default-view="board"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.deal.plural} — coming soon (default view: board)
		</div>
	);
}

export function DealDetailView({ orgSlug, dealId }: { orgSlug: string; dealId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={dealId}
			data-entity="deal"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.deal.singular} {dealId} — coming soon
		</div>
	);
}
