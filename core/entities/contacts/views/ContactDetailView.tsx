// STATUS: NOT_STARTED — Phase 2 frontend
export function ContactsView({ orgSlug }: { orgSlug: string }) {
	return <div data-org={orgSlug}>Contacts — coming soon</div>;
}

export function ContactDetailView({ orgSlug, contactId }: { orgSlug: string; contactId: string }) {
	return <div data-org={orgSlug} data-id={contactId}>Contact detail — coming soon</div>;
}
