/**
 * Companies Mutations — convex/crm/entities/companies/mutations.ts
 * STATUS: IMPLEMENTED
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { ERRORS } from "../../../_shared/errors";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		size: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.create");

		const companyCode = await generateEntityCode(ctx, args.orgId, "company");
		const now = Date.now();

		const companyId = await ctx.db.insert("companies", {
			orgId: args.orgId,
			companyCode,
			name: args.name,
			industry: args.industry,
			website: args.website,
			size: args.size,
			assignedTo: args.assignedTo,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "created",
			entityType: "company",
			entityId: companyId,
			description: `Company created: ${args.name}`,
			metadata: { companyCode },
		});

		if (args.assignedTo && args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "company.assigned",
				title: `Company assigned to you: ${args.name}`,
				entityType: "company",
				entityId: companyId,
			});
		}

		return { companyId, companyCode };
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		companyId: v.id("companies"),
		name: v.optional(v.string()),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		size: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.update");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const { orgId: _o, companyId: _c, ...updates } = args;
		const patch = Object.fromEntries(Object.entries(updates).filter(([, val]) => val !== undefined));

		await ctx.db.patch(args.companyId, { ...patch, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "company",
			entityId: args.companyId,
			description: `Company updated: ${company.name}`,
			metadata: { companyCode: company.companyCode },
		});
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), companyId: v.id("companies") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.delete");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.companyId, { deletedAt: Date.now(), updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "company",
			entityId: args.companyId,
			description: `Company deleted: ${company.name}`,
			metadata: { companyCode: company.companyCode },
		});
	},
});
