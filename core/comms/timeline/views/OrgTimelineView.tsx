"use client";

import { useOrgTimeline } from "@/core/comms/timeline/hooks";
/**
 * OrgTimelineView — org-wide audit feed (placeholder, no UI yet).
 *
 * Same backing query as `/{orgSlug}/settings/activity-log` — gated by
 * `activityLogs.viewOrg` (admin/owner only).
 *
 * Status: backend wired (`useOrgTimeline`). Custom UI pending — designed in-house,
 * NOT copied from any template per FRONTEND-DECISIONS Rule 3.
 */
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function OrgTimelineView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const entries = useOrgTimeline({ orgId, limit: 100 });

	return (
		<div data-status="timeline-pending-ui" className="p-6">
			<h1 className="text-xl font-semibold">Timeline</h1>
			<p className="text-sm text-muted-foreground">
				Backend connected — {entries?.length ?? 0} entries. Custom UI pending.
			</p>
			<pre className="mt-4 max-h-[40vh] overflow-auto rounded-[var(--radius)] border bg-muted p-3 text-xs">
				{JSON.stringify(
					{ orgSlug, count: entries?.length, sample: entries?.slice(0, 3) },
					null,
					2,
				)}
			</pre>
		</div>
	);
}
