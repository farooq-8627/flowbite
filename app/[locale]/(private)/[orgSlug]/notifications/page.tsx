import { NotificationsView } from "@/core/inbox/notifications/views/NotificationsView";

export default async function NotificationsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	await params;
	return <NotificationsView />;
}
