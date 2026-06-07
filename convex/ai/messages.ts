/**
 * convex/ai/messages.ts
 *
 * Message reads (public queries) + internal write helpers for processChat.
 * Public write entry: `sendMessage` (schedules `ai/processChat:run`).
 *
 * Two-step propose/commit was retired in S10 — irreversible capabilities
 * now flow through 2FA step-up (`convex/aiStepUp.ts`) instead. The V1
 * `confirmConfirmation` mutation + `processChat.resume` action are gone.
 */

import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";
import { isDefaultConversationTitle } from "../_shared/aiTitleDefaults";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";

// Forward references resolved after codegen (convex dev regenerates _generated/api.d.ts).
// Using makeFunctionReference to avoid circular import issues at codegen time.
const processChatRun = makeFunctionReference<"action", Record<string, unknown>, null>(
	"ai/processChat:run",
);

// Auto-title runs as a separate internalAction; scheduling it here from
// `sendMessage` (rather than from `processChat.run` step 9) lets the title
// model fire ~1.5s after send instead of after the assistant turn settles.
// `autoTitle` short-circuits if the conversation already has a non-default
// title, so a (theoretical) double-fire is harmless.
const titleGenerationAutoTitle = makeFunctionReference<
	"action",
	{ orgId: string; conversationId: string; firstUserMessage: string },
	unknown
>("ai/titleGeneration:autoTitle");

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
		const isFirstMessage = !args.conversationId;
		// Existing title (if any) — used below to decide whether to
		// re-schedule autoTitle on a follow-up message. Only populated
		// in the "existing conversation" branch; brand-new convos have
		// `title: undefined` so `isDefaultConversationTitle(undefined)`
		// is true and re-scheduling is unconditional via `isFirstMessage`.
		let existingTitle: string | undefined;
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
			existingTitle = conv.title;
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
		});

		// Auto-title at SEND time (audit §4 fix). The title model only
		// needs the user's first message — scheduling here lets the
		// title appear ~1.5s after send, parallel with the main turn,
		// instead of waiting for the assistant reply to settle. The
		// `autoTitle` action short-circuits when a non-default title
		// already exists, so re-runs are no-ops. Fires when:
		//   1. brand-new conversation (`isFirstMessage`), OR
		//   2. existing convo whose title is still a default placeholder
		//      ("New chat" / "New Chat" / "Untitled conversation" / empty).
		// Case 2 covers the failure mode where the user's first message
		// was vague ("hi") and the title model wrote "New chat", but a
		// later, descriptive message could have produced a real title.
		// The Node action's pre-check + `setAutoTitleInternal`'s guard
		// both honour the same default-title set, so the worst case is
		// one extra (cheap) title-model call per follow-up turn.
		const titleNeedsUpdate = isFirstMessage || isDefaultConversationTitle(existingTitle);
		if (titleNeedsUpdate && body.length > 10) {
			await ctx.scheduler.runAfter(0, titleGenerationAutoTitle, {
				orgId: args.orgId,
				conversationId,
				firstUserMessage: body.slice(0, 400),
			});
		}

		return { conversationId, userMessageId: userMsgId };
	},
});

// ─── Public mutation: approve or reject a two-step confirmation ───────────────
//
// S10 retired the V1 propose/commit flow. Two-step confirmation in V2 is the
// 2FA step-up handled by `convex/aiStepUp.ts:confirmStepUp` — this surface
// is intentionally gone so the frontend can't accidentally trip a stale
// approval on V1-shaped messages that no longer exist.

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

/**
 * Read a small projection of an assistant message by id.
 *
 * Used by `processChat.runResume` (`convex/ai/orchestrator/run.ts`) to
 * recover the existing bubble's content + state when resuming a
 * 2FA-paused turn. Returns `null` when the message has been deleted
 * between scheduling and execution (user cancelled the chat,
 * conversation purged) so the caller can bail safely.
 *
 * Why a dedicated query instead of `db.get` inline: actions can't
 * touch the DB directly — every read goes through a query. Why not
 * `listForConversationInternal` + filter: that scans the whole
 * conversation for one row.
 *
 * Locked 2026-06-07 — restored after a regression: the prior
 * `runResume` referenced `ai/messages:_readForTest` (which never
 * existed in this file — only in `convex/aiStepUp.ts` as an
 * internalMutation taking `tokenId`), so EVERY 2FA approval threw
 * "function not found" and the assistant message stayed stuck on
 * `thinkingState: "thinking"` forever. The string-path `_ref()` cast
 * to `any` hid the bug from typecheck. The fix is this dedicated
 * query + a test in `convex/ai-runResume.test.ts` that pins the
 * contract.
 */
