/**
 * Files Queries — convex/files/queries.ts
 *
 * `listByScope(orgId, scope, scopeId)` — return all non-deleted files attached
 * to a given record, with a short-lived signed URL for display/download.
 *
 * `listByField(orgId, scope, scopeId, fieldKey)` — narrow to a specific dynamic
 * field (e.g. a "contract" file field on a lead).
 *
 * `listByTag(orgId, tag)` — cross-entity attribution lookup. Person-scope files
 * tagged with e.g. "deal:D-001" surface in the deal detail view.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../_functions/authenticated";

export const listByScope = orgQuery({
	args: {
		orgId: v.id("orgs"),
		scope: v.string(),
		scopeId: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const rows = await ctx.db
			.query("files")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", args.scope).eq("scopeId", args.scopeId),
			)
			.collect();
		const active = rows.filter((f) => f.deletedAt === undefined);
		const withUrls = await Promise.all(
			active.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
		return withUrls.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const listByField = orgQuery({
	args: {
		orgId: v.id("orgs"),
		scope: v.string(),
		scopeId: v.string(),
		fieldKey: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const rows = await ctx.db
			.query("files")
			.withIndex("by_org_scope_field", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("scope", args.scope)
					.eq("scopeId", args.scopeId)
					.eq("fieldKey", args.fieldKey),
			)
			.collect();
		const active = rows.filter((f) => f.deletedAt === undefined);
		const withUrls = await Promise.all(
			active.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
		return withUrls.sort((a, b) => b.createdAt - a.createdAt);
	},
});

/**
 * Find files attributed to a tag — used to surface person-scope files in
 * deal/company views without duplication. Tag convention: "deal:D-001",
 * "company:C-001". Server-side tag membership filter (no Convex tag index;
 * we read all org files and filter client-side. Acceptable for this scale
 * since file counts are small per org.)
 */
export const listByTag = orgQuery({
	args: {
		orgId: v.id("orgs"),
		tag: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const rows = await ctx.db
			.query("files")
			.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
			.collect();
		const active = rows.filter((f) => f.deletedAt === undefined && f.tags?.includes(args.tag));
		const withUrls = await Promise.all(
			active.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
		return withUrls.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const getUrl = orgQuery({
	args: {
		orgId: v.id("orgs"),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		return await ctx.storage.getUrl(args.storageId);
	},
});

/**
 * Fetch a small batch of files by id (used for message attachments — typically
 * 0–3 files per message). Returns each file with a short-lived signed URL.
 * Skips rows that don't exist, are deleted, or belong to another org.
 */
export const listByIds = orgQuery({
	args: {
		orgId: v.id("orgs"),
		ids: v.array(v.id("files")),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		if (args.ids.length === 0) return [];
		const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
		const valid = rows.filter(
			(f): f is NonNullable<typeof f> =>
				f !== null && f.orgId === args.orgId && f.deletedAt === undefined,
		);
		return await Promise.all(
			valid.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
	},
});
