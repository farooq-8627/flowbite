/**
 * convex/dashboard/annotations/mutations.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — dashboard annotation writes.
 *
 * Two mutation surfaces:
 *   - `dismiss` (public + ForAI twin) — per-user adds caller's userId to
 *     the row's `dismissedByUserIds[]`. Idempotent — re-dismissing a row
 *     is a no-op. The annotation chip filters on the current user's
 *     membership, so dismissal is per-user even though the row itself
 *     is org-wide.
 *   - `createFromToolForAI` (internal-only) — called by the AI tool
 *     `commit_annotate_widget` to write a chat-driven annotation. The
 *     anomaly cron writes through `ai/insights/anomalies.ts` directly;
 *     this surface is only for AI-tool-driven annotations.
 *
 * Permission model:
 *   - dismiss: any org member (it's a per-user view tweak; no write to
 *     org-wide state). The shape `dismissedByUserIds.push(userId)` is
 *     additive only.
 *   - createFromToolForAI: caller must hold `ai.use`. The annotate_widget
 *     tool already gates at the tool layer; this is defence-in-depth.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../_functions/authenticated";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { requireRole } from "../../_shared/permissions/helpers";
import { isWidgetKey } from "../../_shared/widgetRegistry";

// ─── dismiss ──────────────────────────────────────────────────────────────────

async function dismissImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		annotationId: Id<"dashboardAnnotations">;
	},
) {
	const row = await ctx.db.get(args.annotationId);
	if (!row || row.orgId !== args.orgId) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	if (row.dismissedByUserIds.includes(args.userId)) return; // idempotent
	await ctx.db.patch(args.annotationId, {
		dismissedByUserIds: [...row.dismissedByUserIds, args.userId],
	});
}

export const dismiss = orgMutation({
	args: {
		orgId: v.id("orgs"),
		annotationId: v.id("dashboardAnnotations"),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		await dismissImpl(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			annotationId: args.annotationId,
		});
	},
});

export const dismissForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		annotationId: v.id("dashboardAnnotations"),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		await dismissImpl(ctx, args);
	},
});

// ─── createFromToolForAI (annotate_widget commit path) ────────────────────────

export const createFromToolForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		widgetKey: v.string(),
		dealId: v.optional(v.id("deals")),
		severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
		note: v.string(),
		facts: v.optional(v.array(v.string())),
		suggestedIntent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.use");

		// Validate widgetKey if non-empty.
		if (args.widgetKey && !isWidgetKey(args.widgetKey)) {
			throw new ConvexError({
				code: "INVALID_WIDGET_KEY",
				message: `Unknown widget '${args.widgetKey}'. Call list_widgets first.`,
			});
		}

		// Validate optional dealId belongs to the org.
		if (args.dealId) {
			const deal = await ctx.db.get(args.dealId);
			if (!deal || deal.orgId !== args.orgId || deal.deletedAt) {
				throw new ConvexError(ERRORS.NOT_FOUND);
			}
		}

		const note = args.note.trim();
		if (note.length === 0) {
			throw new ConvexError(ERRORS.INVALID_ARGS);
		}

		const now = Date.now();
		return ctx.db.insert("dashboardAnnotations", {
			orgId: args.orgId,
			source: "ai_tool:annotate_widget",
			severity: args.severity,
			widgetKey: args.widgetKey ?? "",
			dealId: args.dealId,
			note: note.slice(0, 200),
			facts: args.facts?.slice(0, 5).map((f) => f.slice(0, 200)),
			suggestedIntent: args.suggestedIntent?.slice(0, 300),
			createdByConversationId: args.conversationId,
			createdByUserId: args.userId,
			dismissedByUserIds: [],
			createdAt: now,
			// AI-tool-driven annotations don't auto-expire — the user
			// dismisses them or they're replaced by the cron.
		});
	},
});
