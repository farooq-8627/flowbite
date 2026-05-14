/**
 * board-grouping — shared helpers to group kanban items by any field.
 *
 * The board historically grouped only by `status` (leads) or `currentStageId`
 * (deals). Users can now pick from `ALLOWED_BOARD_GROUP_BY[slot]` at runtime
 * via the ViewOptionsMenu → "Group by" selector. These helpers normalise the
 * "what's the column id for this item?" question across every slot.
 *
 * KEY INSIGHTS:
 *   - `tag` grouping is one-to-many: a single item appears in every tag's
 *     column. `expandItemsByGroupKey` returns a flat stream of pseudo-rows so
 *     the rest of the board code doesn't need to know about the fan-out.
 *   - A missing value becomes the sentinel `"__none__"` column so items are
 *     never silently dropped.
 */

import type { EntitySlot } from "../types";

/** Sentinel key for items whose groupBy value is null/undefined/empty string. */
export const NO_GROUP_KEY = "__none__";

export type TagRef = { _id?: string; id?: string; name?: string; color?: string };

/**
 * Return the column key(s) an item belongs to given the active groupBy field.
 * Single-value groupings (status, assignee, etc.) return a 1-tuple.
 * Many-value groupings (tag) return one entry per attached tag.
 */
export function getItemGroupKeys(
	item: Record<string, unknown>,
	groupBy: string,
	tagLookup?: (entityId: string) => TagRef[] | undefined,
): string[] {
	if (groupBy === "tag" || groupBy === "tags") {
		const entityId = String(item.id ?? item._id ?? "");
		const resolved = tagLookup?.(entityId) ?? [];
		if (resolved.length === 0) return [NO_GROUP_KEY];
		return resolved
			.map((t) => (t._id ?? t.id ?? t.name ?? NO_GROUP_KEY).toString())
			.filter(Boolean);
	}

	const raw = item[groupBy];
	if (raw === undefined || raw === null || raw === "") return [NO_GROUP_KEY];
	return [String(raw)];
}

/**
 * When the board is grouped by a field that already shows on the card, we hide
 * that field from the card to avoid redundancy. E.g. grouping by `status` →
 * hide the status chip; grouping by `assignedTo` → hide the assignee chip.
 *
 * Returns the list of field keys that should be *removed* from the visible
 * `cardFields` for this grouping.
 */
export function getHiddenCardFieldsForGrouping(groupBy: string): string[] {
	switch (groupBy) {
		case "status":
			return ["status"];
		case "assignedTo":
			return ["assignedTo"];
		case "currentStageId":
			return ["currentStageId"];
		case "source":
			return ["source"];
		case "industry":
			return ["industry"];
		case "companyId":
			return ["companyId"];
		case "tag":
		case "tags":
			return ["tags"];
		default:
			return [groupBy];
	}
}

/**
 * When grouping is applied, choose ONE alternate field to reveal in the card
 * so the user still has context the grouped-by field used to provide. E.g.
 * grouped-by status → reveal source; grouped-by assignee → reveal status;
 * grouped-by tag → reveal source.
 *
 * Returns the key to prepend to the visible cardFields, or null if no swap
 * is needed (e.g. grouping by a neutral field).
 */
export function getRevealedCardFieldForGrouping(groupBy: string, slot: EntitySlot): string | null {
	// Per-slot reveal matrix — lets us pick sensible substitutes.
	const revealMatrix: Record<EntitySlot, Record<string, string>> = {
		lead: {
			status: "source",
			assignedTo: "status",
			tag: "source",
			tags: "source",
			source: "status",
		},
		contact: {
			assignedTo: "companyId",
			companyId: "assignedTo",
			tag: "assignedTo",
			tags: "assignedTo",
		},
		deal: {
			currentStageId: "assignedTo",
			assignedTo: "currentStageId",
			tag: "currentStageId",
			tags: "currentStageId",
		},
		company: {
			industry: "assignedTo",
			assignedTo: "industry",
			tag: "industry",
			tags: "industry",
		},
	};
	return revealMatrix[slot]?.[groupBy] ?? null;
}
