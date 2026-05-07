// STATUS: NOT_STARTED — Phase 2 frontend
export function LeadsView({ orgSlug }: { orgSlug: string }) {
	return <div data-org={orgSlug}>Leads — coming soon</div>;
}

export function LeadDetailView({ orgSlug, leadId }: { orgSlug: string; leadId: string }) {
	return <div data-org={orgSlug} data-id={leadId}>Lead detail — coming soon</div>;
}
