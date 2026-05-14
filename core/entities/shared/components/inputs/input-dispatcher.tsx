"use client";

/**
 * Form input dispatcher — maps a (field.kind, field.type) pair to the React
 * form input shown for that field. Used by `EntityFieldForm`.
 *
 * Adding a new INPUT (rare): add a new `kind` to `KIND_INPUTS`. Every field
 * with that `kind` will use it.
 *
 * Adding a new FIELD (common): no code change. Just insert a `fieldDefinitions`
 * row — it picks up a kind input or a type-default input.
 *
 * SIZING — every control renders at h-9 / w-full so the form looks consistent
 * with Settings' SettingsRow controls. Inputs that "look small" (selects,
 * combobox triggers) stretch to fill their column.
 */

import { PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { CreateModeFileField } from "@/core/files/components/CreateModeFileField";
import { FileUpload } from "@/core/files/components/FileUpload";
import { PersonSelect } from "../PersonSelect";
import { TagPicker } from "../TagPicker";

export type FieldDef = Doc<"fieldDefinitions">;

export interface InputContext {
	field: FieldDef;
	slot: EntitySlot;
	value: unknown;
	onChange: (value: unknown) => void;
	/** Provide when editing an existing entity (file uploads need a stable id). */
	orgId?: Id<"orgs">;
	entityId?: string;
	disabled?: boolean;
}

const inputId = (field: FieldDef) => `field-${field._id}`;
const inputClass = "h-9 w-full text-sm";

// ─── Kind-specific inputs ────────────────────────────────────────────────────

const KIND_INPUTS: Record<string, (ctx: InputContext) => ReactNode> = {
	displayName: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="text"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder={field.label}
			disabled={disabled}
			className={inputClass}
		/>
	),
	title: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="text"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			className={inputClass}
		/>
	),
	email: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="email"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder="name@example.com"
			disabled={disabled}
			className={inputClass}
		/>
	),
	phone: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="tel"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder="+1 555 123 4567"
			disabled={disabled}
			className={inputClass}
		/>
	),
	status: ({ field, value, onChange, disabled }) => (
		<Select
			value={(value as string | undefined) ?? ""}
			onValueChange={onChange}
			disabled={disabled}
		>
			<SelectTrigger id={inputId(field)} className={inputClass}>
				<SelectValue placeholder="Select status" />
			</SelectTrigger>
			<SelectContent>
				{(field.options ?? []).map((opt) => (
					<SelectItem key={opt} value={opt} className="text-sm capitalize">
						{opt}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
	source: ({ field, value, onChange, disabled }) => (
		<Select
			value={(value as string | undefined) ?? ""}
			onValueChange={onChange}
			disabled={disabled}
		>
			<SelectTrigger id={inputId(field)} className={inputClass}>
				<SelectValue placeholder="Select source" />
			</SelectTrigger>
			<SelectContent>
				{(field.options ?? []).map((opt) => (
					<SelectItem key={opt} value={opt} className="text-sm capitalize">
						{opt}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
	assignee: ({ value, onChange, orgId, disabled }) => {
		// PersonSelect resolves a stub `{id, displayName: ""}` against listMembers
		// so the trigger shows the chosen person's avatar + name even when only
		// the userId is persisted on the entity.
		const stub = value ? { id: value as string, type: "user" as const, displayName: "" } : null;
		return (
			<PersonSelect
				scope="user"
				value={stub}
				orgId={orgId}
				onChange={(person) => onChange(person?.id ?? undefined)}
				disabled={disabled}
			/>
		);
	},
	tags: ({ orgId, value, onChange, disabled }) => (
		<TagPicker
			orgId={orgId}
			value={Array.isArray(value) ? (value as string[]) : []}
			onChange={onChange}
			placeholder={disabled ? undefined : "Add tags…"}
			disabled={disabled}
		/>
	),
	currency: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="number"
			step="0.01"
			value={value === undefined || value === null ? "" : String(value)}
			onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
			disabled={disabled}
			className={inputClass}
		/>
	),
	url: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="url"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder="https://..."
			disabled={disabled}
			className={inputClass}
		/>
	),
	"company-ref": ({ field, value, onChange, disabled }) => (
		// Lightweight placeholder — wire to a CompanyPicker later.
		<Input
			id={inputId(field)}
			type="text"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			placeholder="Company id"
			disabled={disabled}
			className={inputClass}
		/>
	),
};

// ─── Type-default inputs ─────────────────────────────────────────────────────

const TYPE_INPUTS: Record<string, (ctx: InputContext) => ReactNode> = {
	number: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="number"
			value={value === undefined || value === null ? "" : String(value)}
			onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
			disabled={disabled}
			className={inputClass}
		/>
	),
	date: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="date"
			value={
				typeof value === "number"
					? new Date(value).toISOString().slice(0, 10)
					: ((value as string | undefined) ?? "")
			}
			onChange={(e) =>
				onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)
			}
			disabled={disabled}
			className={inputClass}
		/>
	),
	boolean: ({ field, value, onChange, disabled }) => (
		<label
			htmlFor={inputId(field)}
			className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border bg-background px-3 text-sm"
		>
			<Checkbox
				id={inputId(field)}
				checked={!!value}
				onCheckedChange={(v) => onChange(!!v)}
				disabled={disabled}
			/>
			<span className="text-muted-foreground">{value ? "Yes" : "No"}</span>
		</label>
	),
	select: ({ field, value, onChange, disabled }) => (
		<Select
			value={(value as string | undefined) ?? ""}
			onValueChange={onChange}
			disabled={disabled}
		>
			<SelectTrigger id={inputId(field)} className={inputClass}>
				<SelectValue placeholder="Select…" />
			</SelectTrigger>
			<SelectContent>
				{(field.options ?? []).map((opt) => (
					<SelectItem key={opt} value={opt} className="text-sm">
						{opt}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
	multiselect: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
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
			disabled={disabled}
			className={inputClass}
		/>
	),
	url: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="url"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			className={inputClass}
		/>
	),
	email: ({ field, value, onChange, disabled }) => (
		<Input
			id={inputId(field)}
			type="email"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			className={inputClass}
		/>
	),
	file: ({ field, slot, orgId, entityId }) => {
		if (!orgId) return <FileFieldPlaceholder label={field.label} multiple={false} />;
		if (!entityId) {
			return (
				<CreateModeFileField
					orgId={orgId}
					fieldKey={field.name}
					label={field.label}
					multiple={false}
				/>
			);
		}
		return (
			<FileUpload
				orgId={orgId}
				scope={slot}
				scopeId={entityId}
				fieldKey={field.name}
				multiple={false}
				label={`Drop ${field.label.toLowerCase()} here or click to browse`}
			/>
		);
	},
	files: ({ field, slot, orgId, entityId }) => {
		if (!orgId) return <FileFieldPlaceholder label={field.label} multiple={true} />;
		if (!entityId) {
			return (
				<CreateModeFileField
					orgId={orgId}
					fieldKey={field.name}
					label={field.label}
					multiple={true}
				/>
			);
		}
		return (
			<FileUpload
				orgId={orgId}
				scope={slot}
				scopeId={entityId}
				fieldKey={field.name}
				multiple={true}
				label={`Drop ${field.label.toLowerCase()} here or click to browse`}
			/>
		);
	},
};

/**
 * File-field placeholder shown in CREATE mode (before we have an entityId
 * to scope storage to). Polished version of the prior italic gray text — looks
 * like a real input row, sets expectations clearly, doesn't break the form's
 * visual rhythm.
 *
 * Why we don't allow upload-then-attach: file storage is org-scoped by
 * `(scope, scopeId)`. Without an entityId the file would be orphaned. The
 * cleanest solution is to enforce save-first; we tell the user upfront so it
 * never feels like a missing feature.
 */
function FileFieldPlaceholder({ label, multiple }: { label: string; multiple: boolean }) {
	return (
		<div className="flex h-9 w-full items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 px-3 text-xs text-muted-foreground">
			<PaperclipIcon className="size-3.5 shrink-0" aria-hidden />
			<span className="truncate">
				Save the record first, then attach {multiple ? "files" : "a file"} to "{label}".
			</span>
		</div>
	);
}

function defaultInput({ field, value, onChange, disabled }: InputContext): ReactNode {
	return (
		<Input
			id={inputId(field)}
			type="text"
			value={(value as string | undefined) ?? ""}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			className={inputClass}
		/>
	);
}

/**
 * Resolve the input renderer for a field. Precedence: kind → type → default.
 */
export function getInputRenderer(field: FieldDef): (ctx: InputContext) => ReactNode {
	if (field.kind && KIND_INPUTS[field.kind]) return KIND_INPUTS[field.kind];
	if (TYPE_INPUTS[field.type]) return TYPE_INPUTS[field.type];
	return defaultInput;
}
