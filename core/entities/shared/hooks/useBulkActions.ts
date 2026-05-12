"use client";

/**
 * useBulkActions — manages row selection state and dispatches bulk mutations.
 */

import { useCallback, useState } from "react";

export function useBulkActions<TId extends string = string>() {
	const [selectedIds, setSelectedIds] = useState<TId[]>([]);

	const toggle = useCallback((id: TId) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
		);
	}, []);

	const selectAll = useCallback((ids: TId[]) => setSelectedIds(ids), []);
	const clearSelection = useCallback(() => setSelectedIds([]), []);

	return {
		selectedIds,
		toggle,
		selectAll,
		clearSelection,
		hasSelection: selectedIds.length > 0,
		count: selectedIds.length,
	};
}
