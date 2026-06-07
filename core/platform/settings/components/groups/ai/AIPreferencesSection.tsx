"use client";
/**
 * core/platform/settings/components/groups/ai/AIPreferencesSection.tsx
 *
 * Per-user AI preferences: default model, briefing toggle, auto-context toggle.
 *
 * The model dropdown lists ONLY models whose provider has a usable key —
 * platform env, org BYOK, or user BYOK. If no keys exist anywhere, we show
 * a CTA pointing to the API Keys section directly above.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ModelTier } from "@/convex/ai/modelRegistry";
import { useModelPreference } from "@/core/ai/hooks/useModelPreference";
import { toast } from "@/lib/toast";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSection } from "../../shared/SettingsSection";

// ── Friendly display helpers (mirrors ChatModelPicker) ──────────────────
const MODEL_LABEL: Record<string, string> = {
	"claude-haiku-3-5": "Claude Haiku 3.5",
	"claude-sonnet-4-5": "Claude Sonnet 4.5",
	"claude-opus-4": "Claude Opus 4",
	"gpt-4o-mini": "GPT-4o mini",
	"gpt-4o": "GPT-4o",
	"o3-mini": "o3-mini",
	"gemini-2.0-flash": "Gemini 2.0 Flash",
	"gemini-2.0-pro": "Gemini 2.0 Pro",
	"grok-3": "Grok 3",
	"grok-3-mini": "Grok 3 mini",
	"llama-3.3-70b": "Llama 3.3 70B (Groq)",
	"mistral-large": "Mistral Large",
	"nvidia-llama-3.3-70b": "Llama 3.3 70B (NVIDIA)",
	"openrouter-llama-3.3-70b-free": "Llama 3.3 70B (Free)",
	"openrouter-qwen3-coder-free": "Qwen3 Coder 480B (Free)",
	"openrouter-qwen3-next-80b-free": "Qwen3 Next 80B (Free)",
	"openrouter-glm-4.5-air-free": "GLM 4.5 Air (Free)",
	"openrouter-gpt-oss-120b-free": "GPT-OSS 120B (Free)",
	"kimi-k2": "Kimi K2",
	"moonshot-v1-128k": "Moonshot v1 128k",
	"moonshot-v1-32k": "Moonshot v1 32k",
};

const PROVIDER_LABEL: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google",
	xai: "xAI",
	groq: "Groq",
	mistral: "Mistral",
	nvidia: "NVIDIA",
	openrouter: "OpenRouter",
	moonshot: "Moonshot",
	custom: "Custom",
};

const TIER_BADGE: Record<ModelTier, { label: string; className: string }> = {
	small: { label: "Fast", className: "text-emerald-600 dark:text-emerald-400" },
	standard: { label: "Standard", className: "text-sky-600 dark:text-sky-400" },
	premium: { label: "Premium", className: "text-violet-600 dark:text-violet-400" },
};

function modelLabel(key: string) {
	if (MODEL_LABEL[key]) return MODEL_LABEL[key];
	if (key.startsWith("dyn:")) {
		const rest = key.slice(4);
		const sep = rest.indexOf(":");
		if (sep > 0) {
			const id = rest.slice(sep + 1);
			const noCreator = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
			return noCreator.replace(/:free$/, "");
		}
	}
	return key;
}

export function AIPreferencesSection() {
	const { defaultModel, availableModelsByProvider, isReady, hasNoKeys, setModel } =
		useModelPreference();
	const updatePrefs = useMutation(anyApi.users.mutations.updatePreferences);

	function handleModelChange(modelKey: string) {
		// Resolve provider from the grouped map (avoids re-importing the registry).
		let provider: string | null = null;
		for (const [p, entries] of Object.entries(availableModelsByProvider)) {
			if (entries.some((e) => e.modelKey === modelKey)) {
				provider = p;
				break;
			}
		}
		if (!provider) return;
		setModel(modelKey, provider);
	}

	async function handleToggle(field: string, value: boolean) {
		try {
			await updatePrefs({ [field]: value });
		} catch (err) {
			toast.mutationError(err, "Could not save preference.");
		}
	}

	return (
		<SettingsSection
			id="ai.preferences"
			title="AI Preferences"
			description="Personal preferences for the AI assistant, saved per user."
		>
			<SettingsRow
				label="Default model"
				description="Picks the AI model used by default in new conversations. Only models whose provider has a usable key are listed."
			>
				{!isReady ? (
					<div className="text-sm text-muted-foreground">Loading…</div>
				) : hasNoKeys ? (
					<div className="text-sm text-amber-600 dark:text-amber-400">
						No API keys configured. Add one in the “API Keys (BYOK)” section above to
						unlock model choices.
					</div>
				) : (
					<Select value={defaultModel ?? ""} onValueChange={handleModelChange}>
						<SelectTrigger className="w-full sm:w-[280px]">
							<SelectValue placeholder="Select a model">
								{defaultModel ? modelLabel(defaultModel) : "Select a model"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent className="min-w-[280px]">
							{Object.entries(availableModelsByProvider).map(
								([provider, entries]) => (
									<SelectGroup key={provider}>
										<SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
											{PROVIDER_LABEL[provider] ?? provider}
										</SelectLabel>
										{entries.map(({ modelKey, info }) => {
											const badge = TIER_BADGE[info.tier];
											return (
												<SelectItem key={modelKey} value={modelKey}>
													<div className="flex w-full items-center justify-between gap-3">
														<span className="truncate">
															{modelLabel(modelKey)}
														</span>
														<span
															className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}
														>
															{badge.label}
														</span>
													</div>
												</SelectItem>
											);
										})}
									</SelectGroup>
								),
							)}
						</SelectContent>
					</Select>
				)}
			</SettingsRow>

			<SettingsRow
				label="Auto-load entity context"
				description="When viewing a lead/contact/deal, automatically include its summary in the next AI message. Free of charge, no extra tokens until you send a message."
				compact
			>
				<Switch
					defaultChecked={true}
					onCheckedChange={(v) => handleToggle("aiAutoContextLoad", v)}
				/>
			</SettingsRow>

			<SettingsRow
				label="Daily morning briefing"
				description="Generate a daily AI summary at the top of your dashboard."
				compact
			>
				<Switch
					defaultChecked={true}
					onCheckedChange={(v) => handleToggle("aiBriefingEnabled", v)}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
