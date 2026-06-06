/**
 * Audit feed query — B.39 (S12 follow-up).
 *
 * Reads `activityLogs` rows tagged `actorType:"ai"` + `entityType:"ai_capability"`
 * (the rows `convex/ai/registry/audit.ts:writeAudit` writes). Org-wide
 * "what did the AI do today?" surface mounted at `/{orgSlug}/ai/audit`.
 *
 * The base scan uses `by_orgId_and_actorType_and_createdAt` so we read
 * only AI rows in date-desc order. Filters that aren't on the index
 * (`capability`, `source`, `status`, `riskTier`, `userId`) are applied
 * after a generous slice — capped at `OVERSCAN_CAP` so the read budget
 * stays bounded even when filters are tight.
 *
 * RBAC:
 *   - `ai.audit.view` — manager-only by default (Owner + Admin). Members
 *     can still get conversation-scoped trace via `ai.trace.view`. A
 *     custom role can grant `ai.audit.view` to broaden visibility.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Default page size when the caller doesn't specify. */
const DEFAULT_LIMIT = 50;
/** Hard cap so a malicious / buggy caller can't request unbounded reads. */
const MAX_LIMIT = 200;
/**
 * How many raw rows to read before applying in-memory filters. The audit
 * feed's filterable axes (capability/source/status/riskTier/userId) all
 * live in the metadata blob, not on indexed columns — so we read
 * `limit * OVERSCAN_FACTOR` rows then filter, capped at `OVERSCAN_CAP`.
 */
const OVERSCAN_FACTOR = 4;
const OVERSCAN_CAP = 1_000;

// ─── Public shapes ─────────────────────────────────────────────────────────

export type AuditFeedFilters = {
	capability?: string;
	source?: string;
	status?: string;
	riskTier?: "safe" | "reversible" | "irreversible";
	module?: string;
	group?: string;
	userId?: Id<"users">;
	conversationId?: Id<"aiConversations">;
	/** Only rows with `createdAt >= since`. */
	since?: number;
	/** Only rows with `createdAt < until`. */
	until?: number;
};

export type AuditFeedRow = {
	id: Id<"activityLogs">;
	createdAt: number;
	userId: Id<"users">;
	capability: string;
	action: string;
	description: string;
	status: string;
	channel: string;
	source: string;
	riskTier: string;
	module: string;
	group: string;
	conversationId?: string;
	personCode?: string;
	errorCount?: number;
	argSummary?: string;
};

export type AuditFeedResult = {
	rows: AuditFeedRow[];
	/**
	 * `createdAt` of the oldest row returned. The next page reads with
	 * `until: nextCursor`. `null` when there are no more rows.
	 */
	nextCursor: number | null;
	/** Whether the query had to truncate at OVERSCAN_CAP — UI can warn. */
	overflowed: boolean;
};

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/** Read a metadata field, defaulting to a string. */
export function readMetaString(
	meta: Doc<"activityLogs">["metadata"],
	key: string,
	fallback = "",
): string {
	if (!meta) return fallback;
	const value = (meta as Record<string, string | number | boolean | undefined>)[key];
	return typeof value === "string" ? value : fallback;
}

/** Read a metadata number, defaulting to undefined. */
export function readMetaNumber(
	meta: Doc<"activityLogs">["metadata"],
	key: string,
): number | undefined {
	if (!meta) return undefined;
	const value = (meta as Record<string, string | number | boolean | undefined>)[key];
	return typeof value === "number" ? value : undefined;
}

/**
 * Extract the canonical capability name from an `ai.cap.<name>` action
 * string. Pure — exported so the UI can reuse the same mapping.
 */
export function extractCapabilityFromAction(action: string): string {
	if (action.startsWith("ai.cap.")) return action.slice("ai.cap.".length);
	return action;
}

/** Project an `activityLogs` doc into the audit-feed row shape. */
export function projectAuditRow(row: Doc<"activityLogs">): AuditFeedRow {
	return {
		id: row._id,
		createdAt: row.createdAt,
		userId: row.userId,
		capability: extractCapabilityFromAction(row.action),
		action: row.action,
		description: row.description ?? "",
		status: readMetaString(row.metadata, "status", "ok"),
		channel: readMetaString(row.metadata, "channel", "chat"),
		source: readMetaString(row.metadata, "source", "chat"),
		riskTier: readMetaString(row.metadata, "riskTier", "safe"),
		module: readMetaString(row.metadata, "module", ""),
		group: readMetaString(row.metadata, "group", ""),
		...(readMetaString(row.metadata, "conversationId")
			? { conversationId: readMetaString(row.metadata, "conversationId") }
			: {}),
		...(row.personCode ? { personCode: row.personCode } : {}),
		...(typeof readMetaNumber(row.metadata, "errorCount") === "number"
			? { errorCount: readMetaNumber(row.metadata, "errorCount") as number }
			: {}),
		...(readMetaString(row.metadata, "argSummary")
			? { argSummary: readMetaString(row.metadata, "argSummary") }
			: {}),
	};
}

