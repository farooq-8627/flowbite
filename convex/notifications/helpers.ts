/**
 * Notification helper — internal use only.
 *
 * Call this from feature mutations to create in-app notifications.
 * Never pass orgId/userId manually — derive from ctx (R10).
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/notifications.ts
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type NotificationInput = {
	orgId: Id<"orgs">;
	userId: Id<"users">; // recipient
	type: string; // e.g. "connection.created", "member.invited"
	title: string;
	body?: string;
	entityType?: string;
	entityId?: string;
	actionUrl?: string;
	metadata?: Record<string, string | number | boolean>;
};

/**
 * Create an in-app notification for a user.
 */
export async function sendNotification(
	ctx: MutationCtx,
	input: NotificationInput,
): Promise<Id<"notifications">> {
	const now = Date.now();
	return await ctx.db.insert("notifications", {
		orgId: input.orgId,
		userId: input.userId,
		type: input.type,
		title: input.title,
		body: input.body,
		entityType: input.entityType,
		entityId: input.entityId,
		actionUrl: input.actionUrl,
		metadata: input.metadata,
		read: false,
		createdAt: now,
		updatedAt: now,
	});
}
