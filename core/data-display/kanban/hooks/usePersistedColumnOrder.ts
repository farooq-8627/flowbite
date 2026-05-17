"use client";

/**
 * usePersistedColumnOrder — per-user persisted Kanban column order.
 *
 * The entity boards (Leads / Contacts / Companies) compute their columns
 * from server-side enums or unique values in the data set. The ORDER of
 * those columns is a per-user preference — admins shouldn't fight over it
 * and there's nothing to validate server-side. We just persist the
 * preferred order to localStorage and apply it client-side every render.
 *
 * Behaviour
 * ─────────
 *   - When localStorage has no entry for the slot, returns the columns in
 *     the order the caller passed them (server / config order).
 *   - When localStorage has an entry, sorts known ids by the saved order
 *     and APPENDS any new ids at the end (so a freshly added status, tag,
 *     or assignee shows up rather than disappearing).
 *   - When the user drags a column, `onColumnReorder` is called with the
 *     new id list — pass it straight back to `KanbanBoard.onColumnReorder`.
 *
 * Notes
 * ─────
 *   - The slot id is the localStorage key suffix. Use a stable, unique
 *     value per board (e.g. `lead`, `contact:status`, `company:industry`).
 *   - Hidden / revealed status filtering is the caller's responsibility —
 *     this hook only owns the order, not visibility.
 */

import { useCallback, useMemo } from "react";
import { usePersistedState } from "../../../../lib/hooks/use-persisted-state";
import type { KanbanColumnConfig } from "../components/KanbanBoard";

export function usePersistedColumnOrder(
	slot: string,
	columns: KanbanColumnConfig[],
): {
	orderedColumns: KanbanColumnConfig[];
	onColumnReorder: (newOrder: string[]) => void;
} {
	const storageKey = `viewopts:${slot}:columnOrder`;
	const [savedOrder, setSavedOrder] = usePersistedState<string[]>(storageKey, []);

	const orderedColumns = useMemo(() => {
		if (savedOrder.length === 0) return columns;
		const byId = new Map(columns.map((c) => [c.id, c]));
		const seen = new Set<string>();
		const out: KanbanColumnConfig[] = [];
		// Apply persisted order first, dropping any ids the data set no longer contains.
		for (const id of savedOrder) {
			const col = byId.get(id);
			if (col) {
				out.push(col);
				seen.add(id);
			}
		}
		// Append new ids that the user hasn't sorted yet.
		for (const col of columns) {
			if (!seen.has(col.id)) out.push(col);
		}
		return out;
	}, [columns, savedOrder]);

	const onColumnReorder = useCallback(
		(newOrder: string[]) => {
			setSavedOrder(newOrder);
		},
		[setSavedOrder],
	);

	return { orderedColumns, onColumnReorder };
}
