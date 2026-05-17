/**
 * Note Categories — public mutations.
 *
 * Permission model:
 *   - All write operations gate on `notes.categories.manage` (Owner / Admin).
 *   - Read mutations (e.g. ensureForOrg) gate only on org membership — they
 *     are idempotent and safe to call from any path that needs the seed
 *     in place.
 *
 * Canonical mutation pattern (RBAC → rate limit → DB → log → return).
 */

import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { logActivity } from "../../../activityLogs/helpers";
import { seedNoteCategoriesForOrg } from "./internal";

const NAME_MAX_LEN = 40;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function validateName(raw: string | undefined): string {
	if (raw === undefined) throw new ConvexError(ERRORS.INVALID_ARGS);
	const trimmed = raw.trim();
	if (trimmed.length === 0 || trimmed.length > NAME_MAX_LEN) {
		throw new ConvexError(ERRORS.INVALID_ARGS);
	}
	return trimmed;
}

function validateHex(raw: string | undefined): string {
	if (raw === undefined) throw new ConvexError(ERRORS.INVALID_ARGS);
	if (!HEX_COLOR_RE.test(raw)) throw new ConvexError(ERRORS.INVALID_ARGS);
	return raw.toLowerCase();
}

// ─── ensureForOrg (idempotent lazy seed) ─────────────────────────────────────

/**
 * Lazy fallback — call from the frontend the first time it loads notes for
 * an org that predates this feature. No-op when categories already exist.
 *
 * Permission gate: org membership only. Anyone who can see the workspace
 * can trigger the seed; the seed itself is deterministic.
 */
export const ensureForOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const inserted = await seedNoteCategoriesForOrg(ctx, args.orgId);
		return { inserted };
	},
});

// ─── create ──────────────────────────────────────────────────────────────────

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		bgColor: v.string(),
		textColor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");
		await enforceRateLimit(ctx, {
			scope: "noteCategories.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const name = validateName(args.name);
		const bgColor = validateHex(args.bgColor);
		const textColor =
			args.textColor !== undefined && args.textColor !== ""
				? validateHex(args.textColor)
				: undefined;

		// Reject duplicate names within the org (case-insensitive).
		const existing = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_name", (q) => q.eq("orgId", args.orgId).eq("name", name))
			.first();
		if (existing) {
			throw new ConvexError({
				code: "DUPLICATE",
				message: `A category named "${name}" already exists`,
			});
		}

		// Append to the end.
		const all = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_position", (q) => q.eq("orgId", args.orgId))
			.collect();
		const position = all.reduce((m, r) => Math.max(m, r.position), -1) + 1;

		const now = Date.now();
		const id = await ctx.db.insert("noteCategories", {
			orgId: args.orgId,
			name,
			bgColor,
			textColor,
			position,
			isDefault: false,
			isArchived: false,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "noteCategory_created",
			entityType: "note",
			entityId: id,
			description: `Note category "${name}" created`,
			metadata: { categoryId: id, name },
		});

		return id;
	},
});

// ─── update ──────────────────────────────────────────────────────────────────

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		categoryId: v.id("noteCategories"),
		name: v.optional(v.string()),
		bgColor: v.optional(v.string()),
		textColor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");

		const cat = await ctx.db.get(args.categoryId);
		if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// biome-ignore lint/suspicious/noExplicitAny: building a partial patch
		const patch: any = { updatedAt: Date.now() };

		if (args.name !== undefined) {
			const next = validateName(args.name);
			if (next !== cat.name) {
				const dup = await ctx.db
					.query("noteCategories")
					.withIndex("by_org_and_name", (q) => q.eq("orgId", args.orgId).eq("name", next))
					.first();
				if (dup && dup._id !== cat._id) {
					throw new ConvexError({
						code: "DUPLICATE",
						message: `A category named "${next}" already exists`,
					});
				}
				patch.name = next;
			}
		}
		if (args.bgColor !== undefined) {
			patch.bgColor = validateHex(args.bgColor);
		}
		if (args.textColor !== undefined) {
			// Empty string clears the explicit text color → revert to dynamic derivation.
			patch.textColor = args.textColor === "" ? undefined : validateHex(args.textColor);
		}

		await ctx.db.patch(args.categoryId, patch);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "noteCategory_updated",
			entityType: "note",
			entityId: args.categoryId,
			description: `Note category "${cat.name}" updated`,
			metadata: { categoryId: args.categoryId },
		});
	},
});

