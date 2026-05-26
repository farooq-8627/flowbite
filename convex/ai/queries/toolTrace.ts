/**
 * convex/ai/queries/toolTrace.ts
 *
 * Stage 7 of /SPRINT-PLAN.md (T-1 trace UI). Read-only audit trail for an
 * AI conversation: returns every `aiToolEvents` row for a given
 * `aiConversations` doc in step order, plus the conversation header
 * the trace UI renders at the top.
 *
 * RBAC:
 *   - `ai.trace.view` — Stage-7 permission, default Owner+Admin+Member.
 *   - Conversation membership — the calling user MUST be the owner of
 *     the conversation OR hold `messages.viewAll` (admin moderation).
 *     This mirrors how the chat panel already gates `aiMessages.list`.
 *
 * The trace surface intentionally does NOT show the model's prose
 * (those rows live in `aiMessages` and the chat panel already renders
 * them); only the tool calls + outcomes. That keeps the trace UI
 * focused on the question "did the agent do the right thing?" and
 * avoids leaking message content to a viewer who can't see the chat.
 */

import { ConvexError, v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";

export type TraceEvent = {
	id: Id<"aiToolEvents">;
	toolName: string;
	layer?: string;
	startedAt: number;
	durationMs: number;
	ok: boolean;
	errorCode?: string;
	errorMessage?: string;
	model?: string;
	provider?: string;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
};

export type TraceResult = {
	conversation: {
		id: Id<"aiConversations">;
		title?: string;
		userId: Id<"users">;
		entityType?: string;
		entityId?: string;
		createdAt: number;
	} | null;
	events: TraceEvent[];
	totals: {
		eventCount: number;
		errorCount: number;
		totalDurationMs: number;
		totalCostUsd: number;
	};
};

async function readTraceForConversation(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		conversationId: Id<"aiConversations">;
		callerUserId: Id<"users">;
		hasViewAll: boolean;
	},
): Promise<TraceResult> {
	const conversation = await ctx.db.get(args.conversationId);
	if (!conversation || conversation.orgId !== args.orgId) {
		// We don't reveal whether the conversation exists in another org.
		return {
			conversation: null,
			events: [],
			totals: { eventCount: 0, errorCount: 0, totalDurationMs: 0, totalCostUsd: 0 },
		};
	}
	if (!args.hasViewAll && conversation.userId !== args.callerUserId) {
		throw new ConvexError({
			code: ERRORS.UNAUTHORIZED,
			message: "You don't have permission to view this conversation's trace.",
		});
	}

	// Pull the org's events bucketed by startedAt — narrowly bounded by
	// the conversation's createdAt window, then filter by conversationId.
	// (`aiToolEvents` lacks a per-conversation index; the cap of ~120
	// events per conversation keeps the read tiny.)
	const rows = await ctx.db
		.query("aiToolEvents")
		.withIndex("by_org_and_started", (q) =>
			q.eq("orgId", args.orgId).gte("startedAt", conversation._creationTime),
		)
		.collect();
	const filtered = rows
		.filter((r) => r.conversationId === args.conversationId)
		.sort((a, b) => a.startedAt - b.startedAt);

	const events: TraceEvent[] = filtered.map((r) => ({
		id: r._id,
		toolName: r.toolName,
		layer: r.layer,
		startedAt: r.startedAt,
		durationMs: r.durationMs,
		ok: r.ok,
		errorCode: r.errorCode,
		errorMessage: r.errorMessage,
		model: r.model,
		provider: r.provider,
		inputTokens: r.inputTokens,
		outputTokens: r.outputTokens,
		costUsd: r.costUsd,
	}));

	const totals = {
		eventCount: events.length,
		errorCount: events.filter((e) => !e.ok).length,
		totalDurationMs: events.reduce((acc, e) => acc + (e.durationMs ?? 0), 0),
		totalCostUsd: Math.round(events.reduce((acc, e) => acc + (e.costUsd ?? 0), 0) * 100) / 100,
	};

	return {
		conversation: {
			id: conversation._id,
			title: conversation.title,
			userId: conversation.userId,
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			createdAt: conversation._creationTime,
		},
		events,
		totals,
	};
}

// ─── Public + ForAI ─────────────────────────────────────────────────────

export const getToolTraceForConversation = orgQuery({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.trace.view")) {
			return null;
		}
		return readTraceForConversation(ctx, {
			orgId: args.orgId,
			conversationId: args.conversationId,
			callerUserId: userId,
			hasViewAll: member.permissions.includes("messages.viewAll"),
		});
	},
});

export const getToolTraceForConversationForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("aiConversations"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("ai.trace.view")) return null;
		return readTraceForConversation(ctx, {
			orgId: args.orgId,
			conversationId: args.conversationId,
			callerUserId: args.userId,
			hasViewAll: member.permissions.includes("messages.viewAll"),
		});
	},
});

/**
 * Internal helper used by `AIReliabilityCard` to wire the "View trace"
 * link to the most recent failing conversation per tool. Returns null
 * if no failure is recorded for the tool in the last 30 days.
 */
export const getRecentFailingConversationForTool = orgQuery({
	args: {
		orgId: v.id("orgs"),
		toolName: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ conversationId: Id<"aiConversations">; startedAt: number } | null> => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.trace.view")) return null;
		const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const rows = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_tool_and_started", (q) =>
				q.eq("orgId", args.orgId).eq("toolName", args.toolName).gte("startedAt", since),
			)
			.order("desc")
			.take(50);
		const failure = rows.find((r) => !r.ok && r.conversationId !== undefined);
		if (!failure || failure.conversationId === undefined) return null;
		return { conversationId: failure.conversationId, startedAt: failure.startedAt };
	},
});
