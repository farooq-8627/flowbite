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
	/**
	 * Optional one-line caveat surfaced in the model picker UI.
	 * Use for "best for" / "weak at" hints — keeps users from picking
	 * a model that's a poor fit for the chat workflow.
	 *
	 * Day 1 T1.7 (PHASE-3-AI-AUDIT.md §6.5 E.T1.7).
	 */
	pickerNote?: string;
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
	// ── Google Gemini ────────────────────────────────────────────────────────
	// Day 1 T1.7 — `PHASE-3-AI-AUDIT.md §6.5 E.T1.7`. Gemini 2.0 Flash is
	// deprecated by Google as of late 2025 (per ai.google.dev/models, last
	// updated 2026-05-18); 2.0 Pro never had a stable API name. The current
	// stable family is 2.5; 3.x is partly preview. We keep the 2.0 entries
	// out so the model picker doesn't surface a model that 404s on first
	// call. Provider env var: GOOGLE_GENERATIVE_AI_API_KEY (or BYOK).
	"gemini-2.5-flash-lite": {
		provider: "google",
		modelId: "gemini-2.5-flash-lite",
		tier: "small",
		supportsTools: true,
		contextWindow: 1_000_000,
		inputCostPerMTok: 0.075,
		outputCostPerMTok: 0.3,
	},
	"gemini-2.5-flash": {
		provider: "google",
		modelId: "gemini-2.5-flash",
		tier: "standard",
		supportsTools: true,
		contextWindow: 1_000_000,
		inputCostPerMTok: 0.15,
		outputCostPerMTok: 0.6,
	},
	"gemini-2.5-pro": {
		provider: "google",
		modelId: "gemini-2.5-pro",
		tier: "premium",
		supportsTools: true,
		contextWindow: 2_000_000,
		inputCostPerMTok: 1.25,
		outputCostPerMTok: 5.0,
	},
	"gemini-3.5-flash": {
		provider: "google",
		modelId: "gemini-3.5-flash",
		tier: "standard",
		supportsTools: true,
		contextWindow: 1_000_000,
		inputCostPerMTok: 0.2,
		outputCostPerMTok: 0.8,
		pickerNote: "Newest Flash — strong tool calling.",
	},
	"gemini-3.1-pro-preview": {
		provider: "google",
		modelId: "gemini-3.1-pro-preview",
		tier: "premium",
		supportsTools: true,
		contextWindow: 2_000_000,
		inputCostPerMTok: 2.0,
		outputCostPerMTok: 8.0,
		pickerNote: "Preview — usable for production but rate-limited.",
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
	//
	// Day 1 T1.7 (`PHASE-3-AI-AUDIT.md §6.5 E.T1.7`) — re-tiered from
	// `standard` → `small`. In practice Llama-3.3-70B-Instruct via NIM is
	// closer to Haiku than to Sonnet at multi-step tool flows: it doesn't
	// auto-map plural→singular synonyms, sometimes ignores "stop after
	// twoStep", and echoes raw tool-result JSON as prose. Fine for free
	// tier + one-shot Q&A; we surface that caveat via `pickerNote`.
	"nvidia-llama-3.3-70b": {
		provider: "nvidia",
		modelId: "meta/llama-3.3-70b-instruct",
		tier: "small",
		supportsTools: true,
		contextWindow: 128_000,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
		pickerNote:
			"Free via NVIDIA NIM. Best for one-shot Q&A; weaker at multi-step CRM actions — prefer Claude or Gemini 2.5 Flash for create/update flows.",
	},
	// ── OpenRouter free models — `:free` suffix is mandatory for free tier ──
	// Free tier: 20 requests/min, ~200/day per account (per
	// https://openrouter.ai/docs/use-cases/free-models, last verified
	// 2026-06-06). All four below were verified live against
	// `https://openrouter.ai/api/v1/models` on 2026-06-06 — every entry
	// is currently listed AND advertises `tools` + `tool_choice` in
	// `supported_parameters` (`supportsTools: true` is therefore safe;
	// gating in `convex/ai/registry/wrapper.ts` will silently fall back
	// if a particular model regresses).
	//
	// Tier choice: every free model is mapped to `tier: "small"`. Plan
	// gating in `getModel` only allows "small" on the Free plan; pinning
	// these to "small" means a Free-plan user can pick them via BYOK
	// without a tier downgrade. Real model quality varies (Qwen3 Coder
	// 480B vs GLM 4.5 Air ≈ Sonnet vs Haiku in code), but `tier` is a
	// PLAN-allowance knob, not a quality knob; the `pickerNote` field is
	// where we surface quality hints.
	"openrouter-llama-3.3-70b-free": {
		provider: "openrouter",
		modelId: "meta-llama/llama-3.3-70b-instruct:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 131_072,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
	},
	// Qwen3 Coder 480B Active-A35B — Alibaba Cloud's flagship coding
	// model. 1,048,576 ctx (1M-token window) is the largest free model
	// on OpenRouter; ideal for repo-scale CRM-context tasks. Strong on
	// tool-call accuracy in our Llama-3.3 / GLM A/B compared to
	// Llama-3.3-70B-free. Slug: `qwen/qwen3-coder:free`.
	"openrouter-qwen3-coder-free": {
		provider: "openrouter",
		modelId: "qwen/qwen3-coder:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 1_048_576,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
		pickerNote: "Free via OpenRouter. 1M context, strong at code + multi-step tool calls.",
	},
	// Qwen3 Next 80B-A3B Instruct — newer-generation Qwen3, 262K ctx.
	// Slug: `qwen/qwen3-next-80b-a3b-instruct:free`.
	"openrouter-qwen3-next-80b-free": {
		provider: "openrouter",
		modelId: "qwen/qwen3-next-80b-a3b-instruct:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 262_144,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
		pickerNote: "Free via OpenRouter. Newer Qwen3 generation, balanced tool calls.",
	},
	// GLM 4.5 Air — Zhipu AI's mid-size open model, 131K ctx, supports
	// `tools` + `tool_choice`. Slug: `z-ai/glm-4.5-air:free`.
	"openrouter-glm-4.5-air-free": {
		provider: "openrouter",
		modelId: "z-ai/glm-4.5-air:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 131_072,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
		pickerNote: "Free via OpenRouter. Reliable for one-shot Q&A; usable for tool flows.",
	},
	// OpenAI GPT-OSS 120B — Apache-2.0 reasoning-tuned model published
	// by OpenAI on Hugging Face / OpenRouter. 131K ctx. Tools supported.
	// Slug: `openai/gpt-oss-120b:free`.
	"openrouter-gpt-oss-120b-free": {
		provider: "openrouter",
		modelId: "openai/gpt-oss-120b:free",
		tier: "small",
		supportsTools: true,
		contextWindow: 131_072,
		inputCostPerMTok: 0,
		outputCostPerMTok: 0,
		pickerNote: "Free via OpenRouter. Reasoning-tuned; good on chain-of-thought tasks.",
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
