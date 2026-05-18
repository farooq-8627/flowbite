"use client";

/**
 * useEntityDisplaysBatched — batched entity display resolver for list views.
 *
 * Replaces per-row `useEntityDisplay` calls in `MessagesSidebar` and
 * `ForwardDialog`. One subscription covers the entire visible list.
 *
 * Pattern mirrors `useAttachmentDisplaysForOrg` (AGENTS.md rule:
 * "Per-row data on a list view comes from one batched query").
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type BatchedEntityDisplay = {
	name: string;
	secondary?: string;
	kindLabel: string;
	avatarUrl?: string;
};

export function useEntityDisplaysBatched(args: {
	orgId?: Id<"orgs">;
	items: ReadonlyArray<{ entityType?: string; entityId?: string }>;
}): Record<string, BatchedEntityDisplay> | undefined {
	const { orgId, items } = args;

	// Stable cache key — sorted, de-duped, primitives only.
	const cacheKey = useMemo(() => {
		const seen = new Set<string>();
		for (const item of items) {
			if (!item.entityType || !item.entityId) continue;
			seen.add(`${item.entityType}:${item.entityId}`);
		}
		if (seen.size === 0) return "";
		return Array.from(seen).sort().join("|");
	}, [items]);

	const stableItems = useMemo(() => {
		if (cacheKey.length === 0) return [];
		return cacheKey.split("|").map((k) => {
			const idx = k.indexOf(":");
			return { entityType: k.slice(0, idx), entityId: k.slice(idx + 1) };
		});
	}, [cacheKey]);

	return useQuery(
		api.crm.shared.conversations.queries.listEntityDisplays,
		orgId && stableItems.length > 0 ? { orgId, items: stableItems } : "skip",
	);
}
