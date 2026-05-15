/**
 * Schema Cleanup Migrations
 * =========================
 *
 * One-shot internal mutations that bring legacy/drifted documents back in line
 * with the current schema. Each follows the **widen → migrate → narrow** pattern
 * from `.kiro/skills/convex-migration-helper/SKILL.md`:
 *
 *   1. Add the deprecated field back to the schema as `v.optional(...)` (widen)
 *   2. Deploy
 *   3. Run the migration here (data is preserved, just renamed/stripped)
 *   4. Remove the deprecated field from the schema (narrow)
 *   5. Re-deploy
 *
 * Run via the Convex CLI:
 *
 *   npx convex run _migrations/cleanup:renameCompanyTeamMembers
 *
 * Mutations are idempotent — safe to re-run.
 */

import type { GenericId } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

/**
 * Loose patch type for clearing a deprecated field that no longer exists in the
 * current schema. Convex's `db.patch` types are inferred from the live schema,
 * so passing `{ deprecatedField: undefined }` would be a type error. We widen
 * to `unknown` here — the runtime accepts it because Convex treats `undefined`
 * as "remove this field" regardless of whether the field is in the validator.
 */
type LegacyPatch<T extends string> = Record<string, unknown> & {
	[K in T]?: undefined;
};

function legacyPatch<T extends string>(patch: LegacyPatch<T>): LegacyPatch<T> {
	return patch;
}

/**
 * Companies — `teamMembers[]` → `assignees[]` rename (Phase 2 backfix).
 *
 * - Merges any user ids in `teamMembers` into `assignees` (deduped).
 * - Removes the `teamMembers` field via `db.patch(id, { teamMembers: undefined })`.
 * - Skips already-migrated rows (no `teamMembers` field).
 */
export const renameCompanyTeamMembers = internalMutation({
	args: {},
	handler: async (ctx) => {
		const companies = await ctx.db.query("companies").collect();
		let migrated = 0;
		let skipped = 0;
		for (const company of companies) {
			// `teamMembers` is the deprecated field — it may not be in the validator
			// at runtime once the schema narrows, but the live document still has it.
			const legacy = (company as unknown as { teamMembers?: Id<"users">[] }).teamMembers;
			if (!legacy || legacy.length === 0) {
				// Even if the array is empty, strip the field so the schema can narrow.
				if (legacy !== undefined) {
					await ctx.db.patch(
						company._id,
						legacyPatch<"teamMembers">({ teamMembers: undefined }) as never,
					);
					migrated++;
				} else {
					skipped++;
				}
				continue;
			}

			const existing = company.assignees ?? [];
			const merged: GenericId<"users">[] = Array.from(new Set([...existing, ...legacy]));
			await ctx.db.patch(
				company._id,
				legacyPatch<"teamMembers">({
					assignees: merged,
					teamMembers: undefined,
					updatedAt: Date.now(),
				}) as never,
			);
			migrated++;
		}

		console.log(
			`[cleanup] companies.teamMembers → assignees: migrated=${migrated} skipped=${skipped} total=${companies.length}`,
		);
		return { migrated, skipped, total: companies.length };
	},
});
