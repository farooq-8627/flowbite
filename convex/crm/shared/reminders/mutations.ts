/**
 * Reminders Mutations — convex/crm/shared/reminders/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * followUpCode auto-generated (FU-001). Every reminder MUST have a personCode.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole, hasMinRole } from "../../../_shared/permissions";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { ERRORS } from "../../../_shared/errors";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		dealCode: v.optional(v.string()),
		entityType: v.string(),
		entityId: v.string(),
		title: v.string(),
		note: v.optional(v.string()),
		dueAt: v.number(),
		assignedTo: v.id("users"),
		source: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "reminders.create");

		const followUpCode = await generateEntityCode(ctx, args.orgId, "followup");
		const now = Date.now();

		const reminderId = await ctx.db.insert("reminders", {
			orgId: args.orgId,
			followUpCode,
			personCode: args.personCode,
			dealCode: args.dealCode,
			entityType: args.entityType,
			entityId: args.entityId,
			title: args.title,
			note: args.note,
			dueAt: args.dueAt,
			assignedTo: args.assignedTo,
			status: "pending",
			source: args.source,
			createdAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reminder_created",
			entityType: args.entityType,
			entityId: args.entityId,
			description: `Reminder set: ${args.title}`,
			metadata: { followUpCode, personCode: args.personCode },
		});

		if (args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "reminder.created",
				title: `New reminder: ${args.title}`,
				entityType: args.entityType,
				entityId: args.entityId,
			});
		}

		return { reminderId, followUpCode };
	},
});

export const complete = orgMutation({
	args: { orgId: v.id("orgs"), reminderId: v.id("reminders") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");
		if (reminder.assignedTo !== userId && !isAdmin) throw new ConvexError(ERRORS.FORBIDDEN);

		const now = Date.now();
		await ctx.db.patch(args.reminderId, { status: "completed", completedAt: now });
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		reminderId: v.id("reminders"),
		title: v.optional(v.string()),
		note: v.optional(v.string()),
		dueAt: v.optional(v.number()),
		assignedTo: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");
		if (reminder.assignedTo !== userId && !isAdmin) throw new ConvexError(ERRORS.FORBIDDEN);

		const { orgId: _o, reminderId: _r, ...updates } = args;
		const patch = Object.fromEntries(Object.entries(updates).filter(([, val]) => val !== undefined));

		await ctx.db.patch(args.reminderId, patch);
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), reminderId: v.id("reminders") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");
		if (reminder.assignedTo !== userId && !isAdmin) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.delete(args.reminderId);
	},
});
