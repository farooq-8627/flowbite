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

		// Reminders due today (assigned to this user). Skip rows opted out
		// of AI exposure so the briefing doesn't quote a "private" reminder.
		const reminders = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("assignedTo"), args.userId),
					q.eq(q.field("status"), "pending"),
					q.lte(q.field("dueAt"), now + dayMs),
					q.neq(q.field("excludeFromAI"), true),
				),
			)
			.take(20);

		// Open deals assigned to this user — same AI opt-out filter.
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("deletedAt"), undefined),
					q.eq(q.field("assignedTo"), args.userId),
					q.neq(q.field("excludeFromAI"), true),
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
				type: r.type,
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
		// Replace existing daily-user briefing for this user — only one
		// active per (user, scope=daily-user). Filter the lookup so a
		// future weekly-org row sharing the org isn't accidentally
		// deleted on a daily refresh.
		const existing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.filter((q) => q.neq(q.field("scope"), "weekly-org"))
			.order("desc")
			.first();
		if (existing) {
			await ctx.db.delete(existing._id);
		}
		// Sprint 5 — write the structured payload alongside the legacy
		// `summary` + `highlights` so the new card AND the legacy reader
		// both work without a follow-up migration.
		const highlightTexts = (args.highlights ?? []).map((h) => h.text).slice(0, 5);
		await ctx.db.insert("aiBriefings", {
			orgId: args.orgId,
			userId: args.userId,
			scope: "daily-user",
			generatedAt: now,
			expiresAt,
			validUntil: expiresAt,
			summary: args.summary,
			highlights: args.highlights,
			payload: {
				summary: args.summary,
				highlights: highlightTexts,
				actionItems: [],
			},
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

// ─── Sprint 5: weekly-org collector + insert ────────────────────────────────

/**
 * Collect a week's worth of org-wide pipeline activity for the
 * `weekly-org` briefing generator. Read-only — pure DB scan.
 *
 * Returns counts + top movers. The action layer turns this into a 1500-token
 * prompt that asks the model to find patterns (week-over-week change,
 * conversion rates, who closed what) instead of just dumping numbers.
 */
export const collectOrgWeeklyData = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();
		const weekMs = 7 * 24 * 60 * 60 * 1000;
		const weekAgo = now - weekMs;
		const twoWeeksAgo = now - 2 * weekMs;

		// Pipeline movement — count deals per stage at the cutoff
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.and(q.eq(q.field("deletedAt"), undefined), q.neq(q.field("excludeFromAI"), true)),
			)
			.take(500);

		const totalOpenValue = deals
			.filter((d) => !d.wonAt && !d.lostAt)
			.reduce((sum, d) => sum + (d.value ?? 0), 0);

		const closedThisWeek = deals.filter(
			(d) =>
				((d.wonAt ?? 0) >= weekAgo && (d.wonAt ?? 0) <= now) ||
				((d.lostAt ?? 0) >= weekAgo && (d.lostAt ?? 0) <= now),
		);
		const wonThisWeek = closedThisWeek.filter((d) => !!d.wonAt);
		const lostThisWeek = closedThisWeek.filter((d) => !!d.lostAt);
		const wonValueThisWeek = wonThisWeek.reduce((sum, d) => sum + (d.value ?? 0), 0);

		const closedLastWeek = deals.filter(
			(d) =>
				((d.wonAt ?? 0) >= twoWeeksAgo && (d.wonAt ?? 0) < weekAgo) ||
				((d.lostAt ?? 0) >= twoWeeksAgo && (d.lostAt ?? 0) < weekAgo),
		);
		const wonLastWeek = closedLastWeek.filter((d) => !!d.wonAt).length;

		// New leads this week
		const leads = await ctx.db
			.query("leads")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.eq(q.field("deletedAt"), undefined))
			.take(500);
		const newLeadsThisWeek = leads.filter((l) => l._creationTime >= weekAgo).length;
		const newLeadsLastWeek = leads.filter(
			(l) => l._creationTime >= twoWeeksAgo && l._creationTime < weekAgo,
		).length;

		// Conversion rates — leads with convertedAt timestamp in the window
		const convertedThisWeek = leads.filter((l) => (l.convertedAt ?? 0) >= weekAgo).length;

		// Reminder completion rate
		const reminders = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.and(q.gte(q.field("dueAt"), weekAgo), q.lte(q.field("dueAt"), now)))
			.take(500);
		const completed = reminders.filter((r) => r.status === "completed").length;
		const overdue = reminders.filter((r) => r.status === "pending" && r.dueAt < now).length;

		const org = await ctx.db.get(args.orgId);

		return {
			org: {
				name: org?.name ?? "your workspace",
				currency: org?.settings?.defaultCurrency ?? "USD",
			},
			window: { weekAgo, now },
			deals: {
				totalOpen: deals.filter((d) => !d.wonAt && !d.lostAt).length,
				totalOpenValue,
				wonThisWeek: wonThisWeek.length,
				lostThisWeek: lostThisWeek.length,
				wonValueThisWeek,
				wonWoWChange: wonThisWeek.length - wonLastWeek,
			},
			leads: {
				newThisWeek: newLeadsThisWeek,
				newWoWChange: newLeadsThisWeek - newLeadsLastWeek,
				convertedThisWeek,
				conversionRate:
					newLeadsThisWeek > 0
						? Math.round((convertedThisWeek / newLeadsThisWeek) * 100)
						: 0,
			},
			reminders: {
				totalThisWeek: reminders.length,
				completed,
				overdue,
				completionRate:
					reminders.length > 0 ? Math.round((completed / reminders.length) * 100) : 0,
			},
		};
	},
});

/**
 * Persist a `weekly-org` briefing. Replaces the org's previous weekly
 * row so only one is active at a time. `userId` is intentionally
 * omitted — weekly briefings are visible to every member.
 */
export const insertWeeklyBriefing = internalMutation({
	args: {
		orgId: v.id("orgs"),
		summary: v.string(),
		highlights: v.array(v.string()),
		actionItems: v.optional(
			v.array(
				v.object({
					label: v.string(),
					url: v.optional(v.string()),
					toolCall: v.optional(v.string()),
				}),
			),
		),
		trend: v.optional(v.union(v.literal("up"), v.literal("down"), v.literal("flat"))),
		model: v.string(),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const validUntil = now + 7 * 24 * 60 * 60 * 1000; // valid all week

		// Replace existing weekly briefing for this org
		const existing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", "weekly-org"),
			)
			.order("desc")
			.first();
		if (existing) await ctx.db.delete(existing._id);

		await ctx.db.insert("aiBriefings", {
			orgId: args.orgId,
			scope: "weekly-org",
			generatedAt: now,
			expiresAt: validUntil,
			validUntil,
			summary: args.summary, // back-compat — daily-user reads from this
			model: args.model,
			inputTokens: args.inputTokens,
			outputTokens: args.outputTokens,
			trigger: args.trigger,
			payload: {
				summary: args.summary,
				highlights: args.highlights,
				actionItems: args.actionItems ?? [],
				trend: args.trend,
			},
			createdAt: now,
			updatedAt: now,
		});
	},
});

// ─── Sprint 5: list ALL active orgs for the weekly cron ──────────────────────

export const listActiveOrgs = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").take(1000);
		return orgs.filter((o) => o.deletedAt === undefined).map((o) => ({ orgId: o._id }));
	},
});
