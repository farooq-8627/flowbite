/**
 * Contacts Mutations — convex/crm/entities/contacts/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * personCode: PASSED from lead on conversion. Generated only for direct creates.
 * aiContext: PASSED from lead on conversion — never recreated. Updated in-place.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { internal } from "../../../_generated/api";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";
import { generatePersonCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		personCode: v.optional(v.string()),
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		leadId: v.optional(v.id("leads")),
		companyId: v.optional(v.id("companies")),
		assignedTo: v.optional(v.id("users")),
		aiContext: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.create");

		// Email dedup via index — O(log n)
		if (args.email) {
			const existing = await ctx.db
				.query("contacts")
				.withIndex("by_org_and_email", (q) =>
					q.eq("orgId", args.orgId).eq("email", args.email!),
				)
				.first();
			if (existing && !existing.deletedAt) {
				throw new ConvexError({
					code: "DUPLICATE",
					message: "Contact with this email already exists",
					personCode: existing.personCode,
				});
			}
		}

		const personCode = args.personCode ?? (await generatePersonCode(ctx, args.orgId));
		const now = Date.now();
		const normalizedPhone = args.phone ? normalizePhone(args.phone) : undefined;

		const contactId = await ctx.db.insert("contacts", {
			orgId: args.orgId,
			personCode,
			displayName: args.displayName,
			email: args.email,
			phone: args.phone,
			normalizedPhone,
			leadId: args.leadId,
			companyId: args.companyId,
			assignedTo: args.assignedTo,
			aiContext: args.aiContext,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "created",
			entityType: "contact",
			entityId: contactId,
			personCode,
			description: `Contact created: ${args.displayName}`,
		});

		if (args.assignedTo && args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "contact.assigned",
				title: `Contact assigned to you: ${args.displayName}`,
				entityType: "contact",
				entityId: contactId,
			});
		}

		await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
			orgId: args.orgId,
			entityType: "contact",
			entityId: contactId,
			personCode,
		});

		return { contactId, personCode };
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		contactId: v.id("contacts"),
		displayName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		companyId: v.optional(v.id("companies")),
		assignedTo: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.update");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId || contact.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const { orgId: _o, contactId: _c, ...updates } = args;
		const patch: Record<string, unknown> = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined),
		);
		if (args.phone) patch.normalizedPhone = normalizePhone(args.phone);

		await ctx.db.patch(args.contactId, { ...patch, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "contact",
			entityId: args.contactId,
			personCode: contact.personCode,
			description: `Contact updated: ${contact.displayName}`,
		});
	},
});

export const updateAiContext = orgMutation({
	args: { orgId: v.id("orgs"), contactId: v.id("contacts"), aiContext: v.any() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.update");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.contactId, { aiContext: args.aiContext, updatedAt: Date.now() });
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), contactId: v.id("contacts") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.delete");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.contactId, { deletedAt: Date.now(), updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "contact",
			entityId: args.contactId,
			personCode: contact.personCode,
			description: `Contact deleted: ${contact.displayName}`,
		});
	},
});
