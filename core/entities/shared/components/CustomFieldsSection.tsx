"use client";

/**
 * CustomFieldsSection — renders a form section for all user-defined fields
 * (fieldDefinitions) of an entity type.
 *
 * USAGE MODES:
 *   - create  — no entityId yet. Values are held in local state; parent reads
 *               `getValues()` after the entity is created and then calls the
 *               `onCreated(entityId)` prop which internally does a bulkSet.
 *   - edit    — entityId is known. Values are pre-filled from fieldValues and
 *               every change writes-through via `fieldValues.set`.
 *
 * FIELD KINDS SUPPORTED:
 *   text | number | date | boolean | select | multiselect | url | email
 *   file (single) | files (multi)
 *
 * File fields mount the universal FileUpload bound to
 *   { scope: entityType, scopeId: entityId, fieldKey: field.name }
 * and are DISABLED in create mode (we need an entityId first).
 */

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileUpload } from "@/core/files/components/FileUpload";
import { cn } from "@/lib/utils";

type SlotEntityType = "leads" | "contacts" | "deals" | "companies";

interface CustomFieldsSectionProps {
	orgId: Id<"orgs"> | undefined;
	entityType: SlotEntityType;
	/** In edit mode, the entity's id. Leave undefined for create mode. */
	entityId?: string;
	/** Layout — two-column grid (label-left/input-right) or stacked. Default: grid. */
	layout?: "grid" | "stack";
	className?: string;
	/**
	 * Create-mode escape hatch — parent reads current values after entity
	 * creation to persist them via fieldValues.bulkSet. Called once on each
	 * render pass so parent doesn't need to re-query.
	 */
	registerGetValues?: (getter: () => Array<{ fieldId: string; value: unknown }>) => void;
}

export function CustomFieldsSection({
	orgId,
	entityType,
	entityId,
	layout = "grid",
	className,
	registerGetValues,
}: CustomFieldsSectionProps) {
	const fields = useQuery(
		api.crm.fields.fieldDefinitions.queries.listByEntity,
		orgId ? { orgId, entityType } : "skip",
	);
	const existingValues = useQuery(
		api.crm.fields.fieldValues.queries.getForEntity,
		orgId && entityId ? { orgId, entityType, entityId } : "skip",
	);

	const setValue = useMutation(api.crm.fields.fieldValues.mutations.set);

	const [values, setValues] = useState<Record<string, unknown>>({});
	const initializedFor = useRef<string | null>(null);

	// Pre-fill from DB (edit mode). Keyed by entityId so switching records
	// resets the form to fresh server values.
	useEffect(() => {
		if (!entityId) return;
		if (initializedFor.current === entityId) return;
		if (!existingValues) return;
		const next: Record<string, unknown> = {};
		for (const v of existingValues) next[v.fieldId as string] = v.value;
		setValues(next);
		initializedFor.current = entityId;
	}, [entityId, existingValues]);

	// Expose a `getValues()` getter to the parent so it can persist after
	// entity creation (create mode).
	useEffect(() => {
		if (!registerGetValues) return;
		registerGetValues(() =>
			Object.entries(values).map(([fieldId, value]) => ({ fieldId, value })),
		);
	}, [registerGetValues, values]);

	const updateLocal = useCallback((fieldId: string, value: unknown) => {
		setValues((prev) => ({ ...prev, [fieldId]: value }));
	}, []);

	const updateRemote = useCallback(
		async (fieldId: string, value: unknown) => {
			if (!orgId || !entityId) return;
			try {
				await setValue({
					orgId,
					entityType,
					entityId,
					fieldId: fieldId as Id<"fieldDefinitions">,
					value,
				});
			} catch {
				// toast handled upstream — silent failure here so a bad field
				// doesn't break the whole form
			}
		},
		[orgId, entityType, entityId, setValue],
	);

	const isEdit = !!entityId;

	const handleChange = (fieldId: string, value: unknown) => {
		updateLocal(fieldId, value);
		if (isEdit) void updateRemote(fieldId, value);
	};

	const sorted = useMemo(
		() => (fields ?? []).slice().sort((a, b) => a.order - b.order),
		[fields],
	);

	if (!sorted.length) return null;

	const gridCls =
		layout === "grid"
			? "grid grid-cols-[120px_1fr] items-start gap-x-3 gap-y-2"
			: "flex flex-col gap-2";

	return (
		<div className={cn("space-y-1.5", className)}>
			<h3 className="text-xs font-medium text-muted-foreground">Custom fields</h3>
			<div className={gridCls}>
				{sorted.map((field) => {
					const current = values[field._id as string];
					return (
						<FieldRow
							key={field._id}
							field={field}
							value={current}
							isEdit={isEdit}
							orgId={orgId}
							entityType={entityType}
							entityId={entityId}
							onChange={(v) => handleChange(field._id as string, v)}
							layout={layout}
						/>
					);
				})}
			</div>
		</div>
	);
}

