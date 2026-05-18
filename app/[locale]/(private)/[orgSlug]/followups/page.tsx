import { FollowUpsView } from "@/core/scheduling/followups/views/FollowUpsView";

/**
 * Follow-ups page — `/{locale}/{orgSlug}/followups`. Thin wrapper.
 *
 * Doctrine (CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md): follow-ups are
 * reminders with `source === "followup"`. This page is a CRM-cadence
 * lens over that subset. Persistence shares the `reminders` table with
 * `/reminders` — the two surfaces stay in sync via the same optimistic-
 * update layer.
 */
export default async function FollowUpsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	return <FollowUpsView orgSlug={orgSlug} />;
}
