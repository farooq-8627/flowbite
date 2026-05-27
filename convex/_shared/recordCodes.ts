/**
 * Record Code Generators — convex/_shared/recordCodes.ts
 *
 * Generates human-readable, org-unique codes for every entity.
 * personCode travels with a person forever (lead → contact → deals → projects).
 * entityCodes are per-type counters (dealCode, companyCode, etc.).
 *
 * Format: {PREFIX}-{ZERO_PADDED_NUMBER}
 * Examples: P-001, D-042, CO-007, T-003
 *
 * Prefixes are customizable per org via orgs.settings.codePrefixes.
 * Numbers are permanent — only prefixes change on rename.
 *
 * Architecture: v3 — personCode system
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const DEFAULT_PREFIXES: Record<string, string> = {
	person: "P",
	deal: "D",
	company: "CO",
	project: "PJ",
	task: "T",
};

async function incrementCounter(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	entityType: string,
): Promise<number> {
	const row = await ctx.db
		.query("entityCodeCounters")
		.withIndex("by_org_and_type", (q) => q.eq("orgId", orgId).eq("entityType", entityType))
		.first();

	const next = (row?.count ?? 0) + 1;
	if (row) {
		await ctx.db.patch(row._id, { count: next });
	} else {
		await ctx.db.insert("entityCodeCounters", {
			orgId,
			entityType,
			count: 1,
			createdAt: Date.now(),
		});
	}
	return next;
}

/**
 * generatePersonCode — called ONLY at lead creation.
 * The generated code is then passed to contact on conversion.
 * Never called again for the same person.
 *
 * @example "P-001", "IN-042" (if org uses "IN" prefix)
 */
export async function generatePersonCode(ctx: MutationCtx, orgId: Id<"orgs">): Promise<string> {
	const org = await ctx.db.get(orgId);
	const prefix =
		(org?.settings?.codePrefixes as Record<string, string> | undefined)?.person ??
		DEFAULT_PREFIXES.person;
	const count = await incrementCounter(ctx, orgId, "person");
	return `${prefix}-${String(count).padStart(3, "0")}`;
}

/**
 * generateEntityCode — called for deals, companies, projects, tasks.
 * Each entity type has its own counter.
 *
 * @example "D-001", "CO-007", "T-003"
 */
export async function generateEntityCode(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	entityType: "deal" | "company" | "project" | "task",
): Promise<string> {
	const org = await ctx.db.get(orgId);
	const prefix =
		(org?.settings?.codePrefixes as Record<string, string> | undefined)?.[entityType] ??
		DEFAULT_PREFIXES[entityType];
	const count = await incrementCounter(ctx, orgId, entityType);
	return `${prefix}-${String(count).padStart(3, "0")}`;
}
