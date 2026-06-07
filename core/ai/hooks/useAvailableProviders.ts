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
 * `MODEL_REGISTRY` whose `provider` is in the union, JOINED with the
 * dynamic `aiProviderCatalogs` cache (every model the user's actual key
 * unlocks at the provider's `/v1/models` endpoint, e.g. ~300+ OpenRouter
 * models including Qwen3 Coder 480B). Dynamic entries carry the same
 * `ModelInfo` shape as static ones; the resolver tells them apart by
 * the `dyn:<provider>:<modelId>` modelKey prefix.
 *
 * Map of `availableModelsByProvider` follows for grouped UI dropdowns.
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
	/** True for entries sourced from `aiProviderCatalogs` (dynamic). */
	dynamic?: boolean;
}

/**
 * Shape returned by `ai.providerCatalogQueries.listForOrg`. Mirrored
 * inline so the hook stays decoupled from the generated api type-graph
 * (which can lag during local dev).
 */
type CatalogRow = {
	providerKey: string;
	provider: string;
	baseUrl: string | null;
	models: Array<{
		id: string;
		label: string;
		contextLength?: number;
		supportsTools: boolean;
		isFree: boolean;
		creator?: string;
	}>;
	fetchedAt: number;
	stale: boolean;
};

/**
 * Build a stable modelKey for a dynamic catalog entry. Format:
 * `dyn:<provider>:<modelId>` — split on the FIRST colon to recover
 * `<provider>` + `<modelId>` (`modelId` may contain its own `:` for
 * `:free`-suffixed slugs, hence the explicit "first colon only" rule).
 */
function dynamicModelKey(provider: string, modelId: string): string {
	return `dyn:${provider}:${modelId}`;
}

export function useAvailableProviders() {
	const { orgId } = useCurrentOrg();

	// BYOK side — reactive. Updates the moment the user adds/removes a key.
	const byokProviders = useQuery(
		anyApi.ai.keys.listAvailableProviders,
		orgId ? { orgId } : "skip",
	) as string[] | undefined;

	// Dynamic catalogs — reactive. Returns ONLY catalogs whose provider
	// the caller can actually use (BYOK ∪ platform); see
	// `convex/ai/providerCatalogQueries.ts:listForOrg`.
	const catalogs = useQuery(
		anyApi.ai.providerCatalogQueries.listForOrg,
		orgId ? { orgId } : "skip",
	) as CatalogRow[] | undefined;

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

		// 1. Static MODEL_REGISTRY entries the viewer can run (the
		//    set of providers they have a key for).
		const staticEntries: AvailableModelEntry[] = Object.entries(MODEL_REGISTRY)
			.filter(([, info]) => availableProviders.has(info.provider))
			.map(([modelKey, info]) => ({ modelKey, info }));

		// 2. Dynamic catalog entries (from /v1/models), if cached.
		//    Dedupe against static modelIds — a user who has both a
		//    static `openrouter-llama-3.3-70b-free` row AND the live
		//    catalog should only see the model once.
		const staticModelIds = new Set(staticEntries.map((e) => e.info.modelId));
		const dynamicEntries: AvailableModelEntry[] = (catalogs ?? [])
			.flatMap(
				(cat): Array<AvailableModelEntry | null> =>
					cat.models.map((m) => {
						if (staticModelIds.has(m.id)) return null;
						const info: ModelInfo = {
							provider: cat.provider,
							modelId: m.id,
							// Dynamic entries always classed `small` so plan
							// gating doesn't refuse them on Free plan; users
							// with platform/BYOK keys aren't paying us per
							// token regardless. Quality hint is in pickerNote.
							tier: "small",
							supportsTools: m.supportsTools,
							contextWindow: m.contextLength ?? 8_000,
							inputCostPerMTok: 0,
							outputCostPerMTok: 0,
							pickerNote: m.isFree
								? `Free via ${cat.provider}.${
										m.contextLength
											? ` Context ${(m.contextLength / 1000).toFixed(0)}K.`
											: ""
									}`
								: undefined,
						};
						const entry: AvailableModelEntry = {
							modelKey: dynamicModelKey(cat.provider, m.id),
							info,
							dynamic: true,
						};
						return entry;
					}),
			)
			.filter((e): e is AvailableModelEntry => e !== null);

		return [...staticEntries, ...dynamicEntries];
	}, [availableProviders, catalogs]);

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
		/** Flat list of usable models (static + dynamic). `undefined` while loading. */
		availableModels,
		/** Same list grouped by provider id. */
		availableModelsByProvider,
		/** Convenience: true once both BYOK + platform have resolved. */
		isReady: availableProviders !== undefined,
	};
}
