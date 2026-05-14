"use client";

/**
 * EntityFieldForm — generic, dynamic entity form (production-grade UI).
 *
 * REDESIGN (Round 5):
 *   - Sections are thin headed bands (small-caps label + hairline) instead of
 *     heavy <details> collapsibles. Quieter, denser, more "premium".
 *   - Density: gap-2.5 between fields, h-9 inputs, 11px labels, 10px helper
 *     text. Mirrors Linear/Attio/Pipedrive density tokens.
 *   - Two-column auto-layout for short related fields (email + phone, city +
 *     state, etc.) — driven by `width` hint in fieldDefinitions. Falls back
 *     to single-column.
 *   - Required indicator: subtle inline asterisk in destructive/60.
 *   - Helper text rendered below input only when present in field config.
 *
 * Replaces hand-coded drawer bodies (AddLeadDrawer, EditContactDrawer, …).
 * Iterates `formFields` from `useEntityFields` and dispatches each field
 * through `getInputRenderer` (inputs/input-dispatcher).
 *
 * STORAGE — per field:
 *   - storage="column"     → value goes into `columnValues`
 *   - storage="fieldValues"→ value goes into `customValues`
 *   - storage="join"       → field is shown read-only / linked to its
 *                             dedicated component (TagsCell, etc.)
 *
 * MODES
 *   - create — no entityId yet. Form holds values in local state. Parent
 *             reads `getValues()` after entity creation and persists.
 *   - edit   — entityId known. Each onChange writes through.
 */

import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useEntityFields } from "../hooks/useEntityFields";
import type { EntitySlot } from "../types";
import { type FieldDef, getInputRenderer } from "./inputs/input-dispatcher";

export interface EntityFormValues {
	/** Values whose `storage === "column"` — applied directly to the entity row. */
	columnValues: Record<string, unknown>;
	/** Values whose `storage === "fieldValues"` — bulkSet after creation / set per-edit. */
	customValues: Record<string, unknown>;
	/** Map of field name → fieldId for resolving bulkSet payloads. */
	fieldIdByName: Record<string, Id<"fieldDefinitions">>;
}

interface EntityFieldFormProps {
	slot: EntitySlot;
	orgId: Id<"orgs"> | undefined;
	/** Edit mode: pass the existing entity row (column values are pre-filled). */
	entity?: Record<string, unknown> & { _id?: string };
	/** Edit mode: pre-loaded `fieldValues` keyed by field NAME. */
	customValuesForEntity?: Record<string, unknown>;
	/** Stage-aware: pass the deal's current stage to filter showInStages fields. */
	currentStageId?: string;
	/** Only render fields with these names. If unset, renders all formFields. */
	includeOnly?: Set<string>;
	/** Render fields with these names hidden (they still validate). */
	excludeNames?: Set<string>;
	/** Per-field-change callback (edit mode write-through). */
	onFieldChange?: (field: FieldDef, value: unknown) => void;
	/** Create mode: hand the form a getter for current values when ready to persist. */
	registerGetValues?: (getter: () => EntityFormValues) => void;
	className?: string;
}

/**
 * Field kinds/types that benefit from being paired side-by-side when adjacent
 * (short single-line inputs).
 */
const HALF_WIDTH_KINDS = new Set(["phone", "email", "url", "currency"]);
const HALF_WIDTH_TYPES = new Set(["number", "date", "boolean", "url", "email"]);

