"use client";
/**
 * core/ai/hooks/useModelPreference.ts
 *
 * Read/write the user's preferred AI model + provider.
 * Persisted in users.preferences.aiDefaultModel and aiDefaultProvider.
 *
 * The list of `allowed` models is now driven by `useAvailableProviders` —
 * it returns ONLY models whose provider has a usable API key (platform env
 * OR org BYOK OR user BYOK). Plan tiers no longer gate the picker.
 */
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { MODEL_REGISTRY } from "@/convex/ai/modelRegistry";
import { useAvailableProviders } from "./useAvailableProviders";

export function useModelPreference() {
	const user = useQuery(api.users.queries.me);
	const updatePrefs = useMutation(api.users.mutations.updatePreferences);

	const { availableModels, availableModelsByProvider, isReady } = useAvailableProviders();

	const allowed = useMemo(
		() => (availableModels ?? []).map((m) => m.modelKey),
		[availableModels],
	);

	// Pick a sane default: user preference if it's still in the available
	// list, otherwise the first available model, otherwise null. We never
	// silently fall back to a model the user can't actually run.
	const savedModel = user?.preferences?.aiDefaultModel ?? null;
	const savedProvider = user?.preferences?.aiDefaultProvider ?? null;

	const defaultModel = useMemo(() => {
		if (savedModel && MODEL_REGISTRY[savedModel] && allowed.includes(savedModel)) {
			return savedModel;
		}
		return allowed[0] ?? null;
	}, [savedModel, allowed]);

	const defaultProvider = useMemo(() => {
		if (!defaultModel) return savedProvider;
		return MODEL_REGISTRY[defaultModel]?.provider ?? savedProvider;
	}, [defaultModel, savedProvider]);

	const modelInfo = defaultModel ? MODEL_REGISTRY[defaultModel] : undefined;

	function setModel(modelKey: string, provider: string) {
		updatePrefs({
			aiDefaultModel: modelKey,
			aiDefaultProvider: provider,
		});
	}

	return {
		defaultModel,
		defaultProvider,
		modelInfo,
		allowed,
		availableModels: availableModels ?? [],
		availableModelsByProvider,
		isReady,
		hasNoKeys: isReady && allowed.length === 0,
		setModel,
	};
}
