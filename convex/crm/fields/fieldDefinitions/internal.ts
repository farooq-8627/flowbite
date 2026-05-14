/**
 * Field Definitions — Internal Seeding Helper
 *
 * Single, idempotent seeder for `fieldDefinitions` rows. Used by:
 *   - `orgs.mutations.updateOrgIndustry` (onboarding step 2 — production path)
 *   - `fieldDefinitions.mutations.ensureForOrg` (lazy fallback, called by
 *     useEntityFields when it sees zero rows for an existing org)
 *   - `fieldDefinitions.migrations.seedAllOrgs` (internal action — one-shot to
 *     fix existing dev orgs after deploying dynamic fields)
 *
 * Idempotent contract: re-running NEVER duplicates; it only inserts
 * (entityType, name) pairs that don't yet exist.
 */

import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { getDefaultFieldDefinitions } from "../../../orgs/templates/fields";

/**
 * Seed missing field definitions for a (orgId, industry).
 * Returns the number of rows inserted.
 */
export async function seedFieldDefinitionsForOrg(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	industry: string,
	now: number = Date.now(),
): Promise<number> {
	const seeds = getDefaultFieldDefinitions(industry);

	const existing = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", orgId))
		.collect();
	const existingKey = new Set<string>(existing.map((r) => `${r.entityType}::${r.name}`));

	// Track per-entity max order so newly seeded rows append cleanly.
	const maxOrderByEntity = new Map<string, number>();
	for (const r of existing) {
		const cur = maxOrderByEntity.get(r.entityType) ?? -1;
		if (r.order > cur) maxOrderByEntity.set(r.entityType, r.order);
	}

	let inserted = 0;
	for (const seed of seeds) {
		const key = `${seed.entityType}::${seed.name}`;
		if (existingKey.has(key)) continue;

		const nextOrder = (maxOrderByEntity.get(seed.entityType) ?? -1) + 1;
		maxOrderByEntity.set(seed.entityType, nextOrder);

		await ctx.db.insert("fieldDefinitions", {
			orgId,
			entityType: seed.entityType,
			name: seed.name,
			label: seed.label,
			type: seed.type,
			kind: seed.kind,
			storage: seed.storage,
			columnKey: seed.columnKey,
			system: seed.system ?? false,
			protected: seed.protected ?? false,
			hidden: false,
			options: seed.options,
			required: seed.required ?? false,
			order: nextOrder,
			createdAt: now,
			updatedAt: now,
		});
		inserted += 1;
	}
	return inserted;
}
