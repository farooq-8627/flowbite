"use node";
/**
 * convex/ai/keysActions.ts
 *
 * Node-runtime side of BYOK API key management.
 *
 * Why this file exists:
 *   `encryptApiKey` lives in `./encryption` ("use node") because it uses
 *   `node:crypto`. Convex queries/mutations run in the V8 isolate which
 *   cannot bundle `node:crypto`. The standard Convex pattern for this
 *   case is: Node action does the encryption, then calls an internal
 *   mutation (V8) to write the encrypted payload to the database.
 *
 *   Files marked "use node" cannot contain queries or mutations, so the
 *   V8 read/write surface lives in `./keys` and is invoked from here via
 *   `ctx.runMutation(internal.ai.keys.insertEncryptedKey, ...)`.
 *
 * Public surface:
 *   - addOrgKey   (action) — encrypts plaintext, persists via internal mutation.
 *   - addUserKey  (action) — same as above, scope=user.
 *
 * Auth + RBAC + rate-limit live in the internal mutation
 * `internal.ai.keys.insertEncryptedKey` — that's the trust boundary for
 * DB writes. The action is just an encryption shim; we still validate
 * the apiKey shape here so we don't waste a round trip on obviously bad
 * input.
 */
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { encryptApiKey } from "./encryption";
import { detectProvider, keyHint, type ProviderId } from "./encryptionTypes";

// Forward-reference shim — see processChat.ts. Convex codegen creates
// the typed `internal.ai.keys.insertEncryptedKey` only after the first
// successful push of `keys.ts`. Until then we use the string-path form
// that Convex's runtime accepts; the cast keeps typecheck green
// regardless of codegen freshness.
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * Add an org-scope BYOK API key.
 *   1. Validate input shape.
 *   2. Encrypt with Node crypto (must run in Node).
 *   3. Internal mutation does auth + RBAC + rate-limit + insert.
 */
export const addOrgKey = action({
	args: {
		orgId: v.id("orgs"),
		apiKey: v.string(), // plaintext — encrypted before storage
		name: v.optional(v.string()),
		defaultModel: v.optional(v.string()),
		baseUrl: v.optional(v.string()),
		provider: v.optional(v.string()), // override auto-detect
	},
	handler: async (ctx, args): Promise<Id<"orgAiKeys">> => {
		if (args.apiKey.length < 10) throw new ConvexError(ERRORS.INVALID_ARGS);

		const provider: ProviderId =
			(args.provider as ProviderId | undefined) ?? detectProvider(args.apiKey);
		const encryptedKey = encryptApiKey(args.apiKey);
		const hint = keyHint(args.apiKey);

		const id = (await ctx.runMutation(
			_ref("ai/keys:insertEncryptedKey"),
			_anyArgs({
				orgId: args.orgId,
				scope: "org",
				provider,
				encryptedKey,
				keyHint: hint,
				baseUrl: args.baseUrl,
				defaultModel: args.defaultModel,
				name: args.name,
			}),
		)) as Id<"orgAiKeys">;

		// Best-effort: kick a catalog refresh so the model picker
		// surfaces every model this key actually unlocks (Qwen3 Coder,
		// DeepSeek, etc. on OpenRouter; full NIM/Moonshot rosters too).
		// Fire-and-forget — failure leaves MODEL_REGISTRY's static
		// entries in place; the cron will retry on the next tick.
		try {
			await ctx.scheduler.runAfter(
				0,
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
				_ref("ai/providerCatalogActions:refreshCatalog") as any,
				_anyArgs({
					provider,
					baseUrl: args.baseUrl,
					apiKey: args.apiKey,
					source: "key-save:org",
				}),
			);
		} catch {
			// Scheduler unavailable — refresh on next cron tick.
		}

		return id;
	},
});

/**
 * Add a user-scope BYOK API key.
 */
export const addUserKey = action({
	args: {
		orgId: v.id("orgs"),
		apiKey: v.string(),
		name: v.optional(v.string()),
		defaultModel: v.optional(v.string()),
		baseUrl: v.optional(v.string()),
		provider: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"orgAiKeys">> => {
		if (args.apiKey.length < 10) throw new ConvexError(ERRORS.INVALID_ARGS);

		const provider: ProviderId =
			(args.provider as ProviderId | undefined) ?? detectProvider(args.apiKey);
		const encryptedKey = encryptApiKey(args.apiKey);
		const hint = keyHint(args.apiKey);

		const id = (await ctx.runMutation(
			_ref("ai/keys:insertEncryptedKey"),
			_anyArgs({
				orgId: args.orgId,
				scope: "user",
				provider,
				encryptedKey,
				keyHint: hint,
				baseUrl: args.baseUrl,
				defaultModel: args.defaultModel,
				name: args.name,
			}),
		)) as Id<"orgAiKeys">;

		// Same catalog refresh as addOrgKey — see comment there.
		try {
			await ctx.scheduler.runAfter(
				0,
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
				_ref("ai/providerCatalogActions:refreshCatalog") as any,
				_anyArgs({
					provider,
					baseUrl: args.baseUrl,
					apiKey: args.apiKey,
					source: "key-save:user",
				}),
			);
		} catch {
			// Scheduler unavailable — cron picks it up.
		}

		return id;
	},
});
