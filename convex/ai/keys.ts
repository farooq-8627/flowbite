/**
 * convex/ai/keys.ts
 *
 * BYOK API key management — V8 (default Convex runtime) surface only.
 *
 * Public V8 surface:
 *   - listKeys        (query)    — lists org-scope keys (encryptedKey stripped).
 *   - listOwnKeys     (query)    — lists current user's user-scope keys.
 *   - removeKey       (mutation) — soft-deactivates an existing key.
 * Internal V8 surface:
 *   - insertEncryptedKey (internalMutation) — actual write path.
 *     Called only from the public actions in `./keysActions`.
 *     Enforces RBAC + rate-limit. Trust boundary for DB writes.
 *   - resolveKey         (internalQuery) — resolves a key payload for a
 *     given (org, user, provider). Called only from processChat.
 *
 * The public *write* entrypoints (addOrgKey, addUserKey) live in
 * `./keysActions` because they need `node:crypto` to encrypt the
 * plaintext key, which forces the Node runtime ("use node"). Files
 * with "use node" cannot contain queries or mutations, so they live
 * here instead and are invoked via `ctx.runMutation` from the action.
 *
 * Security contract:
 *   - encryptedKey is stripped from every public query return path.
 *   - Decryption happens only in resolveKey → processChat (Node action).
 *   - Org-scope keys require ai.byokOrg permission (Owner only by default).
 *   - User-scope keys require ai.byokUser; only the owner can manage them
 *     (org admins with ai.byokOrg can remove others' user-scope keys).
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit } from "../_shared/rateLimit";
import type { ProviderId } from "./encryptionTypes";

// ─── Public queries ───────────────────────────────────────────────────────────

/**
 * List API keys for an org. NEVER returns encryptedKey.
 */
export const listKeys = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.byokOrg");

		const keys = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();

		// Strip encrypted key — never expose to client
		return keys.map(({ encryptedKey: _stripped, ...safe }) => safe);
	},
});

/**
 * List own user-scope keys. NEVER returns encryptedKey.
 */
export const listOwnKeys = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.byokUser");

		const keys = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", "user").eq("userId", userId),
			)
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();

		return keys.map(({ encryptedKey: _stripped, ...safe }) => safe);
	},
});

/**
 * List the set of providers the current viewer can use via BYOK keys.
 *
 * A provider is included if either:
 *   - an org-scope key exists for it (everyone in the org can use it), OR
 *   - the viewer has their own user-scope key for it.
 *
 * Does NOT include providers that only have a platform env-var key set —
 * those are surfaced separately by `availableModels:listPlatformProviders`
 * (a Node action) and merged on the client. Splitting the two paths keeps
 * the BYOK list reactive (auto-updates the moment the user adds a key)
 * while reading `process.env` only happens once per page load.
 *
 * No special permission required beyond org membership; we don't leak any
 * key material, only provider names.
 */
export const listAvailableProviders = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);

		const keys = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();

		const providers = new Set<string>();
		for (const k of keys) {
			if (k.scope === "org") {
				providers.add(k.provider); // org keys are usable by every member
			} else if (k.scope === "user" && k.userId === userId) {
				providers.add(k.provider); // user keys are private to the owner
			}
		}
		return Array.from(providers);
	},
});

// ─── Public mutation — remove key ─────────────────────────────────────────────

export const removeKey = orgMutation({
	args: { orgId: v.id("orgs"), keyId: v.id("orgAiKeys") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const key = await ctx.db.get(args.keyId);
		if (!key || key.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Org-scope key: requires ai.byokOrg
		// User-scope key: owner of the key OR ai.byokOrg
		if (key.scope === "org") {
			requireRole(member.permissions, "ai.byokOrg");
		} else {
			if (key.userId !== userId) {
				requireRole(member.permissions, "ai.byokOrg"); // admin can remove others' keys
			}
		}

		// Soft-deactivate rather than hard delete (audit trail)
		await ctx.db.patch(args.keyId, { isActive: false, updatedAt: Date.now() });
	},
});

// ─── Internal mutation — DB write path for addOrgKey / addUserKey ─────────────

/**
 * Internal mutation called only from the Node actions in `./keysActions`.
 * Re-runs auth + RBAC + rate-limit because the calling action's auth
 * context is advisory; the mutation is the trust boundary for DB writes.
 */
export const insertEncryptedKey = internalMutation({
	args: {
		orgId: v.id("orgs"),
		scope: v.union(v.literal("org"), v.literal("user")),
		provider: v.string(),
		encryptedKey: v.string(),
		keyHint: v.string(),
		baseUrl: v.optional(v.string()),
		defaultModel: v.optional(v.string()),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"orgAiKeys">> => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, args.scope === "org" ? "ai.byokOrg" : "ai.byokUser");
		await enforceRateLimit(ctx, {
			scope: "ai.addKey",
			key: `${userId}:${args.orgId}`,
			max: 10,
			periodMs: 60_000,
		});

		const now = Date.now();
		const id = await ctx.db.insert("orgAiKeys", {
			orgId: args.orgId,
			scope: args.scope,
			...(args.scope === "user" ? { userId } : {}),
			provider: args.provider as ProviderId,
			encryptedKey: args.encryptedKey,
			keyHint: args.keyHint,
			baseUrl: args.baseUrl,
			defaultModel: args.defaultModel,
			name: args.name,
			isActive: true,
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});
		return id;
	},
});

// ─── Internal query — ONLY for processChat ────────────────────────────────────

/**
 * Resolve a key payload for a given org/user/provider combination.
 * Returns the *encrypted* payload; the caller (Node action) decrypts.
 *
 * Resolution order: user-scope BYOK → org-scope BYOK → null (use platform key).
 */
export const resolveKey = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		// 1. User-scope key for this provider
		const userKey = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", "user").eq("userId", args.userId),
			)
			.filter((q) =>
				q.and(q.eq(q.field("provider"), args.provider), q.eq(q.field("isActive"), true)),
			)
			.first();
		if (userKey)
			return {
				encryptedKey: userKey.encryptedKey,
				baseUrl: userKey.baseUrl ?? null,
				scope: "user" as const,
			};

		// 2. Org-scope key for this provider
		const orgKey = await ctx.db
			.query("orgAiKeys")
			.withIndex("by_org_and_provider", (q) =>
				q.eq("orgId", args.orgId).eq("provider", args.provider as "anthropic"),
			)
			.filter((q) => q.and(q.eq(q.field("scope"), "org"), q.eq(q.field("isActive"), true)))
			.first();
		if (orgKey)
			return {
				encryptedKey: orgKey.encryptedKey,
				baseUrl: orgKey.baseUrl ?? null,
				scope: "org" as const,
			};

		return null;
	},
});
