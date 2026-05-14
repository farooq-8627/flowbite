/**
 * rankBySearch — universal search used by every entity view.
 *
 * Given an array of items and a query, it:
 *   1. Assigns every item a score based on where/how strongly the query appears
 *      in the searchable string fields (startsWith > word-boundary > substring).
 *   2. Returns items SORTED so matches come first (highest score first), with
 *      non-matches preserved in their original order below.
 *   3. Returns a `Set<string>` of matched item ids so the board / table can
 *      flash-highlight them.
 *
 * The stable tail guarantees that an empty query leaves the list untouched and
 * a partial query keeps the column layout recognisable — matches just float
 * to the top of their column.
 */

export type SearchableItem = { id: string } & Record<string, unknown>;

export interface RankedSearchResult<T extends SearchableItem> {
	items: T[];
	matchedIds: Set<string>;
}

export function rankBySearch<T extends SearchableItem>(
	items: T[],
	query: string,
	fields: readonly string[],
): RankedSearchResult<T> {
	const q = query.trim().toLowerCase();
	if (!q) {
		return { items, matchedIds: new Set() };
	}

	const scored: Array<{ item: T; score: number; index: number }> = [];
	const unmatched: Array<{ item: T; index: number }> = [];
	const matchedIds = new Set<string>();

	for (let i = 0; i < items.length; i++) {
		const item = items[i] as T;
		const score = scoreItem(item, q, fields);
		if (score > 0) {
			scored.push({ item, score, index: i });
			matchedIds.add(item.id);
		} else {
			unmatched.push({ item, index: i });
		}
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.index - b.index; // stable inside equal-score groups
	});

	const merged: T[] = [...scored.map((s) => s.item), ...unmatched.map((u) => u.item)];

	return { items: merged, matchedIds };
}

function scoreItem<T extends SearchableItem>(
	item: T,
	q: string,
	fields: readonly string[],
): number {
	let best = 0;
	for (const key of fields) {
		const raw = (item as Record<string, unknown>)[key];
		if (typeof raw !== "string") continue;
		const val = raw.toLowerCase();
		if (!val) continue;
		if (val === q) best = Math.max(best, 100);
		else if (val.startsWith(q)) best = Math.max(best, 50);
		else if (wordBoundaryMatch(val, q)) best = Math.max(best, 20);
		else if (val.includes(q)) best = Math.max(best, 5);
	}
	return best;
}

function wordBoundaryMatch(haystack: string, needle: string): boolean {
	// Match `needle` at a word boundary (start of a word) inside `haystack`.
	// e.g. "Ahmed Khan" with needle "kh" matches at position 6.
	const re = new RegExp(`(^|\\s)${escapeRegExp(needle)}`, "i");
	return re.test(haystack);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
