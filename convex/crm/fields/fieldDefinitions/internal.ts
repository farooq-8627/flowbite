/**
 * Field Definitions — Internal helpers
 *
 * Idempotent seeder + bounded-cascade cleanup. Called by:
 *   - `orgs.mutations.updateOrgIndustry` (onboarding step 2 — production path)
 *   - `fieldDefinitions.mutations.ensureForOrg` (lazy fallback, called by
 *     useEntityFields when it sees zero rows for an existing org)
 *   - `fieldDefinitions.mutations.remove` (cascade continuation when a field
 *     has > 500 fieldValues attached)
 */

import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import { getDefaultFieldDefinitions } from "../../../orgs/templates/fields";

const CASCADE_BATCH = 500;

/**
 * Seed missing field definitions for a (orgId, industry).
 * Returns the number of rows inserted.
 *
 * Default-stage pinning
 * ─────────────────────
 * Locked decision (2026-05-20): every `entityType: "deal"` field MUST be
 * pinned to at least one stage. Empty `showInStages` no longer means
 * "show on every stage". When seeding deal fields we therefore pin them
 * to the Default stage of every existing deal pipeline in the org so
 * they appear immediately in the Defaults tab.
 *
 * If no deal pipelines exist yet (org just created), we still seed the
 * field rows but leave their `showInStages` empty. The
 * `pipelines.create` mutation backfills them onto the Default stage of
 * the new pipeline as soon as the org's first pipeline is inserted.
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

	// Pre-load default stage ids for deal pipelines so newly-seeded deal
	// fields can be pinned in one shot. Other entity types use empty
	// showInStages today (no pipelines).
	const dealPipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", orgId).eq("entityType", "deal"))
		.collect();
	const dealDefaultStageIds: string[] = [];
	for (const p of dealPipelines) {
		const def = p.stages.find((s) => s.isDefaultStage === true);
		if (def) dealDefaultStageIds.push(def.id);
	}

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

		// Auto-pin deal fields to every existing deal pipeline's Default
		// stage. Other entity types stay empty.
		const showInStages =
			seed.entityType === "deal" && dealDefaultStageIds.length > 0
				? dealDefaultStageIds
				: undefined;

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
			showInStages,
			createdAt: now,
			updatedAt: now,
		});
		inserted += 1;
	}
	return inserted;
}

/**
 * Bounded continuation: deletes the next 500 fieldValues for the given field.
 * Reschedules itself if more remain. Removes the fieldDefinition row when
 * the cascade is complete.
 */
export const purgeFieldDefinitionCascade = internalMutation({
	args: { orgId: v.id("orgs"), fieldId: v.id("fieldDefinitions") },
	handler: async (ctx, args) => {
		const values = await ctx.db
			.query("fieldValues")
			.withIndex("by_field_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("fieldId", args.fieldId),
			)
			.take(CASCADE_BATCH);

		if (values.length === 0) {
			const field = await ctx.db.get(args.fieldId);
			if (field) await ctx.db.delete(args.fieldId);
			return { remaining: 0, removed: true };
		}

		await Promise.all(values.map((fv) => ctx.db.delete(fv._id)));

		if (values.length === CASCADE_BATCH) {
			await ctx.scheduler.runAfter(
				0,
				internal.crm.fields.fieldDefinitions.internal.purgeFieldDefinitionCascade,
				{ orgId: args.orgId, fieldId: args.fieldId },
			);
		} else {
			const field = await ctx.db.get(args.fieldId);
			if (field) await ctx.db.delete(args.fieldId);
		}
		return { remaining: values.length, removed: values.length < CASCADE_BATCH };
	},
});
