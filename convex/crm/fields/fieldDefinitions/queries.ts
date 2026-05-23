/**
 * Field Definitions Queries — convex/crm/fields/fieldDefinitions/queries.ts
 *
 * Dynamic field schema per entity type per org.
 * Per deep-plan.md Module 16: field types, groups, required, validation, tier limits.
 */
import { v } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";

// ─── Shared body ──────────────────────────────────────────────────────────────
//
// Extracted so the public `listByEntity` and the AI-only `listByEntityForAI`
// share one implementation. See `convex/ai/tools/_shared.ts` for why the
// AI variant exists (scheduled internal actions lose auth identity).
async function listByEntityImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; entityType: string },
) {
	const fields = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();
	return fields.sort((a, b) => a.order - b.order);
}

export const listByEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		return listByEntityImpl(ctx, args);
	},
});

/**
 * AI-callable internal twin of `listByEntity`.
 *
 * Called via `toolQuery` from inside `processChat.run` (an `internalAction`
 * that has no auth identity). The trusted `userId` is forwarded by the
 * orchestrator's `ToolContext`. We re-validate org membership via
 * `requireOrgMemberByIds` so a member who lost access mid-conversation
 * cannot keep reading.
 */
export const listByEntityForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return listByEntityImpl(ctx, args);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), fieldId: v.id("fieldDefinitions") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const field = await ctx.db.get(args.fieldId);
		if (!field || field.orgId !== args.orgId) return null;
		return field;
	},
});