/**
 * Apply in-memory filters to a slice of audit rows. Pure — exported so
 * the same filter logic is reusable from any future projector (e.g. an
 * MCP `list_audit` tool when S16 lands).
 */
export function applyAuditFilters(rows: AuditFeedRow[], filters: AuditFeedFilters): AuditFeedRow[] {
	return rows.filter((row) => {
		if (filters.capability && row.capability !== filters.capability) return false;
		if (filters.source && row.source !== filters.source) return false;
		if (filters.status && row.status !== filters.status) return false;
		if (filters.riskTier && row.riskTier !== filters.riskTier) return false;
		if (filters.module && row.module !== filters.module) return false;
		if (filters.group && row.group !== filters.group) return false;
		if (filters.userId && row.userId !== filters.userId) return false;
		if (filters.conversationId && row.conversationId !== filters.conversationId) {
			return false;
		}
		// `since`/`until` — date-range filter; the index already bounds
		// the upper end via the cursor, but `since` may further trim.
		if (typeof filters.since === "number" && row.createdAt < filters.since) return false;
		if (typeof filters.until === "number" && row.createdAt >= filters.until) return false;
		return true;
	});
}

// ─── Internal read shared by public + ForAI ────────────────────────────────

async function listAuditFeedImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		limit?: number;
		filters?: AuditFeedFilters;
		/** When set, return only rows older than this `createdAt` ms. */
		cursor?: number;
	},
): Promise<AuditFeedResult> {
	const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const filters = args.filters ?? {};

	// Bound the read with the index. We use a date-desc walk so the newest
	// rows arrive first; cursor is the last-seen `createdAt` from the
	// previous page. `since` (when set) trims the lower bound. Filters
	// outside the index (capability/source/status/etc.) are applied in
	// memory after a generous slice.
	const orgId = args.orgId;
	const since = filters.since;
	const cursor = args.cursor;
	const q = ctx.db
		.query("activityLogs")
		.withIndex("by_orgId_and_actorType_and_createdAt", (idx) => {
			const eq = idx.eq("orgId", orgId).eq("actorType", "ai");
			if (typeof since === "number" && typeof cursor === "number") {
				return eq.gte("createdAt", since).lt("createdAt", cursor);
			}
			if (typeof since === "number") {
				return eq.gte("createdAt", since);
			}
			if (typeof cursor === "number") {
				return eq.lt("createdAt", cursor);
			}
			return eq;
		})
		.order("desc");

	const cap = Math.min(limit * OVERSCAN_FACTOR, OVERSCAN_CAP);
	const raw = await q.take(cap);
	const overflowed = raw.length === OVERSCAN_CAP;

	// Filter audit rows down to the AI-capability subset. (`actorType:"ai"`
	// also covers older AI activity rows — autonomous turn markers, etc.
	// — that aren't capability calls. The audit feed scope is "what
	// capability ran"; trace UI covers per-conversation tool events.)
	const projected = raw.filter((r) => r.entityType === "ai_capability").map(projectAuditRow);

	const filtered = applyAuditFilters(projected, filters).slice(0, limit);
	const nextCursor =
		filtered.length === limit ? (filtered[filtered.length - 1]?.createdAt ?? null) : null;

	return { rows: filtered, nextCursor, overflowed };
}

// ─── Public + ForAI ─────────────────────────────────────────────────────────

const auditFiltersValidator = v.object({
	capability: v.optional(v.string()),
	source: v.optional(v.string()),
	status: v.optional(v.string()),
	riskTier: v.optional(
		v.union(v.literal("safe"), v.literal("reversible"), v.literal("irreversible")),
	),
	module: v.optional(v.string()),
	group: v.optional(v.string()),
	userId: v.optional(v.id("users")),
	conversationId: v.optional(v.id("aiConversations")),
	since: v.optional(v.number()),
	until: v.optional(v.number()),
});

/**
 * Public read for the audit-feed UI. Returns `null` when the caller
 * lacks `ai.audit.view` so the UI can render its own permission state
 * without parsing a thrown error.
 */
export const listAuditFeed = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
		cursor: v.optional(v.number()),
		filters: v.optional(auditFiltersValidator),
	},
	handler: async (ctx, args): Promise<AuditFeedResult | null> => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.audit.view")) return null;
		return listAuditFeedImpl(ctx, args);
	},
});

