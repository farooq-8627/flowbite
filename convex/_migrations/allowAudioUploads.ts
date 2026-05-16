/**
 * One-shot migration (created 2026-05-17) — backfill the `audio` MIME category
 * onto orgs whose file-upload policy was configured before voice notes shipped.
 *
 * Why this is needed
 * ──────────────────
 * `convex/files/mutations.ts::record` rejects any upload whose MIME doesn't
 * match a category in `org.settings.fileUpload.allowedMimeCategories`. When
 * that array is empty/unset, every category is allowed (default), so newly
 * created orgs can already upload voice notes. The problem is older orgs
 * that explicitly chose a small whitelist (e.g. `["image", "pdf"]`) — their
 * members get a 403 when sending voice notes.
 *
 * What this does
 * ──────────────
 * Walks every non-deleted org and, when `allowedMimeCategories` is a
 * non-empty array missing `"audio"`, patches the array to include it.
 * Idempotent — orgs already including `"audio"` (and orgs in the unset /
 * empty default state) are skipped.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/allowAudioUploads:run
 *   npx convex run _migrations/allowAudioUploads:runDryRun
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";

const TARGET_CATEGORY = "audio";

/** List orgs whose policy explicitly omits "audio". */
export const listOrgsMissingAudio = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		return orgs
			.filter((o) => o.deletedAt === undefined)
			.filter((o) => {
				const cats = o.settings?.fileUpload?.allowedMimeCategories;
				if (!cats || cats.length === 0) return false; // default = allow all
				return !cats.includes(TARGET_CATEGORY);
			})
			.map((o) => ({
				_id: o._id,
				name: o.name,
				current: o.settings?.fileUpload?.allowedMimeCategories ?? [],
			}));
	},
});

/** Patch one org — append "audio" to its allowedMimeCategories. */
export const addAudioToSingleOrg = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt !== undefined) {
			return { changed: false as const, reason: "not-found-or-deleted" };
		}
		const existing = org.settings?.fileUpload?.allowedMimeCategories ?? [];
		if (existing.length === 0) {
			return { changed: false as const, reason: "default-allow-all" };
		}
		if (existing.includes(TARGET_CATEGORY)) {
			return { changed: false as const, reason: "already-includes-audio" };
		}
		const next = [...existing, TARGET_CATEGORY];
		await ctx.db.patch(args.orgId, {
			settings: {
				...(org.settings ?? {}),
				fileUpload: {
					...(org.settings?.fileUpload ?? {}),
					allowedMimeCategories: next,
				},
			},
			updatedAt: Date.now(),
		});
		return { changed: true as const, before: existing, after: next };
	},
});

/**
 * Idempotent: walk every affected org and patch in `"audio"`. Returns a
 * per-org summary so you can verify in the Convex dashboard that the right
 * rows were touched.
 */
export const run = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		patched: number;
		orgs: Array<{ orgId: Id<"orgs">; orgName: string; before: string[]; after: string[] }>;
	}> => {
		const orgs: Array<{ _id: Id<"orgs">; name: string; current: string[] }> =
			await ctx.runQuery(internal._migrations.allowAudioUploads.listOrgsMissingAudio);
		const summary: Array<{
			orgId: Id<"orgs">;
			orgName: string;
			before: string[];
			after: string[];
		}> = [];
		for (const org of orgs) {
			const result = await ctx.runMutation(
				internal._migrations.allowAudioUploads.addAudioToSingleOrg,
				{ orgId: org._id },
			);
			if (result.changed) {
				summary.push({
					orgId: org._id,
					orgName: org.name,
					before: result.before,
					after: result.after,
				});
			}
		}
		return { patched: summary.length, orgs: summary };
	},
});

/** Dry-run: same query, no writes. */
export const runDryRun = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		wouldPatch: number;
		orgs: Array<{ orgId: Id<"orgs">; orgName: string; current: string[]; next: string[] }>;
	}> => {
		const orgs: Array<{ _id: Id<"orgs">; name: string; current: string[] }> =
			await ctx.runQuery(internal._migrations.allowAudioUploads.listOrgsMissingAudio);
		return {
			wouldPatch: orgs.length,
			orgs: orgs.map((o) => ({
				orgId: o._id,
				orgName: o.name,
				current: o.current,
				next: [...o.current, TARGET_CATEGORY],
			})),
		};
	},
});