// ─── One row per field ────────────────────────────────────────────────────────

interface FieldRowProps {
	field: {
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
		options?: string[];
		required: boolean;
	};
	value: unknown;
	onChange: (v: unknown) => void;
	isEdit: boolean;
	orgId: Id<"orgs"> | undefined;
	entityType: SlotEntityType;
	entityId?: string;
	layout: "grid" | "stack";
}

function FieldRow({
	field,
	value,
	onChange,
	isEdit,
	orgId,
	entityType,
	entityId,
	layout,
}: FieldRowProps) {
	const id = `cf-${field._id}`;
	const labelEl = (
		<Label htmlFor={id} className="pt-2 text-xs">
			{field.label}
			{field.required && <span className="ms-1 text-destructive">*</span>}
		</Label>
	);

	let input: React.ReactNode;
	switch (field.type) {
		case "number":
			input = (
				<Input
					id={id}
					type="number"
					value={(value as number | string | undefined) ?? ""}
					onChange={(e) =>
						onChange(e.target.value === "" ? undefined : Number(e.target.value))
					}
					className="h-8 text-xs"
				/>
			);
			break;
		case "date":
			input = (
				<Input
					id={id}
					type="date"
					value={
						typeof value === "number"
							? new Date(value).toISOString().slice(0, 10)
							: ((value as string | undefined) ?? "")
					}
					onChange={(e) =>
						onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)
					}
					className="h-8 text-xs"
				/>
			);
			break;
		case "boolean":
			input = (
				<div className="flex h-8 items-center">
					<Checkbox id={id} checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
				</div>
			);
			break;
		case "select":
			input = (
				<Select
					value={(value as string | undefined) ?? ""}
					onValueChange={(v) => onChange(v)}
				>
					<SelectTrigger id={id} className="h-8 text-xs">
						<SelectValue placeholder="Select…" />
					</SelectTrigger>
					<SelectContent>
						{(field.options ?? []).map((opt) => (
							<SelectItem key={opt} value={opt} className="text-xs">
								{opt}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
			break;
		case "url":
		case "email":
			input = (
				<Input
					id={id}
					type={field.type === "email" ? "email" : "url"}
					value={(value as string | undefined) ?? ""}
					onChange={(e) => onChange(e.target.value)}
					className="h-8 text-xs"
				/>
			);
			break;
		case "file":
		case "files": {
			if (!isEdit || !orgId || !entityId) {
				input = (
					<p className="text-[11px] italic text-muted-foreground">
						Save first, then attach files here.
					</p>
				);
				break;
			}
			input = (
				<FileUpload
					orgId={orgId}
					scope={entityType.replace(/s$/, "")}
					scopeId={entityId}
					fieldKey={field.name}
					multiple={field.type === "files"}
					label={`Drop ${field.label.toLowerCase()} here or click to browse`}
				/>
			);
			break;
		}
		case "multiselect":
			input = (
				<Input
					id={id}
					placeholder="comma, separated, values"
					value={Array.isArray(value) ? value.join(", ") : ""}
					onChange={(e) =>
						onChange(
							e.target.value
								.split(",")
								.map((v) => v.trim())
								.filter(Boolean),
						)
					}
					className="h-8 text-xs"
				/>
			);
			break;
		default:
			input = (
				<Input
					id={id}
					type="text"
					value={(value as string | undefined) ?? ""}
					onChange={(e) => onChange(e.target.value)}
					className="h-8 text-xs"
				/>
			);
	}

	if (layout === "grid") {
		return (
			<>
				{labelEl}
				<div className="min-w-0">{input}</div>
			</>
		);
	}
	return (
		<div className="space-y-1.5">
			{labelEl}
			{input}
		</div>
	);
}
