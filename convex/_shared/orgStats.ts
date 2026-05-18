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
 *   path is missed (or hot-fixed badly), drift accumulates. Recovery has
 *   two paths:
 *     • Automatic — a weekly cron in `convex/crons.ts` invokes
 *       `internal._shared.orgStats.recomputeOrgStats` so drift never lingers
 *       longer than 7 days.
 *     • Manual — run the mutation against a single org or every org from
 *       the CLI:
 *         npx convex run _shared/orgStats:recomputeOrgStats '{}'
 *         npx convex run _shared/orgStats:recomputeOrgStats '{"orgId":"<id>"}'
 *         npx convex run _shared/orgStats:recomputeOrgStatsDryRun '{}'
 *   Always dry-run first to see the diff before writing.
 *
 *   For backwards compatibility the older `_migrations/recomputeOrgStats:run`
 *   command path is preserved as a thin re-export — both names point at the
 *   same handler.
 *
 * CONCURRENCY
 *   Convex mutations are serialised per (table, id) by OCC, so two parallel
 *   mutations targeting the same key see a consistent state — at worst one
 *   retries. We do NOT need Redis-style INCR primitives.
 *
 * Usage (mutations):
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

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

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

// ─── Drift recovery (canonical) ──────────────────────────────────────────────
// Originally lived in `_migrations/recomputeOrgStats.ts`. Moved here on
// 2026-05-19 so the schema/dashboard doc-comments can simply point at this
// module. The old path keeps working via a thin re-export — see
// `_migrations/recomputeOrgStats.ts`.

interface ComputedStats {
	leadsOpen: number;
	leadsTotal: number;
	contactsActive: number;
	companiesActive: number;
	dealsOpen: number;
	dealsWon: number;
	dealsLost: number;
	dealsPipelineValue: number;
	membersActive: number;
}

/**
 * Compute the truth-counters for a single org by scanning source tables.
 * Pure helper used by both the dry-run and the live mutation handlers, plus
 * the weekly cron.
 *
 *   - "leads.open"           = leads where !deletedAt && !convertedAt
 *   - "leads.total"          = every lead row (incl. converted/deleted)
 *   - "contacts.active"      = contacts where !deletedAt
 *   - "companies.active"     = companies where !deletedAt
 *   - "deals.open"           = deals where !deletedAt && !wonAt && !lostAt
 *   - "deals.won"            = deals where !deletedAt && wonAt set
 *   - "deals.lost"           = deals where !deletedAt && lostAt set
 *   - "deals.pipelineValue"  = sum(value) of open deals
 *   - "members.active"       = orgMembers where !deletedAt
 */
export async function computeOrgStats(ctx: MutationCtx, orgId: Id<"orgs">): Promise<ComputedStats> {
	const [leads, contacts, companies, deals, members] = await Promise.all([
		ctx.db
			.query("leads")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
		ctx.db
			.query("contacts")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
		ctx.db
			.query("companies")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
		ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
		ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId))
			.collect(),
	]);

	const leadsOpen = leads.filter(
		(l) => !l.deletedAt && !l.convertedAt && l.status !== "converted",
	).length;
	const leadsTotal = leads.length;
	const contactsActive = contacts.filter((c) => !c.deletedAt).length;
	const companiesActive = companies.filter((c) => !c.deletedAt).length;
	const openDeals = deals.filter((d) => !d.deletedAt && !d.wonAt && !d.lostAt);
	const dealsOpen = openDeals.length;
	const dealsWon = deals.filter((d) => !d.deletedAt && !!d.wonAt).length;
	const dealsLost = deals.filter((d) => !d.deletedAt && !!d.lostAt).length;
	const dealsPipelineValue = openDeals.reduce(
		(sum, d) => sum + (typeof d.value === "number" ? d.value : 0),
		0,
	);
	const membersActive = members.filter((m) => !m.deletedAt).length;

	return {
		leadsOpen,
		leadsTotal,
		contactsActive,
		companiesActive,
		dealsOpen,
		dealsWon,
		dealsLost,
		dealsPipelineValue,
		membersActive,
	};
}

/**
 * Overwrite a single counter for a given org. Inserts the row if missing,
 * patches it otherwise. No-op when the value is unchanged.
 */
