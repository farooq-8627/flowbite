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
			cols.push({
				id: field.name,
				accessorKey: field.columnKey ?? field.name,
				meta: { label: field.label },
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title={field.label} />
				),
				cell: ({ row }) => {
					const r = row.original as EntityRow;
					const customValues = customValuesByEntityId?.[r.id];
					return renderer({ slot, field, row: r, customValues });
				},
				enableSorting: field.kind !== "tags" && field.storage !== "join",
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
	}, [tableFields, customValuesByEntityId, hiddenColumnIds, onDelete, rowExtraActions, slot]);

	return { columns, fields: tableFields, isLoading };
}
