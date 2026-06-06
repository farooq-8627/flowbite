/**
 * convex/ai/_logAIActivityInternal.ts
 *
 * Thin internalMutation wrapper around logActivity for use from
 * internalAction (processChat, tools, registry/audit) via ctx.runMutation.
 *
 * `metadata` is the structured blob that the S12 audit feed reads — see
 * `convex/ai/registry/audit.ts:writeAudit` for the canonical shape (status /
 * channel / source / riskTier / module / group / argKeys / argSummary /
 * conversationId / errorCount / argTruncated). It MUST match the
 * activityLogs schema validator (string | number | boolean values only).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { logActivity } from "../activityLogs/helpers";

export const logAIActivity = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		action: v.string(),
		entityType: v.string(),
		entityId: v.string(),
		personCode: v.optional(v.string()),
		description: v.optional(v.string()),
		toolName: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	},
	handler: async (ctx, args) => {
		// Merge `toolName` (legacy single-key callers) with the structured
		// `metadata` blob (S12 audit feed). Explicit metadata wins on conflict.
		const merged: Record<string, string | number | boolean> = {};
		if (args.toolName) merged.toolName = args.toolName;
		if (args.metadata) Object.assign(merged, args.metadata);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			actorType: "ai",
			action: args.action,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: args.description ?? `AI tool: ${args.action}`,
			metadata: Object.keys(merged).length > 0 ? merged : undefined,
		});
	},
});
