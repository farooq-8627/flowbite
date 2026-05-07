// STATUS: NOT_STARTED — Phase 2 frontend (Slice 1)
// Combined people list — leads + contacts, filterable by ?type=lead|contact
export default async function ProfileListPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	// TODO Slice 1: import ProfileListView from @/core/entities/profile/views/ProfileListView
	return <div data-org={orgSlug}>All profiles — coming soon</div>;
}
