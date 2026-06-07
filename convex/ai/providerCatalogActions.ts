"use node";
/**
 * convex/ai/providerCatalogActions.ts
 *
 * Node-runtime catalog refresher. Fetches `/v1/models` from the
 * provider's endpoint with a supplied API key, normalises the response
 * to a common shape, and upserts the result into `aiProviderCatalogs`.
 *
 * Why "use node": uses `fetch` with explicit timeout via `AbortController`
 * + reads `process.env.*_API_KEY` for the platform-key fallback when the
 * caller didn't supply a key. V8 queries can't read env or call fetch.
 *
 * Public actions:
 *   - `refreshCatalog({provider, baseUrl?, apiKey?})` — single-provider
 *     refresh. Used by the post-key-save scheduler (`addOrgKey` etc.) +
 *     the manual "Refresh catalog" button (future). When `apiKey` is
 *     omitted, the action resolves a key in the same order the chat
 *     resolver uses: BYOK → platform DB → env.
 *
 *   - `refreshExpiredCatalogs({})` — cron entrypoint. Reads `listExpired`
 *     and refreshes each one with whichever key is available.
 *
 * Provider response shapes are documented inline. We support OpenRouter
 * + every OpenAI-compat endpoint (OpenAI, NVIDIA NIM, Moonshot, custom)
 * via the same handler — the response shape is essentially identical
 * across them, only `pricing` differs and is ignored except as a free-tier
 * heuristic.
 *
 * Sources:
 *   - https://openrouter.ai/api/v1/models (verified shape 2026-06-06)
 *   - https://platform.openai.com/docs/api-reference/models/list
 *   - https://docs.api.nvidia.com/nim/reference/models-list
 *
 * Failure modes are SILENT (logged, not thrown). A flaky provider must
 * not crash the chat experience — the picker just keeps showing the
 * stale entry until the next cron tick succeeds.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { decryptApiKey } from "./encryption";
import type { ProviderId } from "./encryptionTypes";

// String-path forward refs (Convex pre-codegen pattern; see keysActions.ts).
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _anyArgs = (a: Record<string, unknown>) => a as any;

const FETCH_TIMEOUT_MS = 8_000;

type CatalogModel = {
	id: string;
	label: string;
	contextLength?: number;
	supportsTools: boolean;
	isFree: boolean;
	creator?: string;
};

/**
 * Default `/v1/models` URL per provider. `custom` requires the caller
 * to supply baseUrl; we'd rather refuse than guess.
 */
function defaultModelsUrl(provider: ProviderId, baseUrl?: string): string | null {
	if (baseUrl) return joinUrl(baseUrl, "models");
	switch (provider) {
		case "openrouter":
			return "https://openrouter.ai/api/v1/models";
		case "openai":
			return "https://api.openai.com/v1/models";
		case "nvidia":
			return "https://integrate.api.nvidia.com/v1/models";
		case "moonshot":
			return "https://api.moonshot.ai/v1/models";
		case "groq":
			return "https://api.groq.com/openai/v1/models";
		case "mistral":
			return "https://api.mistral.ai/v1/models";
		case "xai":
			return "https://api.x.ai/v1/models";
		// Anthropic + Google use proprietary listing endpoints; their
		// model rosters are stable enough that `MODEL_REGISTRY` is the
		// SSOT — no dynamic catalog needed.
		case "anthropic":
		case "google":
		case "custom":
			return null;
		default:
			return null;
	}
}

function joinUrl(base: string, segment: string): string {
	const trimmed = base.replace(/\/+$/, "");
	if (trimmed.endsWith("/v1") || trimmed.endsWith("/openai/v1")) return `${trimmed}/${segment}`;
	return `${trimmed}/v1/${segment}`;
}

/** Build the composite cache key — `provider` for default endpoints, `provider|baseUrl` otherwise. */
function buildProviderKey(provider: string, baseUrl?: string): string {
	return baseUrl ? `${provider}|${baseUrl}` : provider;
}

/**
 * Heuristic creator extraction. OpenRouter slugs are `<creator>/<model>`
 * (e.g. `qwen/qwen3-coder:free` → `qwen`). Other providers use the bare
 * model id and don't have a creator concept; falls back to the provider id.
 */
