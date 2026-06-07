/**
 * Bulk-row partition — convex/crm/shared/bulkRowPartition.ts
 *
 * THIN COMPATIBILITY SHIM. The previous version of this file shipped a
 * hardcoded `ENTITY_COLUMN_KEYS` map (locked 2026-06-06 morning) which
 * was the WRONG approach: it duplicated the same anti-pattern that
 * already existed in `_shared/aiEntityPatch.ts:splitPatchForEntity`
 * (`COLUMN_KEYS` allowlist) and missed admin-added column-backed fields.
 *
 * The 2026-06-06 evening rework moved the dispatch into a single
 * source of truth: `convex/crm/shared/dynamicFieldDispatch.ts` —
 * 100% `fieldDefinitions`-driven, no hardcoded column lists. This
 * file is now a thin shim that:
 *
 *   1. Re-exports the dispatcher's primitives so existing import paths
 *      keep resolving (avoids a 12-test rewrite churn).
 *   2. Provides `partitionRowKeys` with the legacy result shape
 *      (`{columnArgs, customFields: Record|null, dropped}`) for the
 *      test suite and any caller that hadn't migrated yet.
 *
 * New code should import directly from `dynamicFieldDispatch.ts` and
 * use `dispatchRowKeys` (returns the richer `DispatchedRow` shape with
 * a separate `joinFields` bucket).
 */

import {
	type DispatchedRow,
	type DynamicEntityType,
	dispatchRowKeys,
	type FieldDefRow,
} from "./dynamicFieldDispatch";

/** Re-exported for tests. The dispatcher is the only authority. */
export type { DynamicEntityType as PartitionEntityType, FieldDefRow } from "./dynamicFieldDispatch";

/**
 * Legacy result shape — kept for the existing 12-test suite. The
 * dispatcher returns the richer `DispatchedRow` shape; this helper
 * collapses `joinFields` into `dropped` (the bulk-create path doesn't
 * persist join fields anyway — those flow through dedicated tools
 * like `add_tag`).
 */
export type RowPartition = {
	columnArgs: Record<string, unknown>;
	customFields: Record<string, unknown> | null;
	dropped: string[];
};

/**
 * Pure function. Identical surface to the previous `partitionRowKeys`
 * (called from `bulk_create_entities.run` + the test suite), but the
 * implementation is the unified dispatcher — no hardcoded column lists.
 *
 * The `entityType` argument is now PURELY informational — every dispatch
 * decision flows from `fieldDefLookup`. We keep it on the signature so
 * the call sites + tests don't churn.
 */
export function partitionRowKeys(
	_entityType: DynamicEntityType,
	row: Record<string, unknown>,
	fieldDefLookup: ReadonlyMap<string, FieldDefRow>,
): RowPartition {
	const dispatched: DispatchedRow = dispatchRowKeys(row, fieldDefLookup);
	const dropped = [...dispatched.dropped, ...Object.keys(dispatched.joinFields)];
	return {
		columnArgs: dispatched.columnArgs,
		customFields:
			Object.keys(dispatched.customFields).length > 0 ? dispatched.customFields : null,
		dropped,
	};
}

/**
 * Re-exported placeholder for tests that previously asserted on the
 * hardcoded `ENTITY_COLUMN_KEYS` keys list. The dispatcher derives
 * everything from `fieldDefinitions`, so the test now seeds those rows
 * directly (see `bulkRowPartition.test.ts` post-refactor).
 *
 * Kept as `Record<DynamicEntityType, ReadonlySet<string>>` so the
 * existing test import resolves without modification — the empty sets
 * signal "no hardcoded knowledge".
 */
export const ENTITY_COLUMN_KEYS: Record<DynamicEntityType, ReadonlySet<string>> = {
	lead: new Set(),
	contact: new Set(),
	deal: new Set(),
	company: new Set(),
};
