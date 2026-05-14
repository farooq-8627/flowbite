"use client";

/**
 * useEntityTagsMap — batched lookup of tags for every entity of a given slot
 * in the current org. Returns `{ tagsByEntityId, tagsByName }` with the same
 * data sliced two ways so callers can render rows + group by tag without
 * re-deriving anything.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type Tag = Doc<"tags">;

export function useEntityTagsMap(
	orgId: Id<"orgs"> | undefined,
	entityType: "lead" | "contact" | "deal" | "company",
) {
	const map = useQuery(
		api.crm.shared.tags.queries.listTagsForEntities,
		orgId ? { orgId, entityType } : "skip",
	);

	// entityId -> Tag[]
	const tagsByEntityId = useMemo(() => {
		const out: Record<string, Tag[]> = {};
		if (!map) return out;
		for (const [entityId, tags] of Object.entries(map)) {
			out[entityId] = tags as Tag[];
		}
		return out;
	}, [map]);

	// tagName -> entityId[] (for board group-by="tag")
	const entityIdsByTagName = useMemo(() => {
		const out: Record<string, string[]> = {};
		for (const [entityId, tags] of Object.entries(tagsByEntityId)) {
			for (const tag of tags) {
				if (!out[tag.name]) out[tag.name] = [];
				out[tag.name].push(entityId);
			}
		}
		return out;
	}, [tagsByEntityId]);

	// Unique tag list (for building the group-by columns)
	const uniqueTags = useMemo(() => {
		const seen = new Map<string, Tag>();
		for (const tags of Object.values(tagsByEntityId)) {
			for (const tag of tags) {
				if (!seen.has(tag.name)) seen.set(tag.name, tag);
			}
		}
		return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
	}, [tagsByEntityId]);

	return { tagsByEntityId, entityIdsByTagName, uniqueTags, isLoading: map === undefined };
}
