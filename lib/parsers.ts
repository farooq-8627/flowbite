import { createParser } from "nuqs/server";
import { z } from "zod";

import { dataTableConfig } from "@/core/data-display/datatable/config";
import type { ExtendedColumnFilter, ExtendedColumnSort } from "@/core/data-display/datatable/types";

const sortingItemSchema = z.object({
	id: z.string(),
	desc: z.boolean(),
});

export const getSortingStateParser = <TData>(columnIds?: string[] | Set<string>) => {
	const validKeys = columnIds
		? columnIds instanceof Set
			? columnIds
			: new Set(columnIds)
		: null;

	return createParser({
		parse: (value) => {
			try {
				const parsed = JSON.parse(value);
				const result = z.array(sortingItemSchema).safeParse(parsed);
				if (!result.success) return null;
				if (validKeys && result.data.some((item) => !validKeys.has(item.id))) return null;
				return result.data as ExtendedColumnSort<TData>[];
			} catch {
				return null;
			}
		},
		serialize: (value) => JSON.stringify(value),
		eq: (a, b) =>
			a.length === b.length &&
			a.every((item, i) => item.id === b[i]?.id && item.desc === b[i]?.desc),
	});
};

const filterItemSchema = z.object({
	id: z.string(),
	value: z.union([z.string(), z.array(z.string())]),
	variant: z.enum(dataTableConfig.filterVariants),
	operator: z.enum(dataTableConfig.operators),
	filterId: z.string(),
});

export type FilterItemSchema = z.infer<typeof filterItemSchema>;

export const getFiltersStateParser = <TData>(columnIds?: string[] | Set<string>) => {
	const validKeys = columnIds
		? columnIds instanceof Set
			? columnIds
			: new Set(columnIds)
		: null;

	return createParser({
		parse: (value) => {
			try {
				const parsed = JSON.parse(value);
				const result = z.array(filterItemSchema).safeParse(parsed);
				if (!result.success) return null;
				if (validKeys && result.data.some((item) => !validKeys.has(item.id))) return null;
				return result.data as ExtendedColumnFilter<TData>[];
			} catch {
				return null;
			}
		},
		serialize: (value) => JSON.stringify(value),
		eq: (a, b) =>
			a.length === b.length &&
			a.every(
				(f, i) =>
					f.id === b[i]?.id &&
					f.value === b[i]?.value &&
					f.variant === b[i]?.variant &&
					f.operator === b[i]?.operator,
			),
	});
};
