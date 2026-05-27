/**
 * Owner-panel platform-context query — convex/_platform/platformContext/queries.ts
 *
 * Read access to the singleton `platformContext.main` row that's injected
 * into Layer 1 of every AI system prompt. The owner panel's AI Context
 * editor surfaces the current row + its version + rules list.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 6, §10 stage 6.
 */
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

export const getMain = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("platformContext")
			.withIndex("by_key", (q) => q.eq("key", "main"))
			.unique();
	},
});
