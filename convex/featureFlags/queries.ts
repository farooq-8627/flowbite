import { authenticatedQuery } from "../_functions/authenticated";

/**
 * Get all feature flags for the current org.
 * Returns a map of { flagKey: boolean } — org overrides take precedence.
 */
export const getForOrg = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		// Get the user's current org from their default org
		const user = await ctx.db.get(ctx.userId);
		const orgId = user?.defaultOrgId;

		const flags = await ctx.db.query("featureFlags").collect();

		const result: Record<string, boolean> = {};
		for (const flag of flags) {
			// Org-level override takes precedence over global enabled
			const orgOverride = orgId
				? (flag.orgOverrides as Record<string, boolean> | undefined)?.[orgId]
				: undefined;
			result[flag.key] = orgOverride ?? flag.enabled;
		}
		return result;
	},
});