function extractCreator(modelId: string, provider: string): string | undefined {
	const slash = modelId.indexOf("/");
	if (slash > 0) return modelId.slice(0, slash);
	return provider;
}

/**
 * Normalise a single OpenAI-compat / OpenRouter model row into our
 * canonical `CatalogModel`. Failure-tolerant — returns null when the
 * row lacks an id (the caller filters those out).
 */
function normaliseModelRow(raw: unknown, provider: string): CatalogModel | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const id = typeof r.id === "string" ? r.id : null;
	if (!id) return null;

	// Label: prefer `name` (OpenRouter sets it; OpenAI usually doesn't),
	// else strip the creator prefix off the slug for a friendlier display.
	const rawName = typeof r.name === "string" ? r.name : null;
	const label = rawName ?? id.replace(/^[^/]+\//, "");

	// Context length: OpenRouter uses `context_length`; OpenAI uses
	// `context_window` on some endpoints; both fall through to undefined
	// when the provider doesn't expose it.
	const contextLength =
		typeof r.context_length === "number"
			? r.context_length
			: typeof r.context_window === "number"
				? r.context_window
				: undefined;

	// Tool support: OpenRouter exposes a `supported_parameters` array; if
	// the array contains `tools` or `tool_choice` the model supports them.
	// Other providers don't expose this field and we conservatively
	// default to `true` (every chat model these endpoints surface does in
	// practice; misclassification just means a non-tool-using model
	// pretends to support tools and the request fails on the first call).
	const supportedParams = Array.isArray(r.supported_parameters)
		? (r.supported_parameters as unknown[])
		: null;
	const supportsTools = supportedParams
		? supportedParams.includes("tools") || supportedParams.includes("tool_choice")
		: true;

	// Free heuristic: OpenRouter has a `pricing.{prompt,completion}` block
	// of dollar-per-token strings; both `"0"` => free. Fall through to a
	// slug-suffix check (`:free`) which OpenRouter uses as a hard rule.
	const pricing =
		r.pricing && typeof r.pricing === "object" ? (r.pricing as Record<string, unknown>) : null;
	const promptCost =
		pricing && typeof pricing.prompt === "string" ? Number(pricing.prompt) : null;
	const completionCost =
		pricing && typeof pricing.completion === "string" ? Number(pricing.completion) : null;
	const isFree = (promptCost === 0 && completionCost === 0) || id.toLowerCase().endsWith(":free");

	return {
		id,
		label,
		contextLength,
		supportsTools,
		isFree,
		creator: extractCreator(id, provider),
	};
}

async function fetchModelsFromEndpoint(args: {
	url: string;
	apiKey: string;
}): Promise<{ ok: true; data: unknown[] } | { ok: false; error: string }> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(args.url, {
			headers: {
				Authorization: `Bearer ${args.apiKey}`,
				"Content-Type": "application/json",
				// OpenRouter requires Referer / X-Title headers per their
				// docs (https://openrouter.ai/docs/api-reference/auth);
				// other providers ignore them. Setting them universally
				// is harmless.
				"HTTP-Referer": "https://orbitly.app",
				"X-Title": "Orbitly",
			},
			signal: ctrl.signal,
		});
		if (!res.ok) {
			return { ok: false, error: `HTTP ${res.status}` };
		}
		const json = (await res.json()) as { data?: unknown[] } | unknown[];
		// OpenRouter + OpenAI wrap in `{data: [...]}`; some self-hosted
		// LM-Studio-style endpoints return the array directly.
		const data = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
		if (!data) return { ok: false, error: "Unexpected response shape" };
		return { ok: true, data };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Unknown fetch error";
		return { ok: false, error: msg };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Get the env var name for a provider's platform key (legacy fallback
 * when the Owner panel hasn't been used yet).
 */