async function setStat(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	key: string,
	value: number,
): Promise<void> {
	const existing = await ctx.db
		.query("orgStats")
		.withIndex("by_org_and_key", (q) => q.eq("orgId", orgId).eq("key", key))
		.first();
	const now = Date.now();
	if (!existing) {
		await ctx.db.insert("orgStats", { orgId, key, value, updatedAt: now });
	} else if (existing.value !== value) {
		await ctx.db.patch(existing._id, { value, updatedAt: now });
	}
}

/**
 * Live mutation — recomputes counters and writes them back.
 *
 * Args:
 *   - orgId (optional) — recompute one org. Omit to recompute every org.
 *
 * Returns: a list of `{ orgId, name, before, after }` for audit / log.
 * Useful when a user reports drift and we want to confirm the fix.
 *
 * Invoked weekly via `convex/crons.ts`; also runnable from the CLI
 * (see module docstring).
 */
export const recomputeOrgStats = internalMutation({
	args: { orgId: v.optional(v.id("orgs")) },
	handler: async (ctx, args) => {
		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => !!o)
			: await ctx.db.query("orgs").collect();

		const report: Array<{
			orgId: Id<"orgs">;
			orgName: string;
			before: Record<string, number>;
			after: ComputedStats;
		}> = [];

		for (const org of orgs) {
			const orgId = org._id;

			// Snapshot existing counters for the audit report.
			const existing = await ctx.db
				.query("orgStats")
				.withIndex("by_org_and_key", (q) => q.eq("orgId", orgId))
				.collect();
			const before: Record<string, number> = {};
			for (const r of existing) before[r.key] = r.value;

			// Compute the truth.
			const after = await computeOrgStats(ctx, orgId);

			// Overwrite each counter.
			await setStat(ctx, orgId, "leads.open", after.leadsOpen);
			await setStat(ctx, orgId, "leads.total", after.leadsTotal);
			await setStat(ctx, orgId, "contacts.active", after.contactsActive);
			await setStat(ctx, orgId, "companies.active", after.companiesActive);
			await setStat(ctx, orgId, "deals.open", after.dealsOpen);
			await setStat(ctx, orgId, "deals.won", after.dealsWon);
			await setStat(ctx, orgId, "deals.lost", after.dealsLost);
			await setStat(ctx, orgId, "deals.pipelineValue", after.dealsPipelineValue);
			await setStat(ctx, orgId, "members.active", after.membersActive);

			report.push({ orgId, orgName: org.name, before, after });
		}

		return { recomputedOrgs: report.length, report };
	},
});

/**
 * Dry-run version — logs what *would* change without writing. Useful when
 * verifying behaviour against production data.
 */
export const recomputeOrgStatsDryRun = internalMutation({
	args: { orgId: v.optional(v.id("orgs")) },
	handler: async (ctx, args) => {
		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => !!o)
			: await ctx.db.query("orgs").collect();

		const report: Array<{
			orgId: Id<"orgs">;
			orgName: string;
			diffs: Record<string, { before: number; after: number }>;
		}> = [];

		for (const org of orgs) {
			const orgId = org._id;

			const existing = await ctx.db
				.query("orgStats")
				.withIndex("by_org_and_key", (q) => q.eq("orgId", orgId))
				.collect();
			const before: Record<string, number> = {};
			for (const r of existing) before[r.key] = r.value;

			const after = await computeOrgStats(ctx, orgId);
			const map: Record<string, number> = {
				"leads.open": after.leadsOpen,
				"leads.total": after.leadsTotal,
				"contacts.active": after.contactsActive,
				"companies.active": after.companiesActive,
				"deals.open": after.dealsOpen,
				"deals.won": after.dealsWon,
				"deals.lost": after.dealsLost,
				"deals.pipelineValue": after.dealsPipelineValue,
				"members.active": after.membersActive,
			};
			const diffs: Record<string, { before: number; after: number }> = {};
			for (const [k, val] of Object.entries(map)) {
				const prev = before[k] ?? 0;
				if (prev !== val) diffs[k] = { before: prev, after: val };
			}
			report.push({ orgId, orgName: org.name, diffs });
		}

		return { wouldRecompute: report.length, report };
	},
});
