// STATUS: NOT_STARTED — Phase 2 frontend
export function DealsView({ orgSlug }: { orgSlug: string }) {
	return <div data-org={orgSlug}>Deals — coming soon</div>;
}

export function DealDetailView({ orgSlug, dealId }: { orgSlug: string; dealId: string }) {
	return <div data-org={orgSlug} data-id={dealId}>Deal detail — coming soon</div>;
}
