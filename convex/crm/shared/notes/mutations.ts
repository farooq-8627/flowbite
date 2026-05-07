/**
 * Notes Mutations — convex/crm/shared/notes/mutations.ts
 * STATUS: IMPLEMENTED
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole, hasMinRole } from "../../../_shared/permissions";
import { logActivity } from "../../../activityLogs/helpers";
import { ERRORS } from "../../../_shared/errors";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		personCode: v.optional(v.string()),
		content: v.string(),
		authorType: v.string(),
		isInternal: v.boolean(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "notes.create");

		const now = Date.now();
		const noteId = await ctx.db.insert("notes", {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			content: args.content,
			authorId: userId,
			authorType: args.authorType,
			isPinned: false,
			isInternal: args.isInternal,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "note_added",
			entityType: args.entityType,
			entityId: args.entityId,
			description: "Note added",
		});

		return noteId;
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Own note or admin
		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");
		if (note.authorId !== userId && !isAdmin) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.noteId, { content: args.content, updatedAt: Date.now() });
	},
});

export const togglePin = orgMutation({
	args: { orgId: v.id("orgs"), noteId: v.id("notes") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "notes.create");

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.noteId, { isPinned: !note.isPinned, updatedAt: Date.now() });
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), noteId: v.id("notes") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");
		if (note.authorId !== userId && !isAdmin) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.delete(args.noteId);
	},
});
