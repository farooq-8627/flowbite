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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	/**
	 * Values whose `storage === "join"` — attached via dedicated mutations
	 * (e.g. `tags.attachToEntity`) by the parent form on submit. Keyed by
	 * field NAME (e.g. `"tags"` → array of selected tag names).
	 */
	joinValues: Record<string, unknown>;
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
	/**
	 * When true, required fields with no value are highlighted in destructive
	 * color. Pass `true` after the first submit attempt to show validation state.
	 */
	submittedOnce?: boolean;
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
	submittedOnce = false,
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

	// Track which keys the user has personally edited so we never clobber
	// in-progress input when a reactive query resolves later. The set lives
	// for the lifetime of one entity; switching records resets it.
	const touchedRef = useRef<Set<string>>(new Set());

	// Track which entity we initialised columns for, so switching records refreshes.
	const initedFor = useRef<string | undefined>(entity?._id);
	if (entity?._id && initedFor.current !== entity._id) {
		initedFor.current = entity._id;
		touchedRef.current = new Set();
		const nextCol: Record<string, unknown> = {};
		for (const f of formFields) {
			if (f.storage === "column") nextCol[f.name] = entity[f.columnKey ?? f.name];
		}
		setColumnValues(nextCol);
		setCustomValues(customValuesForEntity ?? {});
	}

	// Reactive sync — when `customValuesForEntity` arrives or changes (e.g.
	// the user just inline-saved a budget on the table and re-opens the edit
	// drawer, OR the query resolved AFTER the form mounted), merge new keys
	// in. Keys the user has actively edited stay protected via `touchedRef`.
	// This is the one and only place where state mirrors the prop after the
	// initial entity-id sync above.
	useEffect(() => {
		if (!customValuesForEntity) return;
		setCustomValues((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const [key, value] of Object.entries(customValuesForEntity)) {
				if (touchedRef.current.has(key)) continue;
				if (next[key] !== value) {
					next[key] = value;
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [customValuesForEntity]);

	// Reactive sync for COLUMN values (the bootstrapping fix).
	//
	// `columnValues` is initialized via a `useState(() => ...)` lazy
	// initializer that iterates `formFields`. On first render `formFields`
	// is `[]` because the underlying `useEntityFields` Convex query hasn't
	// resolved yet — so the initializer produces `{}` even when an
	// `entity` was supplied. The `initedFor` ref-guard above only re-syncs
	// when `entity._id` CHANGES; on the same entity (a normal edit-drawer
	// open), it never fires.
	//
	// Without this effect, opening the edit drawer for a deal whose
	// `formFields` haven't resolved at mount time leaves `columnValues`
	// empty until the user types — which means the parent's submit
	// handler reads `col.title === undefined` and any client-side guard
	// like `if (!col.title) toast.error("title required")` falsely fires
	// even though `entity.title` has a value.
	//
	// This effect re-fills `columnValues` from `entity` once `formFields`
	// has actually loaded (or any time the entity prop changes), with the
	// same `touchedRef` guard so values the user has personally edited
	// stay protected.
	useEffect(() => {
		if (!entity) return;
		// Bail out until the field schema has loaded — otherwise we'd
		// erase whatever defaults the lazy initializer produced.
		const columnDefs = formFields.filter((f) => f.storage === "column");
		if (columnDefs.length === 0) return;
		setColumnValues((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const f of columnDefs) {
				if (touchedRef.current.has(f.name)) continue;
				const fromEntity = entity[f.columnKey ?? f.name];
				if (next[f.name] !== fromEntity) {
					next[f.name] = fromEntity;
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [entity, formFields]);

	// Expose values to the parent for create-mode bulk persist.
	if (registerGetValues) {
		registerGetValues(() => {
			const fieldIdByName: Record<string, Id<"fieldDefinitions">> = {};
			const customByStorage: Record<string, unknown> = {};
			const joinByStorage: Record<string, unknown> = {};
			for (const f of formFields) {
				fieldIdByName[f.name] = f._id;
				const v = customValues[f.name];
				if (v === undefined) continue;
				if (f.storage === "join") joinByStorage[f.name] = v;
				else if (f.storage === "fieldValues" || !f.storage) customByStorage[f.name] = v;
			}
			return {
				columnValues,
				customValues: customByStorage,
				joinValues: joinByStorage,
				fieldIdByName,
			};
		});
	}

	const handleChange = useCallback(
		(field: FieldDef, value: unknown) => {
			if (field.storage === "column") {
				setColumnValues((prev) => ({ ...prev, [field.name]: value }));
			} else if (
				field.storage === "fieldValues" ||
				field.storage === "join" ||
				!field.storage
			) {
				// "join" fields (tags) buffer in customValues exactly like custom
				// fieldValues — the parent extracts them at submit time and runs
				// the appropriate join mutation (e.g. tags.attachToEntity).
				touchedRef.current.add(field.name);
				setCustomValues((prev) => ({ ...prev, [field.name]: value }));
				// Edit-mode write-through. Fires for both `storage === "fieldValues"`
				// AND `storage === undefined` (the implicit default for any
				// non-column / non-join field — e.g. the real-estate template's
				// `ejari_number` field, which omits `storage` in its seed).
				// Without this, typing into an undefined-storage field updates
				// only local state and nothing ever persists; the drawer closes,
				// state is thrown away, and the field reads as empty next time.
				// Excludes `storage === "join"` because join fields (tags) own
				// their own write path via dedicated cells like `<TagsCell>`
				// when an entity already exists.
				const persistsAsFieldValue = field.storage === "fieldValues" || !field.storage;
				if (persistsAsFieldValue && entity?._id && orgId) {
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
			if (field.storage === "fieldValues" || field.storage === "join" || !field.storage) {
				return customValues[field.name];
			}
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
					submittedOnce={submittedOnce}
					valueFor={valueFor}
					render={(field) => {
						const renderer = getInputRenderer(field);
						const fileScopeId = entity
							? slot === "deal"
								? (entity.dealCode as string | undefined)
								: slot === "company"
									? (entity.companyCode as string | undefined)
									: (entity.personCode as string | undefined)
							: undefined;
						const filePersonCode = entity
							? (entity.personCode as string | undefined)
							: undefined;
						return renderer({
							field,
							slot,
							value: valueFor(field),
							onChange: (v) => handleChange(field, v),
							orgId,
							entityId: entity?._id,
							fileScopeId,
							filePersonCode,
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
	submittedOnce: boolean;
	valueFor: (field: FieldDef) => unknown;
	render: (field: FieldDef) => React.ReactNode;
}

function FieldGroup({ name, fields, showHeader, submittedOnce, valueFor, render }: FieldGroupProps) {
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
					const isEmpty = !valueFor(f) && valueFor(f) !== 0 && valueFor(f) !== false;
					return (
						<FormRow key={f._id} field={f} hasError={submittedOnce && !!f.required && isEmpty}>
							{render(f)}
						</FormRow>
					);
				}
				const pairKey = row.map((f) => f._id).join("__");
				return (
					<div key={pairKey} className="grid grid-cols-2 gap-2.5">
						{row.map((f) => {
							const isEmpty = !valueFor(f) && valueFor(f) !== 0 && valueFor(f) !== false;
							return (
								<FormRow key={f._id} field={f} hasError={submittedOnce && !!f.required && isEmpty}>
									{render(f)}
								</FormRow>
							);
						})}
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
	hasError?: boolean;
}

function FormRow({ field, children, hasError }: FormRowProps) {
	const id = `field-${field._id}`;
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className={cn("text-[11px] font-medium leading-none", hasError ? "text-destructive" : "text-foreground/90")}>
				{field.label}
				{field.required && (
					<span className="ms-0.5 text-destructive/60" title="Required">
						*
					</span>
				)}
			</Label>
			<div className={cn("w-full min-w-0", hasError && "[&>*]:ring-1 [&>*]:ring-destructive [&>*]:ring-offset-0")}>
				{children}
			</div>
			{hasError && (
				<p className="text-[10px] text-destructive">This field is required</p>
			)}
		</div>
	);
}
