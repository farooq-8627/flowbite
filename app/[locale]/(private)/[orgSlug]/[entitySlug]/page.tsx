import { EntitySlugView } from "@/core/entities/views/EntitySlugView";

/**
 * Dynamic entity list route — catches ALL entity slugs:
 *   Default:   /leads, /contacts, /deals, /companies
 *   Renamed:   /inquiries, /clients, /opportunities, /accounts
 *
 * Resolution happens at runtime in `EntitySlugView` via `useEntityLabels()`:
 *   entitySlug → entity slot → list view for that slot.
 *
 * Named segments always win over dynamic ones in Next.js routing, so:
 *   - /profile, /settings, /notifications → named folders (win)
 *   - /leads, /inquiries, /opportunities  → caught here
 *
 * This is why we do NOT need separate /deals and /companies folders under app/.
 * One dynamic route handles every entity list view — including after a rename.
 */
export default async function EntityListPage({
	params,
}: {
	params: Promise<{ orgSlug: string; entitySlug: string }>;
}) {
	const { orgSlug, entitySlug } = await params;
	return <EntitySlugView orgSlug={orgSlug} entitySlug={entitySlug} />;
}
