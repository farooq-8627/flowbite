// STATUS: NOT_STARTED — Phase 2 frontend (Slice 2)
// ProfilePage — unified hub for lead + contact
// URL: /{locale}/{orgSlug}/profile/P-001
// Resolves personCode → lead or contact via convex/crm/people/queries.ts::getByPersonCode
export default async function ProfilePage({
	params,
}: {
	params: Promise<{ orgSlug: string; personCode: string }>;
}) {
	const { orgSlug, personCode } = await params;
	// TODO Slice 2: import ProfileView from @/core/entities/profile/views/ProfileView
	return (
		<div data-org={orgSlug} data-person={personCode}>
			Profile {personCode} — coming soon
		</div>
	);
}
