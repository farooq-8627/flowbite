"use client";

/**
 * useEntityColumns — generic, slot-agnostic column builder for DataTable.
 *
 * Replaces the per-entity hand-coded column hooks (useLeadColumns, etc.).
 * Iterates `tableFields` from `useEntityFields` and dispatches each field
 * through `getCellRenderer` (cells/cell-dispatcher).
 *
 * EXTRAS THE HOOK ADDS:
 *   - "select" checkbox column (always first)
 *   - "createdAt" sortable date column (always second-to-last) — surfaces
 *     creation time so users can sort newest-first / oldest-first from the
 *     header. Reads `_creationTime` directly from the Convex doc.
 *   - "actions" dropdown column (always last) — calls onEdit/onDelete and
 *     consumes any extra menu items the caller provides
 *
 * STAGE-AWARENESS: tables show the union of all visible fields (cross-stage
 * view). `showInStages` is honored only for forms / detail / cards. See the
 * dynamic-fields blueprint for why.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTableColumnHeader } from "@/core/datatable/components/DataTableColumnHeader";
import { DataTableRowActions } from "@/core/datatable/components/DataTableRowActions";
import {
	type EntityRow,
	type FieldDef,
	getCellRenderer,
	readFieldValue,
} from "../components/cells/cell-dispatcher";
import type { EntitySlot } from "../types";
import { useEntityFields } from "./useEntityFields";

interface UseEntityColumnsOptions<TRow extends EntityRow> {
	/** Map of entityId → fieldName → value, populated by `useEntityFieldValuesMap`. */
	customValuesByEntityId?: Record<string, Record<string, unknown>>;
	/** Per-row delete handler. */
	onDelete?: (row: TRow) => void | Promise<void>;
	/** Extra dropdown items appended to the row-actions menu. Receives the row. */
	rowExtraActions?: (row: TRow) => ReactNode;
	/** Optional set of column IDs (field names) the caller wants HIDDEN even though they exist. */
	hiddenColumnIds?: Set<string>;
	/** Batch tag data from useEntityTagsMap — enables sorting + eliminates per-row flash. */
	tagsByEntityId?: Record<string, Array<{ _id: unknown; name: string; color?: string | null }>>;
}

export function useEntityColumns<TRow extends EntityRow>(
	slot: EntitySlot,
	orgId: Id<"orgs"> | undefined,
	options?: UseEntityColumnsOptions<TRow>,
): { columns: ColumnDef<TRow, unknown>[]; fields: FieldDef[]; isLoading: boolean } {
	const { tableFields, isLoading } = useEntityFields(slot, orgId);
	const customValuesByEntityId = options?.customValuesByEntityId;
	const hiddenColumnIds = options?.hiddenColumnIds;
	const onDelete = options?.onDelete;
	const rowExtraActions = options?.rowExtraActions;
	const tagsByEntityId = options?.tagsByEntityId;

	const columns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
		const cols: ColumnDef<TRow, unknown>[] = [];

		// Select column — always first
		cols.push({
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={table.getIsAllPageRowsSelected()}
					onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
					aria-label="Select all"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(v) => row.toggleSelected(!!v)}
					aria-label="Select row"
					onClick={(e) => e.stopPropagation()}
				/>
			),
			enableSorting: false,
			enableHiding: false,
			size: 32,
		});

		// One column per visible table field
		for (const field of tableFields) {
			if (hiddenColumnIds?.has(field.name)) continue;
			const renderer = getCellRenderer(field);
			// Use accessorFn (not accessorKey) so TanStack reads the value from
			// the right place regardless of where it's stored. Custom fields
			// (storage="fieldValues") live in `customValuesByEntityId`, NOT on
			// the entity row itself — so an `accessorKey: "budget"` would
			// resolve to undefined for every row and silently break sorting.
			// `readFieldValue` knows the storage rules (column / fieldValues /
			// join) and returns the right value for sort + filter comparisons.
			cols.push({
				id: field.name,
				accessorFn: (row) => {
					const r = row as EntityRow;
					if (field.kind === "tags" && tagsByEntityId) {
						const tags = tagsByEntityId[r.id];
						return tags?.[0]?.name ?? null;
					}
					return readFieldValue(field, r, customValuesByEntityId?.[r.id]);
				},
				meta: { label: field.label },
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title={field.label} />
				),
				cell: ({ row }) => {
					const r = row.original as EntityRow;
					const customValues = customValuesByEntityId?.[r.id];
					const prefetchedTags = field.kind === "tags" ? tagsByEntityId?.[r.id] : undefined;
					return renderer({ slot, field, row: r, customValues, prefetchedTags });
				},
				// Tags are sortable when batch data is provided; otherwise
				// join-storage fields remain unsortable.
				enableSorting: field.kind === "tags" ? !!tagsByEntityId : field.storage !== "join",
				// Booleans + arrays don't sort meaningfully under the default
				// "auto" comparator. Pick a sensible sortingFn per field type.
				sortingFn:
					field.type === "number" ||
					field.kind === "currency" ||
					field.kind === "relativeTime" ||
					field.type === "date"
						? "basic"
						: field.type === "boolean"
							? (a, b, id) => {
									const av = a.getValue(id) ? 1 : 0;
									const bv = b.getValue(id) ? 1 : 0;
									return av - bv;
								}
							: field.type === "multiselect"
								? (a, b, id) => {
										const av = (a.getValue(id) as unknown[] | undefined) ?? [];
										const bv = (b.getValue(id) as unknown[] | undefined) ?? [];
										return av.length - bv.length;
									}
								: "alphanumeric",
				// Undefined/null values always at the bottom regardless of
				// asc/desc — keeps blank cells from polluting the top of a
				// sorted list (common ask in CRM tables).
				sortUndefined: "last",
			});
		}

		// Created-at column — gives the user header-click sorting for "newest"
		// and "oldest" without having to add a custom field. Pulled from the
		// Convex `_creationTime` baked into every doc.
		cols.push({
			id: "createdAt",
			accessorFn: (row: EntityRow) =>
				(row as Record<string, unknown>)._creationTime as number | undefined,
			meta: { label: "Created" },
			header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
			cell: ({ getValue }) => {
				const ts = getValue() as number | undefined;
				if (!ts) return <span className="text-xs text-muted-foreground">—</span>;
				return (
					<span
						className="text-xs text-muted-foreground"
						title={new Date(ts).toLocaleString()}
					>
						{formatDistanceToNow(new Date(ts), { addSuffix: true })}
					</span>
				);
			},
			enableSorting: true,
			sortDescFirst: true,
		});

		// Actions column — always last
		if (onDelete || rowExtraActions) {
			cols.push({
				id: "actions",
				enableSorting: false,
				enableHiding: false,
				size: 44,
				cell: ({ row }) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps the dots menu from opening row detail
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<DataTableRowActions
							row={row}
							extraItems={rowExtraActions?.(row.original as TRow)}
							onDelete={
								onDelete ? async (r) => onDelete(r.original as TRow) : undefined
							}
						/>
					</div>
				),
			});
		}

		return cols;
	}, [tableFields, customValuesByEntityId, hiddenColumnIds, onDelete, rowExtraActions, slot, tagsByEntityId]);

	return { columns, fields: tableFields, isLoading };
}
