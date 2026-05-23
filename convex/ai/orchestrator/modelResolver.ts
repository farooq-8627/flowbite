"use node";
/**
 * convex/ai/orchestrator/modelResolver.ts
 *
 * Resolves the model + provider + BYOK key for a single chat turn.
 *
 * Why a separate file: the resolution chain is long (request args →
 * model registry → BYOK lookup → decryption → plan-tier downgrade) and
 * wraps in friendly-error translation. Splitting it out keeps `run.ts`
 * focused on the agent loop.
 *
 * Public surface: `resolveModelAndKey()`.
 */
import type { Id } from "../../_generated/dataModel";
import { decryptApiKey } from "../encryption";
import { getModel, MODEL_REGISTRY, type OrgPlan } from "../models";

// biome-ignore lint/suspicious/noExplicitAny: _ref/_anyArgs casts required for pre-codegen cross-module refs
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: _ref/_anyArgs casts required for pre-codegen cross-module refs
const _anyArgs = (a: Record<string, unknown>) => a as any;

type RunQueryFn = (fn: unknown, args: unknown) => Promise<unknown>;

export type ResolvedModel = ReturnType<typeof getModel>;

/**
 * Resolve the model + (optional BYOK key) for a chat turn.
 *
 * Provider preference order:
 *   1. explicit args.provider (the model picker in the composer)
 *   2. MODEL_REGISTRY entry for the chosen modelKey
 *   3. saved user preference (`prefs.aiDefaultProvider`)
 *   4. "anthropic" default
 *
 * Trusting the model's registered provider over args.provider matters
 * because BYOK lookup must hit the *correct* provider table — otherwise
 * a saved kimi-k2 model with a stale `provider: "anthropic"` would query
 * the Anthropic key when it actually needs Moonshot.
 *
 * Throws on unrecoverable resolution failure ("Platform API key not
 * configured: <provider>"); the caller is responsible for translating
 * that into a friendly chat bubble.
 */
export async function resolveModelAndKey(args: {
	ctx: { runQuery: RunQueryFn };
	orgId: Id<"orgs">;
	userId: Id<"users">;
	requestedModel?: string | null;
	requestedProvider?: string | null;
	defaultModel?: string | null;
	defaultProvider?: string | null;
	plan: OrgPlan;
}): Promise<ResolvedModel> {
	const requestedModelKey = args.requestedModel ?? args.defaultModel ?? null;
	const registryEntry = requestedModelKey
		? MODEL_REGISTRY[
				requestedModelKey.includes(":")
					? (requestedModelKey.split(":")[1] ?? requestedModelKey)
					: requestedModelKey
			]
		: undefined;
	const provider = (args.requestedProvider ??
		registryEntry?.provider ??
		args.defaultProvider ??
		"anthropic") as string;

	const byokResult = (await args.ctx.runQuery(
		_ref("ai/keys:resolveKey"),
		_anyArgs({
			orgId: args.orgId as string,
			userId: args.userId as string,
			provider,
		}),
	)) as {
		encryptedKey: string;
		baseUrl: string | null;
		scope: "user" | "org";
	} | null;

	let decryptedKey: string | null = null;
	if (byokResult) {
		try {
			decryptedKey = decryptApiKey(byokResult.encryptedKey);
		} catch {
			// Bad key — fall through to platform key.
		}
	}

	return getModel({
		modelKey: requestedModelKey,
		provider,
		resolvedKey: byokResult,
		decryptedKey,
		plan: args.plan,
	});
}
