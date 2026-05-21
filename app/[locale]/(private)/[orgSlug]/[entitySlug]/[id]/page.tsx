// Dynamic entity detail route — catches detail URLs for every entity slot:
//   Default:   /deals/D-042, /companies/C-015
//   Renamed:   /opportunities/D-042, /accounts/C-015
//
// People detail pages live at /profile/[personCode] and are NOT routed here —
// a named `profile/` folder wins over this dynamic segment (that's exactly why
// it's safe to have one dynamic catch-all for non-people entity details).
//
// Locked decision (2026-05-20): this route is now a redirect-only page for
// deals. There is no separate deal detail view — deals live on the owning
// person's profile under the "Deals" tab. The client-side
// `EntityDetailRedirect` resolves the slug, looks up the deal's personCode
// when it lands here, and `router.replace`s to
// `/<orgSlug>/profile/<personCode>?group=deals`. For other slots (`company`,
// stale lead/contact bookmarks) it does the appropriate redirect or shows
// a placeholder.

import { EntityDetailRedirect } from "@/core/entities/views/EntityDetailRedirect";

export default async function EntityDetailPage({
	params,
}: {
	params: Promise<{ orgSlug: string; entitySlug: string; id: string }>;
}) {
	const { orgSlug, entitySlug, id } = await params;
	return <EntityDetailRedirect orgSlug={orgSlug} entitySlug={entitySlug} id={id} />;
}
