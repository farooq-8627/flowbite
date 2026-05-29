"use node";
/**
 * convex/ai/models.ts
 *
 * Node.js-only AI provider factories + model resolution.
 * Static registry (MODEL_REGISTRY, plan gating, types) lives in modelRegistry.ts
 * so it can be imported safely from the Next.js frontend.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Re-export everything from registry so callers only need one import
export * from "./modelRegistry";

import type { ProviderId } from "./encryptionTypes";
import {
	MODEL_REGISTRY,
	type ModelInfo,
	type ModelTier,
	type OrgPlan,
	PLAN_ALLOWED_TIERS,
	PLATFORM_DEFAULT_MODEL,
} from "./modelRegistry";

// ─── Provider factory ─────────────────────────────────────────────────────────

export function buildLanguageModel(args: {
	provider: ProviderId;
	modelId: string;
	apiKey: string;
	baseUrl?: string;
}): unknown {
	const { provider, modelId, apiKey, baseUrl } = args;
	switch (provider) {
		case "anthropic":
			return createAnthropic({ apiKey })(modelId);
		case "openai":
			// Real OpenAI: default callable uses the Responses API, which OpenAI
			// supports natively (and which the SDK prefers for new features like
			// reasoning-delta + previous_response_id).
			return createOpenAI({ apiKey, baseURL: baseUrl })(modelId);
		case "google":
			return createGoogleGenerativeAI({ apiKey })(modelId);
		case "xai":
			return createXai({ apiKey })(modelId);
		case "groq":
			return createGroq({ apiKey })(modelId);
		case "mistral":
			return createMistral({ apiKey })(modelId);
		case "openrouter":
			return createOpenRouter({ apiKey, baseURL: baseUrl })(modelId);
		case "moonshot":
			// Moonshot exposes an OpenAI-compat surface but only implements
			// /v1/chat/completions — NOT /v1/responses. Force the SDK onto the
			// Chat Completions path with .chat(modelId). Default to the
			// international endpoint, allow .cn override via per-key baseUrl.
			return createOpenAI({
				apiKey,
				baseURL: baseUrl ?? "https://api.moonshot.ai/v1",
			}).chat(modelId);
		case "nvidia":
			// NVIDIA NIM is OpenAI-compat at /v1/chat/completions only — it has
			// no /v1/responses endpoint. Without .chat() the SDK posts to
			// /v1/responses and gets a 404. Default to the hosted endpoint;
			// allow self-hosted NIM via per-key baseUrl override.
			return createOpenAI({
				apiKey,
				baseURL: baseUrl ?? "https://integrate.api.nvidia.com/v1",
			}).chat(modelId);
		case "custom":
			// Custom OpenAI-compat endpoints (LM Studio, Ollama, llama.cpp,
			// LiteLLM, vLLM, etc.) almost never implement /v1/responses. Force
			// .chat(modelId) so we hit /v1/chat/completions, which is the
			// universal baseline of the OpenAI-compat surface.
			return createOpenAI({ apiKey, baseURL: baseUrl }).chat(modelId);
		default: {
			const _exhaustive: never = provider;
			throw new Error(`Unknown provider: ${_exhaustive}`);
		}
	}
}

export function getPlatformKey(provider: ProviderId): string | null {
	switch (provider) {
		case "anthropic":
			return process.env.ANTHROPIC_API_KEY ?? null;
		case "openai":
			return process.env.OPENAI_API_KEY ?? null;
		case "google":
			return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null;
		case "xai":
			return process.env.XAI_API_KEY ?? null;
		case "groq":
			return process.env.GROQ_API_KEY ?? null;
		case "mistral":
			return process.env.MISTRAL_API_KEY ?? null;
		case "openrouter":
			return process.env.OPENROUTER_API_KEY ?? null;
		case "nvidia":
			return process.env.NVIDIA_API_KEY ?? null;
		case "moonshot":
			return process.env.MOONSHOT_API_KEY ?? null;
		default:
			return null;
	}
}

// ─── Model resolution ─────────────────────────────────────────────────────────

export type GetModelResult = {
	model: unknown;
	provider: ProviderId;
	modelKey: string;
	modelId: string;
	tier: ModelTier;
	usageMode: "platform" | "byok";
};

export function getModel(args: {
	modelKey?: string | null;
	provider?: string | null;
	resolvedKey: { encryptedKey: string; baseUrl: string | null; scope: "user" | "org" } | null;
	decryptedKey?: string | null;
	plan: OrgPlan;
}): GetModelResult {
	const { resolvedKey, decryptedKey, plan } = args;

	let modelKey = args.modelKey ?? null;
	if (!modelKey) modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_DEFAULT_MODEL;
	if (modelKey.includes(":")) modelKey = modelKey.split(":")[1];

	const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_DEFAULT_MODEL];
	const finalModelKey = MODEL_REGISTRY[modelKey] ? modelKey : PLATFORM_DEFAULT_MODEL;

	if (resolvedKey && decryptedKey) {
		const provider = (args.provider ?? info.provider) as ProviderId;
		return {
			model: buildLanguageModel({
				provider,
				modelId: info.modelId,
				apiKey: decryptedKey,
				baseUrl: resolvedKey.baseUrl ?? undefined,
			}),
			provider,
			modelKey: finalModelKey,
			modelId: info.modelId,
			tier: info.tier,
			usageMode: "byok",
		};
	}

	// Plan-tier gating — re-enabled 2026-05-27 (P0.2.A).
	// `PLAN_ALLOWED_TIERS` maps `OrgPlan` → the model tiers a paying org may run on
	// the platform key. BYOK callers above bypass this entirely (they pay the model
	// bill directly). When the requested model's tier isn't allowed, we silently
	// downgrade to the highest-tier model whose provider has a platform key set —
	// the chat keeps working, but on a tier the plan covers. The `*ChatModelPicker*`
	// frontend surfaces an upgrade CTA before the user gets here.
	const allowedTiers = new Set<ModelTier>(PLAN_ALLOWED_TIERS[plan] ?? PLAN_ALLOWED_TIERS.free);

	// Helper: pick any model whose provider has a platform key set, preferring
	// allowed-tier candidates first, then falling back to any tier. This lets
	// the chat keep working when the user's saved preference (e.g. kimi-k2)
	// has no platform key but ANTHROPIC_API_KEY is set.
	const pickAnyConfiguredModel = (): {
		key: string;
		info: ModelInfo;
		platformKey: string;
	} | null => {
		const candidates = Object.entries(MODEL_REGISTRY)
			.filter(([, m]) => allowedTiers.has(m.tier))
			.sort((a, b) => b[1].inputCostPerMTok - a[1].inputCostPerMTok);
		for (const [key, m] of candidates) {
			const k = getPlatformKey(m.provider as ProviderId);
			if (k) return { key, info: m, platformKey: k };
		}
		// No allowed-tier match — try any model regardless of plan tier.
		for (const [key, m] of Object.entries(MODEL_REGISTRY)) {
			const k = getPlatformKey(m.provider as ProviderId);
			if (k) return { key, info: m, platformKey: k };
		}
		return null;
	};

	if (!allowedTiers.has(info.tier)) {
		const fallback = pickAnyConfiguredModel();
		if (!fallback) throw new Error(`Platform API key not configured: ${info.provider}`);
		return {
			model: buildLanguageModel({
				provider: fallback.info.provider as ProviderId,
				modelId: fallback.info.modelId,
				apiKey: fallback.platformKey,
			}),
			provider: fallback.info.provider as ProviderId,
			modelKey: fallback.key,
			modelId: fallback.info.modelId,
			tier: fallback.info.tier,
			usageMode: "platform",
		};
	}

	const platformKey = getPlatformKey(info.provider as ProviderId);
	if (platformKey) {
		return {
			model: buildLanguageModel({
				provider: info.provider as ProviderId,
				modelId: info.modelId,
				apiKey: platformKey,
			}),
			provider: info.provider as ProviderId,
			modelKey: finalModelKey,
			modelId: info.modelId,
			tier: info.tier,
			usageMode: "platform",
		};
	}

	// Requested provider has no platform key — try ANY other configured provider
	// before giving up so the chat keeps working as long as one platform key
	// exists somewhere in the env.
	const fallback = pickAnyConfiguredModel();
	if (!fallback) throw new Error(`Platform API key not configured: ${info.provider}`);
	return {
		model: buildLanguageModel({
			provider: fallback.info.provider as ProviderId,
			modelId: fallback.info.modelId,
			apiKey: fallback.platformKey,
		}),
		provider: fallback.info.provider as ProviderId,
		modelKey: fallback.key,
		modelId: fallback.info.modelId,
		tier: fallback.info.tier,
		usageMode: "platform",
	};
}
