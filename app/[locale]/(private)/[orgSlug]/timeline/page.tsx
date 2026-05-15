import { OrgTimelineView } from "@/core/comms/timeline/views/OrgTimelineView";

/**
 * Timeline page — `/{locale}/{orgSlug}/timeline`. Thin wrapper.
 *
 * Same view also reachable from `/settings/activity-log` (admin only).
 * `activityLogs.viewOrg` permission is enforced server-side by the timeline query.
 */
export default async function TimelinePage({ params }: { params: Promise<{ orgSlug: string }> }) {
	await params;
	return <OrgTimelineView />;
}
