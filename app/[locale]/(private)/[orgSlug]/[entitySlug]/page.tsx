// STATUS: NOT_STARTED — Phase 2 frontend (Slice 1)
//
// Dynamic entity list route — catches ALL entity slugs:
//   Default:  /leads, /contacts, /deals, /companies
//   Renamed:  /inquiries, /clients, /opportunities, /accounts
//
// Resolution order:
//   1. Look up orgSettings.entityLabels to find which entity type this slug maps to
//   2. Render the correct list view for that entity type
//   3. If slug not found → 404
//
// Next.js resolves NAMED segments before dynamic ones, so:
//   /profile → profile/page.tsx (wins — static)
//   /settings → settings/layout.tsx (wins — static)
//   /notifications → notifications/page.tsx (wins — static)
//   /leads → [entitySlug]/page.tsx (caught here — dynamic)
//   /inquiries → [entitySlug]/page.tsx (caught here — org-renamed)
//
// This means we do NOT need separate /leads and /contacts directories.
// One route handles all entity list views.
export default async function EntityListPage({
	params,
}: {
	params: Promise<{ orgSlug: string; entitySlug: string }>;
}) {
	const { orgSlug, entitySlug } = await params;
	// TODO Slice 1: import EntitySlugView from @/core/entities/views/EntitySlugView
	// EntitySlugView will:
	//   1. Call api.orgs.getEntityLabels to resolve entitySlug → entityType
	//   2. Render LeadsView | ContactsView | DealsView | CompaniesView accordingly
	//   3. Show 404 if slug doesn't match any configured entity
	return (
		<div data-org={orgSlug} data-slug={entitySlug}>
			{entitySlug} list — coming soon
		</div>
	);
}
