/**
 * convex/ai/modelRegistry.ts
 *
 * Static model registry — NO "use node" directive.
 * Safe to import from both frontend (Next.js) and backend (Convex actions).
 *
 * Contains: MODEL_REGISTRY, MODEL_REGISTRY types, plan gating helpers.
 * Does NOT contain: provider factories (those need "use node" + SDK imports).
 */

export type ModelTier = "small" | "standard" | "premium";
export type OrgPlan = "free" | "starter" | "pro" | "enterprise";

export type ModelInfo = {
	provider: string;
	modelId: string;
	tier: ModelTier;
	supportsTools: boolean;
	contextWindow: number;
	inputCostPerMTok: number;
	outputCostPerMTok: number;
};

export const MODEL_REGISTRY: Readonly<Record<string, ModelInfo>> = {
	"claude-haiku-3-5": {
		provider: "anthropic",
		modelId: "claude-haiku-3-5-20241022",
		tier: "small",
		supportsTools: true,
		contextWindow: 200_000,
		inputCostPerMTok: 0.8,
		outputCostPerMTok: 4.0,
	},
	"claude-sonnet-4-5": {
		provider: "anthropic",
		modelId: "claude-sonnet-4-5-20250929",
		tier: "standard",
		supportsTools: true,
		contextWindow: 200_000,
		inputCostPerMTok: 3.0,
		outputCostPerMTok: 15.0,
	},
	"claude-opus-4": {
		provider: "anthropic",
		modelId: "claude-opus-4-20250514",
		tier: "premium",
		supportsTools: true,
		contextWindow: 200_000,
		inputCostPerMTok: 15.0,
		outputCostPerMTok: 75.0,
	},
	"gpt-4o-mini": {
		provider: "openai",
		modelId: "gpt-4o-mini",
		tier: "small",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0.15,
		outputCostPerMTok: 0.6,
	},
	"gpt-4o": {
		provider: "openai",
		modelId: "gpt-4o",
		tier: "standard",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 2.5,
		outputCostPerMTok: 10.0,
	},
	"o3-mini": {
		provider: "openai",
		modelId: "o3-mini",
		tier: "premium",
		supportsTools: true,
		contextWindow: 200_000,
		inputCostPerMTok: 1.1,
		outputCostPerMTok: 4.4,
	},
	"gemini-2.0-flash": {
		provider: "google",
		modelId: "gemini-2.0-flash",
		tier: "small",
		supportsTools: true,
		contextWindow: 1_000_000,
		inputCostPerMTok: 0.1,
		outputCostPerMTok: 0.4,
	},
	"gemini-2.0-pro": {
		provider: "google",
		modelId: "gemini-2.0-pro-exp-02-05",
		tier: "premium",
		supportsTools: true,
		contextWindow: 2_000_000,
		inputCostPerMTok: 1.25,
		outputCostPerMTok: 5.0,
	},
	"grok-3": {
		provider: "xai",
		modelId: "grok-3-latest",
		tier: "premium",
		supportsTools: true,
		contextWindow: 131_072,
		inputCostPerMTok: 3.0,
		outputCostPerMTok: 15.0,
	},
	"grok-3-mini": {
		provider: "xai",
		modelId: "grok-3-mini-latest",
		tier: "small",
		supportsTools: true,
		contextWindow: 131_072,
		inputCostPerMTok: 0.3,
		outputCostPerMTok: 0.5,
	},
	"llama-3.3-70b": {
		provider: "groq",
		modelId: "llama-3.3-70b-versatile",
		tier: "standard",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0.59,
		outputCostPerMTok: 0.79,
	},
	"mistral-large": {
		provider: "mistral",
		modelId: "mistral-large-latest",
		tier: "standard",
		supportsTools: true,
		contextWindow: 131_000,
		inputCostPerMTok: 2.0,
		outputCostPerMTok: 6.0,
	},
	// ── Free-tier-friendly providers ─────────────────────────────────────────
	// NVIDIA NIM exposes an OpenAI-compatible API at https://integrate.api.nvidia.com/v1.
	// Free tier: 5,000 requests/month for build.nvidia.com personal accounts.
	// Set `NVIDIA_API_KEY` in Convex dashboard env vars, OR add via Settings → AI as BYOK.
	// Tool calling support varies per model; Llama-3.3-70b-instruct supports tools.
	"nvidia-llama-3.3-70b": {
		provider: "nvidia",
		modelId: "meta/llama-3.3-70b-instruct",
		tier: "standard",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
	},
	// OpenRouter free model — `:free` suffix is mandatory for free tier.
	// Free tier: 20 requests/min, ~200/day per account.
	"openrouter-llama-3.3-70b-free": {
		provider: "openrouter",
		modelId: "meta-llama/llama-3.3-70b-instruct:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
	},
	// ── Moonshot AI / Kimi ───────────────────────────────────────────────────
	// Moonshot exposes an OpenAI-compatible API at https://api.moonshot.ai/v1
	// (international) or https://api.moonshot.cn/v1 (China). Set `MOONSHOT_API_KEY`
	// in Convex env vars OR add via Settings → AI as BYOK.
	// Kimi K2 is the flagship reasoning model; moonshot-v1-128k is the
	// long-context generalist.
	"kimi-k2": {
		provider: "moonshot",
		modelId: "kimi-k2-0711-preview",
		tier: "premium",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0.6,
		outputCostPerMTok: 2.5,
	},
	"moonshot-v1-128k": {
		provider: "moonshot",
		modelId: "moonshot-v1-128k",
		tier: "standard",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 2.0,
		outputCostPerMTok: 5.0,
	},
	"moonshot-v1-32k": {
		provider: "moonshot",
		modelId: "moonshot-v1-32k",
		tier: "small",
		supportsTools: true,
		contextWindow: 32_000,
		inputCostPerMTok: 1.0,
		outputCostPerMTok: 3.0,
	},
} as const;

export function canUsePremiumTools(modelKey: string): boolean {
	const info = MODEL_REGISTRY[modelKey];
	return info?.tier === "premium" || info?.tier === "standard";
}

export const PLAN_ALLOWED_TIERS: Record<OrgPlan, ModelTier[]> = {
	free: ["small"],
	starter: ["small", "standard"],
	pro: ["small", "standard", "premium"],
	enterprise: ["small", "standard", "premium"],
};

export function getAllowedModelsForPlan(plan: OrgPlan): string[] {
	const tiers = new Set(PLAN_ALLOWED_TIERS[plan] ?? PLAN_ALLOWED_TIERS.free);
	return Object.entries(MODEL_REGISTRY)
		.filter(([, info]) => tiers.has(info.tier))
		.map(([key]) => key);
}

export const PLATFORM_DEFAULT_MODEL = "claude-sonnet-4-5";
export const PLATFORM_BRIEFING_MODEL = "claude-haiku-3-5";
