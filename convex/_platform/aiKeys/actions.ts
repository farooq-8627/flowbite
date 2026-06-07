"use node";
/**
 * convex/_platform/aiKeys/actions.ts
 *
 * Node-runtime entry-point for adding a platform AI provider key.
 *
 * Mirrors `convex/ai/keysActions.ts` (the BYOK action layer). The split
 * is required because `encryptApiKey` lives in a "use node" file that
 * can't be imported from V8 mutations — so the action does the
 * encryption then hands off to an internal V8 mutation to write the row.
 *
 * Auth: the internal mutation re-checks `requirePlatformOwner` is moot
 * because internal mutations have no client surface — but the public
 * action below DOES gate on the env-allow-list owner check before doing
 * anything (we need an action-context-aware variant since the action
 * runtime can't access ctx.db).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27).
 */
import { ConvexError, v } from "convex/values";
import { action } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { encryptApiKey } from "../../ai/encryption";
import { detectProvider, keyHint, type ProviderId } from "../../ai/encryptionTypes";

// String-path forward refs — resolved post-codegen.
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen cross-module ref
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen cross-module ref
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * Add (or rotate) a platform-managed AI provider key.
 *
 *  1. Validate input shape.
 *  2. Authenticate the calling user as a platform owner via an internal
 *     query (`_platform/aiKeys/queries:_assertOwner`) because actions
 *     can't run `requirePlatformOwner` directly (no ctx.db).
 *  3. Encrypt with `node:crypto`.
 *  4. Internal mutation persists, deactivating any existing active row
 *     for the same provider (one active key per provider).
 *  5. Audit-log the rotation.
 *
 * Owner-only — surfaced under "AI keys" in the owner panel.
 */
export const addPlatformKey = action({
	args: {
		apiKey: v.string(),
		provider: v.optional(v.string()),
		name: v.optional(v.string()),
		baseUrl: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<{ id: unknown; replaced: number }> => {
		if (args.apiKey.length < 10) throw new ConvexError(ERRORS.INVALID_ARGS);

		// Identity of the caller — actions read identity from
		// ctx.auth.getUserIdentity(). The internal mutation we call uses
		// this identity to gate on `requirePlatformOwner` (env-allow-list
		// check) AND to record the audit row's actor fields.
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError(ERRORS.UNAUTHORIZED);

		// Resolve { userId, email, isOwner } via an internal query. The
		// query throws SUPER_ADMIN_REQUIRED if the caller isn't an owner.
		const owner = (await ctx.runQuery(
			_ref("_platform/aiKeys/queries:_assertOwner"),
			_anyArgs({}),
		)) as { userId: string; email: string };

		const provider: ProviderId =
			(args.provider as ProviderId | undefined) ?? detectProvider(args.apiKey);
		const encryptedKey = encryptApiKey(args.apiKey);
		const hint = keyHint(args.apiKey);

		const result = (await ctx.runMutation(
			_ref("_platform/aiKeys/mutations:insertEncrypted"),
			_anyArgs({
				provider,
				encryptedKey,
				keyHint: hint,
				baseUrl: args.baseUrl,
				name: args.name,
				actorUserId: owner.userId,
				actorEmail: owner.email,
			}),
		)) as { id: unknown; replaced: number };

		// Best-effort: refresh the dynamic model catalog for this provider
		// so every workspace's picker surfaces the full roster (Qwen3 Coder
		// etc. on OpenRouter; full NIM/Moonshot rosters too). Fire-and-forget;
		// the daily cron retries on failure.
		try {
			await ctx.scheduler.runAfter(
				0,
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
				_ref("ai/providerCatalogActions:refreshCatalog") as any,
				_anyArgs({
					provider,
					baseUrl: args.baseUrl,
					apiKey: args.apiKey,
					source: "key-save:platform",
				}),
			);
		} catch {
			// Scheduler unavailable — cron picks it up on the next tick.
		}

		return result;
	},
});
