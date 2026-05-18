/**
 * Timeline hooks — wrap the unified timeline query.
 *
 * Backend already merges activityLogs + notes + reminders into a single feed
 * with `_entryType`, `_kind` ("bare" | "card" | "node"), and `_color` tags.
 * Frontend simply renders.
 *
 * Status: IMPLEMENTED.
 *
 * 2026-05-19 — added `usePaginatedTimeline` (cursor pagination via
 * `usePaginatedQuery`). This is the primary hook used by the new
 * `<TimelineFeed>` component. The legacy hooks (`usePersonTimeline`,
 * `useOrgTimeline`) are kept for non-paginated callers (small embeds,
 * dashboard widgets) — they cap at 50/100 entries which is all those
 * surfaces ever render.
 */
"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Discriminated scope union — must match the validator on
 * `crm.shared.timeline.queries.getForScope`.
 */
export type TimelineScope =
	| { kind: "org" }
	| { kind: "person"; personCode: string }
	| { kind: "entity"; entityType: string; entityId: string };

/**
 * Paginated timeline — used by `<TimelineFeed>` everywhere.
 *
 * Returns the standard `usePaginatedQuery` shape:
 *   - `results`     — flat array of all loaded entries, ordered desc by createdAt
 *   - `status`      — "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
 *   - `loadMore(n)` — call to fetch the next older page
 *
 * Pass `initialNumItems` per surface:
 *   - Org / profile / entity timeline: 50
 *   - Dashboard widget: 10
 */
export function usePaginatedTimeline(args: {
	orgId?: Id<"orgs">;
	scope: TimelineScope;
	initialNumItems?: number;
}) {
	return usePaginatedQuery(
		api.crm.shared.timeline.queries.getForScope,
		args.orgId ? { orgId: args.orgId, scope: args.scope } : "skip",
		{ initialNumItems: args.initialNumItems ?? 50 },
	);
}

/** Per-person timeline — non-paginated. Used by simple embeds. */
export function usePersonTimeline(args: {
	orgId?: Id<"orgs">;
	personCode: string;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.timeline.queries.getForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode, limit: args.limit } : "skip",
	);
}

/** Org-wide audit feed — non-paginated. Admin/owner only — gated server-side. */
export function useOrgTimeline(args: {
	orgId?: Id<"orgs">;
	limit?: number;
	actorType?: "user" | "ai" | "integration" | "system";
}) {
	return useQuery(
		api.crm.shared.timeline.queries.getForOrg,
		args.orgId ? { orgId: args.orgId, limit: args.limit, actorType: args.actorType } : "skip",
	);
}

/**
 * Entity-scoped timeline (Deal/Company tabs) — non-paginated.
 *
 * Calls the new `getForEntity` query which reads from the cheapest
 * activityLogs index plus entity-scoped notes + reminders.
 */
export function useEntityTimeline(args: {
	orgId?: Id<"orgs">;
	entityType?: string;
	entityId?: string;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.timeline.queries.getForEntity,
		args.orgId && args.entityType && args.entityId
			? {
					orgId: args.orgId,
					entityType: args.entityType,
					entityId: args.entityId,
					limit: args.limit,
				}
			: "skip",
	);
}
