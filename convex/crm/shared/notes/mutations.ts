/**
 * Notes Mutations — convex/crm/shared/notes/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * Permission model:
 *   - create:    `notes.create`
 *   - update:    own + `notes.updateOwn`  OR `notes.deleteAny` (admin override)
 *   - togglePin: `notes.pin`
 *   - remove:    own + `notes.deleteOwn`  OR `notes.deleteAny`
 *
 * Every mutation logs activity. Internal-flag is honored on read; mutations
 * don't gate on `notes.viewInternal` (that's a read-only filter).
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { logActivity } from "../../../activityLogs/helpers";

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
		requireRole(member.permissions, "notes.create");
		await enforceRateLimit(ctx, {
			scope: "notes.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const trimmed = args.content.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		const now = Date.now();
		const noteId = await ctx.db.insert("notes", {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			content: trimmed,
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
			actorType: args.authorType === "ai" ? "ai" : "user",
			action: "note_added",
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: `Note added${args.isInternal ? " (internal)" : ""}`,
			metadata: { noteId },
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

		const isOwn = note.authorId === userId;
		const canEditOwn = hasPermission(member.permissions, "notes.updateOwn");
		const canEditAny = hasPermission(member.permissions, "notes.deleteAny");
		if (!(canEditAny || (isOwn && canEditOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const trimmed = args.content.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		await ctx.db.patch(args.noteId, { content: trimmed, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "note_updated",
			entityType: note.entityType,
			entityId: note.entityId,
			personCode: note.personCode,
			description: "Note updated",
			metadata: { noteId: args.noteId },
		});
	},
});

export const togglePin = orgMutation({
	args: { orgId: v.id("orgs"), noteId: v.id("notes") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.pin");

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const nextPinned = !note.isPinned;
		await ctx.db.patch(args.noteId, { isPinned: nextPinned, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: nextPinned ? "note_pinned" : "note_unpinned",
			entityType: note.entityType,
			entityId: note.entityId,
			personCode: note.personCode,
			description: nextPinned ? "Note pinned" : "Note unpinned",
			metadata: { noteId: args.noteId },
		});
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), noteId: v.id("notes") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isOwn = note.authorId === userId;
		const canDeleteOwn = hasPermission(member.permissions, "notes.deleteOwn");
		const canDeleteAny = hasPermission(member.permissions, "notes.deleteAny");
		if (!(canDeleteAny || (isOwn && canDeleteOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		await ctx.db.delete(args.noteId);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "note_deleted",
			entityType: note.entityType,
			entityId: note.entityId,
			personCode: note.personCode,
			description: "Note deleted",
			metadata: { noteId: args.noteId },
		});
	},
});
