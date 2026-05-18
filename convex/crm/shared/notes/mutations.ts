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
import type { Doc, Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
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
		// New cards land at the top of their category column. Compute the
		// top-of-column sortOrder from the existing rows so the freshly-created
		// note sits above every existing card. (gap-based: subtract 1024 from
		// the current minimum.)
		const sortOrder = await topOfColumnSortOrder(ctx, args.orgId, categoryId);
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
			sortOrder,
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
 * Single-mutation move + recategorize used by the Kanban drag and the
 * per-card category dot picker. Accepts `categoryId` (which column) and
 * optionally `sortOrder` (free position within that column).
 *
 * Permission: same as `update` — owner with `notes.updateOwn` OR an admin
 * with `notes.deleteAny`. Wrapping it here saves a round-trip and keeps
 * the wire payload small when a user moves dozens of cards in a session.
 *
 * - Drag drop → `categoryId` + `sortOrder` (midpoint between neighbours).
 * - Dropdown picker → only `categoryId` (server stamps a top-of-column
 *   sortOrder so the recategorized card lands at the top of the new
 *   column, matching the user's expectation when they pick a category).
 */
export const setCategory = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		categoryId: v.id("noteCategories"),
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		// Same drag-rate guard as `reorder`. Cross-column drops fire
		// `setCategory` instead of `reorder`, so the throttle has to gate
		// both for full coverage. We use the SAME scope so the budget is
		// shared — a user dragging non-stop across columns counts the
		// same as one dragging within a column.
		await enforceRateLimit(ctx, {
			scope: "notes.reorder",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

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

		const sameCategory = note.categoryId === args.categoryId;
		const sameOrder = args.sortOrder === undefined || note.sortOrder === args.sortOrder;
		if (sameCategory && sameOrder) return; // idempotent

		// Compute the new sortOrder.
		// - explicit value from the drag handler → use it
		// - otherwise (dropdown picker, no neighbours) → server stamps a
		//   top-of-column position so the recategorized card lands above
		//   every existing card in the new column.
		let nextSortOrder: number | undefined = args.sortOrder;
		if (nextSortOrder === undefined && !sameCategory) {
			nextSortOrder = await topOfColumnSortOrder(ctx, args.orgId, args.categoryId);
		}

		const patch: Record<string, unknown> = {
			categoryId: args.categoryId,
			updatedAt: Date.now(),
		};
		if (nextSortOrder !== undefined) patch.sortOrder = nextSortOrder;
		await ctx.db.patch(args.noteId, patch);

		// Defensive: if the drop landed in a tight neighbour gap, renumber
		// the destination column with 1024-step gaps. Idempotent — bails
		// when the column is already well-spaced.
		await rebalanceCategoryIfTight(ctx, args.orgId, args.categoryId);

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

/**
 * In-column reorder fast-path. Used by the kanban drag handler when the
 * card stays in the same column — only `sortOrder` changes. RBAC mirrors
 * `setCategory`.
 */
export const reorder = orgMutation({
	args: {
		orgId: v.id("orgs"),
		noteId: v.id("notes"),
		sortOrder: v.number(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		// Drag-rate guard. A single user dragging cards rapidly should not
		// be able to flood the deployment. 120 reorders/min ≈ 2/sec is
		// generous for a fast user but cuts off automated abuse / bug
		// loops at 10× normal use.
		await enforceRateLimit(ctx, {
			scope: "notes.reorder",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

		const note = await ctx.db.get(args.noteId);
		if (!note || note.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const isOwn = note.authorId === userId;
		const canEditOwn = hasPermission(member.permissions, "notes.updateOwn");
		const canEditAny = hasPermission(member.permissions, "notes.deleteAny");
		if (!(canEditAny || (isOwn && canEditOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		if (note.sortOrder === args.sortOrder) return; // idempotent
		await ctx.db.patch(args.noteId, {
			sortOrder: args.sortOrder,
			updatedAt: Date.now(),
		});

		// Defensive rebalance — same call as `setCategory`. Skipped when the
		// column is already well-spaced.
		if (note.categoryId !== undefined) {
			await rebalanceCategoryIfTight(ctx, args.orgId, note.categoryId);
		}
	},
});

/**
 * Compute a sortOrder that places a new note at the top of a category
 * column. The current minimum sortOrder in the column is the top; we
 * subtract 1024 (gap-based allocation) so the new value sits above
 * everything.
 *
 * If the column is empty or every existing row has no sortOrder yet
 * (pre-migration), returns a sensible default (`-Date.now()`) which is
 * also where the seed migration places fresh rows.
 */
async function topOfColumnSortOrder(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
	categoryId: Id<"noteCategories">,
): Promise<number> {
	const rows: Array<Doc<"notes">> = await ctx.db
		.query("notes")
		.withIndex("by_org_and_category", (q) => q.eq("orgId", orgId).eq("categoryId", categoryId))
		.take(500);
	let min: number | undefined;
	for (const r of rows) {
		if (r.sortOrder === undefined) continue;
		if (min === undefined || r.sortOrder < min) min = r.sortOrder;
	}
	if (min === undefined) return -Date.now();
	return min - 1024;
}

/**
 * Defensive rebalance: if any two adjacent cards in a category column have
 * an absolute sortOrder gap below `MIN_GAP`, renumber the entire column
 * with 1024-step gaps. Cheap (one column rarely exceeds a few hundred
 * cards) and rare in practice (1024-step allocation survives ~50 inserts
 * in the same gap before precision issues — float64 mantissa is 53 bits,
 * so the practical limit is ~2^40 successive midpoints before rounding
 * actually causes ordering ambiguity).
 *
 * Called from `setCategory` and `reorder` after the patch. Idempotent:
 * if the column is already well-spaced, the function bails without
 * writing.
 *
 * Threshold rationale: previously `MIN_GAP = 1` collapsed after just ~10
 * midpoint inserts (1024 → 512 → 256 → … → 1 → 0.5). That triggered the
 * rebalance on every drop in a popular column, which patched every row
 * in the column → every patch invalidated every `listForOrg` subscription
 * → 100+ function calls/min for a single user dragging cards. The new
 * threshold (`2 ** -10` ≈ 0.001) only fires when float precision is
 * actually at risk — roughly 20+ consecutive midpoints in the same gap.
 *
 * Concurrency: the rebalance writes N rows in one transaction, so other
 * mutations on the same column (a second user dragging) will OCC-conflict
 * and retry. That's fine — rebalance is rare. We use `take(2000)` because
 * Convex transactions read-set caps at 8000 docs; 2000 keeps headroom.
 */
const MIN_GAP = 2 ** -10; // ≈ 0.000976
const REBALANCE_STEP = 1024;

async function rebalanceCategoryIfTight(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	categoryId: Id<"noteCategories">,
): Promise<void> {
	const rows: Array<Doc<"notes">> = await ctx.db
		.query("notes")
		.withIndex("by_org_and_category", (q) => q.eq("orgId", orgId).eq("categoryId", categoryId))
		.take(2000);
	if (rows.length < 2) return;

	const sorted = rows
		.slice()
		.sort((a, b) => (a.sortOrder ?? -a._creationTime) - (b.sortOrder ?? -b._creationTime));

	let needsRebalance = false;
	for (let i = 1; i < sorted.length; i += 1) {
		const prev = sorted[i - 1].sortOrder ?? -sorted[i - 1]._creationTime;
		const curr = sorted[i].sortOrder ?? -sorted[i]._creationTime;
		if (Math.abs(curr - prev) < MIN_GAP) {
			needsRebalance = true;
			break;
		}
	}
	if (!needsRebalance) return;

	const now = Date.now();
	for (let i = 0; i < sorted.length; i += 1) {
		const target = (i + 1) * REBALANCE_STEP;
		if (sorted[i].sortOrder === target) continue;
		await ctx.db.patch(sorted[i]._id, { sortOrder: target, updatedAt: now });
	}
}

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