export const getMessageContent = internalQuery({
	args: { messageId: v.id("aiMessages") },
	handler: async (ctx, args) => {
		const m = await ctx.db.get(args.messageId);
		if (!m) return null;
		return {
			content: m.content,
			thinkingState: m.thinkingState,
			conversationId: m.conversationId,
			orgId: m.orgId,
		};
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
				v.literal("awaiting_approval"),
				v.literal("done"),
				v.literal("error"),
			),
		),
		activeTool: v.optional(v.string()),
		reasoning: v.optional(v.string()),
		// B.44 — provider grounding metadata captured by `runtime/host.ts`
		// post-stream. Currently `{ citations: Citation[] }`; the shape is
		// open-ended so future overflow can land here without a schema rev.
		// Caller passes `undefined` when there's nothing to persist —
		// existing rows that already have metadata are kept untouched.
		metadata: v.optional(v.any()),
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
			...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
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

/**
 * Shared helper: append a reasoning chunk onto an existing string with
 * head-cap behaviour. Returns the next reasoning value to write back.
 *
 * Extracted 2026-05-28 (Stage 0 of DASHBOARD-V2-PLAN.md) so both
 * `patchThinkingState` and the new coalesced `patchAssistantSnapshot`
 * use the same truncation contract — if they ever drift, the AI's
 * reasoning trail on disk would be inconsistent depending on which
 * mutation a code path used.
 */
function appendReasoningWithCap(
	existing: string | undefined,
	append: string | undefined,
): string | undefined {
	if (!append || append.length === 0) return existing;
	const prev = existing ?? "";
	const sep = prev ? "\n" : "";
	const candidate = `${prev}${sep}${append}`;

	if (candidate.length <= REASONING_HARD_CAP) {
		return candidate;
	}
	if (prev.endsWith(REASONING_TRUNCATION_MARKER)) {
		// Already truncated — drop the new append silently.
		return prev;
	}
	// Cap reached for the first time. Keep the head + marker.
	const room = REASONING_HARD_CAP - REASONING_TRUNCATION_MARKER.length;
	return `${prev.slice(0, Math.max(0, room))}${REASONING_TRUNCATION_MARKER}`;
}

export const patchThinkingState = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		thinkingState: v.union(
			v.literal("thinking"),
			v.literal("calling_tool"),
			v.literal("streaming"),
			v.literal("awaiting_approval"),
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

		const nextReasoning = appendReasoningWithCap(msg.reasoning, args.reasoningAppend);

		await ctx.db.patch(args.messageId, {
			thinkingState: args.thinkingState,
			...(args.activeTool !== undefined ? { activeTool: args.activeTool } : {}),
			...(nextReasoning !== msg.reasoning ? { reasoning: nextReasoning } : {}),
		});
	},
});

/**
 * Coalesced body + thinking-state snapshot — the streamLoop's only
 * per-chunk write surface (Stage 0 of DASHBOARD-V2-PLAN.md).
 *
 * Why a third mutation when `patchAssistantBody` and `patchThinkingState`
 * already exist? The streamLoop used to call BOTH on every text-delta
 * burst (body update) AND every reasoning-delta (thinking append).
 * On a 30-second turn that's ~80 mutation calls. By accepting both
 * the (replace) `content` and the (append) `reasoningAppend` in one
 * mutation, plus the live `thinkingState` + `activeTool` flags, the
 * streamLoop can flush a wall-clock-throttled snapshot in a single
 * Convex round-trip. Drops mutation count by ~40% on tool-heavy turns.
 *
 * Semantics:
 *   - `content` REPLACES the body (idempotent re-flushes are safe — the
 *     caller passes the running accumulated text every time).
 *   - `reasoningAppend` APPENDS to whatever `reasoning` the row has on
 *     disk, with the same head-cap behaviour as `patchThinkingState`.
 *   - `thinkingState` / `activeTool` flip the live status the UI shows.
 *   - `model` / `provider` / `usageMode` / `inputTokens` / `outputTokens`
 *     are settled at finish; passing them mid-stream is harmless because
 *     they're set-only (no clear semantics by passing `undefined`).
 *
 * The two legacy mutations (`patchAssistantBody`, `patchThinkingState`)
 * stay live because `resume.ts` and `run.ts` outer-loop call sites
 * (one-shot settles, failover narrative) don't need the coalesced
 * surface and migrating them is out of scope for Stage 0. They share
 * the same `appendReasoningWithCap` helper so behaviour stays in sync.
 */
