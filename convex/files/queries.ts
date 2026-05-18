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

/**
 * Unified entity-files query — replaces the 3 separate subscriptions that
 * EntityFilesPanel previously opened (listByScope + listByTag + listByScope for person).
 * One server-side query, deduped + sorted. Saves 2 subscriptions per detail-page mount.
 */
export const listForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		scope: v.string(),
		scopeId: v.string(),
		/** Also include person-scope files for this personCode when present. */
		personCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const tag = `${args.scope}:${args.scopeId}`;
		const personScopeRedundant = args.scope === "person" && args.personCode === args.scopeId;

		const [direct, tagged, person] = await Promise.all([
			ctx.db
				.query("files")
				.withIndex("by_org_and_scope", (q) =>
					q.eq("orgId", args.orgId).eq("scope", args.scope).eq("scopeId", args.scopeId),
				)
				.collect(),
			ctx.db
				.query("files")
				.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
				.collect()
				.then((rows) => rows.filter((f) => f.tags?.includes(tag))),
			args.personCode && !personScopeRedundant
				? ctx.db
						.query("files")
						.withIndex("by_org_and_scope", (q) =>
							q.eq("orgId", args.orgId).eq("scope", "person").eq("scopeId", args.personCode!),
						)
						.collect()
				: Promise.resolve([]),
		]);

		const seen = new Set<string>();
		const merged: typeof direct = [];
		for (const f of [...direct, ...tagged, ...person]) {
			if (f.deletedAt !== undefined) continue;
			const key = String(f._id);
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(f);
		}
		merged.sort((a, b) => b.createdAt - a.createdAt);

		return await Promise.all(
			merged.map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })),
		);
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
 *
 * Per-message variant: returns an Array<FileWithUrl>. Used by `ForwardDialog`
 * and any single-bubble caller. For LIST-level consumption (e.g. the chat
 * `MessageList`, where every visible bubble needs attachment data), use
 * `listByIdsKeyed` below — it batches the union of every visible message's
 * attachments into ONE subscription instead of N.
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

/**
 * Conversation-level batched attachment lookup.
 *
 * Same shape as `listByIds`, but returns a `Record<fileId, FileWithUrl>`
 * keyed by id — letting the chat `MessageList` resolve attachments for the
 * whole visible page in ONE subscription, then hand each `MessageBubble`
 * its slice via prop (the canonical "list-level batched query" pattern,
 * matching `useAttachmentDisplaysForOrg` for the notes board).
 *
 * Why a separate query (rather than shape-shifting `listByIds`):
 *   - `ForwardDialog` already consumes `listByIds` as an array; reshaping it
 *     would be a breaking-change migration with no benefit for that caller.
 *   - The keyed-record shape is the natural read for "give me the file for
 *     attachmentId X" lookups inside the bubble, avoiding a per-render
 *     `.find()` scan over the array.
 *
 * Bounded:
 *   - Caller passes the UNION of attachment ids across the visible page.
 *   - Hard cap of 500 ids — the chat list paginates 30 messages at a time
 *     and tops out at well under 500 attachments per visible page even in
 *     pathological "every message has 3 files" threads. If a future caller
 *     needs more, page them.
 *   - Skips rows that don't exist, are deleted, or belong to another org —
 *     same defence as `listByIds`. Missing ids simply won't have a key in
 *     the returned record.
 *
 * Permission: any org member (file membership is enforced by org scope —
 * the deletedAt + orgId filter ensures cross-tenant ids are silently
 * dropped, not surfaced).
 */
export const listByIdsKeyed = orgQuery({
	args: {
		orgId: v.id("orgs"),
		ids: v.array(v.id("files")),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		if (args.ids.length === 0) {
			return {} as Record<string, never>;
		}
		// De-dupe at the boundary so the same id passed multiple times only
		// hits the DB once. (The hook already de-dupes for cache-key
		// stability, but defending here keeps the query honest.)
		const seen = new Set<string>();
		const unique: typeof args.ids = [];
		for (const id of args.ids) {
			const key = String(id);
			if (seen.has(key)) continue;
			seen.add(key);
			unique.push(id);
		}
		// Hard cap: see docstring above.
		const bounded = unique.slice(0, 500);

		const rows = await Promise.all(bounded.map((id) => ctx.db.get(id)));
		const valid = rows.filter(
			(f): f is NonNullable<typeof f> =>
				f !== null && f.orgId === args.orgId && f.deletedAt === undefined,
		);
		const withUrls = await Promise.all(
			valid.map(async (f) => ({
				...f,
				url: await ctx.storage.getUrl(f.storageId),
			})),
		);
		// Build the keyed record. `String(f._id)` to match how the frontend
		// indexes — a `Doc<"files">["_id"]` is opaque, but stringifying it
		// is the standard pattern across this codebase.
		const result: Record<string, (typeof withUrls)[number]> = {};
		for (const f of withUrls) {
			result[String(f._id)] = f;
		}
		return result;
	},
});
