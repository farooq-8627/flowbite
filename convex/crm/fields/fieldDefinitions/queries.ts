/**
 * Field Definitions Queries — convex/crm/fields/fieldDefinitions/queries.ts
 *
 * Dynamic field schema per entity type per org.
 * Per deep-plan.md Module 16: field types, groups, required, validation, tier limits.
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";

export const listByEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const fields = await ctx.db
			.query("fieldDefinitions")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();
		return fields.sort((a, b) => a.order - b.order);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), fieldId: v.id("fieldDefinitions") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) return null;
		return field;
	},
});
