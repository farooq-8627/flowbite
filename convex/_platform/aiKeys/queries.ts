/**
 * convex/_platform/aiKeys/queries.ts
 *
 * Owner-panel queries for platform-managed AI provider keys.
 *
 * Public surface (owner-only):
 *   - list — returns active rows with `encryptedKey` STRIPPED.
 *
 * Internal surface:
 *   - getEncryptedPlatformKey — single-row lookup by provider, returns
 *     the encrypted key (Node action callers decrypt). Mirrors the
 *     `ai/keys:resolveKey` shape so the briefings BYOK fallback chain
 *     can reuse the same decryption code path.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27 — owner-managed
 * AI keys), AGENTS.md AI tools rule (twin pattern not strictly required
 * for platform keys because they're never AI-callable — only briefings/
 * titles/orchestrator read them via internal queries).
 */
import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Public (owner-only) ─────────────────────────────────────────────────

/**
 * List every active platform AI key. Returned rows OMIT `encryptedKey`
 * — the encrypted material never leaves the server.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		const rows = await ctx.db
			.query("platformAiKeys")
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
		return rows
			.map(({ encryptedKey: _stripped, ...safe }) => safe)
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	},
});

// ─── Internal (action-callable) ──────────────────────────────────────────

/**
 * Resolve the active platform key for a provider. Returns the encrypted
 * payload + optional baseUrl. Caller decrypts via `decryptApiKey`.
 *
 * Returns `null` when no active row exists. Callers should use this as
 * one rung of the resolution chain (BYOK → DB platform → env platform).
 */
export const getEncryptedPlatformKey = internalQuery({
	args: { provider: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("platformAiKeys")
			.withIndex("by_provider", (q) => q.eq("provider", args.provider as "anthropic"))
			.filter((q) => q.eq(q.field("isActive"), true))
			.first();
		if (!row) return null;
		return {
			encryptedKey: row.encryptedKey,
			baseUrl: row.baseUrl ?? null,
		};
	},
});

/**
 * Internal helper used by the Node action to gate on the platform-owner
 * check before encrypting + writing. Returns the caller's userId + email
 * (for the audit row). Throws SUPER_ADMIN_REQUIRED otherwise.
 *
 * Underscore-prefixed to keep it out of casual auto-complete; the only
 * caller is `_platform/aiKeys/actions:addPlatformKey`.
 */
export const _assertOwner = internalQuery({
	args: {},
	handler: async (ctx) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		return {
			userId: userId as unknown as string,
			email: (user.email ?? "").toLowerCase(),
		};
	},
});
