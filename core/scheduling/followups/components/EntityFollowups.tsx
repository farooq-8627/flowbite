"use client";

/**
 * EntityFollowups — the ONE follow-ups panel every entity-scoped surface
 * should mount.
 *
 * Same pattern as `<EntityTimeline>`: callers pass whichever set of
 * identifiers they have (a `personCode` for the profile page, or
 * `entityType`+`entityId` for a deal/company/project) and this component
 * forwards to the right `<FollowUpsPanel>` shape.
 *
 * Why we wrap `<FollowUpsPanel>` instead of replacing it:
 *   `FollowUpsPanel` already exists and is correct — it just has a
 *   discriminated-union prop shape that callers find awkward to thread
 *   through. This facade gives a single named entry point so consumers
 *   don't have to reach across module boundaries.
 *
 * Where this gets used:
 *   - Profile page (`/profile/[personCode]`) → Reminders tab
 *   - Deal detail → Reminders / Follow-ups area
 *   - Company detail → Reminders / Follow-ups area
 *   - Project detail (Phase 8) → Follow-ups area
 *
 * If the panel ever needs to render in a sidebar widget (e.g. dashboard
 * "Follow-ups today"), reach for `<FollowUpsView>` org-wide instead —
 * `<EntityFollowups>` is for ONE entity at a time.
 */

import { FollowUpsPanel } from "@/core/scheduling/followups/panels/FollowUpsPanel";

type SharedProps = {
	className?: string;
};

type PersonProps = SharedProps & {
	personCode: string;
	entityType?: never;
	entityId?: never;
	/** When mounted on a deal-aware view, pre-bind the deal in the form. */
	defaults?: { dealCode?: string };
};

type EntityProps = SharedProps & {
	personCode?: never;
	entityType: "deal" | "company";
	entityId: string;
	/** When the entity has a primary contact, pre-bind the personCode in the form. */
	defaults?: { personCode?: string };
};

export type EntityFollowupsProps = PersonProps | EntityProps;

export function EntityFollowups(props: EntityFollowupsProps) {
	if ("personCode" in props && props.personCode) {
		return (
			<FollowUpsPanel
				personCode={props.personCode}
				defaults={props.defaults}
				className={props.className}
			/>
		);
	}
	const e = props as EntityProps;
	return (
		<FollowUpsPanel
			entityType={e.entityType}
			entityId={e.entityId}
			defaults={e.defaults}
			className={e.className}
		/>
	);
}