// ─── archive / restore ───────────────────────────────────────────────────────

export const setArchived = orgMutation({
	args: {
		orgId: v.id("orgs"),
		categoryId: v.id("noteCategories"),
		isArchived: v.boolean(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");

		const cat = await ctx.db.get(args.categoryId);
		if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Don't allow archiving the only non-archived default category — there
		// must always be a default for new-note creation.
		if (args.isArchived && cat.isDefault) {
			throw new ConvexError({
				code: "DEFAULT_REQUIRED",
				message: "Mark a different category as default before archiving this one.",
			});
		}

		await ctx.db.patch(args.categoryId, {
			isArchived: args.isArchived,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: args.isArchived ? "noteCategory_archived" : "noteCategory_restored",
			entityType: "note",
			entityId: args.categoryId,
			description: args.isArchived
				? `Note category "${cat.name}" archived`
				: `Note category "${cat.name}" restored`,
			metadata: { categoryId: args.categoryId },
		});
	},
});

// ─── reorder (bulk position update) ──────────────────────────────────────────

export const reorder = orgMutation({
	args: {
		orgId: v.id("orgs"),
		categoryIds: v.array(v.id("noteCategories")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");

		const now = Date.now();
		for (let i = 0; i < args.categoryIds.length; i += 1) {
			const id = args.categoryIds[i];
			const row = await ctx.db.get(id);
			if (!row || row.orgId !== args.orgId) continue;
			if (row.position !== i) {
				await ctx.db.patch(id, { position: i, updatedAt: now });
			}
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "noteCategories_reordered",
			entityType: "note",
			entityId: args.categoryIds.join(","),
			description: "Note categories reordered",
		});
	},
});

// ─── setDefault ──────────────────────────────────────────────────────────────

export const setDefault = orgMutation({
	args: {
		orgId: v.id("orgs"),
		categoryId: v.id("noteCategories"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");

		const target = await ctx.db.get(args.categoryId);
		if (!target || target.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (target.isArchived) {
			throw new ConvexError({
				code: "ARCHIVED",
				message: "Restore the category before marking it default.",
			});
		}

		// Clear any previously-flagged defaults — there is exactly one default
		// per org. We index on `by_org_and_default` so the lookup is cheap.
		const previousDefaults = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_default", (q) => q.eq("orgId", args.orgId).eq("isDefault", true))
			.collect();

		const now = Date.now();
		for (const prev of previousDefaults) {
			if (prev._id !== args.categoryId) {
				await ctx.db.patch(prev._id, { isDefault: false, updatedAt: now });
			}
		}

		if (!target.isDefault) {
			await ctx.db.patch(args.categoryId, { isDefault: true, updatedAt: now });
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "noteCategory_setDefault",
			entityType: "note",
			entityId: args.categoryId,
			description: `Default note category set to "${target.name}"`,
			metadata: { categoryId: args.categoryId },
		});
	},
});

// ─── remove (hard delete — only when zero notes reference it) ────────────────

export const remove = orgMutation({
	args: {
		orgId: v.id("orgs"),
		categoryId: v.id("noteCategories"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.categories.manage");

		const cat = await ctx.db.get(args.categoryId);
		if (!cat || cat.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (cat.isDefault) {
			throw new ConvexError({
				code: "DEFAULT_REQUIRED",
				message: "Mark a different category as default before deleting this one.",
			});
		}

		// Only allow hard delete when no notes reference it. Otherwise the
		// caller should archive instead.
		const referenced = await ctx.db
			.query("notes")
			.withIndex("by_org_and_category", (q) =>
				q.eq("orgId", args.orgId).eq("categoryId", args.categoryId),
			)
			.first();
		if (referenced) {
			throw new ConvexError({
				code: "IN_USE",
				message:
					"This category still has notes. Archive it instead, or move the notes first.",
			});
		}

		await ctx.db.delete(args.categoryId);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "noteCategory_removed",
			entityType: "note",
			entityId: args.categoryId,
			description: `Note category "${cat.name}" deleted`,
			metadata: { categoryId: args.categoryId },
		});
	},
});
