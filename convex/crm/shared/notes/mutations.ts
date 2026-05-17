/**
 * Notes Mutations — convex/crm/shared/notes/mutations.ts
 *
 * Permission model:
 *   - create:        `notes.create`
 *   - update:        own + `notes.updateOwn`  OR `notes.deleteAny` (admin override)
 *   - togglePin:     `notes.pin`
 *   - setCategory:   same gate as `update`
 *   - setEntity:     same gate as `update` (changes the attached entity / personCode)
 *   - remove:        own + `notes.deleteOwn`  OR `notes.deleteAny`
 *
 * Every mutation logs activity. `isInternal` is honored on read; mutations
 * don't gate on `notes.viewInternal` (that's a read-only filter).
 *
 * Schema move (2026-05-17): the legacy `color` + `type` enums are gone from
 * the public mutation API. New attribute is `categoryId` → row in
 * `noteCategories`. Migration backfill: `_migrations/seedNoteCategories.ts`.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { logActivity } from "../../../activityLogs/helpers";
import { getDefaultCategoryForOrg, seedNoteCategoriesForOrg } from "../noteCategories/internal";

const TITLE_MAX_LEN = 80;

// ─── create ──────────────────────────────────────────────────────────────────

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		personCode: v.optional(v.string()),
		title: v.optional(v.string()),
		content: v.string(),
		/** Optional. When unset, the org's default category is used. */
		categoryId: v.optional(v.id("noteCategories")),
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

		const trimmedContent = args.content.trim();
		if (trimmedContent.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		const trimmedTitle = args.title?.trim();
		if (trimmedTitle && trimmedTitle.length > TITLE_MAX_LEN) {
			throw new ConvexError(ERRORS.INVALID_ARGS);
		}

		// Resolve the category — explicit param OR fallback to org default.
		let categoryId: typeof args.categoryId = args.categoryId;
		if (categoryId === undefined) {
			// Lazy seed: any org that predates this feature gets defaults the
			// first time someone tries to create a note. Idempotent.
			await seedNoteCategoriesForOrg(ctx, args.orgId);
			const def = await getDefaultCategoryForOrg(ctx, args.orgId);
			if (!def) {
				throw new ConvexError({
					code: "NO_DEFAULT_CATEGORY",
					message: "Workspace has no note categories configured.",
				});
			}
			categoryId = def;
		} else {
			// Validate the explicit category belongs to the org.
			const cat = await ctx.db.get(categoryId);
			if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const now = Date.now();
		const noteId = await ctx.db.insert("notes", {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			title: trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : undefined,
			content: trimmedContent,
			categoryId,
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
			metadata: { noteId, categoryId },
		});

		return noteId;
	},
});

// ─── update ──────────────────────────────────────────────────────────────────

/**
 * Patch any combination of `title`, `content`, `categoryId`, `isInternal`.
 * Only the note owner (with `notes.updateOwn`) or an admin (with
 * `notes.deleteAny`) may call this.
 */
export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		categoryId: v.optional(v.id("noteCategories")),
		isInternal: v.optional(v.boolean()),
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

		// biome-ignore lint/suspicious/noExplicitAny: building a partial patch
		const patch: any = { updatedAt: Date.now() };

		if (args.content !== undefined) {
			const trimmed = args.content.trim();
			if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);
			patch.content = trimmed;
		}
		if (args.title !== undefined) {
			const trimmed = args.title.trim();
			if (trimmed.length > TITLE_MAX_LEN) throw new ConvexError(ERRORS.INVALID_ARGS);
			patch.title = trimmed.length > 0 ? trimmed : undefined;
		}
		if (args.categoryId !== undefined) {
			const cat = await ctx.db.get(args.categoryId);
			if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
			patch.categoryId = args.categoryId;
		}
		if (args.isInternal !== undefined) patch.isInternal = args.isInternal;

		await ctx.db.patch(args.noteId, patch);

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

// ─── togglePin ───────────────────────────────────────────────────────────────

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

// ─── setCategory (fast-path used by Kanban drag + corner color picker) ──────

/**
 * Single-field category update used by the Kanban drag + the per-card color
 * dot picker. Same RBAC as `update` — wrapping it here saves a round-trip
 * and keeps the wire payload small when a user moves dozens of cards in a
 * session.
 */
export const setCategory = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		categoryId: v.id("noteCategories"),
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

		const cat = await ctx.db.get(args.categoryId);
		if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		if (note.categoryId === args.categoryId) return; // idempotent
		await ctx.db.patch(args.noteId, {
			categoryId: args.categoryId,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "note_recategorized",
			entityType: note.entityType,
			entityId: note.entityId,
			personCode: note.personCode,
			description: `Note category → ${cat.name}`,
			metadata: { noteId: args.noteId, to: args.categoryId },
		});
	},
});

// ─── setEntity (per-card +-button entity attach) ────────────────────────────

/**
 * Re-attach a note to a different entity. Used by the per-card `+` button's
 * popover picker — the user types `@P-004` (or searches by name) and picks
 * an entity, the note's (entityType, entityId, personCode) flip atomically.
 *
 * Pass `entityType: "org"` + `entityId: "<orgSlug>"` to detach the note
 * back to the org-wide bucket.
 */
export const setEntity = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		entityType: v.string(),
		entityId: v.string(),
		personCode: v.optional(v.string()),
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

		// Idempotent — bail if nothing actually changes.
		if (
			note.entityType === args.entityType &&
			note.entityId === args.entityId &&
			(note.personCode ?? undefined) === (args.personCode ?? undefined)
		) {
			return;
		}

		await ctx.db.patch(args.noteId, {
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "note_reattached",
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: `Note re-attached to ${args.entityType}/${args.entityId}`,
			metadata: {
				noteId: args.noteId,
				fromEntityType: note.entityType,
				fromEntityId: note.entityId,
			},
		});
	},
});

// ─── remove ──────────────────────────────────────────────────────────────────

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
