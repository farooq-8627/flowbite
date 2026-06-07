/**
 * convex/ai/providerCatalogQueries.ts
 *
 * V8 read + write surface for the `aiProviderCatalogs` cache.
 *
 * The cache stores normalised `/v1/models` responses per (provider,
 * baseUrl). Lifecycle is owned by `convex/ai/providerCatalogActions.ts`
 * (Node) — this file only exposes the V8-safe pieces:
 *
 *   - `listForOrg` (orgQuery): returns the catalogs the caller's org
 *     can actually use — i.e. catalogs whose provider has either
 *     a per-user / per-org BYOK key OR a platform-level key (env or
 *     owner-managed). The model picker (`useAvailableProviders`)
 *     joins this onto `MODEL_REGISTRY` to render a complete dropdown.
 *
 *   - `getByProviderKey` (internalQuery): point lookup used by the
 *     Node refresh action (read-modify-write).
 *
 *   - `upsertCatalog` (internalMutation): write path. Called only by
 *     `providerCatalogActions:refreshCatalog`.
 *
 *   - `listExpired` / `listAll` (internalQuery): used by the daily
 *     refresh cron + admin diagnostics.
 *
 * The `listForOrg` filter is intentional: a per-user BYOK key for
 * provider X grants ONLY that user access to X's dynamic catalog;
 * an org-scope BYOK key grants every member access; a platform key
 * grants every authenticated user access. The same precedence the
 * key-resolver uses at chat time (`ai/keys:resolveKey`).
 *
 * Sources:
 *   - https://docs.convex.dev/database/indexes
 *   - .github/agents/base/rules.md §3.3 (orgQuery / orgMutation)
 *   - convex/ai/keys.ts:listAvailableProviders (BYOK provider list pattern)
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── Public ───────────────────────────────────────────────────────────────

/**
 * Public read for the chat model picker. Returns catalogs (without the
 * stale fetched/expires timestamps the picker doesn't need) for every
 * provider the caller can use here. No secret material is in the catalog
 * (only public model ids + metadata) so it's safe to surface.
 */
export const listForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);

		// 1. Providers the viewer has BYOK access to (mirrors
		//    `ai/keys:listAvailableProviders` — same membership
		//    filter rules).
		const byokKeys = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
		const usableProviders = new Set<string>();
		for (const k of byokKeys) {
			if (k.scope === "org") usableProviders.add(k.provider);
			else if (k.scope === "user" && k.userId === userId) usableProviders.add(k.provider);
		}

		// 2. Platform DB keys grant every signed-in user access (same
		//    pattern as `_platform/aiKeys/queries:listActivePlatformProviderIds`).
		const platformRows = await ctx.db
			.query("platformAiKeys")
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
		for (const r of platformRows) usableProviders.add(r.provider);

		// 3. Pull every cached catalog and filter to providers the
		//    viewer can actually USE. (No index by provider; the
		//    table holds ≤ 10 rows in practice — bounded scan.)
		const catalogs = await ctx.db.query("aiProviderCatalogs").collect();
		const now = Date.now();
		return catalogs
			.filter((c) => usableProviders.has(c.provider))
			.map((c) => ({
				providerKey: c.providerKey,
				provider: c.provider,
				baseUrl: c.baseUrl ?? null,
				models: c.models,
				fetchedAt: c.fetchedAt,
				stale: c.expiresAt < now,
			}));
	},
});

// ─── Internal — read ──────────────────────────────────────────────────────

export const getByProviderKey = internalQuery({
	args: { providerKey: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("aiProviderCatalogs")
			.withIndex("by_providerKey", (q) => q.eq("providerKey", args.providerKey))
			.unique();
	},
});

/**
 * Used by the daily refresh cron — returns the providerKey of every row
 * whose `expiresAt` is in the past. Bounded `.take(20)` so a swamped
 * fetch loop drains over multiple ticks.
 */
export const listExpired = internalQuery({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const cutoff = Date.now();
		const rows = await ctx.db
			.query("aiProviderCatalogs")
			.withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
			.take(Math.min(args.limit ?? 20, 100));
		return rows.map((r) => ({
			providerKey: r.providerKey,
			provider: r.provider,
			baseUrl: r.baseUrl ?? null,
		}));
	},
});

/**
 * Diagnostic-only read for the owner-panel page (future). Listed here
 * for completeness; not currently called from a UI.
 */
export const listAll = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("aiProviderCatalogs").collect();
	},
});

// ─── Internal — write ─────────────────────────────────────────────────────

export const upsertCatalog = internalMutation({
	args: {
		providerKey: v.string(),
		provider: v.string(),
		baseUrl: v.optional(v.string()),
		models: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				contextLength: v.optional(v.number()),
				supportsTools: v.boolean(),
				isFree: v.boolean(),
				creator: v.optional(v.string()),
			}),
		),
		lastFetchSource: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + 24 * 60 * 60 * 1000; // 24h TTL

		const existing = await ctx.db
			.query("aiProviderCatalogs")
			.withIndex("by_providerKey", (q) => q.eq("providerKey", args.providerKey))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				provider: args.provider,
				baseUrl: args.baseUrl,
				models: args.models,
				lastFetchSource: args.lastFetchSource,
				fetchedAt: now,
				expiresAt,
			});
			return { id: existing._id, replaced: true };
		}

		const id = await ctx.db.insert("aiProviderCatalogs", {
			providerKey: args.providerKey,
			provider: args.provider,
			baseUrl: args.baseUrl,
			models: args.models,
			lastFetchSource: args.lastFetchSource,
			fetchedAt: now,
			expiresAt,
		});
		return { id, replaced: false };
	},
});
