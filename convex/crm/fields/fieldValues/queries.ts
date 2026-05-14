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
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.collect();
	},
});

/**
 * Batched read of every fieldValue for one (orgId, entityType). Used by
 * tables and cards so they can show user-defined fields without N+1 queries.
 *
 * Returns: { [entityId]: { [fieldName]: value } }
 *
 * Uses the same `by_entity` composite index — when entityId isn't pinned the
 * read scans the (orgId, entityType) prefix only, so cost is O(values for the
 * entity type), not O(all fieldValues in the org).
 */
export const listForEntityType = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string() },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const rows = await ctx.db
			.query("fieldValues")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();

		const out: Record<string, Record<string, unknown>> = {};
		for (const r of rows) {
			const eid = r.entityId;
			if (!out[eid]) out[eid] = {};
			out[eid][r.fieldName] = r.value;
		}
		return out;
	},
});
