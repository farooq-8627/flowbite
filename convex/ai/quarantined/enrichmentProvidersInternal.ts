/**
 * convex/ai/quarantined/enrichmentProvidersInternal.ts
 *
 * Internal queries / mutations the enrichment-provider action calls. The
 * sibling action lives in `enrichmentProviders.ts` (`"use node"`) which
 * cannot define `internalQuery`/`internalMutation` directly.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

export const _getRun = internalQuery({
	args: { enrichmentRunId: v.id("enrichmentRuns") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.enrichmentRunId);
	},
});

export const _patchRun = internalMutation({
	args: {
		enrichmentRunId: v.id("enrichmentRuns"),
		patch: v.any(),
	},
	handler: async (ctx, args) => {
		const patch = (args.patch ?? {}) as Record<string, unknown>;
		await ctx.db.patch(args.enrichmentRunId, {
			...patch,
			updatedAt: Date.now(),
		});
	},
});

export const _createRun = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		targetEntity: v.union(
			v.literal("lead"),
			v.literal("contact"),
			v.literal("company"),
			v.literal("deal"),
		),
		targetEntityId: v.string(),
		targetCode: v.optional(v.string()),
		beforeFields: v.record(v.string(), v.union(v.string(), v.null())),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("enrichmentRuns", {
			orgId: args.orgId,
			userId: args.userId,
			targetEntity: args.targetEntity,
			targetEntityId: args.targetEntityId,
			targetCode: args.targetCode,
			status: "running",
			beforeFields: args.beforeFields,
			providerTrace: [],
			proposedPatch: [],
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const _readRunInternal = internalQuery({
	args: {
		enrichmentRunId: v.id("enrichmentRuns"),
		orgId: v.id("orgs"),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.enrichmentRunId);
		if (!run || run.orgId !== args.orgId) return null;
		return run;
	},
});
