/**
 * convex/ai/messages.ts
 *
 * Message reads (public queries) + internal write helpers for processChat.
 * Public write entries: sendMessage (schedules processChat) + confirmConfirmation (two-step gate).
 */

import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";
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
		// P1.13 — broad page-mode info from the frontend, used by the
		// `## Current page` block in the system prompt.
		pageContext: v.optional(
			v.object({
				mode: v.union(
					v.literal("entity"),
					v.literal("list"),
					v.literal("dashboard"),
					v.literal("calendar"),
					v.literal("settings"),
					v.literal("reports"),
					v.literal("other"),
				),
				path: v.string(),
				label: v.optional(v.string()),
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
			pageContext: args.pageContext,
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

/**
 * Week 3.4 — `PHASE-3-AI-AUDIT.md §6 Week 3` & §2.2 (AI SDK v6 native HITL).
 *
 * Alias of `confirmConfirmation` that matches the AI SDK v6 cookbook's
 * `addToolApprovalResponse({approved, toolApprovalId, ...})` signature.
 *
 * The full AI SDK v6 native flow keeps `streamText` alive until the user
 * responds — incompatible with our DB-streamed resume model. We adopt the
 * SDK's NAME + ARG SHAPE so frontend code reads the same as in the SDK
 * cookbook, but server-side we still flip a row from `pending → approved`
 * and schedule `processChat.resume`. See `Future-Enhancements.md §B.8`.
 *
 * If the underlying tool's `needsApproval` was a function form (e.g.
 * "auto-approve under 50 rows"), the frontend should NOT call this for
 * the auto-approved case — those calls run inline server-side.
 */
export const addToolApprovalResponse = orgMutation({
	args: {
		orgId: v.id("orgs"),
		toolApprovalId: v.id("aiMessages"),
		approved: v.boolean(),
		editedArgs: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");

		const msg = await ctx.db.get(args.toolApprovalId);
		if (!msg || msg.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (msg.confirmationState !== "pending") {
			throw new ConvexError("Confirmation is no longer pending.");
		}

		const conv = await ctx.db.get(msg.conversationId);
		if (!conv || conv.userId !== userId) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.toolApprovalId, {
			confirmationState: args.approved ? "approved" : "rejected",
			...(args.editedArgs
				? {
						confirmationPayload: {
							...msg.confirmationPayload,
							editedArgs: args.editedArgs,
						},
					}
				: {}),
		});

		if (args.approved) {
			await ctx.scheduler.runAfter(0, processChatResume, {
				orgId: args.orgId,
				userId,
				conversationId: msg.conversationId,
				confirmedMessageId: args.toolApprovalId,
				editedPayload: args.editedArgs,
			});
		}
	},
});

/**
 * Week 3.4 — mirrors AI SDK v6's
 * `lastAssistantMessageIsCompleteWithApprovalResponses(messages)` helper.
 *
 * Returns `true` when the most recent assistant turn has fully settled
 * AND every tool message in that turn has either been rejected or has a
 * commit_* counterpart. Frontend hooks (`useAIChat`) use this to decide
 * whether the composer should be enabled.
 *
 * This is a server-side exported pure function, NOT a Convex query — it
 * operates on a list of message rows the caller already has in memory
 * (e.g. from `useQuery(api.ai.messages.listForConversation)`).
 */
export function lastAssistantMessageIsCompleteWithApprovalResponses(
	messages: Array<{
		role: string;
		thinkingState?: string;
		confirmationState?: string;
	}>,
): boolean {
	if (messages.length === 0) return true;
	const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
	if (!lastAssistant) return true;
	const ts = lastAssistant.thinkingState;
	if (ts !== "done" && ts !== "error") return false;
	// Any tool message after the last user turn that's still pending → not complete.
	const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
	const tail = lastUserIdx === -1 ? messages : messages.slice(lastUserIdx + 1);
	const stillPending = tail.some((m) => m.role === "tool" && m.confirmationState === "pending");
	return !stillPending;
}

// ─── Public mutation: cancel an in-flight assistant stream ────────────────────

/**
 * Cancel the live assistant message the orchestrator is currently writing.
 *
 * Mirrors Claude / ChatGPT's Stop button: the UI fires this when the user
 * hits the Stop button or Cmd+. (Mac) / Ctrl+. (Win) while a message is
 * streaming. We patch the live message to a terminal `done` state with an
 * `aborted: true` flag and append a small `[cancelled]` marker to whatever
 * text streamed before. processChat's stream loop polls this flag between
 * chunks and exits early.
 *
 * Idempotent — calling it on a message that's already settled is a no-op.
 */
export const cancelStream = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("aiMessages"),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);

		const msg = await ctx.db.get(args.messageId);
		if (!msg || msg.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Ownership: only the user that owns the conversation can cancel.
		const conv = await ctx.db.get(msg.conversationId);
		if (!conv || conv.userId !== userId) throw new ConvexError(ERRORS.FORBIDDEN);

		// Idempotent — already settled.
		const ts = msg.thinkingState;
		if (ts === "done" || ts === "error") return { ok: true, alreadySettled: true };

		const stamped = msg.content
			? `${msg.content}\n\n_[cancelled]_`
			: "_[cancelled before any output]_";

		await ctx.db.patch(args.messageId, {
			content: stamped,
			thinkingState: "done",
			aborted: true,
			cancelledBy: userId,
		});

		return { ok: true, alreadySettled: false };
	},
});

