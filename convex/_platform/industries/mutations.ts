/**
 * Industry-template owner mutations — convex/_platform/industries/mutations.ts
 *
 * Stage 2 implementation (locked 2026-05-27). Each mutation follows the
 * canonical 4-step owner-panel pattern from `_platform/tiers/mutations.ts`:
 *
 *   1. requirePlatformOwner(ctx)         — defence-in-depth gate
 *   2. enforceRateLimit(ctx, ...)        — shared "owner.write" scope
 *   3. read-modify-write with snapshot   — capture `before` JSON
 *   4. logPlatformAction(ctx, ...)       — append-only audit row
 *
 * Reserved-slug semantics:
 *   - Templates are uniquely identified by `templateKey` and ALSO mirror
 *     into `platformReservedSlugs` (category=template) so org-slug
 *     creation can't collide with template ids.
 *   - Groups are uniquely identified by `groupKey` and mirror into
 *     `platformReservedSlugs` (category=industryGroup).
 *   - `createTemplate` / `createGroup` insert both rows; `deleteTemplate`
 *     / `deleteGroup` remove both. The mutations stay idempotent — if
 *     the reservedSlugs row is missing (or extra) the cleanup is a no-op.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.4 + §7.
 */

import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "../../_generated/server";
import { mutation } from "../../_generated/server";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from "../../_shared/reservedSlugs";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";
import { validateDefinition } from "./validators";

// ─── Shared helpers ──────────────────────────────────────────────────────────

const REGION_VALUES = ["global", "gcc", "us", "eu", "apac"] as const;
type Region = (typeof REGION_VALUES)[number];

function isRegion(value: string | undefined): value is Region {
	return value !== undefined && (REGION_VALUES as readonly string[]).includes(value);
}

const regionValidator = v.union(
	v.literal("global"),
	v.literal("gcc"),
	v.literal("us"),
	v.literal("eu"),
	v.literal("apac"),
);

/**
 * Validate the format of a templateKey / groupKey using the same shape
 * rules as `validateSlug` from `_shared/reservedSlugs.ts`. Throws
 * `INVALID_KEY_FORMAT` carrying a human-readable reason on failure.
 */
function assertValidKey(key: string, kind: "templateKey" | "groupKey"): void {
	if (!key || key.length < SLUG_MIN) {
		throw new ConvexError(
			`INVALID_${kind === "templateKey" ? "TEMPLATE_KEY" : "GROUP_KEY"}_FORMAT: minimum ${SLUG_MIN} characters`,
		);
	}
	if (key.length > SLUG_MAX) {
		throw new ConvexError(
			`INVALID_${kind === "templateKey" ? "TEMPLATE_KEY" : "GROUP_KEY"}_FORMAT: maximum ${SLUG_MAX} characters`,
		);
	}
	if (!SLUG_REGEX.test(key)) {
		throw new ConvexError(
			`INVALID_${kind === "templateKey" ? "TEMPLATE_KEY" : "GROUP_KEY"}_FORMAT: only lowercase letters, numbers, and hyphens; cannot start or end with a hyphen`,
		);
	}
	if (key.includes("--")) {
		throw new ConvexError(
			`INVALID_${kind === "templateKey" ? "TEMPLATE_KEY" : "GROUP_KEY"}_FORMAT: consecutive hyphens are not allowed`,
		);
	}
}

/**
 * Throws `INVALID_DEFINITION` carrying the first 3 errors from
 * `validateDefinition`. Stage 2 surfaces these inline in the editor; we
 * cap the message at 3 paths to keep the toast readable when the operator
 * pastes a wildly-broken JSON blob.
 */
function assertValidDefinition(definition: unknown): void {
	const result = validateDefinition(definition);
	if (result.valid) return;
	const head = result.errors
		.slice(0, 3)
		.map((e) => `${e.path}: ${e.message}`)
		.join(" | ");
	const more = result.errors.length > 3 ? ` (+${result.errors.length - 3} more)` : "";
	throw new ConvexError(`INVALID_DEFINITION: ${head}${more}`);
}

/**
 * Insert (or noop-skip) a mirror entry in `platformReservedSlugs` so the
 * key is recognised as taken across the platform. Idempotent.
 */
