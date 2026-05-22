/**
 * convex/ai/messages.ts
 *
 * Message reads (public queries) + internal write helpers for processChat.
 * Public write entries: sendMessage (schedules processChat) + confirmConfirmation (two-step gate).
 */

import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { internalMutation } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";

// Forward references resolved after codegen (convex dev regenerates _generated/api.d.ts).
// Using makeFunctionReference to avoid circular import issues at codegen time.
const processChatRun = makeFunctionReference<"action", Record<string, unknown>, null>(
	"ai/processChat:run",
);
const processChatResume = makeFunctionReference<"action", Record<string, unknown>, null>(
	"ai/processChat:resume",
);

// ─── Public queries ───────────────────────────────────────────────────────────

/** Stream-ready: lists messages for a conversation. useQuery subscribes reactively. */
export const listForConversation = orgQuery({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);

		// Ownership check
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) return [];

		const limit = Math.min(args.limit ?? 200, 500);
		return await ctx.db
			.query("aiMessages")
			.withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
			.order("asc")
			.take(limit);
	},
});

// ─── Public mutation: send a message (entry point) ───────────────────────────

/**
 * Appends the user message, creates/resumes conversation, then schedules
 * processChat as a background internalAction. The UI subscribes to
 * listForConversation and picks up the streaming assistant reply reactively.
 */
export const sendMessage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.optional(v.id("aiConversations")),
		body: v.string(),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		// Route context injected by frontend (only when aiAutoContextLoad is true)
		routeContext: v.optional(
			v.object({
				entityType: v.string(),
				entityId: v.string(),
				personCode: v.optional(v.string()),
				dealCode: v.optional(v.string()),
				name: v.optional(v.string()),
				aiContextSummary: v.optional(v.string()),
				aiContextKeyFacts: v.optional(v.array(v.string())),
			}),
		),
		expandedLayers: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");
		await enforceRateLimit(ctx, {
			scope: "ai.chat",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.ai,
		});

		if (args.body.trim().length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);
		const body = args.body.trim().slice(0, 8000); // guard runaway inputs

		const now = Date.now();

		// Resolve or create conversation
		let conversationId = args.conversationId;
		if (!conversationId) {
			conversationId = await ctx.db.insert("aiConversations", {
				orgId: args.orgId,
				userId,
				status: "active",
				defaultModel: args.model,
				defaultProvider: args.provider,
				lastMessageAt: now,
				createdAt: now,
				updatedAt: now,
			});
		} else {
			// Verify ownership
			const conv = await ctx.db.get(conversationId);
			if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
				throw new ConvexError(ERRORS.NOT_FOUND);
			}
			await ctx.db.patch(conversationId, {
				lastMessageAt: now,
				updatedAt: now,
			});
		}

		// Append user message
		const userMsgId = await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId,
			role: "user",
			content: body,
			createdAt: now,
		});

		// Schedule AI inference
		await ctx.scheduler.runAfter(0, processChatRun, {
			orgId: args.orgId,
			userId,
			conversationId,
			userMessageId: userMsgId,
			model: args.model,
			provider: args.provider,
			routeContext: args.routeContext,
			expandedLayers: args.expandedLayers ?? [],
		});

		return { conversationId, userMessageId: userMsgId };
	},
});

// ─── Public mutation: approve or reject a two-step confirmation ───────────────

export const confirmConfirmation = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("aiMessages"),
		decision: v.union(v.literal("approved"), v.literal("rejected")),
		editedPayload: v.optional(v.any()), // user edited args before approving
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");

		const msg = await ctx.db.get(args.messageId);
		if (!msg || msg.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (msg.confirmationState !== "pending") {
			throw new ConvexError("Confirmation is no longer pending.");
		}

		// Ownership: confirm the conversation belongs to this user
		const conv = await ctx.db.get(msg.conversationId);
		if (!conv || conv.userId !== userId) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.messageId, {
			confirmationState: args.decision,
			...(args.editedPayload
				? {
						confirmationPayload: {
							...msg.confirmationPayload,
							editedArgs: args.editedPayload,
						},
					}
				: {}),
		});

		// If approved, resume the agent loop
		if (args.decision === "approved") {
			await ctx.scheduler.runAfter(0, processChatResume, {
				orgId: args.orgId,
				userId,
				conversationId: msg.conversationId,
				confirmedMessageId: args.messageId,
				editedPayload: args.editedPayload,
			});
		}
	},
});

// ─── Internal mutations — called ONLY from processChat ───────────────────────

export const appendAssistantPlaceholder = internalMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId: args.conversationId,
			role: "assistant",
			content: "", // progressively patched by processChat
			createdAt: now,
		});
	},
});

export const patchAssistantBody = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		content: v.string(),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		usageMode: v.optional(v.union(v.literal("platform"), v.literal("byok"))),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, {
			content: args.content,
			...(args.model ? { model: args.model } : {}),
			...(args.provider ? { provider: args.provider } : {}),
			...(args.usageMode ? { usageMode: args.usageMode } : {}),
			...(args.inputTokens !== undefined ? { inputTokens: args.inputTokens } : {}),
			...(args.outputTokens !== undefined ? { outputTokens: args.outputTokens } : {}),
		});
	},
});

export const appendToolCallRecord = internalMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		toolName: v.string(),
		toolCallId: v.string(),
		input: v.any(),
		output: v.optional(v.any()),
		status: v.union(v.literal("started"), v.literal("completed"), v.literal("failed")),
		confirmationState: v.optional(
			v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
		),
		confirmationPayload: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId: args.conversationId,
			role: "tool",
			content: JSON.stringify({ toolName: args.toolName, status: args.status }),
			toolCalls: [
				{
					id: args.toolCallId,
					name: args.toolName,
					input: args.input,
					output: args.output,
					status: args.status,
				},
			],
			confirmationState: args.confirmationState,
			confirmationPayload: args.confirmationPayload,
			createdAt: now,
		});
	},
});

export const patchToolCallRecord = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		output: v.optional(v.any()),
		status: v.union(v.literal("completed"), v.literal("failed")),
	},
	handler: async (ctx, args) => {
		const msg = await ctx.db.get(args.messageId);
		if (!msg?.toolCalls) return;
		const updated = (msg.toolCalls as Array<Record<string, unknown>>).map((tc) => ({
			...tc,
			output: args.output,
			status: args.status,
		}));
		await ctx.db.patch(args.messageId, {
			toolCalls: updated,
			content: JSON.stringify({ status: args.status }),
		});
	},
});

export const setConfirmationPending = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		payload: v.any(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, {
			confirmationState: "pending",
			confirmationPayload: args.payload,
		});
	},
});
