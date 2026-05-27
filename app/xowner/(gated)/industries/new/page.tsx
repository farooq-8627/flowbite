import { NewTemplateView } from "@/owner/views/industries/NewTemplateView";

export default async function OwnerIndustriesNewPage({
	searchParams,
}: {
	searchParams: Promise<{ source?: string }>;
}) {
	const { source } = await searchParams;
	return <NewTemplateView initialSourceKey={source} />;
}