// ─── Public mutation: regenerate the last assistant turn ──────────────────────

/**
 * Re-run the model on the same conversation, taking the last user message
 * as the prompt. Drops any in-progress / failed assistant turn that follows
 * it and schedules a fresh processChat run.
 *
 * Mirrors ChatGPT's "Regenerate response" button.
 */
export const regenerate = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
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

		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		// Walk the message log backwards to find the most recent user message.
		// Drop any assistant/tool messages between it and `now`.
		const all = await ctx.db
			.query("aiMessages")
			.withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
			.order("desc")
			.take(50);

		const lastUser = all.find((m) => m.role === "user");
		if (!lastUser) throw new ConvexError("No user message to regenerate from.");

		// Hard-delete every message AFTER the last user turn (in chronological
		// order, that's everything we just walked past in `all` BEFORE the
		// match). We compare createdAt to be safe across docs with the same
		// timestamp.
		for (const m of all) {
			if (m._id === lastUser._id) break;
			if (m.createdAt < lastUser.createdAt) continue; // shouldn't happen
			await ctx.db.delete(m._id);
		}

		await ctx.db.patch(args.conversationId, {
			lastMessageAt: Date.now(),
			updatedAt: Date.now(),
		});

		await ctx.scheduler.runAfter(0, processChatRun, {
			orgId: args.orgId,
			userId,
			conversationId: args.conversationId,
			userMessageId: lastUser._id,
			model: args.model ?? conv.defaultModel,
			provider: args.provider ?? conv.defaultProvider,
			routeContext: undefined,
			expandedLayers: args.expandedLayers ?? [],
		});

		return { ok: true, userMessageId: lastUser._id };
	},
});

// ─── Public mutation: edit a user turn and re-run from there ──────────────────

/**
 * ChatGPT-style "Edit & Re-send": replace the body of an earlier user
 * message and discard every later turn, then re-run the model from there.
 * Useful when the user mistyped or wants to refine the prompt without
 * starting a new conversation.
 */
