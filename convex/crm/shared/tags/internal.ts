/**
 * Tag internals — convex/crm/shared/tags/internal.ts
 *
 * Cascade-cleanup helpers used by `tags.remove`. When a tag has many
 * `entityTags` rows attached, the public mutation deletes 500 at a time and
 * schedules `purgeTagCascade` to finish the job — keeping each transaction
 * well under Convex's per-call read/write limits.
 */
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalMutation } from "../../../_generated/server";

const CASCADE_BATCH = 500;

/**
 * Internal sweeper. Deletes the next `CASCADE_BATCH` entityTags rows for the
 * given tag. Reschedules itself if more remain. Deletes the tag row when
 * empty.
 */
export const purgeTagCascade = internalMutation({
	args: { orgId: v.id("orgs"), tagId: v.id("tags") },
	handler: async (ctx, args) => {
		const links = await ctx.db
			.query("entityTags")
			.withIndex("by_tag", (q) => q.eq("orgId", args.orgId).eq("tagId", args.tagId))
			.take(CASCADE_BATCH);

		if (links.length === 0) {
			const tag = await ctx.db.get(args.tagId);
			if (tag) await ctx.db.delete(args.tagId);
			return { remaining: 0, removed: true };
		}

		await Promise.all(links.map((l) => ctx.db.delete(l._id)));

		if (links.length === CASCADE_BATCH) {
			await ctx.scheduler.runAfter(0, internal.crm.shared.tags.internal.purgeTagCascade, {
				orgId: args.orgId,
				tagId: args.tagId,
			});
		} else {
			const tag = await ctx.db.get(args.tagId);
			if (tag) await ctx.db.delete(args.tagId);
		}

		return { remaining: links.length, removed: links.length < CASCADE_BATCH };
	},
});
