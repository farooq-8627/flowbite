// STATUS: NOT_STARTED — Phase 2 frontend (Slice 3)
// Company detail page — Overview | Contacts | Deals | Timeline
// URL: /{locale}/{orgSlug}/companies/[id]  (id = Convex _id, not companyCode)
export default async function CompanyDetailPage({
	params,
}: {
	params: Promise<{ orgSlug: string; id: string }>;
}) {
	const { orgSlug, id } = await params;
	// TODO Slice 3: import CompanyDetailView from @/core/entities/companies/views/CompanyDetailView
	return <div data-org={orgSlug} data-id={id}>Company detail — coming soon</div>;
}
