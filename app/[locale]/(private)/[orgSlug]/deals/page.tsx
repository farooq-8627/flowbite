import { DealsView } from "@/core/entities/deals/views/DealDetailView";

export default async function DealsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <DealsView orgSlug={orgSlug} />;
}
