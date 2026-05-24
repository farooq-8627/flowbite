/**
 * convex/ai/quarantined/fileAnalyzerInternal.ts
 *
 * Internal queries/mutations the `fileAnalyzer.ts` action calls. Mirrors
 * the csvParserInternal.ts pattern.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

export const _getAnalysis = internalQuery({
	args: { fileAnalysisId: v.id("fileAnalyses") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.fileAnalysisId);
	},
});

export const _getFileMeta = internalQuery({
	args: { fileId: v.id("files"), orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId) return null;
		return {
			storageId: file.storageId,
			sizeBytes: file.size,
			mimeType: file.mimeType,
			name: file.name,
		};
	},
});

export const _patchAnalysis = internalMutation({
	args: { fileAnalysisId: v.id("fileAnalyses"), patch: v.any() },
	handler: async (ctx, args) => {
		const p = (args.patch ?? {}) as Record<string, unknown>;
		await ctx.db.patch(args.fileAnalysisId, { ...p, updatedAt: Date.now() });
	},
});

export const _createAnalysis = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		fileId: v.id("files"),
		kind: v.union(
			v.literal("passport"),
			v.literal("listing_photo"),
			v.literal("invoice"),
			v.literal("generic"),
		),
		targetEntity: v.optional(
			v.union(
				v.literal("lead"),
				v.literal("contact"),
				v.literal("company"),
				v.literal("deal"),
			),
		),
		targetEntityId: v.optional(v.string()),
		targetCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("fileAnalyses", {
			orgId: args.orgId,
			userId: args.userId,
			fileId: args.fileId,
			kind: args.kind,
			status: "analyzing",
			targetEntity: args.targetEntity,
			targetEntityId: args.targetEntityId,
			targetCode: args.targetCode,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const _readAnalysis = internalQuery({
	args: { fileAnalysisId: v.id("fileAnalyses"), orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const a = await ctx.db.get(args.fileAnalysisId);
		if (!a || a.orgId !== args.orgId) return null;
		return a;
	},
});
