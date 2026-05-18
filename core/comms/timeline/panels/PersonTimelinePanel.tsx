"use client";

/**
 * PersonTimelinePanel — embedded inside the profile page Timeline tab.
 *
 * Mounts `<TimelineFeed scope={kind:"person", personCode}>`.
 * The composer attaches new comments to this person via
 * `entityType="person"` + `personCode`.
 *
 * Used in:
 *   - `/profile/[personCode]` → Timeline tab
 */

import { TimelineFeed } from "@/core/comms/timeline/components/TimelineFeed";

interface PersonTimelinePanelProps {
	personCode: string;
}

export function PersonTimelinePanel({ personCode }: PersonTimelinePanelProps) {
	return (
		<TimelineFeed
			scope={{ kind: "person", personCode }}
			pageSize={50}
			composerEntity={{
				entityType: "person",
				entityId: personCode,
				personCode,
			}}
			emptyState={{
				title: "No timeline yet",
				body: "Notes, reminders, and updates for this person will appear here.",
			}}
		/>
	);
}
