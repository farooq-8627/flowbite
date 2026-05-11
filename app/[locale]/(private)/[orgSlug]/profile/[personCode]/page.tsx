import { ProfileDetailView } from "@/core/profile/views/ProfileDetailView";

/**
 * Person detail page.
 *
 * URL: `/{locale}/{orgSlug}/profile/{personCode}`.
 *
 * A person is ONE identity regardless of whether they are a "lead" or
 * "contact" — the backend resolves `personCode` → whichever table holds it
 * (see convex/crm/people/queries.ts::getByPersonCode). That's why this route
 * lives outside `core/entities/` and has its own module (`core/profile/`).
 *
 * The page itself is intentionally thin per our "app/ pages are wrappers" rule.
 * All rendering, data fetching, and layout happens in `ProfileDetailView`.
 */
export default async function ProfilePage({
	params,
}: {
	params: Promise<{ orgSlug: string; personCode: string }>;
}) {
	const { orgSlug, personCode } = await params;
	return <ProfileDetailView orgSlug={orgSlug} personCode={personCode} />;
}
