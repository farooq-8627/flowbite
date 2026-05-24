/**
 * convex/ai/csvImports.ts
 *
 * Public queries for the CSV import preview UI
 * (`PHASE-3-AI-AUDIT.md §6 Week 4`). The actual write paths live in
 * `convex/ai/quarantined/csvParser.ts` (parser action),
 * `convex/ai/tools/layers/csvImport.ts` (AI tool),
 * `convex/ai/tools/layers/csvImportInternal.ts` (internal create/read),
 * and `convex/crm/entities/leads/mutations.ts` (privileged commit).
 *
 * This file only exposes a READ for the preview card. The user must
 * already own the import row (orgId + userId match) — drop-in defence
 * against URL-id enumeration.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../_functions/authenticated";

/**
 * Get a single CSV import row. Returns null when missing, mismatched
 * org, or owned by another user. The preview card calls this with the
 * id surfaced via the propose() payload; the per-row dedup decisions
 * + sourceHeaders + result summary come back so the UI can render the
 * full table.
 */
export const get = orgQuery({
	args: {
		orgId: v.id("orgs"),
		csvImportId: v.id("csvImports"),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const row = await ctx.db.get(args.csvImportId);
		if (!row || row.orgId !== args.orgId || row.userId !== userId) return null;
		// Strip the file id — the UI doesn't need it for the preview and
		// it's a small leak-prevention measure.
		const { fileId: _f, ...rest } = row;
		void _f;
		return rest;
	},
});

/**
 * List the user's most-recent imports. Used by the "Resume CSV import"
 * affordance + the future Settings → Imports surface. Returns metadata
 * only — the heavy `previewRows` field is dropped here.
 */
export const listRecent = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const limit = Math.min(args.limit ?? 10, 50);
		const rows = await ctx.db
			.query("csvImports")
			.withIndex("by_org_and_user_and_status", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.take(limit);
		return rows.map((r) => ({
			_id: r._id,
			status: r.status,
			rowCount: r.rowCount,
			targetEntity: r.targetEntity,
			parserModel: r.parserModel,
			result: r.result,
			createdAt: r.createdAt,
		}));
	},
});