/** AI-callable twin — used by future `list_audit` capability (S16 / B.31). */
export const listAuditFeedForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		limit: v.optional(v.number()),
		cursor: v.optional(v.number()),
		filters: v.optional(auditFiltersValidator),
	},
	handler: async (ctx, args): Promise<AuditFeedResult | null> => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("ai.audit.view")) return null;
		const { userId: _u, ...rest } = args;
		return listAuditFeedImpl(ctx, rest);
	},
});

/**
 * Lightweight summary used by the feed UI's filter bar — distinct
 * capabilities + sources + statuses seen in the most recent window.
 * Caps the underlying scan at 500 rows so a fresh org loads instantly
 * AND a chatty org's filter dropdowns stay populated.
 */
export const getAuditFeedFacets = orgQuery({
	args: {
		orgId: v.id("orgs"),
		windowMs: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		capabilities: string[];
		sources: string[];
		statuses: string[];
		riskTiers: string[];
	} | null> => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.audit.view")) return null;

		const sinceTs = Date.now() - (args.windowMs ?? 30 * 24 * 60 * 60 * 1000);
		const rows = await ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_actorType_and_createdAt", (idx) =>
				idx.eq("orgId", args.orgId).eq("actorType", "ai").gte("createdAt", sinceTs),
			)
			.order("desc")
			.take(500);

		const projected = rows.filter((r) => r.entityType === "ai_capability").map(projectAuditRow);
		const capSet = new Set<string>();
		const srcSet = new Set<string>();
		const statSet = new Set<string>();
		const riskSet = new Set<string>();
		for (const r of projected) {
			capSet.add(r.capability);
			srcSet.add(r.source);
			statSet.add(r.status);
			riskSet.add(r.riskTier);
		}
		return {
			capabilities: Array.from(capSet).sort(),
			sources: Array.from(srcSet).sort(),
			statuses: Array.from(statSet).sort(),
			riskTiers: Array.from(riskSet).sort(),
		};
	},
});

// ─── Unseen-count badge (B.42 follow-up) ───────────────────────────────────

/**
 * How many AI capability rows landed since the caller last visited the
 * audit feed. Drives the unread-count badge on the sidebar's
 * `AI → Audit feed` entry.
 *
 * Cap: `UNSEEN_COUNT_CAP` rows. We early-out as soon as we've seen this
 * many rows because the badge truncates to "99+" anyway — no need to
 * scan further into history just to compute a number we'll round down.
 *
 * RBAC: gated on `ai.audit.view` server-side (same key the feed itself
 * uses). Returns `0` when the caller lacks the permission so the
 * sidebar simply doesn't render a badge — never leaks counts.
 *
 * Reactive: `lastSeenAuditAt` lives on `users.preferences`. Convex
 * subscriptions invalidate this query whenever a relevant row is
 * inserted OR the user's preferences change (i.e. mark-as-seen). The
 * sidebar therefore drops the badge instantly when the user opens the
 * feed.
 */

const UNSEEN_COUNT_CAP = 99;

export const getUnseenAuditCount = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<{ count: number; capped: boolean }> => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.audit.view")) {
			return { count: 0, capped: false };
		}
		// Default 0 means "never opened" → every existing AI row counts
		// as unseen. We use `gt`, not `gte`, so a re-mount that writes
		// `Date.now()` and immediately re-reads doesn't flicker the
		// badge back on for the same-millisecond row.
		const lastSeenAt = ctx.user.preferences?.lastSeenAuditAt ?? 0;

		// Read rows newer than the cursor in date-desc order, stopping
		// as soon as we hit the cap. We over-scan by `UNSEEN_COUNT_CAP * 2`
		// then filter to `entityType === "ai_capability"` because the
		// `actorType:"ai"` index also surfaces autonomous-turn markers
		// + standing-order rows that DON'T belong on the feed. The
		// over-scan factor is tuned so a chatty workspace still hits
		// the cap inside one read budget; pathological orgs whose AI
		// row stream is mostly markers will simply show a slightly
		// lower badge than ground-truth — acceptable for an inbox-
		// style indicator.
		const rows = await ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_actorType_and_createdAt", (idx) =>
				idx.eq("orgId", args.orgId).eq("actorType", "ai").gt("createdAt", lastSeenAt),
			)
			.order("desc")
			.take(UNSEEN_COUNT_CAP * 2);

		let count = 0;
		for (const row of rows) {
			if (row.entityType !== "ai_capability") continue;
			count += 1;
			if (count >= UNSEEN_COUNT_CAP) {
				return { count: UNSEEN_COUNT_CAP, capped: true };
			}
		}
		return { count, capped: false };
	},
});
