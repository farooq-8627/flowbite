import { ProfilesView } from "@/core/platform/profile/views/ProfilesView";

/**
 * All-profiles page — combined people view (leads + contacts).
 *
 * URL: `/{locale}/{orgSlug}/profile`.
 *
 * People are one mental model — leads and contacts are just two stages of
 * the same person's lifecycle. This page renders BOTH on a single board:
 * a Leads column (excluding converted) and a Contacts column. One search,
 * one toolbar, one place to scan the whole pipeline.
 *
 * Rendering happens in `ProfilesView`. Per "app/ pages are thin wrappers"
 * rule, this file does nothing but unwrap params and forward.
 */
export default async function AllProfilesPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	return <ProfilesView orgSlug={orgSlug} />;
}
