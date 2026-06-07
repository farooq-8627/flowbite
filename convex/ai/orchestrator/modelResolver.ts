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
import type { ProviderId } from "../encryptionTypes";
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

	// Dynamic catalog entries use `dyn:<provider>:<modelId>`. Provider
	// comes off the FIRST colon (split on first only — modelId can carry
	// its own `:` for `:free`-suffixed slugs). For static keys, fall
	// back to the legacy registry lookup.
	let dynamicProvider: string | null = null;
	if (requestedModelKey?.startsWith("dyn:")) {
		const rest = requestedModelKey.slice(4);
		const sep = rest.indexOf(":");
		if (sep > 0) dynamicProvider = rest.slice(0, sep);
	}
	const registryEntry =
		!dynamicProvider && requestedModelKey
			? MODEL_REGISTRY[
					requestedModelKey.includes(":")
						? (requestedModelKey.split(":")[1] ?? requestedModelKey)
						: requestedModelKey
				]
			: undefined;
	const provider = (args.requestedProvider ??
		dynamicProvider ??
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

	// Owner-managed platform keys (the `platformAiKeys` table, set in the
	// Owner panel → AI keys). Decrypt them here (Node) and hand the map to
	// the pure `getModel`, which prefers a DB key over the env var. This is
	// what lets a user with NO BYOK key chat on the platform's key by
	// default — without being asked to bring their own. Failure-tolerant:
	// a bad/undecryptable row is skipped and we still fall back to env keys.
	const platformRows = (await args.ctx.runQuery(
		_ref("_platform/aiKeys/queries:listActivePlatformKeys"),
		_anyArgs({}),
	)) as Array<{ provider: string; encryptedKey: string; baseUrl: string | null }> | null;

	const platformKeys: Partial<Record<ProviderId, { key: string; baseUrl: string | null }>> = {};
	for (const row of platformRows ?? []) {
		try {
			platformKeys[row.provider as ProviderId] = {
				key: decryptApiKey(row.encryptedKey),
				baseUrl: row.baseUrl,
			};
		} catch {
			// Skip an undecryptable row — env fallback still applies.
		}
	}

	return getModel({
		modelKey: requestedModelKey,
		provider,
		resolvedKey: byokResult,
		decryptedKey,
		plan: args.plan,
		platformKeys,
	});
}

// ─── Week 6.3 — Multi-provider auto-failover ─────────────────────────────────
//
// `resolveFallbackChain()` returns the user's primary model first, followed
// by 1-3 providers from a *different* family that have working configuration
// (BYOK or platform key). The streamLoop iterates this list — if streamText
// throws or emits an `error` chunk before the first `text-delta`, we move
// to the next provider transparently. The user sees the answer; only the
// telemetry log records the fallback.
//
// Why "different family": the typical 5xx is a single provider being down
// (Anthropic capacity, Google quota). Falling back to the same provider is
// almost always pointless; a different family is most likely to succeed.
//
// Conservative max chain length = 3 — beyond that we're chasing tail latency.

export async function resolveFallbackChain(args: {
	ctx: { runQuery: RunQueryFn };
	orgId: Id<"orgs">;
	userId: Id<"users">;
	primary: ResolvedModel;
	plan: OrgPlan;
}): Promise<ResolvedModel[]> {
	const chain: ResolvedModel[] = [args.primary];
	const triedProviders = new Set<string>([args.primary.provider]);

	// Candidate fallback model keys, ordered by reliability/quality.
	// We only care that they're a DIFFERENT provider from the primary;
	// the actual model picked is whichever is configured.
	const fallbackOrder = [
		"claude-sonnet-4-5",
		"gemini-2.5-flash",
		"gpt-4o-mini",
		"claude-haiku-3-5",
		"nvidia-llama-3.3-70b",
	];

	for (const key of fallbackOrder) {
		if (chain.length >= 3) break;
		const info = MODEL_REGISTRY[key];
		if (!info) continue;
		if (triedProviders.has(info.provider)) continue;

		// Try BYOK first, then platform key. Same shape as primary resolution.
		try {
			const candidate = await resolveModelAndKey({
				ctx: args.ctx,
				orgId: args.orgId,
				userId: args.userId,
				requestedModel: key,
				requestedProvider: info.provider,
				plan: args.plan,
			});
			chain.push(candidate);
			triedProviders.add(candidate.provider);
		} catch {
			// No working key for this provider → skip.
		}
	}

	return chain;
}