export const editAndResend = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("aiMessages"),
		body: v.string(),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
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

		const target = await ctx.db.get(args.messageId);
		if (!target || target.orgId !== args.orgId || target.role !== "user") {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const conv = await ctx.db.get(target.conversationId);
		if (!conv || conv.userId !== userId) throw new ConvexError(ERRORS.FORBIDDEN);

		const trimmed = args.body.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);
		const body = trimmed.slice(0, 8000);

		// Update the message body in place.
		await ctx.db.patch(args.messageId, { content: body });

		// Drop everything that came AFTER this message in the same conversation.
		const later = await ctx.db
			.query("aiMessages")
			.withIndex("by_conversation", (q) =>
				q.eq("conversationId", target.conversationId).gt("createdAt", target.createdAt),
			)
			.collect();
		for (const m of later) {
			await ctx.db.delete(m._id);
		}

		await ctx.db.patch(target.conversationId, {
			lastMessageAt: Date.now(),
			updatedAt: Date.now(),
		});

		await ctx.scheduler.runAfter(0, processChatRun, {
			orgId: args.orgId,
			userId,
			conversationId: target.conversationId,
			userMessageId: args.messageId,
			model: args.model ?? conv.defaultModel,
			provider: args.provider ?? conv.defaultProvider,
			routeContext: undefined,
			expandedLayers: args.expandedLayers ?? [],
		});

		return { ok: true };
	},
});

// ─── Internal queries / mutations — called ONLY from processChat ─────────────

/**
 * Internal-only variant of `listForConversation` for the processChat
 * orchestrator. Skips the `requireOrgMember` auth wrapper because the
 * caller is an internalAction that has already verified org membership
 * via `getMemberWithPermissions` — re-running auth would just throw
 * (`internalAction` runs with a service identity, not a user identity).
 *
 * Returns the same shape as the public query.
 */
export const listForConversationInternal = internalQuery({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Defense in depth: confirm the conversation actually belongs to the
		// org the caller passed. This prevents a hypothetical bug elsewhere
		// from leaking messages across orgs even though only internalActions
		// can reach this function.
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId) return [];

		const limit = Math.min(args.limit ?? 200, 500);
		return await ctx.db
			.query("aiMessages")
			.withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
			.order("asc")
			.take(limit);
	},
});

/**
 * Cheap abort-flag check called from processChat between stream chunks.
 * Returns true the moment the user's `cancelStream` mutation lands.
 */
export const isAborted = internalQuery({
	args: { messageId: v.id("aiMessages") },
	handler: async (ctx, args) => {
		const m = await ctx.db.get(args.messageId);
		return !!m?.aborted;
	},
});

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
			thinkingState: "thinking", // Claude/OpenAI-style: starts in thinking phase
			createdAt: now,
		});
	},
});

/**
 * Insert a synthesised user message and return its id.
 *
 * Used by the `ask_user_choice` resume flow in `processChat.resume`: when
 * the user picks one option, we synthesise a user-role message
 * (`User picked: <label>. Continue with the original task.`) so the model
 * can pick the conversation back up cleanly. No auth wrapper because the
 * calling action already authenticated via getOrgMemberAndPermissions.
 */
export const appendUserMessage = internalMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId: args.conversationId,
			role: "user",
			content: args.body,
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
		thinkingState: v.optional(
			v.union(
				v.literal("thinking"),
				v.literal("calling_tool"),
				v.literal("streaming"),
				v.literal("done"),
				v.literal("error"),
			),
		),
		activeTool: v.optional(v.string()),
		reasoning: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Defensive: the message may have been deleted between scheduling
		// and execution (user cancelled the chat, conversation purged,
		// etc.). Bug 2026-05-24: previously crashed processChat:run with
		// "Update on nonexistent document ID" — silent return is the
		// correct behaviour; the placeholder is gone, there's nothing to
		// patch.
		const existing = await ctx.db.get(args.messageId);
		if (!existing) {
			console.warn(
				`[patchAssistantBody] skipped: message ${args.messageId} no longer exists`,
			);
			return;
		}
		await ctx.db.patch(args.messageId, {
			content: args.content,
			...(args.model ? { model: args.model } : {}),
			...(args.provider ? { provider: args.provider } : {}),
			...(args.usageMode ? { usageMode: args.usageMode } : {}),
			...(args.inputTokens !== undefined ? { inputTokens: args.inputTokens } : {}),
			...(args.outputTokens !== undefined ? { outputTokens: args.outputTokens } : {}),
			...(args.thinkingState ? { thinkingState: args.thinkingState } : {}),
			...(args.activeTool ? { activeTool: args.activeTool } : {}),
			...(args.reasoning !== undefined ? { reasoning: args.reasoning } : {}),
		});
	},
});

