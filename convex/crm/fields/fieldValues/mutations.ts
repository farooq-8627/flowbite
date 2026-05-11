/**
 * Field Values Mutations — convex/crm/fields/fieldValues/mutations.ts
 *
 * Set/update field values for any entity record.
 * Upsert pattern: if a value exists for (entityId, fieldId), update it; else insert.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";

export const set = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		fieldId: v.id("fieldDefinitions"),
		value: v.any(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const now = Date.now();
		const existing = await ctx.db
			.query("fieldValues")
			.withIndex("by_field", (q) => q.eq("orgId", args.orgId).eq("fieldId", args.fieldId))
			.filter((q) => q.eq(q.field("entityId"), args.entityId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { value: args.value, updatedAt: now });
			return existing._id;
		}

		return ctx.db.insert("fieldValues", {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			fieldId: args.fieldId,
			fieldName: field.name,
			value: args.value,
			updatedAt: now,
		});
	},
});

export const bulkSet = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		values: v.array(v.object({ fieldId: v.id("fieldDefinitions"), value: v.any() })),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const now = Date.now();
		await Promise.all(
			args.values.map(async ({ fieldId, value }) => {
				const field = await ctx.db.get(fieldId);
				if (!field || field.orgId !== args.orgId) return;

				const existing = await ctx.db
					.query("fieldValues")
					.withIndex("by_field", (q) => q.eq("orgId", args.orgId).eq("fieldId", fieldId))
					.filter((q) => q.eq(q.field("entityId"), args.entityId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, { value, updatedAt: now });
				} else {
					await ctx.db.insert("fieldValues", {
						orgId: args.orgId,
						entityType: args.entityType,
						entityId: args.entityId,
						fieldId,
						fieldName: field.name,
						value,
						updatedAt: now,
					});
				}
			}),
		);
	},
});
