import { CompaniesView } from "@/core/entities/companies/views/CompaniesView";

export default async function CompaniesPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <CompaniesView orgSlug={orgSlug} />;
}