async function ensureReservedSlug(
	ctx: MutationCtx,
	args: {
		category: "template" | "industryGroup";
		slug: string;
		isBuiltIn: boolean;
		userId: import("../../_generated/dataModel").Id<"users">;
		reason?: string;
	},
): Promise<void> {
	const slug = args.slug.toLowerCase();
	const existing = await ctx.db
		.query("platformReservedSlugs")
		.withIndex("by_category_slug", (q) => q.eq("category", args.category).eq("slug", slug))
		.unique();
	const now = Date.now();
	if (existing) {
		// Don't overwrite an isBuiltIn row's flag; just refresh the user
		// who last touched it for traceability.
		await ctx.db.patch(existing._id, { updatedBy: args.userId, updatedAt: now });
		return;
	}
	await ctx.db.insert("platformReservedSlugs", {
		category: args.category,
		slug,
		reason: args.reason,
		isBuiltIn: args.isBuiltIn,
		createdBy: args.userId,
		updatedBy: args.userId,
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * Remove the reservedSlugs mirror row when a template / group is deleted.
 * Idempotent — silently skips when the row is absent.
 */
async function removeReservedSlugMirror(
	ctx: MutationCtx,
	category: "template" | "industryGroup",
	slug: string,
): Promise<void> {
	const row = await ctx.db
		.query("platformReservedSlugs")
		.withIndex("by_category_slug", (q) =>
			q.eq("category", category).eq("slug", slug.toLowerCase()),
		)
		.unique();
	if (row) await ctx.db.delete(row._id);
}

/**
 * Compute a sensible "append at end" sortOrder for a new row inside a
 * group. Returns the next slot in increments of 10 so manual tweaks stay
 * simple.
 */
async function nextSortOrderInGroup(ctx: MutationCtx, groupKey: string): Promise<number> {
	const tpls = await ctx.db
		.query("platformTemplates")
		.withIndex("by_group_visible_order", (q) => q.eq("groupKey", groupKey))
		.collect();
	if (tpls.length === 0) return 10;
	const max = tpls.reduce((m, t) => (t.sortOrder > m ? t.sortOrder : m), 0);
	return Math.floor(max / 10) * 10 + 10;
}

async function nextGroupSortOrder(ctx: MutationCtx): Promise<number> {
	const groups = await ctx.db.query("platformIndustryGroups").collect();
	if (groups.length === 0) return 10;
	const max = groups.reduce((m, g) => (g.sortOrder > m ? g.sortOrder : m), 0);
	return Math.floor(max / 10) * 10 + 10;
}

// ─── Group mutations ─────────────────────────────────────────────────────────

const groupPatchValidator = v.object({
	label: v.optional(v.string()),
	description: v.optional(v.string()),
	icon: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
});

export const createGroup = mutation({
	args: {
		groupKey: v.string(),
		label: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		sortOrder: v.optional(v.number()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const groupKey = args.groupKey.trim().toLowerCase();
		assertValidKey(groupKey, "groupKey");

		const existing = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", groupKey))
			.unique();
		if (existing) throw new ConvexError("GROUP_KEY_TAKEN");

		// Cross-category collision check: a new group key shouldn't shadow
		// an existing template id or org slug reservation.
		const reservedAsTemplate = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) => q.eq("category", "template").eq("slug", groupKey))
			.unique();
		if (reservedAsTemplate) throw new ConvexError("GROUP_KEY_COLLIDES_TEMPLATE");

		const now = Date.now();
		const sortOrder = args.sortOrder ?? (await nextGroupSortOrder(ctx));
		const id = await ctx.db.insert("platformIndustryGroups", {
			groupKey,
			label: args.label.trim(),
			description: args.description?.trim() || undefined,
			icon: args.icon?.trim() || undefined,
			visible: true,
			sortOrder,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		await ensureReservedSlug(ctx, {
			category: "industryGroup",
			slug: groupKey,
			isBuiltIn: false,
			userId,
			reason: `Auto-mirrored from platformIndustryGroups (${groupKey})`,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.group.create",
			targetType: "industryGroup",
			targetId: groupKey,
			before: null,
			after: { _id: id, groupKey, label: args.label, sortOrder },
			reason: args.reason,
		});

		return { ok: true, groupKey };
	},
});

export const updateGroup = mutation({
	args: {
		groupKey: v.string(),
		patch: groupPatchValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
		if (!existing) throw new ConvexError("GROUP_NOT_FOUND");

		const before = { ...existing };
		const next = {
			label: args.patch.label?.trim() ?? existing.label,
			description:
				args.patch.description !== undefined
					? args.patch.description.trim() || undefined
					: existing.description,
			icon:
				args.patch.icon !== undefined ? args.patch.icon.trim() || undefined : existing.icon,
			sortOrder: args.patch.sortOrder ?? existing.sortOrder,
			updatedBy: userId,
			updatedAt: Date.now(),
		};
		await ctx.db.patch(existing._id, next);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.group.update",
			targetType: "industryGroup",
			targetId: args.groupKey,
			before,
			after: { _id: existing._id, groupKey: existing.groupKey, ...next },
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const setGroupVisible = mutation({
	args: {
		groupKey: v.string(),
		visible: v.boolean(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
		if (!existing) throw new ConvexError("GROUP_NOT_FOUND");

		if (existing.visible === args.visible) return { ok: true, unchanged: true };

		const before = { visible: existing.visible };
		await ctx.db.patch(existing._id, {
			visible: args.visible,
			updatedBy: userId,
			updatedAt: Date.now(),
		});
		const after = { visible: args.visible };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.group.visibility",
			targetType: "industryGroup",
			targetId: args.groupKey,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const reorderGroups = mutation({
	args: {
		ordered: v.array(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		// Resolve every supplied groupKey before any write.
		const rows = [];
		for (const key of args.ordered) {
			const r = await ctx.db
				.query("platformIndustryGroups")
				.withIndex("by_groupKey", (q) => q.eq("groupKey", key))
				.unique();
			if (!r) throw new ConvexError(`GROUP_NOT_FOUND:${key}`);
			rows.push(r);
		}

		const before = rows.map((r) => ({ groupKey: r.groupKey, sortOrder: r.sortOrder }));
		const now = Date.now();
		for (let i = 0; i < rows.length; i++) {
			await ctx.db.patch(rows[i]!._id, {
				sortOrder: (i + 1) * 10,
				updatedBy: userId,
				updatedAt: now,
			});
		}
		const after = rows.map((r, i) => ({
			groupKey: r.groupKey,
			sortOrder: (i + 1) * 10,
		}));

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.group.reorder",
			targetType: "industryGroup",
			targetId: args.ordered.join(","),
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const deleteGroup = mutation({
	args: { groupKey: v.string(), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
		if (!existing) throw new ConvexError("GROUP_NOT_FOUND");

		// Hard rule: a group cannot be deleted while any template references
		// it. Move/reassign templates first.
		const refs = await ctx.db
			.query("platformTemplates")
			.withIndex("by_group_visible_order", (q) => q.eq("groupKey", args.groupKey))
			.take(1);
		if (refs.length > 0) {
			throw new ConvexError("GROUP_IN_USE");
		}

		const before = { ...existing };
		await ctx.db.delete(existing._id);
		await removeReservedSlugMirror(ctx, "industryGroup", args.groupKey);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.group.delete",
			targetType: "industryGroup",
			targetId: args.groupKey,
			before,
			after: null,
			reason: args.reason,
		});

		return { ok: true };
	},
});

// ─── Template mutations ──────────────────────────────────────────────────────

const templatePatchValidator = v.object({
	label: v.optional(v.string()),
	description: v.optional(v.string()),
	icon: v.optional(v.string()),
	region: v.optional(regionValidator),
	groupKey: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
	definition: v.optional(v.any()),
});

export const createTemplate = mutation({
	args: {
		templateKey: v.string(),
		groupKey: v.string(),
		label: v.string(),
		description: v.string(),
		icon: v.optional(v.string()),
		region: v.optional(regionValidator),
		definition: v.any(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const templateKey = args.templateKey.trim().toLowerCase();
		assertValidKey(templateKey, "templateKey");

		const exists = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", templateKey))
			.unique();
		if (exists) throw new ConvexError("TEMPLATE_KEY_TAKEN");

		// Cross-category collision check — never shadow an existing org
		// slug reservation or industry group key.
		const reservedAsOrg = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) => q.eq("category", "org").eq("slug", templateKey))
			.unique();
		if (reservedAsOrg) throw new ConvexError("TEMPLATE_KEY_COLLIDES_ORG_SLUG");

		const reservedAsGroup = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) =>
				q.eq("category", "industryGroup").eq("slug", templateKey),
			)
			.unique();
		if (reservedAsGroup) throw new ConvexError("TEMPLATE_KEY_COLLIDES_GROUP");

		const group = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
		if (!group) throw new ConvexError("GROUP_NOT_FOUND");

		assertValidDefinition(args.definition);

		const now = Date.now();
		const sortOrder = await nextSortOrderInGroup(ctx, args.groupKey);
		const region = isRegion(args.region) ? args.region : undefined;
		const row = {
			templateKey,
			groupKey: args.groupKey,
			label: args.label.trim(),
			description: args.description.trim(),
			icon: args.icon?.trim() || undefined,
			region,
			visible: true,
			sortOrder,
			isBuiltIn: false,
			isArchived: false,
			definition: args.definition as Record<string, unknown>,
			createdBy: userId,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		};
		const id = await ctx.db.insert("platformTemplates", row);

		await ensureReservedSlug(ctx, {
			category: "template",
			slug: templateKey,
			isBuiltIn: false,
			userId,
			reason: `Auto-mirrored from platformTemplates (${templateKey})`,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.create",
			targetType: "template",
			targetId: templateKey,
			before: null,
			// Audit log strips the heavy `definition` blob to keep rows
			// readable. The full payload is available via `getTemplateForAdmin`.
			after: {
				_id: id,
				templateKey,
				groupKey: args.groupKey,
				label: args.label,
				region,
				sortOrder,
			},
			reason: args.reason,
		});

		return { ok: true, templateKey };
	},
});

export const updateTemplate = mutation({
	args: {
		templateKey: v.string(),
		patch: templatePatchValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
			.unique();
		if (!existing) throw new ConvexError("TEMPLATE_NOT_FOUND");

		// If the group is being changed, validate it exists.
		if (args.patch.groupKey && args.patch.groupKey !== existing.groupKey) {
			const newGroup = await ctx.db
				.query("platformIndustryGroups")
				.withIndex("by_groupKey", (q) => q.eq("groupKey", args.patch.groupKey as string))
				.unique();
			if (!newGroup) throw new ConvexError("GROUP_NOT_FOUND");
		}

		// Validate definition shape + cross-refs only when supplied.
		if (args.patch.definition !== undefined) {
			assertValidDefinition(args.patch.definition);
		}

		const before = {
			label: existing.label,
			description: existing.description,
			icon: existing.icon,
			region: existing.region,
			groupKey: existing.groupKey,
			sortOrder: existing.sortOrder,
			definition: existing.definition,
		};

		const region = args.patch.region !== undefined ? args.patch.region : existing.region;
		const next = {
			label: args.patch.label?.trim() ?? existing.label,
			description: args.patch.description?.trim() ?? existing.description,
			icon:
				args.patch.icon !== undefined ? args.patch.icon.trim() || undefined : existing.icon,
			region: isRegion(region) ? region : existing.region,
			groupKey: args.patch.groupKey ?? existing.groupKey,
			sortOrder: args.patch.sortOrder ?? existing.sortOrder,
			definition: (args.patch.definition ?? existing.definition) as Record<string, unknown>,
			updatedBy: userId,
			updatedAt: Date.now(),
		};

		await ctx.db.patch(existing._id, next);

		// Audit log records before/after WITHOUT the giant `definition`
		// blob. Diffing two ~30KB blobs in a single audit row is noisy and
		// breaks the audit-list view. The blob is durably re-readable via
		// `getTemplateForAdmin` if needed.
		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.update",
			targetType: "template",
			targetId: args.templateKey,
			before: {
				...before,
				definition: existing.definition !== undefined ? "[blob]" : undefined,
			},
			after: {
				templateKey: existing.templateKey,
				groupKey: next.groupKey,
				label: next.label,
				description: next.description,
				icon: next.icon,
				region: next.region,
				sortOrder: next.sortOrder,
				definition:
					args.patch.definition !== undefined ? "[blob:updated]" : "[blob:unchanged]",
			},
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const setTemplateVisible = mutation({
	args: {
		templateKey: v.string(),
		visible: v.boolean(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
			.unique();
		if (!existing) throw new ConvexError("TEMPLATE_NOT_FOUND");

		if (existing.visible === args.visible) return { ok: true, unchanged: true };

		const before = { visible: existing.visible };
		await ctx.db.patch(existing._id, {
			visible: args.visible,
			updatedBy: userId,
			updatedAt: Date.now(),
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.visibility",
			targetType: "template",
			targetId: args.templateKey,
			before,
			after: { visible: args.visible },
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const archiveTemplate = mutation({
	args: {
		templateKey: v.string(),
		archive: v.boolean(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
			.unique();
		if (!existing) throw new ConvexError("TEMPLATE_NOT_FOUND");

		if (existing.isArchived === args.archive) return { ok: true, unchanged: true };

		const before = { isArchived: existing.isArchived };
		await ctx.db.patch(existing._id, {
			isArchived: args.archive,
			updatedBy: userId,
			updatedAt: Date.now(),
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.archive",
			targetType: "template",
			targetId: args.templateKey,
			before,
			after: { isArchived: args.archive },
			reason: args.reason,
		});

		return { ok: true };
	},
});

/**
 * Hard-delete a template. Per L8:
 *   - `confirmKey` MUST equal `templateKey`. Mismatch → `TYPED_CONFIRM_MISMATCH`.
 *   - Any org with `industry === templateKey` blocks the delete with
 *     `TEMPLATE_IN_USE`.
 *   - `isBuiltIn` is informational; the UI surfaces a banner but the
 *     mutation accepts the delete.
 */
export const deleteTemplate = mutation({
	args: {
		templateKey: v.string(),
		confirmKey: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		if (args.confirmKey.trim() !== args.templateKey) {
			throw new ConvexError("TYPED_CONFIRM_MISMATCH");
		}

		const existing = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
			.unique();
		if (!existing) throw new ConvexError("TEMPLATE_NOT_FOUND");

		// Usage check: scan the orgs table once (no by_industry index — owner
		// panel is infrequent + small org count vs a tenant-facing read).
		// Bail at the first hit.
		const orgs = await ctx.db.query("orgs").collect();
		const inUse = orgs.find(
			(o) => o.industry === args.templateKey && o.deletedAt === undefined,
		);
		if (inUse) {
			throw new ConvexError(`TEMPLATE_IN_USE:${inUse.slug}`);
		}

		const before = { ...existing };
		await ctx.db.delete(existing._id);
		await removeReservedSlugMirror(ctx, "template", args.templateKey);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.delete",
			targetType: "template",
			targetId: args.templateKey,
			before: {
				...before,
				definition: before.definition !== undefined ? "[blob]" : undefined,
			},
			after: null,
			reason: args.reason,
		});

		return { ok: true };
	},
});

/**
 * Clone an existing template into a new (custom) one.
 *
 * Stage 3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md. Takes the source row's
 * `definition` blob, deep-clones it via `JSON.parse(JSON.stringify(...))`,
 * and inserts a new row with:
 *   - `templateKey = newTemplateKey` (must be unique across all templates).
 *   - `groupKey = newGroupKey ?? source.groupKey`.
 *   - `label / description / icon` overridden when supplied; otherwise
 *     copied from the source.
 *   - `region` copied from the source.
 *   - `visible = true`, `isArchived = false`, `isBuiltIn = false`.
 *   - `sortOrder` appended at the end of the target group.
 *
 * Mirrors the `template`-category reservedSlugs row to prevent
 * cross-category collisions. Audit verb: `owner.industries.template.clone`.
 *
 * Validates the cloned definition through `validateDefinition` so any
 * corruption in the source row is caught before the new row is committed.
 *
 * Why JSON-clone instead of structuredClone:
 *   `JSON.parse(JSON.stringify(...))` is sufficient because every value
 *   inside `definition` is JSON-serialisable (strings, numbers, booleans,
 *   nested objects/arrays). Convex stores documents as JSON-equivalent
 *   data, so the round-trip is lossless.
 */
export const cloneTemplate = mutation({
	args: {
		sourceTemplateKey: v.string(),
		newTemplateKey: v.string(),
		newGroupKey: v.optional(v.string()),
		newLabel: v.optional(v.string()),
		newDescription: v.optional(v.string()),
		newIcon: v.optional(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const source = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.sourceTemplateKey))
			.unique();
		if (!source) throw new ConvexError("SOURCE_TEMPLATE_NOT_FOUND");

		const newTemplateKey = args.newTemplateKey.trim().toLowerCase();
		assertValidKey(newTemplateKey, "templateKey");

		// Reject when the new key collides with an existing template,
		// org-slug reservation, or industry-group key.
		const exists = await ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", newTemplateKey))
			.unique();
		if (exists) throw new ConvexError("TEMPLATE_KEY_TAKEN");

		const reservedAsOrg = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) =>
				q.eq("category", "org").eq("slug", newTemplateKey),
			)
			.unique();
		if (reservedAsOrg) throw new ConvexError("TEMPLATE_KEY_COLLIDES_ORG_SLUG");

		const reservedAsGroup = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) =>
				q.eq("category", "industryGroup").eq("slug", newTemplateKey),
			)
			.unique();
		if (reservedAsGroup) throw new ConvexError("TEMPLATE_KEY_COLLIDES_GROUP");

		// Resolve target group — defaults to the source's group when
		// the caller doesn't override it. The chosen group MUST exist.
		const targetGroupKey = args.newGroupKey?.trim() || source.groupKey;
		const group = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", targetGroupKey))
			.unique();
		if (!group) throw new ConvexError("GROUP_NOT_FOUND");

		// Deep-clone the definition — every nested value is JSON-safe so
		// stringify/parse is sufficient and avoids any reference sharing.
		const clonedDefinition: Record<string, unknown> = JSON.parse(
			JSON.stringify(source.definition ?? {}),
		);
		assertValidDefinition(clonedDefinition);

		const now = Date.now();
		const sortOrder = await nextSortOrderInGroup(ctx, targetGroupKey);
		const label = args.newLabel?.trim() || source.label;
		const description = args.newDescription?.trim() || source.description;
		const icon = args.newIcon?.trim() || source.icon;

		const id = await ctx.db.insert("platformTemplates", {
			templateKey: newTemplateKey,
			groupKey: targetGroupKey,
			label,
			description,
			icon,
			region: source.region,
			visible: true,
			sortOrder,
			isBuiltIn: false,
			isArchived: false,
			definition: clonedDefinition,
			createdBy: userId,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		await ensureReservedSlug(ctx, {
			category: "template",
			slug: newTemplateKey,
			isBuiltIn: false,
			userId,
			reason: `Auto-mirrored from platformTemplates (${newTemplateKey})`,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.clone",
			targetType: "template",
			targetId: newTemplateKey,
			before: null,
			after: {
				_id: id,
				templateKey: newTemplateKey,
				clonedFrom: source.templateKey,
				groupKey: targetGroupKey,
				label,
				sortOrder,
			},
			reason: args.reason,
		});

		return { ok: true, templateKey: newTemplateKey };
	},
});

export const reorderTemplates = mutation({
	args: {
		groupKey: v.string(),
		ordered: v.array(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const group = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
		if (!group) throw new ConvexError("GROUP_NOT_FOUND");

		// Resolve every templateKey in the order list before any write.
		const rows = [];
		for (const key of args.ordered) {
			const t = await ctx.db
				.query("platformTemplates")
				.withIndex("by_templateKey", (q) => q.eq("templateKey", key))
				.unique();
			if (!t) throw new ConvexError(`TEMPLATE_NOT_FOUND:${key}`);
			if (t.groupKey !== args.groupKey) {
				throw new ConvexError(`TEMPLATE_NOT_IN_GROUP:${key}`);
			}
			rows.push(t);
		}

		const before = rows.map((t) => ({
			templateKey: t.templateKey,
			sortOrder: t.sortOrder,
		}));
		const now = Date.now();
		for (let i = 0; i < rows.length; i++) {
			await ctx.db.patch(rows[i]!._id, {
				sortOrder: (i + 1) * 10,
				updatedBy: userId,
				updatedAt: now,
			});
		}
		const after = rows.map((t, i) => ({
			templateKey: t.templateKey,
			sortOrder: (i + 1) * 10,
		}));

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.industries.template.reorder",
			targetType: "template",
			targetId: `${args.groupKey}:${args.ordered.join(",")}`,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});
