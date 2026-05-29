/**
 * convex/ai/insights/anomalies.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — anomaly cron + on-demand
 * refresh. Built on top of `anomalyDetection.ts` (pure helpers).
 *
 * Two entry points:
 *   - `detectAllOrgs` (cron, daily 06:00 UTC) — paginates active orgs,
 *     runs the per-org scan, writes annotations.
 *   - `refreshForOrgForAI` (ForAI twin) — manual refresh, called by
 *     the `list_anomalies` AI tool's commit when the user asks to
 *     refresh on-demand.
 *
 * V8 — pure DB I/O, no LLM. The LLM-explainer for deal scores lives
 * in `explainDealScore.ts` (`"use node"`).
 */

import { v } from "convex/values";
import { requireOrgMemberByIds } from "../../_functions/authenticated";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";
import { type AnomalyCandidate, scanOrgForAnomalies } from "./anomalyDetection";

/** Annotation TTL for cron-written rows. */
const CRON_ANNOTATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Internal query: scannable orgs ───────────────────────────────────────────

/**
 * Skip free-plan + soft-deleted orgs. Free-plan orgs see anomalies
 * generated only on demand via `refreshForOrgForAI` (saves daily
 * cron runtime on inactive workspaces).
 */
export const listScannableOrgsQuery = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		return orgs
			.filter(
				(o) =>
					!o.deletedAt &&
					(o.plan === "starter" || o.plan === "pro" || o.plan === "enterprise"),
			)
			.map((o) => ({ orgId: o._id }));
	},
});

// ─── Per-org scan + write ─────────────────────────────────────────────────────

/**
 * Internal mutation: scan ONE org and persist annotations. Idempotent —
 * deletes the org's existing cron-written rows before writing new ones
 * so the dashboard never carries stale anomaly chips. User-tool
 * annotations (source !== "cron:detectAnomalies") are left untouched.
 */
export const scanAndWriteForOrg = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();
		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt) return { skipped: "deleted-or-missing" };

		const currency = org.settings?.defaultCurrency ?? "USD";
		const candidates = await scanOrgForAnomalies(ctx, {
			orgId: args.orgId,
			now,
			currency,
		});

		// Replace prior cron-written rows for this org. User-tool rows
		// (source: "ai_tool:annotate_widget") are left untouched.
		const prior = await ctx.db
			.query("dashboardAnnotations")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		for (const row of prior) {
			if (row.source === "cron:detectAnomalies") {
				await ctx.db.delete(row._id);
			}
		}

		const written: Id<"dashboardAnnotations">[] = [];
		for (const c of candidates) {
			const id = await writeAnnotation(ctx, {
				orgId: args.orgId,
				now,
				candidate: c,
				source: "cron:detectAnomalies",
				ttlMs: CRON_ANNOTATION_TTL_MS,
			});
			written.push(id);
		}
		return { written: written.length };
	},
});

/**
 * Cron entry point: paginate every org and schedule the per-org scan.
 *
 * Skips orgs with `deletedAt` set + free-plan orgs. Each org's scan
 * runs inside its own mutation transaction so a single bad org never
 * breaks the whole tick.
 */
export const detectAllOrgs = internalAction({
	args: {},
	handler: async (ctx: ActionCtx) => {
		const orgs = (await ctx.runQuery(
			internal.ai.insights.anomalies.listScannableOrgsQuery,
			{},
		)) as Array<{ orgId: Id<"orgs"> }>;
		let processed = 0;
		for (const { orgId } of orgs) {
			try {
				await ctx.runMutation(internal.ai.insights.anomalies.scanAndWriteForOrg, { orgId });
				processed += 1;
			} catch (err) {
				console.error("[anomalies] scan failed for org", String(orgId), err);
			}
		}
		return { processed };
	},
});

// ─── On-demand refresh (AI tool surface) ──────────────────────────────────────

/**
 * AI-callable: refresh anomalies for the calling user's org. Permission
 * gate: `ai.briefingRefresh` (same as the weekly briefing manual
 * refresh). Re-runs the scan idempotently.
 */
export const refreshForOrgForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.briefingRefresh");

		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt) {
			return { written: 0, skipped: "missing-org" };
		}
		const now = Date.now();
		const currency = org.settings?.defaultCurrency ?? "USD";
		const candidates = await scanOrgForAnomalies(ctx, {
			orgId: args.orgId,
			now,
			currency,
		});

		const prior = await ctx.db
			.query("dashboardAnnotations")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		for (const row of prior) {
			if (row.source === "cron:detectAnomalies") {
				await ctx.db.delete(row._id);
			}
		}

		const written: Id<"dashboardAnnotations">[] = [];
		for (const c of candidates) {
			const id = await writeAnnotation(ctx, {
				orgId: args.orgId,
				now,
				candidate: c,
				source: "cron:detectAnomalies",
				ttlMs: CRON_ANNOTATION_TTL_MS,
			});
			written.push(id);
		}
		return { written: written.length };
	},
});

// ─── Internal helper: write one annotation row ────────────────────────────────

async function writeAnnotation(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		now: number;
		candidate: AnomalyCandidate;
		source: string;
		ttlMs: number;
		createdByUserId?: Id<"users">;
		createdByConversationId?: Id<"aiConversations">;
	},
): Promise<Id<"dashboardAnnotations">> {
	const c = args.candidate;
	return ctx.db.insert("dashboardAnnotations", {
		orgId: args.orgId,
		source: args.source,
		severity: c.severity,
		widgetKey: c.widgetKey ?? "",
		dealId: c.dealId,
		note: c.note.slice(0, 200),
		facts: c.facts?.slice(0, 5).map((f) => f.slice(0, 200)),
		suggestedIntent: c.suggestedIntent?.slice(0, 300),
		createdByUserId: args.createdByUserId,
		createdByConversationId: args.createdByConversationId,
		dismissedByUserIds: [],
		createdAt: args.now,
		expiresAt: args.now + args.ttlMs,
	});
}

// Re-export so the annotate_widget tool's commit can use the same
// row-shape rules without copy-pasting.
export { writeAnnotation as writeAnnotationInternal };
