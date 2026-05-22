/**
 * convex/ai/_logAIActivityInternal.ts
 *
 * Thin internalMutation wrapper around logActivity for use from
 * internalAction (processChat, tools) via ctx.runMutation.
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
	},
	handler: async (ctx, args) => {
		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			actorType: "ai",
			action: args.action,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: args.description ?? `AI tool: ${args.action}`,
			metadata: args.toolName ? { toolName: args.toolName } : undefined,
		});
	},
});
