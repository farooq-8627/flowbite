/**
 * convex/ai/chatAttachments.ts
 *
 * Phase 4 Part 2 — File-attach in chat. Bridges the existing
 * `_storage` upload flow with the chat conversation lifecycle.
 *
 * Flow:
 *   1. Frontend calls `files.generateUploadUrl` → uploads bytes →
 *      gets `storageId`.
 *   2. Frontend calls `chatAttachments.attach` with the storageId +
 *      metadata. We create a `files` row scoped to the conversation
 *      (`scope: "aiChat"`, `scopeId: conversationId`) so the file
 *      respects the same trash / quota / permission story as every
 *      other attachment in the app.
 *   3. The mutation returns `{ fileId }` which the composer prepends
 *      to the chat message body as `[Attached file:abc123 "name.jpg"]`.
 *      The AI sees the fileId inline and can call `analyze_file({
 *      fileId })` directly when relevant.
 *
 * Why a dedicated mutation: `files/mutations:record` requires the
 * `files.upload` permission which is broadly granted, but the file
 * size / mime checks there expect a real entity record (lead/contact/
 * deal/company) at `scope`. We bypass that path with a chat-specific
 * scope so the size cap is the only check that runs.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../_functions/authenticated";
import { requireRole } from "../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";

const DEFAULT_MAX_SIZE_MB = 25;

export const attach = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		storageId: v.id("_storage"),
		name: v.string(),
		size: v.number(),
		mimeType: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId, org } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");

		// Verify the conversation belongs to this org + user before we
		// scope a file under it.
		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) {
			throw new ConvexError({
				code: "CONVERSATION_NOT_FOUND",
				message: "Conversation not found.",
			});
		}
		if (conversation.userId !== userId) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Cannot attach to another user's conversation.",
			});
		}

		await enforceRateLimit(ctx, {
			scope: "ai.chat.attach",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.upload,
		});

		const maxSizeMb = org.settings?.fileUpload?.maxSizeMb ?? DEFAULT_MAX_SIZE_MB;
		if (args.size <= 0 || args.size > maxSizeMb * 1024 * 1024) {
			throw new ConvexError({
				code: "FILE_TOO_LARGE",
				message: `File exceeds the ${maxSizeMb} MB workspace limit.`,
				maxSizeMb,
			});
		}

		const now = Date.now();
		const fileId = await ctx.db.insert("files", {
			orgId: args.orgId,
			storageId: args.storageId,
			scope: "aiChat",
			scopeId: args.conversationId,
			name: args.name,
			size: args.size,
			mimeType: args.mimeType,
			uploadedBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		return { fileId };
	},
});
