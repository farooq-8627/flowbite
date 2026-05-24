/**
 * convex/ai/quarantined/csvParserInternal.ts
 *
 * Internal queries/mutations used by `csvParser.ts` (the `"use node"`
 * action can't define `internalMutation` — Convex requires those in
 * non-Node files). This module is the auth-bridge surface for the
 * quarantined parser action.
 *
 * Each handler runs as `internalMutation` / `internalQuery`, so it
 * cannot be called from the client. The CSV parser action is the
 * sole caller.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import type { DedupCandidate } from "../../_shared/dedup";

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Read a single csvImports row. Returns null when missing — the parser
 * action treats null as "give up silently" (the row was probably
 * cancelled while we were running).
 */
export const _getImportRowInternal = internalQuery({
	args: { csvImportId: v.id("csvImports") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.csvImportId);
		if (!row) return null;
		return {
			orgId: row.orgId,
			userId: row.userId,
			fileId: row.fileId,
			targetEntity: row.targetEntity,
		};
	},
});

/**
 * File metadata (storageId + size + mime). Org-scoped — the parser
 * passes the orgId from the import row so a misaddressed file id
 * can't leak into another org.
 */
export const _getFileMetaInternal = internalQuery({
	args: { fileId: v.id("files"), orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId) return null;
		return {
			storageId: file.storageId,
			size: file.size,
			mimeType: file.mimeType,
			name: file.name,
		};
	},
});

/**
 * Dedup candidate set — the most recent N leads in the org. Bounded
 * read; the parser caps comparisons at this set even when the org has
 * more rows. See `convex/_shared/dedup.ts` for the matcher.
 *
 * 5,000 is a conservative cap: at average 5k characters per lead row
 * we read ~25 MB, which is well inside the 16 MB Convex query
 * function limit. Larger orgs will see false-negative dedup decisions
 * for very old leads — the user reviews per-row in the preview UI
 * before approval, so this is a recall-vs-cost trade-off, not a
 * correctness issue.
 */
export const _listDedupCandidatesInternal = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<DedupCandidate[]> => {
		const leads = await ctx.db
			.query("leads")
			.withIndex("by_org_and_email", (q) => q.eq("orgId", args.orgId))
			.take(5000);
		return leads
			.filter((l) => !l.deletedAt)
			.map((l) => ({
				personCode: l.personCode,
				displayName: l.displayName,
				email: l.email ?? null,
				phone: l.phone ?? null,
				companyName: null, // companyName lives on the Company table; Phase 5 hydrates this
			}));
	},
});

// ─── Patch helpers ───────────────────────────────────────────────────────────

/**
 * Patch a csvImports row from the parser action. Schema-validated via
 * v.object so a typo in the parser can't sneak through.
 */
export const _patchImportRowInternal = internalMutation({
	args: {
		csvImportId: v.id("csvImports"),
		patch: v.object({
			status: v.optional(
				v.union(
					v.literal("parsing"),
					v.literal("ready"),
					v.literal("committing"),
					v.literal("completed"),
					v.literal("failed"),
					v.literal("cancelled"),
				),
			),
			rowCount: v.optional(v.number()),
			mapping: v.optional(v.record(v.string(), v.string())),
			sourceHeaders: v.optional(v.array(v.string())),
			previewRows: v.optional(
				v.array(
					v.object({
						idemKey: v.string(),
						fields: v.record(v.string(), v.union(v.string(), v.null())),
						dedupDecision: v.union(
							v.literal("insert"),
							v.literal("merge"),
							v.literal("skip"),
						),
						dedupTargetCode: v.optional(v.string()),
						validationError: v.optional(v.string()),
					}),
				),
			),
			errors: v.optional(v.array(v.string())),
			result: v.optional(
				v.object({
					inserted: v.number(),
					merged: v.number(),
					skipped: v.number(),
					failedRows: v.array(v.object({ idemKey: v.string(), error: v.string() })),
				}),
			),
			parserModel: v.optional(v.string()),
			parserTokens: v.optional(v.number()),
		}),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.csvImportId);
		if (!row) return;
		await ctx.db.patch(args.csvImportId, {
			...args.patch,
			updatedAt: Date.now(),
		});
	},
});
