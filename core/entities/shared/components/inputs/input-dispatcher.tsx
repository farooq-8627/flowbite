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
import { PhoneInput } from "@/components/ui/phone-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { CreateModeFileField } from "@/core/data-io/files/components/CreateModeFileField";
import { FileUpload } from "@/core/data-io/files/components/FileUpload";
import type { EntitySlot } from "@/core/entities/shared/types";
import { useOrgDefaultCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";
import { BufferedTagsPicker } from "../BufferedTagsPicker";
import { PersonSelect } from "../PersonSelect";
import { TagsCell } from "../TagsCell";

export type FieldDef = Doc<"fieldDefinitions">;

export interface InputContext {
	field: FieldDef;
	slot: EntitySlot;
	value: unknown;
	onChange: (value: unknown) => void;
	/** Provide when editing an existing entity (file uploads need a stable id). */
	orgId?: Id<"orgs">;
	/**
	 * The entity's Convex `_id` (a string). Used by joins-style cells like
	 * `<TagsCell>` whose backing table (`entityTags`) keys on the Convex id.
	 */
	entityId?: string;
	/**
	 * The entity's HUMAN code (`personCode`, `dealCode`, `companyCode`).
	 * Used by file-type fields because `convex/files/mutations.ts::record`
	 * validates `scopeId` against the per-slot human code, not the Convex
	 * `_id`. Must be derived from the entity in edit mode by `EntityFieldForm`
	 * — passing `entityId` (Convex id) here would cause `validateScopeId`
	 * to throw "Resource not found" because the lookup index is by code.
	 *
	 * Undefined in create mode (no entity yet) — `<CreateModeFileField>`
	 * buffers locally and the parent commits later via `fileBuffer.commitAll`
	 * with the freshly-generated code.
	 */
	fileScopeId?: string;
	/**
	 * The person code associated with this entity (for deals: deal.personCode).
	 * Used to tag file uploads with `person:<code>` so they surface on the
	 * person's Files tab.
	 */
	filePersonCode?: string;
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
		<PhoneInput
			id={inputId(field)}
			value={(value as string | undefined) ?? ""}
			onChange={(v) => onChange(v || undefined)}
			placeholder="555 123 4567"
			defaultCountry="US"
			international
			disabled={disabled}
			className="w-full"
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
	tags: ({ orgId, slot, entityId, value, onChange, disabled }) => {
		// Edit mode (entityId present) → DB-backed TagsCell, identical to the
		// pencil affordance the user gets in the table cell. Single-tag
		// semantics, lives in the entityTags join.
		if (entityId && orgId && !disabled) {
			return (
				<div className="flex h-9 items-center">
					<TagsCell orgId={orgId} entityType={slot} entityId={entityId} size="sm" />
				</div>
			);
		}
		// Create mode → buffer the tag NAME locally; parent attaches after
		// the entity row is written. Same popover UI as TagsCell.
		const single =
			Array.isArray(value) && value.length > 0
				? (value[0] as string)
				: typeof value === "string"
					? value
					: undefined;
		return (
			<BufferedTagsPicker
				orgId={orgId}
				value={single}
				onChange={(next) => onChange(next ? [next] : [])}
				size="sm"
			/>
		);
	},
	currency: ({ field, value, onChange, disabled, orgId }) => (
		<CurrencyInput
			id={inputId(field)}
			value={value as number | undefined}
			onChange={onChange}
			disabled={disabled}
			orgId={orgId}
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
	file: ({ field, slot, orgId, entityId, fileScopeId, filePersonCode }) => {
		if (!orgId) return <FileFieldPlaceholder label={field.label} multiple={false} />;
		if (!entityId || !fileScopeId) {
			return (
				<CreateModeFileField
					orgId={orgId}
					fieldKey={field.name}
					label={field.label}
					multiple={false}
				/>
			);
		}
		const tags = filePersonCode ? [`person:${filePersonCode}`] : undefined;
		return (
			<FileUpload
				orgId={orgId}
				scope={slot}
				scopeId={fileScopeId}
				fieldKey={field.name}
				multiple={false}
				label={`Drop ${field.label.toLowerCase()} here or click to browse`}
				tags={tags}
			/>
		);
	},
	files: ({ field, slot, orgId, entityId, fileScopeId, filePersonCode }) => {
		if (!orgId) return <FileFieldPlaceholder label={field.label} multiple={true} />;
		if (!entityId || !fileScopeId) {
			return (
				<CreateModeFileField
					orgId={orgId}
					fieldKey={field.name}
					label={field.label}
					multiple={true}
				/>
			);
		}
		const tags = filePersonCode ? [`person:${filePersonCode}`] : undefined;
		return (
			<FileUpload
				orgId={orgId}
				scope={slot}
				scopeId={fileScopeId}
				fieldKey={field.name}
				multiple={true}
				label={`Drop ${field.label.toLowerCase()} here or click to browse`}
				tags={tags}
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
 * CurrencyInput — money field with a separate currency-code prefix.
 *
 * Why split the code from the amount: typing "AED 25,000" into one Input
 * mixes locale + value and breaks Number() parsing. Showing the org's
 * default currency code as a prefix (read-only chip) keeps the amount
 * input clean — `<input type="number">` semantics work as users expect.
 *
 * The code itself is dynamic — pulled from `orgs.settings.defaultCurrency`
 * via `useOrgDefaultCurrency`. Workspaces in the UAE see "AED", workspaces
 * in India see "INR", US workspaces see "USD", with no hardcoding.
 */
function CurrencyInput({
	id,
	value,
	onChange,
	disabled,
	orgId,
}: {
	id: string;
	value: number | undefined;
	onChange: (v: unknown) => void;
	disabled?: boolean;
	orgId?: Id<"orgs">;
}) {
	const currencyCode = useOrgDefaultCurrency(orgId);
	return (
		<div
			className={cn(
				"flex h-9 items-stretch overflow-hidden rounded-[var(--radius)] border bg-background",
				disabled && "opacity-60",
			)}
		>
			<span
				aria-hidden
				className="inline-flex shrink-0 items-center border-e bg-muted/40 px-2 text-[11px] font-mono text-muted-foreground"
			>
				{currencyCode}
			</span>
			<Input
				id={id}
				type="number"
				step="0.01"
				inputMode="decimal"
				value={value === undefined || value === null ? "" : String(value)}
				onChange={(e) =>
					onChange(e.target.value === "" ? undefined : Number(e.target.value))
				}
				disabled={disabled}
				className="h-full flex-1 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
			/>
		</div>
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
