"use client";
/**
 * core/ai/hooks/useAvailableProviders.ts
 *
 * Returns the union set of AI providers the current viewer can actually use:
 *
 *   • providers with a platform env-var key set (read once via Node action),
 *   • providers with an org-scope BYOK key (reactive Convex query),
 *   • providers with a user-scope BYOK key for the viewer (same query).
 *
 * Plus the derived list of `availableModels` — the entries from
 * MODEL_REGISTRY whose `provider` is in the union — and a helper map of
 * `availableModelsByProvider` for grouped UI dropdowns.
 *
 * The model picker / settings dropdown / preference defaults all flow
 * through this hook — there is no plan-based gating any more. Capability
 * comes from "is there a key for this provider?" only.
 */
import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { MODEL_REGISTRY, type ModelInfo } from "@/convex/ai/modelRegistry";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export interface AvailableModelEntry {
	modelKey: string;
	info: ModelInfo;
}

export function useAvailableProviders() {
	const { orgId } = useCurrentOrg();

	// BYOK side — reactive. Updates the moment the user adds/removes a key.
	const byokProviders = useQuery(
		anyApi.ai.keys.listAvailableProviders,
		orgId ? { orgId } : "skip",
	) as string[] | undefined;

	// Platform-env side — fetched once on mount via Node action.
	const listPlatformProviders = useAction(anyApi.ai.availableModels.listPlatformProviders);
	const [platformProviders, setPlatformProviders] = useState<string[] | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		listPlatformProviders({})
			.then((result) => {
				if (!cancelled) setPlatformProviders(result as string[]);
			})
			.catch(() => {
				if (!cancelled) setPlatformProviders([]); // fail-soft: assume none
			});
		return () => {
			cancelled = true;
		};
	}, [listPlatformProviders]);

	const availableProviders = useMemo(() => {
		if (byokProviders === undefined || platformProviders === undefined) return undefined;
		return new Set<string>([...byokProviders, ...platformProviders]);
	}, [byokProviders, platformProviders]);

	const availableModels = useMemo<AvailableModelEntry[] | undefined>(() => {
		if (!availableProviders) return undefined;
		return Object.entries(MODEL_REGISTRY)
			.filter(([, info]) => availableProviders.has(info.provider))
			.map(([modelKey, info]) => ({ modelKey, info }));
	}, [availableProviders]);

	const availableModelsByProvider = useMemo(() => {
		const map: Record<string, AvailableModelEntry[]> = {};
		if (!availableModels) return map;
		for (const entry of availableModels) {
			if (!map[entry.info.provider]) map[entry.info.provider] = [];
			map[entry.info.provider].push(entry);
		}
		return map;
	}, [availableModels]);

	return {
		/** Set of usable provider ids (BYOK ∪ platform env). `undefined` while loading. */
		availableProviders,
		/** Flat list of usable models. `undefined` while loading, `[]` when no keys. */
		availableModels,
		/** Same list grouped by provider id. */
		availableModelsByProvider,
		/** Convenience: true once both BYOK + platform have resolved. */
		isReady: availableProviders !== undefined,
	};
}
