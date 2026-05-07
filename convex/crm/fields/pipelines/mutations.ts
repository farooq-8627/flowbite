/**
 * Pipeline mutations — create, update, delete pipelines and stages.
 * Phase 2: Full CRUD. For now only seedDefault (internal) is needed.
 */
import { v } from "convex/values";
import { internalMutation } from "../../../_generated/server";

type StageInput = {
	name: string;
	color: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
};

const INDUSTRY_STAGES: Record<string, StageInput[]> = {
	"real-estate": [
		{ name: "New Inquiry",    color: "#3b82f6" },
		{ name: "Viewing",        color: "#8b5cf6", staleAfterDays: 3 },
		{ name: "Offer / MOU",    color: "#f59e0b", staleAfterDays: 5 },
		{ name: "Under Contract", color: "#10b981" },
		{ name: "Closed Won",     color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",           color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"technology": [
		{ name: "Prospecting",  color: "#3b82f6" },
		{ name: "Qualified",    color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Demo",         color: "#f59e0b" },
		{ name: "Proposal",     color: "#f97316", staleAfterDays: 5 },
		{ name: "Negotiation",  color: "#10b981" },
		{ name: "Closed Won",   color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Closed Lost",  color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"finance": [
		{ name: "Lead",          color: "#3b82f6" },
		{ name: "Discovery",     color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Proposal",      color: "#f59e0b" },
		{ name: "Due Diligence", color: "#f97316" },
		{ name: "Closed",        color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",          color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"healthcare": [
		{ name: "Inquiry",    color: "#3b82f6" },
		{ name: "Assessment", color: "#8b5cf6" },
		{ name: "Proposal",   color: "#f59e0b" },
		{ name: "Contract",   color: "#10b981" },
		{ name: "Won",        color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",       color: "#ef4444", isFinal: true, finalType: "negative" },
	],
};

const DEFAULT_STAGES: StageInput[] = [
	{ name: "New",       color: "#3b82f6" },
	{ name: "Contacted", color: "#8b5cf6", staleAfterDays: 7 },
	{ name: "Proposal",  color: "#f59e0b" },
	{ name: "Won",       color: "#22c55e", isFinal: true, finalType: "positive" },
	{ name: "Lost",      color: "#ef4444", isFinal: true, finalType: "negative" },
];

/**
 * Internal: seed a default pipeline for an org. Idempotent.
 * Called from orgs/mutations.ts updateOrgIndustry via ctx.scheduler.
 */
export const seedDefault = internalMutation({
	args: {
		orgId: v.id("orgs"),
		industry: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const existing = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_default", (q) =>
				q.eq("orgId", args.orgId).eq("isDefault", true),
			)
			.first();
		if (existing) return existing._id;

		const set: StageInput[] = (args.industry ? INDUSTRY_STAGES[args.industry] : undefined) ?? DEFAULT_STAGES;
		const stages = set.map((s, i) => ({
			id: `stage_${args.orgId.slice(-6)}_${i}`,
			name: s.name,
			order: i,
			color: s.color,
			isFinal: s.isFinal,
			finalType: s.finalType,
			staleAfterDays: s.staleAfterDays,
		}));

		return await ctx.db.insert("pipelines", {
			orgId: args.orgId,
			name: "Sales Pipeline",
			entityType: "deal",
			isDefault: true,
			stages,
			createdAt: now,
			updatedAt: now,
		});
	},
});
