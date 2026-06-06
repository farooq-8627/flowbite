/**
 * convex/ai/aiApiTokens.ts — S16.
 *
 * Personal access tokens for the MCP + REST projectors. Every request
 * authenticates with `Authorization: Bearer <plaintext>` and resolves to
 * a `Principal` that runs under the issuing member's RBAC. Plaintext is
 * shown ONCE at issuance and never persisted — we store only the SHA-256
 * hash, the 12-char prefix (UI display), and a name.
 *
 * The token shape `ot_<orgPrefix6>_<random32hex>` lets a leaked token be
 * traced to its org without decrypting.
 *
 * Public surface:
 *   - `issueToken`   (orgMutation)      — gated on `ai.apiTokens.manage`.
 *                                         Returns the plaintext ONCE.
 *   - `listTokens`   (orgQuery)         — gated on `ai.apiTokens.manage`.
 *                                         Returns prefix-only rows.
 *   - `revokeToken`  (orgMutation)      — gated on `ai.apiTokens.manage`.
 *
 * Internal surface (used by the HTTP routes in `convex/http.ts`):
 *   - `verifyApiTokenInternal` (internalAction) — Bearer plaintext →
 *     `Principal` or null.
 *   - `touchLastUsedInternal`  (internalMutation) — best-effort timestamp
 *     refresh that runs OUTSIDE the request hot path.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../_functions/authenticated";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { requireRole } from "../_shared/permissions/helpers";
import type { Channel, Principal } from "./registry/types";

// ─── Tunables ──────────────────────────────────────────────────────────────

const TOKEN_PREFIX = "ot_";
const ORG_PREFIX_LEN = 6;
const RANDOM_HEX_LEN = 32;
const NAME_MAX_LEN = 60;
const SCOPE_MAX = 64;
const PREFIX_DISPLAY_LEN = 12;

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/** Strip a leading `Bearer `/`Token ` and surrounding whitespace. */
export function parseAuthorizationHeader(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (trimmed.length === 0) return undefined;
	const m = /^(?:Bearer|Token)\s+(.+)$/i.exec(trimmed);
	if (m) return m[1].trim();
	// Allow bare-string headers too — some MCP/REST clients send the token
	// as the entire Authorization header value.
	return trimmed;
}

/** Lowercase, alphanumeric-only fragment of an org slug, 6 chars max. */
export function orgPrefixFromSlug(slug: string): string {
	const cleaned = slug.toLowerCase().replace(/[^a-z0-9]+/g, "");
	return cleaned.length >= ORG_PREFIX_LEN
		? cleaned.slice(0, ORG_PREFIX_LEN)
		: cleaned.padEnd(ORG_PREFIX_LEN, "x");
}

/** Build a token plaintext from an org prefix + random hex. Pure. */
export function buildTokenPlaintext(orgPrefix: string, randomHex: string): string {
	return `${TOKEN_PREFIX}${orgPrefix}_${randomHex}`;
}

/** First 12 chars of the plaintext — shown in UI for identification. */
export function tokenPrefixForDisplay(plaintext: string): string {
	return plaintext.slice(0, PREFIX_DISPLAY_LEN);
}

/** SHA-256 hex of the plaintext via Web Crypto (Convex runtime). */
export async function hashTokenPlaintext(plaintext: string): Promise<string> {
	const enc = new TextEncoder().encode(plaintext);
	const buf = await crypto.subtle.digest("SHA-256", enc);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Cryptographically random 32-char hex string. */
export function randomTokenHex(): string {
	const bytes = new Uint8Array(RANDOM_HEX_LEN / 2);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Validate + normalise a scope list. Empty → `["*"]`. Throws on bad input. */
export function normaliseScopes(scopes: string[] | undefined): string[] {
	if (!scopes || scopes.length === 0) return ["*"];
	const trimmed = scopes.map((s) => s.trim()).filter((s) => s.length > 0);
	if (trimmed.length === 0) return ["*"];
	if (trimmed.length > SCOPE_MAX) {
		throw new ConvexError(`Too many scopes (max ${SCOPE_MAX}).`);
	}
	for (const s of trimmed) {
		if (s !== "*" && !/^[a-z][a-z0-9_]{1,63}$/.test(s)) {
			throw new ConvexError(`Invalid scope name: "${s}".`);
		}
	}
	return Array.from(new Set(trimmed));
}

/** Channel header → trusted Channel value. Defaults to `"rest"` (the safer surface). */
export function resolveChannel(raw: string | null | undefined): Channel {
	if (raw === "mcp") return "mcp";
	if (raw === "rest") return "rest";
	return "rest";
}

/** Is the token allowed to call this capability under its scope list? */
export function tokenScopeAllows(scopes: readonly string[], capabilityName: string): boolean {
	if (scopes.includes("*")) return true;
	return scopes.includes(capabilityName);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Issue a new token. Returns the plaintext ONCE — the caller MUST surface
 * it to the user immediately (UI flow: copy-to-clipboard, then never
 * shown again).
 */
export const issueToken = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		scopes: v.optional(v.array(v.string())),
		expiresAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId, org } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.apiTokens.manage");

		const name = args.name.trim();
		if (name.length === 0 || name.length > NAME_MAX_LEN) {
			throw new ConvexError(`Token name must be 1–${NAME_MAX_LEN} characters.`);
		}
		const scopes = normaliseScopes(args.scopes);

		const orgPrefix = orgPrefixFromSlug(org.slug);
		const plaintext = buildTokenPlaintext(orgPrefix, randomTokenHex());
		const hash = await hashTokenPlaintext(plaintext);

		const now = Date.now();
		const tokenId = await ctx.db.insert("aiApiTokens", {
			orgId: args.orgId,
			userId,
			name,
			prefix: tokenPrefixForDisplay(plaintext),
			hash,
			scopes,
			expiresAt: args.expiresAt,
			createdAt: now,
			updatedAt: now,
		});

		return {
			id: tokenId,
			plaintext, // Shown ONCE.
			prefix: tokenPrefixForDisplay(plaintext),
			scopes,
			name,
			expiresAt: args.expiresAt,
		};
	},
});

