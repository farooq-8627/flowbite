/**
 * Field Values Queries — convex/crm/fields/fieldValues/queries.ts
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";

export const getForEntity = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string(), entityId: v.string() },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		return ctx.db
			.query("fieldValues")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType).eq("entityId", args.entityId),
			)
			.collect();
	},
});
