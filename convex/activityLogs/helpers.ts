/**
 * Activity log helper — internal use only.
 *
 * Call logActivity() from feature mutations to record audit trail.
 * Always uses internalMutation pattern (R6).
 *
 * actorType distinguishes AI vs human vs integration actions. Defaults to "user".
 * AI tool calls must pass actorType: "ai". Integration jobs pass "integration".
 * Email content belongs in emailMessages table (Phase 4) — not here.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/activityLogs.ts
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ActorType } from "../_shared/validators";

export type ActivityLogInput = {
	orgId: Id<"orgs">;
	userId: Id<"users">; // actor identity — always required, even for AI actions
	actorType?: ActorType; // defaults to "user" — AI calls pass "ai"
	action: string; // "created" | "updated" | "deleted" | custom verb
	entityType: string; // from ENTITY_TYPES constants
	entityId: string;
	personCode?: string; // denormalized for timeline queries — pass when action relates to a person
	description?: string;
	metadata?: Record<string, string | number | boolean>;
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
		actorType: input.actorType ?? "user",
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		personCode: input.personCode,
		description: input.description,
		metadata: input.metadata,
		createdAt: Date.now(),
	});
}
