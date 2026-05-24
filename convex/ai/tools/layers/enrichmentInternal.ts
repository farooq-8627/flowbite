/**
 * convex/ai/tools/layers/enrichmentInternal.ts
 *
 * Internal helpers for the `enrich_record` AI tool (`PHASE-3-AI-AUDIT.md
 * §6 Week 5`). Defined as `internalQuery` so the tool's action context
 * can call them via `runQuery`.
 *
 * The single helper here snapshots an entity's current canonical fields
 * so the enrichment provider waterfall can see what's missing. Because
 * each entity table has different canonical field names, we read through
 * the existing `getByPersonCode / getByDealCode / getByCompanyCode`
 * indexes and project a uniform `{name, email, phone, companyName, …}`
 * shape.
 */
import { v } from "convex/values";
import { requireOrgMemberByIds } from "../../../_functions/authenticated";
import { internalQuery } from "../../../_generated/server";

const TARGET_ENTITY_VAL = v.union(
	v.literal("lead"),
	v.literal("contact"),
	v.literal("company"),
	v.literal("deal"),
);

export const _snapshotEntityFields = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: TARGET_ENTITY_VAL,
		code: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);

		switch (args.entityType) {
			case "lead": {
				const lead = await ctx.db
					.query("leads")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", args.code),
					)
					.first();
				if (!lead) return null;
				return {
					entityId: lead._id as string,
					code: lead.personCode,
					beforeFields: project({
						name: lead.displayName ?? null,
						displayName: lead.displayName ?? null,
						email: lead.email ?? null,
						phone: lead.phone ?? null,
					}),
				};
			}
			case "contact": {
				const c = await ctx.db
					.query("contacts")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", args.code),
					)
					.first();
				if (!c) return null;
				return {
					entityId: c._id as string,
					code: c.personCode,
					beforeFields: project({
						name: c.displayName ?? null,
						displayName: c.displayName ?? null,
						email: c.email ?? null,
						phone: c.phone ?? null,
						companyName: c.companyCode ?? null,
					}),
				};
			}
			case "company": {
				const co = await ctx.db
					.query("companies")
					.withIndex("by_org_and_companyCode", (q) =>
						q.eq("orgId", args.orgId).eq("companyCode", args.code),
					)
					.first();
				if (!co) return null;
				return {
					entityId: co._id as string,
					code: co.companyCode,
					beforeFields: project({
						name: co.name ?? null,
						companyName: co.name ?? null,
						companyDomain: co.website ?? null,
						industry: co.industry ?? null,
					}),
				};
			}
			case "deal": {
				const d = await ctx.db
					.query("deals")
					.withIndex("by_org_and_dealCode", (q) =>
						q.eq("orgId", args.orgId).eq("dealCode", args.code),
					)
					.first();
				if (!d) return null;
				return {
					entityId: d._id as string,
					code: d.dealCode,
					beforeFields: project({
						title: d.title ?? null,
						currentStageId: d.currentStageId ?? null,
					}),
				};
			}
			default:
				return null;
		}
	},
});

/**
 * Drop any keys whose value is null/undefined so the snapshot's "is this
 * field already present?" semantics are obvious.
 */
function project(src: Record<string, string | null | undefined>): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (const [k, v_] of Object.entries(src)) {
		out[k] = v_ ?? null;
	}
	return out;
}
