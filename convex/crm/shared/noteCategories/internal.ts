/**
 * Note Categories — internal helpers.
 *
 * Idempotent seeder. Called by:
 *   - `orgs.mutations.createOrg` (initial seed when an org is freshly created)
 *   - `noteCategories.mutations.ensureForOrg` (lazy fallback for existing
 *     orgs that predate this feature)
 *   - `_migrations/seedNoteCategories` (one-shot migration on rollout)
 *
 * Why a single helper: the rules in AGENTS.md require any schema/data change
 * to migrate IN THE SAME message. Having one canonical seeder means the
 * migration, the org-creation path, and the lazy fallback all converge on
 * the same row shape — no drift.
 */

import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";

/**
 * The 6 default categories every org is seeded with on creation. Values
 * match the legacy `notes.color` enum so existing notes keep their visual
 * identity after the migration backfills `categoryId`.
 *
 * Background hex values are the 100-shade Tailwind colours rendered in the
 * old sticky-note UI. Text colour is derived dynamically by the UI helper
 * `getReadableTextColor` — we don't store an explicit value here.
 */
export const DEFAULT_NOTE_CATEGORIES: ReadonlyArray<{
	/** Stable lookup key — also the legacy `notes.color` enum value. */
	legacyColorKey: "yellow" | "blue" | "green" | "pink" | "purple" | "gray";
	name: string;
	bgColor: string;
	isDefault: boolean;
}> = [
	{ legacyColorKey: "yellow", name: "Yellow", bgColor: "#fde68a", isDefault: true },
	{ legacyColorKey: "blue", name: "Blue", bgColor: "#bae6fd", isDefault: false },
	{ legacyColorKey: "green", name: "Green", bgColor: "#a7f3d0", isDefault: false },
	{ legacyColorKey: "pink", name: "Pink", bgColor: "#fbcfe8", isDefault: false },
	{ legacyColorKey: "purple", name: "Purple", bgColor: "#ddd6fe", isDefault: false },
	{ legacyColorKey: "gray", name: "Gray", bgColor: "#e2e8f0", isDefault: false },
];

/**
 * Seed missing default categories for an org. Returns the number of rows
 * inserted (0 if the org is already seeded).
 *
 * Idempotent: per-name lookup via `by_org_and_name` index. Calling this
 * twice is a no-op.
 */
export async function seedNoteCategoriesForOrg(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	now: number = Date.now(),
): Promise<number> {
	let inserted = 0;
	let position = 0;

	// Find the highest existing position so we append cleanly when partial
	// seeds are present (e.g. user already created their own categories
	// before we ever ran this seeder).
	const existing = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_position", (q) => q.eq("orgId", orgId))
		.collect();
	for (const row of existing) {
		if (row.position >= position) position = row.position + 1;
	}

	const existingNames = new Set(existing.map((c) => c.name));
	const hasAnyDefault = existing.some((c) => c.isDefault && !c.isArchived);

	for (const seed of DEFAULT_NOTE_CATEGORIES) {
		if (existingNames.has(seed.name)) continue;

		// Don't seed a default if the org already has one (human-defined).
		const isDefault = seed.isDefault && !hasAnyDefault;

		await ctx.db.insert("noteCategories", {
			orgId,
			name: seed.name,
			bgColor: seed.bgColor,
			textColor: undefined,
			position,
			isDefault,
			isArchived: false,
			createdAt: now,
			updatedAt: now,
		});
		position += 1;
		inserted += 1;
	}

	return inserted;
}

/**
 * Resolve the legacy color key for a row to its newly-seeded category id.
 * Used by the migration to backfill `notes.categoryId` from the old enum.
 *
 * Returns `null` if no matching category exists in the org (caller decides
 * what to do — usually fall back to the org's default).
 */
export async function lookupCategoryByLegacyColor(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	color: string,
): Promise<Id<"noteCategories"> | null> {
	// Match by display name (e.g. "Yellow") since that's what the seeder uses.
	const seed = DEFAULT_NOTE_CATEGORIES.find((c) => c.legacyColorKey === color);
	const targetName = seed?.name ?? color;
	const row = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_name", (q) => q.eq("orgId", orgId).eq("name", targetName))
		.first();
	return row?._id ?? null;
}

/**
 * Look up the org's default category. Returns `null` if no category is
 * marked default (in which case the caller should bail or fall back to
 * the first category by position).
 */
export async function getDefaultCategoryForOrg(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
): Promise<Id<"noteCategories"> | null> {
	const row = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_default", (q) => q.eq("orgId", orgId).eq("isDefault", true))
		.first();
	if (row && !row.isArchived) return row._id;
	// Fallback: oldest category by position.
	const fallback = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_position", (q) => q.eq("orgId", orgId))
		.first();
	return fallback?._id ?? null;
}
