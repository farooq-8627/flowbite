/**
 * Leads Mutations — convex/crm/entities/leads/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * personCode generated HERE only. On conversion, personCode + aiContext
 * are PASSED to contact — never regenerated.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";
import { generatePersonCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { ERRORS } from "../../../_shared/errors";
import { internal } from "../../../_generated/api";

/** Strip all non-digits from a phone number for index-based dedup */
function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		source: v.string(),
		assignedTo: v.optional(v.id("users")),
		aiContext: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.create");

		// Email dedup via index — O(log n)
		if (args.email) {
			const existing = await ctx.db
				.query("leads")
				.withIndex("by_org_and_email", (q) => q.eq("orgId", args.orgId).eq("email", args.email!))
				.first();
			if (existing && !existing.deletedAt && !existing.convertedAt) {
				throw new ConvexError({ code: "DUPLICATE", message: "Lead with this email already exists", personCode: existing.personCode });
			}
		}

		const personCode = await generatePersonCode(ctx, args.orgId);
		const now = Date.now();
		const normalizedPhone = args.phone ? normalizePhone(args.phone) : undefined;

		const leadId = await ctx.db.insert("leads", {
			orgId: args.orgId,
			personCode,
			displayName: args.displayName,
			email: args.email,
			phone: args.phone,
			normalizedPhone,
			status: "new",
			source: args.source,
			assignedTo: args.assignedTo,
			aiContext: args.aiContext,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "created",
			entityType: "lead",
			entityId: leadId,
			personCode,
			description: `Lead created: ${args.displayName}`,
		});

		if (args.assignedTo && args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "lead.assigned",
				title: `Lead assigned to you: ${args.displayName}`,
				entityType: "lead",
				entityId: leadId,
			});
		}

		await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
			orgId: args.orgId, entityType: "lead", entityId: leadId, personCode,
		});

		return { leadId, personCode };
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		displayName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		status: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.update");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const { orgId: _o, leadId: _l, ...updates } = args;
		const patch: Record<string, unknown> = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined),
		);
		if (args.phone) patch.normalizedPhone = normalizePhone(args.phone);

		await ctx.db.patch(args.leadId, { ...patch, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "lead",
			entityId: args.leadId,
			personCode: lead.personCode,
			description: `Lead updated: ${lead.displayName}`,
		});
	},
});

export const convertToContact = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		companyId: v.optional(v.id("companies")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.convert");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		if (lead.status === "converted") {
			throw new ConvexError({ code: "ALREADY_CONVERTED", message: "Lead is already converted" });
		}

		const now = Date.now();

		// personCode and aiContext PASSED from lead — never regenerated
		const contactId = await ctx.db.insert("contacts", {
			orgId: args.orgId,
			personCode: lead.personCode,
			displayName: lead.displayName,
			email: lead.email,
			phone: lead.phone,
			normalizedPhone: lead.normalizedPhone,
			leadId: args.leadId,
			companyId: args.companyId,
			assignedTo: lead.assignedTo,
			aiContext: lead.aiContext,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.patch(args.leadId, {
			status: "converted",
			convertedAt: now,
			contactId,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "converted",
			entityType: "lead",
			entityId: args.leadId,
			personCode: lead.personCode,
			description: `Lead converted: ${lead.displayName}`,
		});

		await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
			orgId: args.orgId, entityType: "contact", entityId: contactId, personCode: lead.personCode,
		});

		return { contactId, personCode: lead.personCode };
	},
});

export const updateAiContext = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		aiContext: v.any(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.update");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.leadId, { aiContext: args.aiContext, updatedAt: Date.now() });
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), leadId: v.id("leads") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.delete");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.leadId, { deletedAt: Date.now(), updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "lead",
			entityId: args.leadId,
			personCode: lead.personCode,
			description: `Lead deleted: ${lead.displayName}`,
		});
	},
});
