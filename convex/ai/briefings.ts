/**
 * convex/ai/briefings.ts
 *
 * AI Morning Briefing — V8 (default Convex runtime) surface only.
 *
 * Internal V8 surface:
 *   - collectUserBriefingData (internalQuery)    — gathers reminders / deals / activity for the prompt.
 *   - insertBriefing          (internalMutation) — replaces the user's cached briefing.
 *   - listEligibleUsers       (internalQuery)    — cron iteration list.
 *
 * The LLM-calling actions (`generate`, `generateForActiveUsers`) live in
 * `./briefingsActions` because they import `./models` ("use node") which
 * pulls in `@ai-sdk/*` Node SDKs. Convex forbids queries/mutations in
 * "use node" files, so the read/write helpers live here and are invoked
 * from the Node action via `ctx.runQuery`/`ctx.runMutation`.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── Internal: collect user's data for briefing context ─────────────────────

export const collectUserBriefingData = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const now = Date.now();
		const dayMs = 24 * 60 * 60 * 1000;

		// Reminders due today (assigned to this user)
		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("assignedTo"), args.userId),
					q.eq(q.field("status"), "pending"),
					q.lte(q.field("dueAt"), now + dayMs),
				),
			)
			.take(20);

		// Open deals assigned to this user
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("deletedAt"), undefined),
					q.eq(q.field("assignedTo"), args.userId),
				),
			)
			.take(50);

		// Recent activity (last 24h)
		const since = now - dayMs;
		const activity = await ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_createdAt", (q) =>
				q.eq("orgId", args.orgId).gte("createdAt", since),
			)
			.take(30);

		const user = await ctx.db.get(args.userId);
		const org = await ctx.db.get(args.orgId);

		return {
			user: { name: user?.name ?? "there" },
			org: {
				name: org?.name ?? "your workspace",
				currency: org?.settings?.defaultCurrency ?? "USD",
			},
			counts: {
				remindersDue: reminders.length,
				openDeals: deals.length,
				activityCount: activity.length,
			},
			reminders: reminders.slice(0, 5).map((r) => ({
				id: r._id,
				title: r.title,
				dueAt: r.dueAt,
				source: r.source,
			})),
			topDeals: deals.slice(0, 5).map((d) => ({
				id: d._id,
				title: d.title,
				value: d.value,
			})),
		};
	},
});

// ─── Internal mutation: persist briefing row ─────────────────────────────────

export const insertBriefing = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		summary: v.string(),
		highlights: v.optional(
			v.array(
				v.object({
					type: v.string(),
					entityType: v.optional(v.string()),
					entityId: v.optional(v.string()),
					entityCode: v.optional(v.string()),
					text: v.string(),
				}),
			),
		),
		model: v.string(),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + 24 * 60 * 60 * 1000;
		// Replace existing briefing for this user — only one active per user
		const existing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.order("desc")
			.first();
		if (existing) {
			await ctx.db.delete(existing._id);
		}
		await ctx.db.insert("aiBriefings", {
			orgId: args.orgId,
			userId: args.userId,
			generatedAt: now,
			expiresAt,
			summary: args.summary,
			highlights: args.highlights,
			model: args.model,
			inputTokens: args.inputTokens,
			outputTokens: args.outputTokens,
			trigger: args.trigger,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// ─── Internal query: list users eligible for cron-generated briefings ────────

export const listEligibleUsers = internalQuery({
	args: { activeSince: v.number() },
	handler: async (ctx, args) => {
		const allMembers = await ctx.db.query("orgMembers").take(1000);
		const result: Array<{ orgId: Id<"orgs">; userId: Id<"users"> }> = [];
		for (const m of allMembers) {
			if (m.deletedAt !== undefined) continue;
			const user = await ctx.db.get(m.userId);
			if (!user || user.deletedAt !== undefined) continue;
			if (user.preferences?.aiBriefingEnabled === false) continue;
			if ((user.lastActiveAt ?? 0) < args.activeSince) continue;
			result.push({ orgId: m.orgId, userId: m.userId });
		}
		return result;
	},
});
