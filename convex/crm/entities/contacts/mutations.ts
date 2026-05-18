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
import type { Id } from "../../../_generated/dataModel";
import { ERRORS } from "../../../_shared/errors";
import { applyOrgStat } from "../../../_shared/orgStats";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
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
		await enforceRateLimit(ctx, {
			scope: "contacts.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

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

		// Counter increment when this is a *direct* contact creation. Conversion
		// from lead handles its own counter rebalance in `leads.convertToContact`.
		if (!args.leadId) {
			await applyOrgStat(ctx, args.orgId, "contacts.active", +1);
		}

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
		/** Optional kanban position. See `leads.update.sortOrder`. */
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.update");

		// Drag-rate guard — same shared 120/min budget as the other
		// kanban-driven mutations.
		await enforceRateLimit(ctx, {
			scope: "contacts.update",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

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

		// Propagate `assignedTo` change back to the source lead (if this
		// contact was converted from one). Keeps the two records in lockstep
		// — a kanban drag on the contacts board surfaces on the lead row's
		// activity log under the same assignee. Idempotent.
		if (
			args.assignedTo !== undefined &&
			contact.leadId !== undefined &&
			contact.assignedTo !== args.assignedTo
		) {
			const lead = await ctx.db.get(contact.leadId);
			if (lead && lead.orgId === args.orgId && lead.deletedAt === undefined) {
				if (lead.assignedTo !== args.assignedTo) {
					await ctx.db.patch(contact.leadId, {
						assignedTo: args.assignedTo,
						updatedAt: Date.now(),
					});
				}
			}
		}

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
		if (!contact.deletedAt) {
			await applyOrgStat(ctx, args.orgId, "contacts.active", -1);
		}

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

/**
 * Revert a converted contact back to a lead.
 *
 * Used when a conversion was accidental. The contact is soft-deleted and the
 * original lead (linked via `leadId`) is flipped back to status="new" so it
 * reappears on the leads board. Both actions are logged.
 *
 * Requires `leads.convert` — same permission that did the conversion. If the
 * contact has no `leadId` (created directly, not via conversion), this throws.
 */
export const revertToLead = orgMutation({
	args: { orgId: v.id("orgs"), contactId: v.id("contacts") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.convert");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId || contact.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		if (!contact.leadId) {
			throw new ConvexError({
				code: "NO_ORIGIN_LEAD",
				message:
					"This contact was not created from a lead and cannot be reverted. Delete instead.",
			});
		}

		const lead = await ctx.db.get(contact.leadId);
		if (!lead || lead.orgId !== args.orgId) {
			throw new ConvexError({
				code: "LEAD_NOT_FOUND",
				message: "Original lead no longer exists. Delete the contact instead.",
			});
		}

		const now = Date.now();
		// Flip the lead back to its working state. Clear convertedAt so the
		// lead's list/board row stops showing the "converted" status and the
		// standard workflow (edit, re-convert, etc.) becomes available again.
		await ctx.db.patch(contact.leadId, {
			status: "new",
			convertedAt: undefined,
			deletedAt: undefined,
			updatedAt: now,
		});
		// Soft-delete the contact.
		await ctx.db.patch(args.contactId, { deletedAt: now, updatedAt: now });

		// Counter rebalance: contact leaves "active", lead returns to "open".
		if (!contact.deletedAt) {
			await applyOrgStat(ctx, args.orgId, "contacts.active", -1);
		}
		await applyOrgStat(ctx, args.orgId, "leads.open", +1);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reverted",
			entityType: "contact",
			entityId: args.contactId,
			personCode: contact.personCode,
			description: `Contact reverted to lead: ${contact.displayName}`,
		});

		return { leadId: contact.leadId as Id<"leads"> };
	},
});
