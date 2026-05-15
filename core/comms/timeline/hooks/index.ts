/**
 * Timeline hooks — wrap the unified timeline query.
 *
 * Backend already merges activityLogs + notes + reminders into a single feed
 * with `_entryType` and `_color` tags. Frontend simply renders.
 *
 * Status: IMPLEMENTED (Phase 2 backend already exists; this is the React wrapper).
 */
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Per-person timeline. Used by `PersonTimelinePanel`. */
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

/** Org-wide audit feed. Admin/owner only — gated server-side. */
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
 * Entity-scoped timeline (Deal/Company tabs).
 *
 * `getForOrg` returns activity logs filtered by actorType — for entity scope
 * we currently fall through to person scope when personCode is known. A
 * dedicated `getForEntity` query can be added later if needed.
 */
export function useEntityTimeline(args: {
	orgId?: Id<"orgs">;
	personCode?: string;
	limit?: number;
}) {
	// Until a `getForEntity` query exists, route entity timelines through the
	// person query when personCode is available; otherwise return undefined.
	return useQuery(
		api.crm.shared.timeline.queries.getForPerson,
		args.orgId && args.personCode
			? { orgId: args.orgId, personCode: args.personCode, limit: args.limit }
			: "skip",
	);
}