/**
 * Fine-grained thinking-state transition without touching content.
 * Used by processChat to publish phases the user sees in the
 * "Thinking…" / "Calling tool…" indicator.
 *
 * Reasoning is capped at REASONING_HARD_CAP bytes. We keep the HEAD
 * (the early steps where the model planned the work) + a marker line,
 * not the tail — losing the start of the chain-of-thought is more
 * confusing for the user than losing the late retries.
 */
const REASONING_HARD_CAP = 8_000;
const REASONING_TRUNCATION_MARKER =
	"\n… [reasoning truncated — too many steps, see chat for outcome] …";

export const patchThinkingState = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		thinkingState: v.union(
			v.literal("thinking"),
			v.literal("calling_tool"),
			v.literal("streaming"),
			v.literal("done"),
			v.literal("error"),
		),
		activeTool: v.optional(v.string()),
		// `null` clears the field; undefined leaves it unchanged.
		reasoningAppend: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const msg = await ctx.db.get(args.messageId);
		if (!msg) return;

		let nextReasoning = msg.reasoning;
		if (args.reasoningAppend && args.reasoningAppend.length > 0) {
			const existing = msg.reasoning ?? "";
			const sep = existing ? "\n" : "";
			const candidate = `${existing}${sep}${args.reasoningAppend}`;

			if (candidate.length <= REASONING_HARD_CAP) {
				nextReasoning = candidate;
			} else if (existing.endsWith(REASONING_TRUNCATION_MARKER)) {
				// Already truncated — drop the new append silently.
				nextReasoning = existing;
			} else {
				// Cap reached for the first time. Keep the head + marker.
				const room = REASONING_HARD_CAP - REASONING_TRUNCATION_MARKER.length;
				nextReasoning = `${existing.slice(0, Math.max(0, room))}${REASONING_TRUNCATION_MARKER}`;
			}
		}

		await ctx.db.patch(args.messageId, {
			thinkingState: args.thinkingState,
			...(args.activeTool !== undefined ? { activeTool: args.activeTool } : {}),
			...(nextReasoning !== msg.reasoning ? { reasoning: nextReasoning } : {}),
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
		const existing = await ctx.db.get(args.messageId);
		if (!existing) return;
		await ctx.db.patch(args.messageId, {
			confirmationState: "pending",
			confirmationPayload: args.payload,
		});
	},
});

/**
 * Sprint 5 — attach 2-3 follow-up prompt suggestions to a settled
 * assistant message. The orchestrator calls this AFTER the stream
 * loop finishes (state=`done`); the UI's `Suggestions.tsx` reads
 * `aiMessages.suggestions` and renders clickable chips above the
 * composer. `suggestions` is optional → empty arrays just clear any
 * stale chips on regenerate.
 */
export const patchSuggestions = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		suggestions: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.messageId);
		if (!existing) return;
		await ctx.db.patch(args.messageId, {
			suggestions: args.suggestions.slice(0, 3),
		});
	},
});

/**
 * Week 2.3 — record the subagent the router picked for this assistant
 * turn. Called from `processChat.run` immediately after `classifyRequest`
 * returns, BEFORE the stream loop runs. Idempotent — re-stamping the
 * same id is a no-op.
 *
 * Stored as a free-form string (not a v.union of literals) so adding a
 * new subagent id doesn't require a schema migration; the router's
 * classifier already coerces unknown ids to the fallback subagent.
 */
export const patchAssistantSubagent = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		subagent: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, { subagent: args.subagent });
	},
});
