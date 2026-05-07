/**
 * AI Internal Functions — convex/ai/internal.ts
 *
 * Phase 3 placeholder. These functions are wired up in mutations NOW
 * via ctx.scheduler.runAfter() so that Phase 3 only needs to fill in
 * the function bodies — no mutation files need to be touched.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Rebuild AI context for an entity after a mutation.
 * Phase 3: will scan timeline, notes, deals, and rebuild the aiContext field.
 * Currently a no-op — wired up so mutations don't need changes later.
 */
export const rebuildEntityContext = internalMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(), // "lead"|"contact"|"deal"|"company"
		entityId: v.string(),
		personCode: v.optional(v.string()),
	},
	handler: async (_ctx, _args) => {
		// Phase 3: implement AI context rebuild here
		// Will scan: activityLogs, notes, reminders, deals for this entity
		// Will write: updated aiContext field on the entity
	},
});
