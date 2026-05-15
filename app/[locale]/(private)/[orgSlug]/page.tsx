import { DashboardHomeView } from "@/core/shell/shell/views/DashboardHomeView";

export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	const { orgSlug } = await params;
	return <DashboardHomeView orgSlug={orgSlug} />;
}
