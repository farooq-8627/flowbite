import { DealDetailView } from "@/core/entities/deals/views/DealDetailView";
import { DealsView } from "@/core/entities/deals/views/DealDetailView";

export default async function DealDetailPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string; id: string }>;
}) {
	const { orgSlug, id } = await params;
	return <DealDetailView orgSlug={orgSlug} dealId={id} />;
}
