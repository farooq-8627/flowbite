import type { Column } from "@tanstack/react-table";
import { dataTableConfig } from "../config";
import type { FilterOperator, FilterVariant } from "../types";

export function getCommonPinningStyles<TData>({
	column,
}: {
	column: Column<TData>;
}): React.CSSProperties {
	const isPinned = column.getIsPinned();
	const isLastLeft = isPinned === "left" && column.getIsLastColumn("left");
	const isFirstRight = isPinned === "right" && column.getIsFirstColumn("right");

	return {
		boxShadow: isLastLeft
			? "-5px 0 5px -5px var(--border) inset"
			: isFirstRight
				? "5px 0 5px -5px var(--border) inset"
				: undefined,
		left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
		right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
		position: isPinned ? "sticky" : "relative",
		background: isPinned ? "var(--background)" : undefined,
		width: column.getSize(),
		zIndex: isPinned ? 1 : 0,
	};
}

export function getFilterOperators(filterVariant: FilterVariant) {
	const map: Record<FilterVariant, { label: string; value: FilterOperator }[]> = {
		text: dataTableConfig.textOperators,
		number: dataTableConfig.numericOperators,
		range: dataTableConfig.numericOperators,
		date: dataTableConfig.dateOperators,
		dateRange: dataTableConfig.dateOperators,
		boolean: dataTableConfig.booleanOperators,
		select: dataTableConfig.selectOperators,
		multiSelect: dataTableConfig.multiSelectOperators,
	};
	return map[filterVariant] ?? dataTableConfig.textOperators;
}

export function getDefaultFilterOperator(filterVariant: FilterVariant) {
	const operators = getFilterOperators(filterVariant);
	return operators[0]?.value ?? (filterVariant === "text" ? "iLike" : "eq");
}
