/**
 * Field Definitions Mutations — convex/crm/fields/fieldDefinitions/mutations.ts
 *
 * CRUD for dynamic field schema. Only owner/admin can manage fields.
 * Field types per schema: text, number, select, multiselect, date, boolean, url, email, relation, file
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";
import { ERRORS } from "../../../_shared/errors";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		name: v.string(),
		label: v.string(),
		labelAr: v.optional(v.string()),
		type: v.string(),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
		sensitive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "fieldDefinitions.manage");

		const existing = await ctx.db
			.query("fieldDefinitions")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();
		const maxOrder = existing.reduce((max, f) => Math.max(max, f.order ?? 0), -1);

		return ctx.db.insert("fieldDefinitions", {
			orgId: args.orgId,
			entityType: args.entityType,
			name: args.name,
			label: args.label,
			labelAr: args.labelAr,
			type: args.type,
			groupName: args.groupName,
			required: args.required ?? false,
			options: args.options,
			defaultValue: args.defaultValue,
			sensitive: args.sensitive,
			order: maxOrder + 1,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fieldId: v.id("fieldDefinitions"),
		label: v.optional(v.string()),
		labelAr: v.optional(v.string()),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "fieldDefinitions.manage");

		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const { orgId: _o, fieldId: _f, ...updates } = args;
		const patch = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
		await ctx.db.patch(args.fieldId, { ...patch, updatedAt: Date.now() });
	},
});

export const reorder = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fieldIds: v.array(v.id("fieldDefinitions")),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "fieldDefinitions.manage");

		await Promise.all(
			args.fieldIds.map((id, index) =>
				ctx.db.patch(id, { order: index, updatedAt: Date.now() }),
			),
		);
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), fieldId: v.id("fieldDefinitions") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "fieldDefinitions.manage");

		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Remove all field values for this field
		const values = await ctx.db
			.query("fieldValues")
			.withIndex("by_field", (q) => q.eq("orgId", args.orgId).eq("fieldId", args.fieldId))
			.collect();
		await Promise.all(values.map((fv) => ctx.db.delete(fv._id)));

		await ctx.db.delete(args.fieldId);
	},
});
