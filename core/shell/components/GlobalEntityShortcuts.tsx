"use client";

/**
 * GlobalEntityShortcuts — mounts a single keydown listener for the global
 * entity-navigation shortcuts (⌘⇧L / ⌘⇧N / ⌘⇧D / ⌘⇧O).
 *
 * Slugs are resolved dynamically from `useEntityLabels()` so a workspace that
 * renames Leads → Inquiries still reaches the right page.
 *
 * Listens at document-level so the shortcuts fire from anywhere in the shell,
 * not just from the entity pages themselves.
 */

import { useEffect } from "react";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useRouter } from "@/i18n/navigation";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";

interface Props {
	orgSlug: string;
}

export function GlobalEntityShortcuts({ orgSlug }: Props) {
	const router = useRouter();
	const labels = useEntityLabels();
	const scLeads = useShortcut("gotoLeads");
	const scContacts = useShortcut("gotoContacts");
	const scDeals = useShortcut("gotoDeals");
	const scCompanies = useShortcut("gotoCompanies");

	useEffect(() => {
		function handler(e: KeyboardEvent) {
			if (matchesShortcut(e, scLeads)) {
				e.preventDefault();
				router.push(`/${orgSlug}/${labels.lead.slug}`);
			} else if (matchesShortcut(e, scContacts)) {
				e.preventDefault();
				router.push(`/${orgSlug}/${labels.contact.slug}`);
			} else if (matchesShortcut(e, scDeals)) {
				e.preventDefault();
				router.push(`/${orgSlug}/${labels.deal.slug}`);
			} else if (matchesShortcut(e, scCompanies)) {
				e.preventDefault();
				router.push(`/${orgSlug}/${labels.company.slug}`);
			}
		}
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [orgSlug, router, labels, scLeads, scContacts, scDeals, scCompanies]);

	return null;
}
