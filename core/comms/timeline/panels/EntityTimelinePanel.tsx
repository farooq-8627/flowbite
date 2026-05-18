"use client";

/**
 * EntityTimelinePanel — embedded inside deal/company detail Timeline tabs.
 *
 * Mounts `<TimelineFeed scope={kind:"entity", entityType, entityId}>`.
 * The composer attaches new comments to the entity. When `personCode` is
 * known (e.g. a deal's primary contact), it's threaded so the comment
 * also surfaces on that person's timeline.
 */

import { TimelineFeed } from "@/core/comms/timeline/components/TimelineFeed";

interface EntityTimelinePanelProps {
	entityType: string;
	entityId: string;
	/** Optional personCode for cross-entity threading. */
	personCode?: string;
}

export function EntityTimelinePanel({
	entityType,
	entityId,
	personCode,
}: EntityTimelinePanelProps) {
	return (
		<TimelineFeed
			scope={{ kind: "entity", entityType, entityId }}
			pageSize={50}
			composerEntity={{ entityType, entityId, personCode }}
			emptyState={{
				title: "No timeline yet",
				body: "Notes, reminders, and updates for this record will appear here.",
			}}
		/>
	);
}
