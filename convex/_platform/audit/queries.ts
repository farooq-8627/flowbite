/**
 * Platform audit log queries — convex/_platform/audit/queries.ts
 *
 * Read-only owner-panel access to `platformAuditLogs`. Cursor paginated;
 * never `.collect()` because the table grows monotonically (decision S10
 * in PLATFORM-OWNER-PANEL.md §13).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 7 (Audit log section).
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Cursor-paginated audit log. Newest entries first. Optional `action`
 * filter narrows to a single verb (e.g. only `owner.tier.update`).
 */
export const listAuditLogs = query({
	args: {
		paginationOpts: paginationOptsValidator,
		action: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);

		const builder = args.action
			? ctx.db
					.query("platformAuditLogs")
					.withIndex("by_action", (q) => q.eq("action", args.action as string))
					.order("desc")
			: ctx.db.query("platformAuditLogs").withIndex("by_created").order("desc");

		return builder.paginate(args.paginationOpts);
	},
});

/**
 * Top-N most recent rows — used by the Overview "Recent admin actions"
 * card. Bounded to 25 to keep the read cap small.
 */
export const listRecent = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
		return ctx.db.query("platformAuditLogs").withIndex("by_created").order("desc").take(cap);
	},
});
