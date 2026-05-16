/**
 * Aggregate counters helper — convex/_shared/orgStats.ts
 *
 * Production-grade replacement for the older "scan + reduce" dashboard query
 * pattern. Every CRM mutation that should affect a count or sum calls
 * `applyOrgStat()`; reads are O(1) per key against the `orgStats` table.
 *
 * Counter keys live alongside the schema definition in `schema/system.ts`
 * (search "orgStats" for the canonical list).
 *
 * IDEMPOTENCY / DRIFT
 *   Mutations call `applyOrgStat(orgId, "leads.open", +1)` on insert and
 *   `applyOrgStat(orgId, "leads.open", -1)` on soft-delete. If a mutation
 *   path is missed (or hot-fixed badly), drift accumulates. To recover, run
 *   `npx convex run _shared/orgStats:recompute --org <orgId>` (Phase 3
 *   internalAction; stub today). The recompute reads the source-of-truth
 *   tables and overwrites the counters atomically.
 *
 * CONCURRENCY
 *   Convex mutations are serialised per (table, id) by OCC, so two parallel
 *   mutations targeting the same key see a consistent state — at worst one
 *   retries. We do NOT need Redis-style INCR primitives.
 *
 * Usage:
 * ```ts
 * import { applyOrgStat } from "@/convex/_shared/orgStats";
 *
 * // After a successful insert:
 * await applyOrgStat(ctx, args.orgId, "leads.open", +1);
 * await applyOrgStat(ctx, args.orgId, "leads.total", +1);
 *
 * // After a soft-delete:
 * await applyOrgStat(ctx, args.orgId, "leads.open", -1);
 * ```
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Apply a delta to an org-scoped counter. Inserts the row if missing.
 * Negative deltas are clamped at zero to keep the counter sane after drift.
 *
 * @param key Canonical counter key (e.g. "leads.open"). See schema/system.ts.
 * @param delta Integer or decimal delta. Floors to 0 if the result is negative.
 */
export async function applyOrgStat(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	key: string,
	delta: number,
): Promise<number> {
	const existing = await ctx.db
		.query("orgStats")
		.withIndex("by_org_and_key", (q) => q.eq("orgId", orgId).eq("key", key))
		.first();
	const now = Date.now();
	if (!existing) {
		const initial = Math.max(0, delta);
		await ctx.db.insert("orgStats", {
			orgId,
			key,
			value: initial,
			updatedAt: now,
		});
		return initial;
	}
	const next = Math.max(0, existing.value + delta);
	await ctx.db.patch(existing._id, { value: next, updatedAt: now });
	return next;
}

/**
 * Bulk-apply multiple counter deltas in one call. Saves a Convex round-trip
 * per key when a mutation affects several counters at once.
 *
 * Concurrency-safe (each key is patched in its own transaction step).
 */
export async function applyOrgStats(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	deltas: Record<string, number>,
): Promise<void> {
	for (const [key, delta] of Object.entries(deltas)) {
		if (delta === 0) continue;
		await applyOrgStat(ctx, orgId, key, delta);
	}
}

/**
 * Read every counter for an org as a flat record. Returns 0 for missing keys
 * so callers can use the default-value pattern without conditionals.
 */
export async function readAllOrgStats(
	ctx: { db: MutationCtx["db"] | { query: MutationCtx["db"]["query"] } },
	orgId: Id<"orgs">,
): Promise<Record<string, number>> {
	const rows = await (ctx.db as MutationCtx["db"])
		.query("orgStats")
		.withIndex("by_org_and_key", (q) => q.eq("orgId", orgId))
		.collect();
	const out: Record<string, number> = {};
	for (const r of rows) out[r.key] = r.value;
	return out;
}
