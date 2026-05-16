/**
 * Field Values Mutations — convex/crm/fields/fieldValues/mutations.ts
 *
 * Set/update field values for any entity record.
 * Upsert pattern: if a value exists for (entityId, fieldId), update it; else insert.
 *
 * Permission model:
 *   set/bulkSet require write permission on the target entity. The mutation
 *   derives the permission key from `args.entityType` (e.g. `"deal"` →
 *   `deals.update`). Unknown entity types fall back to `fieldDefinitions.manage`
 *   (admin-only).
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";

/**
 * Map an entityType to the permission key required to write field values for it.
 * Falls back to `fieldDefinitions.manage` for unknown types — admin-only by default.
 */
function permissionForEntity(entityType: string): string {
	switch (entityType) {
		case "lead":
			return "leads.update";
		case "contact":
			return "contacts.update";
		case "company":
			return "companies.update";
		case "deal":
			return "deals.update";
		default:
			return "fieldDefinitions.manage";
	}
}

export const set = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		fieldId: v.id("fieldDefinitions"),
		value: v.any(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, permissionForEntity(args.entityType));

		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const now = Date.now();
		const existing = await ctx.db
			.query("fieldValues")
			.withIndex("by_field_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("fieldId", args.fieldId).eq("entityId", args.entityId),
			)
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
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, permissionForEntity(args.entityType));

		const now = Date.now();
		await Promise.all(
			args.values.map(async ({ fieldId, value }) => {
				const field = await ctx.db.get(fieldId);
				if (!field || field.orgId !== args.orgId) return;

				const existing = await ctx.db
					.query("fieldValues")
					.withIndex("by_field_and_entity", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("fieldId", fieldId)
							.eq("entityId", args.entityId),
					)
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
