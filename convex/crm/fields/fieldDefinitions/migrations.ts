/**
 * Field Definitions — One-Shot Migration
 *
 * `seedAllOrgs` — internal action you run from the Convex CLI once after
 * deploying dynamic fields. Walks every org and inserts the seed
 * `fieldDefinitions` rows it's missing. Idempotent: safe to re-run.
 *
 * USAGE:
 *   npx convex run crm/fields/fieldDefinitions/migrations:seedAllOrgs
 */

import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../../../_generated/server";
import { seedFieldDefinitionsForOrg } from "./internal";

/** Internal-only: list every non-deleted org with its industry. */
export const listOrgs = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		return orgs
			.filter((o) => o.deletedAt === undefined)
			.map((o) => ({ _id: o._id, name: o.name, industry: o.industry ?? "general" }));
	},
});

/** Internal mutation invoked once per org from the action. */
export const seedSingleOrg = internalMutation({
	args: { orgId: v.id("orgs"), industry: v.string() },
	handler: async (ctx, args) => {
		return seedFieldDefinitionsForOrg(ctx, args.orgId, args.industry);
	},
});

/**
 * Walks all non-deleted orgs and seeds missing field definitions for each.
 * Returns a summary of inserted-row counts per org.
 */
export const seedAllOrgs = internalAction({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.runQuery(internal.crm.fields.fieldDefinitions.migrations.listOrgs);

		const summary: Array<{ orgId: Id<"orgs">; orgName: string; inserted: number }> = [];
		for (const org of orgs) {
			const inserted = await ctx.runMutation(
				internal.crm.fields.fieldDefinitions.migrations.seedSingleOrg,
				{ orgId: org._id, industry: org.industry },
			);
			summary.push({ orgId: org._id, orgName: org.name, inserted });
		}

		const total = summary.reduce((sum, s) => sum + s.inserted, 0);
		console.log(`Seeded ${total} field definition rows across ${summary.length} org(s).`);
		return { total, orgs: summary };
	},
});
