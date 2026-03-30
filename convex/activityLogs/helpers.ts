/**
 * Activity log helper — internal use only.
 *
 * Call logActivity() from feature mutations to record audit trail.
 * Always uses internalMutation pattern (R6).
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/activityLogs.ts
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type ActivityLogInput = {
	orgId: Id<"orgs">;
	userId: Id<"users">; // actor
	action: string; // "created" | "updated" | "deleted" | custom verb
	entityType: string; // from ENTITY_TYPES constants
	entityId: string;
	description?: string;
	metadata?: Record<string, unknown>;
};

/**
 * Record an activity log entry. Call after every state-changing mutation.
 */
export async function logActivity(
	ctx: MutationCtx,
	input: ActivityLogInput,
): Promise<Id<"activityLogs">> {
	return await ctx.db.insert("activityLogs", {
		orgId: input.orgId,
		userId: input.userId,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		description: input.description,
		metadata: input.metadata,
		createdAt: Date.now(),
	});
}
