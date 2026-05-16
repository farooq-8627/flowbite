/**
 * Companies Mutations — convex/crm/entities/companies/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * CANONICAL MODEL:
 *   - Company owns the relationship to people via `personCodes[]` (single
 *     source of truth). A lead OR a contact is linked to a company by their
 *     personCode appearing in this array.
 *   - Company has a multi-assignee team via `assignees[]`. `assignedTo` is
 *     kept as the "primary" assignee for back-compat.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { applyOrgStat } from "../../../_shared/orgStats";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		size: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		assignees: v.optional(v.array(v.id("users"))),
		personCodes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.create");
		await enforceRateLimit(ctx, {
			scope: "companies.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

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
			assignees: args.assignees,
			personCodes: args.personCodes,
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

		await applyOrgStat(ctx, args.orgId, "companies.active", +1);

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
		assignees: v.optional(v.array(v.id("users"))),
		personCodes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.update");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const { orgId: _o, companyId: _c, ...updates } = args;
		const patch = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined),
		);

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

/**
 * Attach a person (by personCode) to a company's member list. Idempotent —
 * calling it twice with the same personCode keeps the array unique.
 */
export const addPerson = orgMutation({
	args: {
		orgId: v.id("orgs"),
		companyId: v.id("companies"),
		personCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.update");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const current = company.personCodes ?? [];
		if (current.includes(args.personCode)) return;

		await ctx.db.patch(args.companyId, {
			personCodes: [...current, args.personCode],
			updatedAt: Date.now(),
		});

		// Maintain the indexed join table for O(1) lookups.
		await ctx.db.insert("companyMembers", {
			orgId: args.orgId,
			personCode: args.personCode,
			companyId: args.companyId,
			createdAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "company",
			entityId: args.companyId,
			description: `Added ${args.personCode} to ${company.name}`,
			metadata: { companyCode: company.companyCode, personCode: args.personCode },
		});
	},
});

/**
 * Remove a person from the company's member list. Idempotent.
 */
export const removePerson = orgMutation({
	args: {
		orgId: v.id("orgs"),
		companyId: v.id("companies"),
		personCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.update");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const current = company.personCodes ?? [];
		const next = current.filter((pc) => pc !== args.personCode);
		if (next.length === current.length) return;

		await ctx.db.patch(args.companyId, {
			personCodes: next,
			updatedAt: Date.now(),
		});

		// Remove from the indexed join table.
		const link = await ctx.db
			.query("companyMembers")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
		if (link) await ctx.db.delete(link._id);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "company",
			entityId: args.companyId,
			description: `Removed ${args.personCode} from ${company.name}`,
			metadata: { companyCode: company.companyCode, personCode: args.personCode },
		});
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), companyId: v.id("companies") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.delete");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const now = Date.now();
		await ctx.db.patch(args.companyId, { deletedAt: now, updatedAt: now });
		if (!company.deletedAt) {
			await applyOrgStat(ctx, args.orgId, "companies.active", -1);
		}

		// Clean up the indexed join table — leave no stale companyMembers rows.
		const memberLinks = await ctx.db
			.query("companyMembers")
			.withIndex("by_org_and_company", (q) =>
				q.eq("orgId", args.orgId).eq("companyId", args.companyId),
			)
			.collect();
		await Promise.all(memberLinks.map((link) => ctx.db.delete(link._id)));

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "company",
			entityId: args.companyId,
			description: `Company deleted: ${company.name}`,
			metadata: {
				companyCode: company.companyCode,
				cleanedMemberLinks: memberLinks.length,
			},
		});
	},
});
