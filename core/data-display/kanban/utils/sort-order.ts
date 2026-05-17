/**
 * sort-order helpers — gap-based fractional positioning for the kanban.
 *
 * Allocation strategy (see `notes.sortOrder` schema doc):
 *   - Cards live in a column, ordered ascending by `sortOrder`.
 *   - A new card at the TOP of a column gets `min - 1024`.
 *   - A new card at the BOTTOM of a column gets `max + 1024`.
 *   - A card dropped BETWEEN two cards A (sortOrder=a) and B (sortOrder=b)
 *     where a < b gets `(a + b) / 2`. After ~10 inserts in the same gap
 *     the values get small but never collide; if the gap drops below 2
 *     the column is renumbered on the next move (rare, cheap).
 *
 * The helpers below are pure — they do NOT call mutations. The consumer's
 * drag handler invokes `computeSortOrderForDrop` with the post-drop items
 * array of the destination column and the new index, then forwards the
 * result to whichever mutation owns the column-field update.
 */

/** Fallback sort key used when `sortOrder` hasn't been migrated for a row. */
function readSortKey(item: { sortOrder?: number; _creationTime?: number }): number {
	if (item.sortOrder !== undefined) return item.sortOrder;
	if (item._creationTime !== undefined) return -item._creationTime;
	return 0;
}

/**
 * Compute a sortOrder for a card dropped at `newIndex` in a list of
 * `itemsAfterDrop` (the destination column's items, INCLUDING the dropped
 * card at `newIndex`). Returns the sortOrder the dropped card should be
 * stamped with so it lives at that exact position when the page re-renders
 * from a fresh query result.
 *
 * - newIndex === 0           → above the current top → topKey - 1024
 * - newIndex === length - 1  → below the current bottom → bottomKey + 1024
 * - otherwise                → midpoint of the two neighbours
 *
 * If both neighbours are missing (column had only the dropped card), returns
 * a sensible default near 0 (`-Date.now()`).
 */
export function computeSortOrderForDrop<T extends { id: string; sortOrder?: number; _creationTime?: number }>(
	itemsAfterDrop: T[],
	newIndex: number,
): number {
	const above = newIndex > 0 ? itemsAfterDrop[newIndex - 1] : undefined;
	const below =
		newIndex < itemsAfterDrop.length - 1 ? itemsAfterDrop[newIndex + 1] : undefined;

	if (!above && !below) {
		// Empty column except for the dropped card.
		return -Date.now();
	}
	if (!above && below) {
		return readSortKey(below) - 1024;
	}
	if (above && !below) {
		return readSortKey(above) + 1024;
	}
	// Both neighbours present — midpoint.
	const midpoint = (readSortKey(above as T) + readSortKey(below as T)) / 2;
	return midpoint;
}

/**
 * Convenience: sort an array of cards by their effective sortOrder
 * (`sortOrder` if set, else `-_creationTime`). Used by board consumers
 * before bucketing into columns.
 */
export function sortBySortOrder<T extends { sortOrder?: number; _creationTime?: number }>(
	items: ReadonlyArray<T>,
): T[] {
	return items.slice().sort((a, b) => readSortKey(a) - readSortKey(b));
}