function providerEnvVar(p: ProviderId): string | null {
	switch (p) {
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "openai":
			return "OPENAI_API_KEY";
		case "google":
			return "GOOGLE_GENERATIVE_AI_API_KEY";
		case "xai":
			return "XAI_API_KEY";
		case "groq":
			return "GROQ_API_KEY";
		case "mistral":
			return "MISTRAL_API_KEY";
		case "openrouter":
			return "OPENROUTER_API_KEY";
		case "nvidia":
			return "NVIDIA_API_KEY";
		case "moonshot":
			return "MOONSHOT_API_KEY";
		case "custom":
			return null;
	}
}

// ─── Public actions ───────────────────────────────────────────────────────

/**
 * Refresh the catalog for one provider+baseUrl combination. Idempotent;
 * a failed fetch leaves the existing cached row untouched (so the picker
 * keeps rendering whatever was there before).
 */
export const refreshCatalog = internalAction({
	args: {
		provider: v.string(),
		baseUrl: v.optional(v.string()),
		apiKey: v.optional(v.string()),
		source: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<{ ok: boolean; modelCount: number; error?: string }> => {
		const provider = args.provider as ProviderId;
		const url = defaultModelsUrl(provider, args.baseUrl);
		if (!url) {
			return { ok: false, modelCount: 0, error: "no listing endpoint for provider" };
		}

		// Resolve a usable plaintext key. Order: caller-supplied → platform DB → env var.
		let apiKey: string | null = args.apiKey ?? null;
		if (!apiKey) {
			const platformRows = (await ctx.runQuery(
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
				_ref("_platform/aiKeys/queries:listActivePlatformKeys") as any,
				_anyArgs({}),
			)) as Array<{ provider: string; encryptedKey: string }> | null;
			const platformRow = platformRows?.find((r) => r.provider === args.provider);
			if (platformRow) {
				try {
					apiKey = decryptApiKey(platformRow.encryptedKey);
				} catch {
					// Skip undecryptable row — fall through to env.
				}
			}
			if (!apiKey) {
				const envName = providerEnvVar(provider);
				if (envName) apiKey = process.env[envName] ?? null;
			}
		}
		if (!apiKey) {
			return { ok: false, modelCount: 0, error: "no API key available" };
		}

		const result = await fetchModelsFromEndpoint({ url, apiKey });
		if (!result.ok) {
			console.warn(
				`[providerCatalog] refresh failed for ${provider}${
					args.baseUrl ? `|${args.baseUrl}` : ""
				}: ${result.error}`,
			);
			return { ok: false, modelCount: 0, error: result.error };
		}

		const models = result.data
			.map((row) => normaliseModelRow(row, provider))
			.filter((m): m is CatalogModel => m !== null)
			// Only surface models that support tools — the chat host
			// requires tool-calling. Non-tool models would silently fail
			// at first call.
			.filter((m) => m.supportsTools);

		await ctx.runMutation(
			_ref("ai/providerCatalogQueries:upsertCatalog"),
			_anyArgs({
				providerKey: buildProviderKey(args.provider, args.baseUrl),
				provider: args.provider,
				baseUrl: args.baseUrl,
				models,
				lastFetchSource: args.source ?? "manual",
			}),
		);

		return { ok: true, modelCount: models.length };
	},
});

/**
 * Cron entrypoint — refreshes every catalog whose `expiresAt` is in the
 * past. Each row is refreshed independently; one failing provider does
 * not block the others. Bounded `.take(20)` per tick.
 */
export const refreshExpiredCatalogs = internalAction({
	args: {},
	handler: async (ctx): Promise<{ refreshed: number; failed: number }> => {
		const expired = (await ctx.runQuery(
			_ref("ai/providerCatalogQueries:listExpired"),
			_anyArgs({ limit: 20 }),
		)) as Array<{ providerKey: string; provider: string; baseUrl: string | null }>;

		let refreshed = 0;
		let failed = 0;
		for (const row of expired) {
			const result = (await ctx.runAction(
				_ref("ai/providerCatalogActions:refreshCatalog"),
				_anyArgs({
					provider: row.provider,
					baseUrl: row.baseUrl ?? undefined,
					source: "cron",
				}),
			)) as { ok: boolean };
			if (result.ok) refreshed++;
			else failed++;
		}
		return { refreshed, failed };
	},
});
