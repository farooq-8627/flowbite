"use client";

// STATUS: NOT_STARTED — Phase 2 frontend (Slice 1)
//
// Placeholder for the Contacts list + Contact detail views. Replaced by real
// scaffold-driven views in Slice 1 of ENTITY_SCAFFOLDS_ARCHITECTURE.md.
//
// Labels read from `useEntityLabels()` — renaming "Contacts" → "Clients" in
// Settings updates the placeholder instantly.

import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

export function ContactsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-entity="contact"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.contact.plural} — coming soon
		</div>
	);
}

export function ContactDetailView({ orgSlug, contactId }: { orgSlug: string; contactId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={contactId}
			data-entity="contact"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.contact.singular} {contactId} — coming soon
		</div>
	);
}
