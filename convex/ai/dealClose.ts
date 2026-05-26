/**
 * convex/ai/dealClose.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — non-Node helpers for the
 * `analyzeDealClose` action. Mirror of how `convex/ai/briefingsActions.ts`
 * delegates query + mutation work to `convex/ai/briefings.ts` (because
 * "use node" files cannot define `internalQuery` / `internalMutation`).
 *
 * Exports:
 *   - collectDealContext (internalQuery) — read deal + recent notes +
 *     recent activity in one round trip.
 *   - writeRetrospectiveNote (internalMutation) — auto-create the
 *     `winLoss` note category if it doesn't exist, then insert a
 *     formatted retrospective note linked to the deal.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

const RETRO_NOTE_CATEGORY_NAME = "Win/Loss";
const RETRO_NOTE_CATEGORY_BG = "#fde68a";
const RETRO_NOTE_CATEGORY_TEXT = "#92400e";

export const collectDealContext = internalQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId) {
			return { deal: null, notes: [], activity: [] };
		}

		const [notes, activity] = await Promise.all([
			ctx.db
				.query("notes")
				.withIndex("by_entity", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("entityType", "deal")
						.eq("entityId", args.dealId as unknown as string),
				)
				.order("desc")
				.take(20),
			ctx.db
				.query("activityLogs")
				.withIndex("by_entityType_and_entityId", (q) =>
					q.eq("entityType", "deal").eq("entityId", args.dealId as unknown as string),
				)
				.order("desc")
				.take(20),
		]);

		return {
			deal: {
				_id: deal._id,
				dealCode: deal.dealCode,
				title: deal.title,
				value: deal.value,
				currency: deal.currency,
				outcomeReason: deal.outcomeReason,
				personCode: deal.personCode,
			},
			notes: notes.map((n) => ({ content: n.content ?? "", createdAt: n.createdAt })),
			activity: activity.map((a) => ({
				action: a.action,
				description: a.description,
				createdAt: a.createdAt,
			})),
		};
	},
});

export const writeRetrospectiveNote = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		dealId: v.id("deals"),
		personCode: v.optional(v.string()),
		summary: v.string(),
		findings: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		// 1. Ensure the Win/Loss category exists. Idempotent — if it's
		//    already there we reuse it.
		let category = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_name", (q) =>
				q.eq("orgId", args.orgId).eq("name", RETRO_NOTE_CATEGORY_NAME),
			)
			.first();

		if (!category) {
			const all = await ctx.db
				.query("noteCategories")
				.withIndex("by_org_and_position", (q) => q.eq("orgId", args.orgId))
				.collect();
			const position = all.reduce((m, r) => Math.max(m, r.position), -1) + 1;
			const now = Date.now();
			const newCategoryId = await ctx.db.insert("noteCategories", {
				orgId: args.orgId,
				name: RETRO_NOTE_CATEGORY_NAME,
				bgColor: RETRO_NOTE_CATEGORY_BG,
				textColor: RETRO_NOTE_CATEGORY_TEXT,
				position,
				isDefault: false,
				isArchived: false,
				createdAt: now,
				updatedAt: now,
			});
			category = await ctx.db.get(newCategoryId);
		}

		// 2. Insert a formatted note. We use the canonical notes shape so
		//    it appears in the deal's notes feed (and not the timeline).
		const now = Date.now();
		const findingsText = args.findings.map((f) => `• ${f}`).join("\n");
		const content = `${args.summary}\n\n${findingsText}`;

		const noteId = await ctx.db.insert("notes", {
			orgId: args.orgId,
			authorId: args.userId,
			authorType: "ai",
			entityType: "deal",
			entityId: args.dealId as unknown as string,
			personCode: args.personCode,
			content,
			categoryId: category?._id,
			isPinned: false,
			isInternal: false,
			createdAt: now,
			updatedAt: now,
		});
		return noteId;
	},
});
