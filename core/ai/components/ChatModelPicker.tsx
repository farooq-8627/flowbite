"use client";
/**
 * core/ai/components/ChatModelPicker.tsx
 *
 * Compact AI model picker for the chat composer.
 *
 * The list of selectable models is DYNAMIC — only models whose provider has
 * a usable API key (platform env, org BYOK, or user BYOK) are shown. When no
 * keys are configured at all, the picker collapses to a CTA that points the
 * user at Settings → AI to add one.
 */
import { Key, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ModelTier } from "@/convex/ai/modelRegistry";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useModelPreference } from "../hooks/useModelPreference";

// ── Friendly display helpers ─────────────────────────────────────────────
const MODEL_LABEL: Record<string, string> = {
	"claude-haiku-3-5": "Claude Haiku 3.5",
	"claude-sonnet-4-5": "Claude Sonnet 4.5",
	"claude-opus-4": "Claude Opus 4",
	"gpt-4o-mini": "GPT-4o mini",
	"gpt-4o": "GPT-4o",
	"o3-mini": "o3-mini",
	// Day 1 T1.7 — Gemini family refresh. 2.0 entries removed (deprecated
	// upstream); 2.5 + 3.x added. See PHASE-3-AI-AUDIT.md §6.5 E.T1.7.
	"gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
	"gemini-2.5-flash": "Gemini 2.5 Flash",
	"gemini-2.5-pro": "Gemini 2.5 Pro",
	"gemini-3.5-flash": "Gemini 3.5 Flash",
	"gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
	"grok-3": "Grok 3",
	"grok-3-mini": "Grok 3 mini",
	"llama-3.3-70b": "Llama 3.3 70B (Groq)",
	"mistral-large": "Mistral Large",
	"nvidia-llama-3.3-70b": "Llama 3.3 70B (NVIDIA)",
	"openrouter-llama-3.3-70b-free": "Llama 3.3 70B (Free)",
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
	return MODEL_LABEL[key] ?? key;
}

interface Props {
	/** Optional callback fired when the user picks a different model. */
	onModelChange?: (modelKey: string, provider: string) => void;
}

export function ChatModelPicker({ onModelChange }: Props) {
	const { defaultModel, modelInfo, availableModelsByProvider, isReady, hasNoKeys, setModel } =
		useModelPreference();
	const { fullOrgEntry } = useCurrentOrg();
	const orgSlug = fullOrgEntry?.org.slug;

	if (!isReady) {
		return (
			<Button
				variant="ghost"
				size="sm"
				disabled
				className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
			>
				<Sparkles className="size-3.5" />
				Loading…
			</Button>
		);
	}

	if (hasNoKeys) {
		return (
			<Button
				variant="ghost"
				size="sm"
				asChild
				className="h-7 gap-1.5 px-2 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
			>
				<Link href={orgSlug ? `/${orgSlug}/settings?group=ai` : "#"}>
					<Key className="size-3.5" />
					Add API key
				</Link>
			</Button>
		);
	}

	function handleValueChange(modelKey: string) {
		// availableModelsByProvider entries already carry MODEL_REGISTRY info.
		// Resolve the provider from the parent group rather than re-importing
		// the registry here.
		let resolvedProvider: string | null = null;
		for (const [provider, entries] of Object.entries(availableModelsByProvider)) {
			if (entries.some((e) => e.modelKey === modelKey)) {
				resolvedProvider = provider;
				break;
			}
		}
		if (!resolvedProvider) return;
		setModel(modelKey, resolvedProvider);
		onModelChange?.(modelKey, resolvedProvider);
	}

	const triggerIcon =
		modelInfo?.tier === "small" ? (
			<Zap className="size-3.5 text-emerald-500 shrink-0" />
		) : (
			<Sparkles className="size-3.5 text-primary shrink-0" />
		);

	// `defaultModel` is non-null here because hasNoKeys === false.
	const value = defaultModel ?? "";

	return (
		<Select value={value} onValueChange={handleValueChange}>
			<SelectTrigger
				size="sm"
				className="h-7 gap-1.5 ps-2 pe-1.5 text-xs font-medium border-transparent hover:bg-muted/60 data-[state=open]:bg-muted/60 max-w-[200px]"
			>
				{triggerIcon}
				<SelectValue
					placeholder="Select model"
					className="truncate"
					aria-label={modelLabel(value)}
				>
					<span className="truncate">{modelLabel(value)}</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent align="start" className="min-w-[260px]">
				{Object.entries(availableModelsByProvider).map(([provider, entries]) => (
					<SelectGroup key={provider}>
						<SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
							{PROVIDER_LABEL[provider] ?? provider}
						</SelectLabel>
						{entries.map(({ modelKey, info }) => {
							const badge = TIER_BADGE[info.tier];
							return (
								<SelectItem key={modelKey} value={modelKey} className="text-sm">
									<div className="flex w-full flex-col gap-0.5">
										<div className="flex w-full items-center justify-between gap-3">
											<span className="truncate">{modelLabel(modelKey)}</span>
											<span
												className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}
											>
												{badge.label}
											</span>
										</div>
										{info.pickerNote && (
											<span className="text-[10px] text-muted-foreground/80 leading-tight">
												{info.pickerNote}
											</span>
										)}
									</div>
								</SelectItem>
							);
						})}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	);
}
