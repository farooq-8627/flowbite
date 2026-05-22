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
			// Moonshot exposes an OpenAI-compat surface; pick the international
			// endpoint by default but allow per-key baseUrl override (e.g. .cn).
			return createOpenAI({
				apiKey,
				baseURL: baseUrl ?? "https://api.moonshot.ai/v1",
			})(modelId);
		case "nvidia":
			// NVIDIA NIM is OpenAI-compat. Default to the public hosted endpoint
			// unless the key was added with a custom baseUrl (self-hosted NIM).
			return createOpenAI({
				apiKey,
				baseURL: baseUrl ?? "https://integrate.api.nvidia.com/v1",
			})(modelId);
		case "custom":
			return createOpenAI({ apiKey, baseURL: baseUrl })(modelId);
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

	const allowedTiers = new Set<ModelTier>(PLAN_ALLOWED_TIERS[plan] ?? PLAN_ALLOWED_TIERS.free);
	if (!allowedTiers.has(info.tier)) {
		const bestKey =
			Object.entries(MODEL_REGISTRY)
				.filter(([, m]) => allowedTiers.has(m.tier))
				.sort((a, b) => b[1].inputCostPerMTok - a[1].inputCostPerMTok)[0]?.[0] ??
			PLATFORM_DEFAULT_MODEL;
		const bestInfo = MODEL_REGISTRY[bestKey];
		const platformKey = getPlatformKey(bestInfo.provider as ProviderId);
		if (!platformKey) throw new Error(`Platform API key not configured: ${bestInfo.provider}`);
		return {
			model: buildLanguageModel({
				provider: bestInfo.provider as ProviderId,
				modelId: bestInfo.modelId,
				apiKey: platformKey,
			}),
			provider: bestInfo.provider as ProviderId,
			modelKey: bestKey,
			modelId: bestInfo.modelId,
			tier: bestInfo.tier,
			usageMode: "platform",
		};
	}

	const platformKey = getPlatformKey(info.provider as ProviderId);
	if (!platformKey) throw new Error(`Platform API key not configured: ${info.provider}`);
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