export const patchAssistantSnapshot = internalMutation({
	args: {
		messageId: v.id("aiMessages"),
		// Body — replace if present.
		content: v.optional(v.string()),
		// Reasoning — append if present.
		reasoningAppend: v.optional(v.string()),
		// Live status flags.
		thinkingState: v.optional(
			v.union(
				v.literal("thinking"),
				v.literal("calling_tool"),
				v.literal("streaming"),
				v.literal("awaiting_approval"),
				v.literal("done"),
				v.literal("error"),
			),
		),
		activeTool: v.optional(v.string()),
		// Final-settle fields (optional, only passed at finish / approval-pause).
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		usageMode: v.optional(v.union(v.literal("platform"), v.literal("byok"))),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.messageId);
		if (!existing) {
			// Same defensive bailout as patchAssistantBody — the message
			// may have been deleted between scheduling and execution.
			console.warn(
				`[patchAssistantSnapshot] skipped: message ${args.messageId} no longer exists`,
			);
			return;
		}

		const nextReasoning = appendReasoningWithCap(existing.reasoning, args.reasoningAppend);

		await ctx.db.patch(args.messageId, {
			...(args.content !== undefined ? { content: args.content } : {}),
			...(args.thinkingState ? { thinkingState: args.thinkingState } : {}),
			...(args.activeTool !== undefined ? { activeTool: args.activeTool } : {}),
			...(args.model ? { model: args.model } : {}),
			...(args.provider ? { provider: args.provider } : {}),
			...(args.usageMode ? { usageMode: args.usageMode } : {}),
			...(args.inputTokens !== undefined ? { inputTokens: args.inputTokens } : {}),
			...(args.outputTokens !== undefined ? { outputTokens: args.outputTokens } : {}),
			...(nextReasoning !== existing.reasoning ? { reasoning: nextReasoning } : {}),
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

// ─── Internal mutation: reap stale assistant streams (cron) ───────────────────

/**
 * Stale-stream reaper — fired every minute by `convex/crons.ts`.
 *
 * If the `runChatTurn` action crashes mid-turn (provider 500, OOM, isolate
 * timeout) the assistant `aiMessages` row is left in a non-terminal
 * `thinkingState` ("thinking" | "calling_tool" | "streaming") forever — the
 * user sees a bubble that spins until they refresh. Nothing else ever flips
 * that row to a terminal state because the only writer (the orchestrator)
 * is dead.
 *
 * This reaper flips any non-terminal row older than `STALE_STREAM_THRESHOLD_MS`
 * to a terminal `done` state with `aborted: true` and a `[stalled]` marker —
 * the SAME shape `cancelStream` produces, so `<AssistantTurn>` already renders
 * it correctly (stops the spinner, shows the aborted badge) with zero UI work.
 *
 * Bounded: queries the `by_thinkingState` index per non-terminal state with a
 * `createdAt < cutoff` range (no `.filter()` full scan, per guidelines) and
 * `.take(REAP_BATCH_PER_STATE)`. A backlog drains over successive ticks.
 *
 * Idempotent: a reaped row is `done`, so it never matches the non-terminal
 * range again. The 5-minute threshold is comfortably longer than any healthy
 * turn (longest observed tool-heavy turn ≈ 60 s) so live streams are untouched.
 */
const STALE_STREAM_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const REAP_BATCH_PER_STATE = 100;
const NON_TERMINAL_STATES = ["thinking", "calling_tool", "streaming"] as const;

export const reapStaleStreams = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - STALE_STREAM_THRESHOLD_MS;
		let reaped = 0;

		for (const state of NON_TERMINAL_STATES) {
			const stale = await ctx.db
				.query("aiMessages")
				.withIndex("by_thinkingState", (q) =>
					q.eq("thinkingState", state).lt("createdAt", cutoff),
				)
				.take(REAP_BATCH_PER_STATE);

			for (const msg of stale) {
				const stamped = msg.content
					? `${msg.content}\n\n_[stalled — please retry]_`
					: "_[stalled — no response received, please retry]_";
				await ctx.db.patch(msg._id, {
					content: stamped,
					thinkingState: "done",
					aborted: true,
				});
				reaped++;
			}
		}

		return { reaped };
	},
});
