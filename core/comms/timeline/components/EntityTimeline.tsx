"use client";

/**
 * EntityTimeline — the ONE timeline component every entity-scoped surface
 * should mount.
 *
 * Why this exists:
 *   We already had `<PersonTimelinePanel personCode>` and
 *   `<EntityTimelinePanel entityType entityId>` as two separate
 *   components. Callers (profile / deal / company / project) had to pick
 *   the right one. Now they can just pass whichever set of identifiers
 *   they have on hand and this component routes to the correct
 *   `TimelineFeed` scope under the hood.
 *
 * Props (one of two shapes):
 *   - `{ personCode }`                       → timeline for a person
 *   - `{ entityType, entityId, personCode? }` → timeline for an entity
 *
 * Why we didn't just delete the two old panels:
 *   They're still mounted in older code paths (deal detail, company
 *   detail, profile timeline tab). Replacing every callsite is a
 *   different change. This file is the new canonical surface; existing
 *   panels keep working unchanged. New surfaces — and any refactor —
 *   should reach for `<EntityTimeline>` instead.
 *
 * Consumers (current + future):
 *   - Profile page → Timeline tab
 *   - Deal detail → Timeline tab
 *   - Company detail → Timeline tab
 *   - Project detail (Phase 8) → Timeline tab
 *   - Dashboard widget (caps `pageSize` via `visibleCap`)
 */

import {
	TimelineFeed,
	type TimelineFeedProps,
} from "@/core/comms/timeline/components/TimelineFeed";
import type { TimelineScope } from "@/core/comms/timeline/hooks";

type SharedProps = Pick<
	TimelineFeedProps,
	"showComposer" | "showFilters" | "emptyState" | "pageSize" | "visibleCap" | "className"
>;

/**
 * Person-scoped variant — pass `personCode`. Composer attaches new entries
 * to the person via `entityType="person"` + the same personCode.
 */
type PersonProps = SharedProps & {
	personCode: string;
	entityType?: never;
	entityId?: never;
};

/**
 * Entity-scoped variant — pass `entityType` + `entityId`. Optionally
 * thread to a personCode so cross-entity timeline links surface this
 * entry on the person's profile too.
 */
type EntityProps = SharedProps & {
	entityType: string;
	entityId: string;
	personCode?: string;
};

export type EntityTimelineProps = PersonProps | EntityProps;

export function EntityTimeline(props: EntityTimelineProps) {
	const { showComposer, showFilters, emptyState, pageSize, visibleCap, className } = props;

	// Resolve the right scope + composer entity from whichever shape we
	// got. Type guard via `"personCode" in props && !entityType`.
	const isPerson =
		"personCode" in props && !!props.personCode && !("entityType" in props && props.entityType);
	const scope: TimelineScope = isPerson
		? { kind: "person", personCode: (props as PersonProps).personCode }
		: {
				kind: "entity",
				entityType: (props as EntityProps).entityType,
				entityId: (props as EntityProps).entityId,
			};

	const composerEntity = isPerson
		? {
				entityType: "person",
				entityId: (props as PersonProps).personCode,
				personCode: (props as PersonProps).personCode,
			}
		: {
				entityType: (props as EntityProps).entityType,
				entityId: (props as EntityProps).entityId,
				personCode: (props as EntityProps).personCode,
			};

	const resolvedEmptyState = emptyState ?? {
		title: "No timeline yet",
		body: isPerson
			? "Notes, reminders, and updates for this person will appear here."
			: "Notes, reminders, and updates for this record will appear here.",
	};

	return (
		<TimelineFeed
			scope={scope}
			pageSize={pageSize ?? 50}
			visibleCap={visibleCap}
			composerEntity={composerEntity}
			showComposer={showComposer}
			showFilters={showFilters}
			emptyState={resolvedEmptyState}
			className={className}
		/>
	);
}
