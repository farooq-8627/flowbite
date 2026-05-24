/**
 * Migration: drop `orgs.aiContext` column. Migrate any non-empty value
 * into `aiPersonaContext.identity` (org-level row, userId === undefined).
 *
 * Why
 * ───
 * `orgs.aiContext` was a single static text blob set during onboarding
 * (industry-template seeding). It was never re-written and never read
 * by the AI loop until 2026-05-24. We've since replaced it with the
 * structured `aiPersonaContext` table, which carries:
 *
 *   - `identity`: the owner-edited blob (this column's content)
 *   - `summary`  + `keyFacts`: AI-managed dynamic memory
 *
 * Keeping the column around means two writers (settings UI + persona
 * tool) and two readers (system prompt) for a piece of data that has
 * one source of truth. Drop it.
 *
 * What this does
 * ──────────────
 *  1. Walk every org. Skip those with no `aiContext` set or an empty
 *     trimmed string.
 *  2. For each, look up the org-level persona row by
 *     `(orgId, userId=undefined)`. If none exists, insert one with
 *     `identity` set + empty AI-managed fields. If one exists already,
 *     patch in the identity (only if the row's identity is currently
 *     empty — never overwrite a manual edit).
 *  3. Clear `aiContext` on the org via `ctx.db.patch(orgId, { aiContext: undefined })`
 *     — we can't actually drop the column from row data; that happens
 *     when the schema validator no longer accepts it. Setting to
 *     undefined is the closest we can do at the row level.
 *  4. After every existing row has `aiContext === undefined`, the field
 *     can be removed from the schema.
 *
 * Idempotent: running again is a no-op since step 1 short-circuits.
 *
 * Triggered manually:
 *   npx convex run --component _migrations._2026_05_24_dropOrgAiContext:run
 *   (run with `dryRun: true` first to see what would change)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { computeByteCount } from "../ai/personaContext";

export const run = internalMutation({
	args: {
		orgId: v.optional(v.id("orgs")),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => o !== null)
			: await ctx.db.query("orgs").collect();

		let scanned = 0;
		let migrated = 0;
		let cleared = 0;
		let skippedAlreadyClean = 0;
		let skippedExistingIdentity = 0;

		for (const org of orgs) {
			scanned++;
			// Tolerant of the field being undefined or absent from older
			// rows (post-schema-drop, that's how every row will look).
			const value = (org as unknown as { aiContext?: string }).aiContext;
			if (!value || value.trim().length === 0) {
				skippedAlreadyClean++;
				continue;
			}
			const trimmed = value.trim();

			const existing = await ctx.db
				.query("aiPersonaContext")
				.withIndex("by_org_and_user", (q) => q.eq("orgId", org._id).eq("userId", undefined))
				.first();

			const now = Date.now();
			if (existing) {
				if (existing.identity && existing.identity.trim().length > 0) {
					// A subsequent settings edit already wrote here —
					// don't clobber it. Just clear the legacy column.
					skippedExistingIdentity++;
				} else if (!dryRun) {
					await ctx.db.patch(existing._id, {
						identity: trimmed,
						lastUpdatedAt: now,
						updatedAt: now,
						byteCount: computeByteCount({
							summary: existing.summary,
							keyFacts: existing.keyFacts,
							preferences: existing.preferences,
						}),
					});
				}
			} else if (!dryRun) {
				await ctx.db.insert("aiPersonaContext", {
					orgId: org._id,
					userId: undefined,
					identity: trimmed,
					summary: "",
					keyFacts: [],
					preferences: undefined,
					byteCount: computeByteCount({ summary: "", keyFacts: [] }),
					lastUpdatedAt: now,
					createdAt: now,
					updatedAt: now,
				});
			}
			migrated++;

			if (!dryRun) {
				// biome-ignore lint/suspicious/noExplicitAny: orgs.aiContext was dropped from the schema; we need to clear pre-migration row data via a loose patch
				await ctx.db.patch(org._id, { aiContext: undefined } as any);
				cleared++;
			}
		}

		return {
			scanned,
			migrated,
			cleared,
			skippedAlreadyClean,
			skippedExistingIdentity,
			dryRun,
		};
	},
});
