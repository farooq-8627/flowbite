// STATUS: NOT_STARTED — Phase 2 frontend (Slice 3/4)
//
// Dynamic entity detail route — catches detail URLs for every entity slot:
//   Default:   /deals/D-042, /companies/C-015
//   Renamed:   /opportunities/D-042, /accounts/C-015
//
// People detail pages live at /profile/[personCode] and are NOT routed here —
// a named `profile/` folder wins over this dynamic segment (that's exactly why
// it's safe to have one dynamic catch-all for non-people entity details).
//
// Resolution order inside EntitySlugDetailView (to be built in Slice 3/4):
//   1. Look up orgSettings.entityLabels → resolve `entitySlug` → entity slot
//   2. Render CompanyDetailView | DealDetailView accordingly
//   3. If the slug does not map to an enabled entity → 404
//
// Build order reminder:
//   - Slice 3 → company detail view
//   - Slice 4 → deal detail view
//   - Slice 5 → unified timeline consumed by both details + profile
//
// Until those are built this route only renders a placeholder div.
export default async function EntityDetailPage({
	params,
}: {
	params: Promise<{ orgSlug: string; entitySlug: string; id: string }>;
}) {
	const { orgSlug, entitySlug, id } = await params;
	// TODO: import EntitySlugDetailView from @/core/entities/views/EntitySlugDetailView
	return (
		<div
			data-org={orgSlug}
			data-slug={entitySlug}
			data-id={id}
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{entitySlug} / {id} detail — coming soon
		</div>
	);
}
