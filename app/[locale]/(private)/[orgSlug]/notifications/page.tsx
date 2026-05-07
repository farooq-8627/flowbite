// STATUS: NOT_STARTED — Phase 2 frontend
export default async function NotificationsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	return <div data-org={orgSlug}>Notifications — coming soon</div>;
}
