/**
 * convex/ai/actions/rebuildCohorts.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — nightly cohort rebuild.
 *
 * Walks every active org, runs the deterministic `computeCohorts` over
 * leadSource / industry / owner, and upserts ONE `aiCohortReports` row
 * per (org, kind, periodEnd). Pure deterministic — no LLM call.
 *
 * Architecture:
 *   ┌─ crons.ts: rebuild-ai-cohorts (every 24h)
 *   │
 *   ▼
 *   rebuildAllOrgs (internalAction, V8 — no `use node`)
 *     for each active org:
 *       - listActiveCohortOrgs (internalQuery): enumerate orgs.
 *       - rebuildForOrg (internalMutation): collect data + write rows.
 *
 * Idempotency: each rebuild writes a NEW row per (orgId, kind) — older
 * rows TTL-expire via the `by_expires` index. The latest-by-kind read
 * picks up the newest row, so re-running the cron is a no-op for the
 * UI surface.
 *
 * Empty-data safety: when an org has zero leads/deals, the rollup
 * returns `[]` and the row is still written so downstream code can
 * distinguish "never rebuilt" from "rebuilt and empty".
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../../_generated/server";
import { type CohortKind, computeCohorts } from "../queries/cohorts";

const COHORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COHORT_PERIOD_MS = 90 * 24 * 60 * 60 * 1000; // 90-day rollup window

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;

// ─── List active orgs ────────────────────────────────────────────────────

export const listActiveCohortOrgs = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").take(2000);
		return orgs.filter((o) => o.deletedAt === undefined).map((o) => ({ orgId: o._id }));
	},
});

// ─── Per-org rebuild (mutation — bounded transaction) ────────────────────

export const rebuildForOrg = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<{ orgId: Id<"orgs">; kindsWritten: number }> => {
		const now = Date.now();
		const periodStart = now - COHORT_PERIOD_MS;

		// Pull populations.
		const [leads, contacts, deals, companies, members] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("companies")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
				.collect(),
		]);

		const memberLabelById: Record<string, string> = {};
		for (const m of members) {
			if (m.deletedAt !== undefined) continue;
			const u = await ctx.db.get(m.userId);
			if (u?.name) memberLabelById[m.userId as unknown as string] = u.name;
			else if (u?.email) memberLabelById[m.userId as unknown as string] = u.email;
		}

		const kinds: CohortKind[] = ["leadSource", "industry", "owner"];
		let kindsWritten = 0;
		for (const kind of kinds) {
			const rows = computeCohorts({
				kind,
				leads,
				contacts,
				deals,
				companies,
				memberLabelById,
			});
			await ctx.db.insert("aiCohortReports", {
				orgId: args.orgId,
				kind,
				periodStart,
				periodEnd: now,
				rows,
				generatedAt: now,
				expiresAt: now + COHORT_TTL_MS,
			});
			kindsWritten += 1;
		}
		return { orgId: args.orgId, kindsWritten };
	},
});

// ─── Cron entry ──────────────────────────────────────────────────────────

export const rebuildAllOrgs = internalAction({
	args: {},
	handler: async (ctx): Promise<{ orgs: number; kindsWritten: number; failures: number }> => {
		const orgs = (await ctx.runQuery(
			_ref("ai/actions/rebuildCohorts:listActiveCohortOrgs"),
			{} as never,
		)) as Array<{
			orgId: Id<"orgs">;
		}>;
		let totalKinds = 0;
		let failures = 0;
		for (const { orgId } of orgs) {
			try {
				const result = (await ctx.runMutation(
					_ref("ai/actions/rebuildCohorts:rebuildForOrg"),
					{ orgId } as never,
				)) as { kindsWritten: number };
				totalKinds += result.kindsWritten;
			} catch (err) {
				console.warn("[rebuildCohorts] org failed", { orgId, err });
				failures += 1;
			}
			// Spread the work — 50ms between orgs.
			await new Promise((r) => setTimeout(r, 50));
		}
		return { orgs: orgs.length, kindsWritten: totalKinds, failures };
	},
});

void internal;