/** List the org's tokens — never includes plaintext or hash. */
export const listTokens = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.apiTokens.manage");

		const rows = await ctx.db
			.query("aiApiTokens")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();

		return rows
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((row) => ({
				id: row._id,
				name: row.name,
				prefix: row.prefix,
				scopes: row.scopes,
				userId: row.userId,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				lastUsedAt: row.lastUsedAt,
				revokedAt: row.revokedAt,
			}));
	},
});

/** Revoke a token. Soft — sets `revokedAt`; row stays for audit. */
export const revokeToken = orgMutation({
	args: { orgId: v.id("orgs"), tokenId: v.id("aiApiTokens") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.apiTokens.manage");

		const row = await ctx.db.get(args.tokenId);
		if (!row || row.orgId !== args.orgId) {
			throw new ConvexError("Token not found.");
		}
		if (row.revokedAt !== undefined) return { ok: true, alreadyRevoked: true };

		const now = Date.now();
		await ctx.db.patch(args.tokenId, { revokedAt: now, updatedAt: now });
		return { ok: true, alreadyRevoked: false };
	},
});

// ─── Internal surface (HTTP routes) ─────────────────────────────────────────

/**
 * What a successful verify call returns: the trusted Principal (read at
 * call time so permission changes propagate), the matched token row's id
 * (for `touchLastUsedInternal`), and the token's scope list.
 *
 * `null` when the token is unknown / revoked / expired / or the
 * (orgId,userId) combination is no longer a valid org member.
 */
export type VerifiedApiToken = {
	tokenId: Id<"aiApiTokens">;
	principal: Principal;
	scopes: string[];
};

/**
 * Verify a Bearer plaintext and resolve the trusted Principal. The action
 * runs in V8 (no `"use node"`) so it can call internalQueries directly.
 * It NEVER throws on invalid auth — returns `null` so the HTTP route can
 * map that to a 401 without leaking why.
 */
export const verifyApiTokenInternal = internalAction({
	args: { plaintext: v.string(), channel: v.string() },
	handler: async (ctx, args): Promise<VerifiedApiToken | null> => {
		const channel = resolveChannel(args.channel);
		const hash = await hashTokenPlaintext(args.plaintext);
		const verified = await ctx.runQuery(internal.ai.aiApiTokens.lookupAndAuthorise, {
			hash,
			channel,
		});
		return verified;
	},
});

/**
 * Internal query — looks up the token row by hash, validates the row is
 * still usable (not revoked, not expired), and re-derives the Principal
 * via `requireOrgMemberByIds` so the permissions list is FRESH.
 *
 * Kept as an internalQuery (not a function on `verifyApiTokenInternal`)
 * so the action can call it without going through ctx.runMutation; the
 * `touchLastUsedInternal` write happens separately.
 */
export const lookupAndAuthorise = internalQuery({
	args: { hash: v.string(), channel: v.string() },
	handler: async (ctx, args): Promise<VerifiedApiToken | null> => {
		const channel = resolveChannel(args.channel);

		const row = await ctx.db
			.query("aiApiTokens")
			.withIndex("by_hash", (q) => q.eq("hash", args.hash))
			.first();
		if (!row) return null;
		if (row.revokedAt !== undefined) return null;
		if (row.expiresAt !== undefined && row.expiresAt < Date.now()) return null;

		// Re-derive the principal from the live RBAC record. If the member
		// has been removed/suspended/role-changed, this is where we find
		// out — the token instantly stops working.
		try {
			const { member } = await requireOrgMemberByIds(ctx, row.orgId, row.userId);
			const principal: Principal = {
				kind: "member",
				userId: row.userId,
				orgId: row.orgId,
				permissions: member.permissions,
				channel,
			};
			return { tokenId: row._id, principal, scopes: row.scopes };
		} catch {
			return null;
		}
	},
});

/** Best-effort `lastUsedAt` refresh. Outside the request hot path. */
export const touchLastUsedInternal = internalMutation({
	args: { tokenId: v.id("aiApiTokens") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.tokenId);
		if (!row) return;
		const now = Date.now();
		await ctx.db.patch(args.tokenId, { lastUsedAt: now, updatedAt: now });
	},
});

/**
 * Convenience for HTTP routes — wraps `verifyApiTokenInternal` +
 * `touchLastUsedInternal` so the route handler is a single call.
 */
export async function verifyAndTouch(
	ctx: ActionCtx,
	plaintext: string,
	channel: Channel,
): Promise<VerifiedApiToken | null> {
	const verified = await ctx.runAction(internal.ai.aiApiTokens.verifyApiTokenInternal, {
		plaintext,
		channel,
	});
	if (verified) {
		// Fire-and-forget touch — never blocks the response.
		void ctx
			.runMutation(internal.ai.aiApiTokens.touchLastUsedInternal, {
				tokenId: verified.tokenId,
			})
			.catch(() => {});
	}
	return verified;
}
