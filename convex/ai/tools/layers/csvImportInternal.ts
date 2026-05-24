/**
 * convex/ai/tools/layers/csvImportInternal.ts
 *
 * Internal queries/mutations used by the `import_csv` AI tool
 * (`./csvImport.ts`). The tool itself runs inside a "use node" action,
 * so it can't define `internalMutation`/`internalQuery` directly —
 * Convex requires those in non-Node files.
 *
 * The functions here are private helpers; not part of the auth-bridge
 * `*ForAI` pattern because they don't represent a public API surface.
 * The AI tool that calls them already validated the user's permission
 * via `requirePermission(tc.permissions, "leads.create")`.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../../_generated/server";

/**
 * Insert a fresh `csvImports` row in `parsing` state. Tools call this
 * before invoking the quarantined parser action so the parser has a
 * row to patch.
 */
export const _createCsvImportRowInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		fileId: v.id("files"),
		targetEntity: v.union(
			v.literal("lead"),
			v.literal("contact"),
			v.literal("company"),
			v.literal("deal"),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return ctx.db.insert("csvImports", {
			orgId: args.orgId,
			userId: args.userId,
			fileId: args.fileId,
			targetEntity: args.targetEntity,
			status: "parsing",
			rowCount: 0,
			mapping: {},
			previewRows: [],
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Read an import row's preview state for the AI tool. Org-scoped — the
 * caller passes the orgId from the trusted ToolContext, so a misaddressed
 * id can't leak across orgs.
 */
export const _readCsvImportRowInternal = internalQuery({
	args: {
		csvImportId: v.id("csvImports"),
		orgId: v.id("orgs"),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.csvImportId);
		if (!row || row.orgId !== args.orgId) return null;
		return {
			status: row.status,
			rowCount: row.rowCount,
			previewRows: row.previewRows,
			errors: row.errors,
		};
	},
});