export function EntityFieldForm({
	slot,
	orgId,
	entity,
	customValuesForEntity,
	currentStageId,
	includeOnly,
	excludeNames,
	onFieldChange,
	registerGetValues,
	className,
}: EntityFieldFormProps) {
	const { formFields } = useEntityFields(slot, orgId, { currentStageId });
	const setFieldValue = useMutation(api.crm.fields.fieldValues.mutations.set);

	// Local form state — both column and fieldValues.
	const [columnValues, setColumnValues] = useState<Record<string, unknown>>(() => {
		if (!entity) return {};
		const init: Record<string, unknown> = {};
		for (const f of formFields) {
			if (f.storage === "column") init[f.name] = entity[f.columnKey ?? f.name];
		}
		return init;
	});
	const [customValues, setCustomValues] = useState<Record<string, unknown>>(
		() => customValuesForEntity ?? {},
	);

	// Track which entity we initialised for, so switching records refreshes.
	const initedFor = useRef<string | undefined>(entity?._id);
	if (entity?._id && initedFor.current !== entity._id) {
		initedFor.current = entity._id;
		const nextCol: Record<string, unknown> = {};
		for (const f of formFields) {
			if (f.storage === "column") nextCol[f.name] = entity[f.columnKey ?? f.name];
		}
		setColumnValues(nextCol);
		setCustomValues(customValuesForEntity ?? {});
	}

	// Expose values to the parent for create-mode bulk persist.
	if (registerGetValues) {
		registerGetValues(() => {
			const fieldIdByName: Record<string, Id<"fieldDefinitions">> = {};
			for (const f of formFields) fieldIdByName[f.name] = f._id;
			return { columnValues, customValues, fieldIdByName };
		});
	}

	const handleChange = useCallback(
		(field: FieldDef, value: unknown) => {
			if (field.storage === "column") {
				setColumnValues((prev) => ({ ...prev, [field.name]: value }));
			} else if (field.storage === "fieldValues" || !field.storage) {
				setCustomValues((prev) => ({ ...prev, [field.name]: value }));
				// Edit-mode write-through for fieldValues.
				if (entity?._id && orgId) {
					void setFieldValue({
						orgId,
						entityType: slot,
						entityId: entity._id,
						fieldId: field._id,
						value,
					}).catch(() => {
						// silent — toast is parent responsibility
					});
				}
			}
			onFieldChange?.(field, value);
		},
		[entity?._id, orgId, slot, setFieldValue, onFieldChange],
	);

	// Resolve the value for a field from local state.
	const valueFor = useCallback(
		(field: FieldDef) => {
			if (field.storage === "column") return columnValues[field.name];
			if (field.storage === "fieldValues" || !field.storage) return customValues[field.name];
			return undefined;
		},
		[columnValues, customValues],
	);

	// Group by groupName, preserving field order within each group.
	const groups = useMemo(() => {
		const list = formFields.filter((f) => {
			if (includeOnly && !includeOnly.has(f.name)) return false;
			if (excludeNames?.has(f.name)) return false;
			// Read-only generated kinds: never editable.
			if (f.kind === "personCode" || f.kind === "entityCode") return false;
			return true;
		});

		const map = new Map<string, FieldDef[]>();
		for (const f of list) {
			const key = f.groupName ?? "General";
			if (!map.has(key)) map.set(key, []);
			map.get(key)?.push(f);
		}
		return Array.from(map.entries());
	}, [formFields, includeOnly, excludeNames]);

	if (groups.length === 0) return null;

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			{groups.map(([name, fields], idx) => (
				<FieldGroup
					key={name}
					name={name}
					fields={fields}
					showHeader={idx > 0 || groups.length > 1}
					render={(field) => {
						const renderer = getInputRenderer(field);
						return renderer({
							field,
							slot,
							value: valueFor(field),
							onChange: (v) => handleChange(field, v),
							orgId,
							entityId: entity?._id,
						});
					}}
				/>
			))}
		</div>
	);
}

// ─── FieldGroup — section-style group with optional header + dense layout ────

interface FieldGroupProps {
	name: string;
	fields: FieldDef[];
	showHeader: boolean;
	render: (field: FieldDef) => React.ReactNode;
}

function FieldGroup({ name, fields, showHeader, render }: FieldGroupProps) {
	// Pair adjacent half-width fields so they render side-by-side.
	const rows = useMemo(() => groupIntoRows(fields), [fields]);

	return (
		<section className="flex flex-col gap-2.5">
			{showHeader && (
				<div className="flex items-center gap-2 pt-1">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						{name}
					</span>
					<div className="h-px flex-1 bg-border" />
				</div>
			)}
			{rows.map((row) => {
				if (row.length === 1) {
					const f = row[0]!;
					return (
						<FormRow key={f._id} field={f}>
							{render(f)}
						</FormRow>
					);
				}
				// Pair-rows are stable: keyed by the concatenated field _ids of the pair.
				const pairKey = row.map((f) => f._id).join("__");
				return (
					<div key={pairKey} className="grid grid-cols-2 gap-2.5">
						{row.map((f) => (
							<FormRow key={f._id} field={f}>
								{render(f)}
							</FormRow>
						))}
					</div>
				);
			})}
		</section>
	);
}

/**
 * Pair adjacent half-width fields into 2-col rows. A field is "half-width"
 * when its kind/type is in the half-width set (short single-line inputs like
 * phone, email, number, date). All other fields render full-width.
 */
function groupIntoRows(fields: FieldDef[]): FieldDef[][] {
	const rows: FieldDef[][] = [];
	let pendingHalf: FieldDef | null = null;

	for (const f of fields) {
		const isHalf = HALF_WIDTH_KINDS.has(f.kind ?? "") || HALF_WIDTH_TYPES.has(f.type);

		if (!isHalf) {
			if (pendingHalf) {
				rows.push([pendingHalf]);
				pendingHalf = null;
			}
			rows.push([f]);
			continue;
		}

		// half-width
		if (pendingHalf) {
			rows.push([pendingHalf, f]);
			pendingHalf = null;
		} else {
			pendingHalf = f;
		}
	}
	if (pendingHalf) rows.push([pendingHalf]);
	return rows;
}

interface FormRowProps {
	field: FieldDef;
	children: React.ReactNode;
}

function FormRow({ field, children }: FormRowProps) {
	const id = `field-${field._id}`;
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className="text-[11px] font-medium leading-none text-foreground/90">
				{field.label}
				{field.required && (
					<span className="ms-0.5 text-destructive/60" title="Required">
						*
					</span>
				)}
			</Label>
			<div className="w-full min-w-0">{children}</div>
		</div>
	);
}
