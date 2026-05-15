"use client";

/**
 * Cell renderer dispatcher — maps a (field.kind, field.type) pair to the
 * React node shown inside a table cell. Used by `useEntityColumns` so every
 * entity table is built generically from `fieldDefinitions`.
 *
 * Adding a new RENDERER (rare): add a new `kind` to `KIND_RENDERERS`. Every
 * field with that `kind` will use it, across every entity type.
 *
 * Adding a new FIELD (common): no code change. Just insert a `fieldDefinitions`
 * row — it will pick up the type-default renderer or one of the existing
 * `kind` renderers.
 *
 * EMPTY CELLS — the "—" dash is replaced by a small `+` button whenever the
 * field supports inline edit (most text/number/date/select/url/email/phone
 * kinds). Clicking opens a tight popover with the field's input + Save /
 * Enter saves. See `<InlineFieldEdit>`. Pinned UIs (tags, assignee, status,
 * file pickers) keep their own affordances and don't go through the dash.
 */

import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import type { EntitySlot } from "@/core/entities/shared/types";
import { useOrgDefaultCurrency } from "@/core/shared/hooks/useOrgDefaultCurrency";
import { PersonCodeBadge } from "../../PersonCodeBadge";
import { AssigneeCell } from "../AssigneeCell";
import { CompanyCell } from "../CompanyCell";
import { CopyField } from "../CopyField";
import { TagsCell } from "../TagsCell";
import { InlineFieldEdit, isInlineEditable } from "./InlineFieldEdit";

export type FieldDef = Doc<"fieldDefinitions">;
export type EntityRow = Record<string, unknown> & {
	id: string;
	_id?: string;
	orgId?: Id<"orgs">;
};

export interface CellContext {
	slot: EntitySlot;
	field: FieldDef;
	row: EntityRow;
	/** Custom-field values map for this row (only relevant for storage="fieldValues"). */
	customValues?: Record<string, unknown>;
	/** Pre-fetched tags for this row (from batch useEntityTagsMap). */
	prefetchedTags?: Array<{ _id: unknown; name: string; color?: string | null }>;
}

/** Read the value for a field from the right place based on `storage`. */
export function readFieldValue(
	field: FieldDef,
	row: EntityRow,
	customValues?: Record<string, unknown>,
): unknown {
	switch (field.storage) {
		case "column":
			return row[field.columnKey ?? field.name];
		case "fieldValues":
			return customValues?.[field.name];
		case "join":
			// dedicated component (TagsCell, …) reads its own data
			return null;
		default:
			return customValues?.[field.name] ?? row[field.name];
	}
}

// ─── EmptyCell — `+` inline-edit button or "—" fallback ────────────────────

/**
 * Universal empty-cell renderer. Returns a `+` button (opens inline editor)
 * when the field is inline-editable AND we have the keys to write back; else
 * returns the dash placeholder.
 */
function EmptyCell({ slot, field, row }: CellContext): ReactNode {
	const orgId = row.orgId;
	const entityId = (row._id ?? row.id) as string;
	const editable = isInlineEditable(field) && !!orgId && !!entityId;
	if (!editable) return <span className="text-xs text-muted-foreground">—</span>;
	return <InlineFieldEdit field={field} slot={slot} orgId={orgId!} entityId={entityId} />;
}

// ─── Kind-specific renderers ─────────────────────────────────────────────────

const KIND_RENDERERS: Record<string, (ctx: CellContext) => ReactNode> = {
	personCode: ({ row }) => <PersonCodeBadge personCode={row.personCode as string} />,

	entityCode: ({ field, row }) => {
		const code = row[field.columnKey ?? field.name];
		return code ? (
			<span className="font-mono text-[11px] text-muted-foreground">{String(code)}</span>
		) : (
			<span className="text-xs text-muted-foreground">—</span>
		);
	},

	displayName: ({ field, row }) => {
		const value = row[field.columnKey ?? field.name];
		return <span className="font-medium">{(value as string | undefined) ?? "—"}</span>;
	},

	title: ({ field, row }) => {
		const value = row[field.columnKey ?? field.name];
		return <span className="font-medium">{(value as string | undefined) ?? "—"}</span>;
	},

	email: ({ slot, field, row }) => {
		const value = row[field.columnKey ?? field.name] as string | undefined;
		if (!value) return <EmptyCell slot={slot} field={field} row={row} />;
		return <CopyField value={value} kind="email" className="text-xs text-muted-foreground" />;
	},

	phone: ({ slot, field, row }) => {
		const value = row[field.columnKey ?? field.name] as string | undefined;
		if (!value) return <EmptyCell slot={slot} field={field} row={row} />;
		return <CopyField value={value} kind="phone" className="text-xs text-muted-foreground" />;
	},

	status: ({ slot, field, row }) => {
		const status = row[field.columnKey ?? field.name] as string | undefined;
		if (!status) return <span className="text-xs text-muted-foreground">—</span>;
		const color = getStatusColor(slot, status);
		return (
			<Badge
				variant="outline"
				className="h-5 gap-1 text-[10px] capitalize"
				style={{
					backgroundColor: `${color}1a`,
					borderColor: `${color}66`,
					color,
				}}
			>
				<span
					aria-hidden
					className="inline-block size-1.5 shrink-0 rounded-full"
					style={{ backgroundColor: color }}
				/>
				{status}
			</Badge>
		);
	},

	source: ({ field, row }) => {
		const value = row[field.columnKey ?? field.name] as string | undefined;
		if (!value) return <span className="text-xs text-muted-foreground">—</span>;
		return (
			<Badge variant="outline" className="h-5 text-[10px] capitalize">
				{value}
			</Badge>
		);
	},

	assignee: ({ row, field }) => (
		<AssigneeCell
			orgId={row.orgId}
			userId={row[field.columnKey ?? field.name] as Id<"users"> | undefined}
		/>
	),

	tags: ({ slot, row, prefetchedTags }) => (
		<TagsCell
			orgId={row.orgId}
			entityType={slot}
			entityId={(row._id ?? row.id) as string}
			size="xs"
			prefetchedTags={prefetchedTags}
		/>
	),

	"company-ref": ({ slot, row }) => (
		<CompanyCell
			orgId={row.orgId}
			personCode={row.personCode as string | undefined}
			entityType={slot as "lead" | "contact"}
		/>
	),

	currency: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (value === undefined || value === null || value === "") {
			return <EmptyCell slot={slot} field={field} row={row} />;
		}
		const num = Number(value);
		if (Number.isNaN(num)) return <span className="text-xs">{String(value)}</span>;
		return <CurrencyValue value={num} orgId={row.orgId} />;
	},

	url: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!value) return <EmptyCell slot={slot} field={field} row={row} />;
		return (
			<a
				href={String(value)}
				target="_blank"
				rel="noopener noreferrer"
				className="text-xs text-primary hover:underline truncate inline-block max-w-[200px]"
				onClick={(e) => e.stopPropagation()}
			>
				{String(value).replace(/^https?:\/\//, "")}
			</a>
		);
	},

	relativeTime: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (typeof value !== "number")
			return <span className="text-xs text-muted-foreground">—</span>;
		return (
			<span className="text-xs text-muted-foreground">
				{formatDistanceToNow(new Date(value), { addSuffix: true })}
			</span>
		);
	},
};

// ─── Type-default renderers (fallback when `kind` doesn't match) ─────────────

const TYPE_RENDERERS: Record<string, (ctx: CellContext) => ReactNode> = {
	number: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (value === undefined || value === null || value === "") {
			return <EmptyCell slot={slot} field={field} row={row} />;
		}
		return <span className="text-xs">{String(value)}</span>;
	},
	date: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (typeof value !== "number") return <EmptyCell slot={slot} field={field} row={row} />;
		return (
			<span className="text-xs text-muted-foreground">
				{new Date(value).toLocaleDateString()}
			</span>
		);
	},
	boolean: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		return <span className="text-xs">{value ? "Yes" : "No"}</span>;
	},
	select: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!value) return <EmptyCell slot={slot} field={field} row={row} />;
		return (
			<Badge variant="outline" className="h-5 text-[10px] capitalize">
				{String(value)}
			</Badge>
		);
	},
	multiselect: ({ slot, field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!Array.isArray(value) || value.length === 0) {
			return <EmptyCell slot={slot} field={field} row={row} />;
		}
		return (
			<div className="flex flex-wrap gap-1">
				{value.slice(0, 2).map((v) => (
					<Badge key={String(v)} variant="outline" className="h-5 text-[10px]">
						{String(v)}
					</Badge>
				))}
				{value.length > 2 && (
					<span className="text-[10px] text-muted-foreground self-center">
						+{value.length - 2}
					</span>
				)}
			</div>
		);
	},
};

/** Default text renderer — last-resort fallback for unrecognised kind+type. */
function defaultRenderer({ slot, field, row, customValues }: CellContext): ReactNode {
	const value = readFieldValue(field, row, customValues);
	if (value === undefined || value === null || value === "") {
		return <EmptyCell slot={slot} field={field} row={row} />;
	}
	if (Array.isArray(value)) return <span className="text-xs">{value.join(", ")}</span>;
	return <span className="text-xs">{String(value)}</span>;
}

/**
 * Resolve the renderer function for a field. Precedence: `kind` → `type` → default.
 */
export function getCellRenderer(field: FieldDef): (ctx: CellContext) => ReactNode {
	if (field.kind && KIND_RENDERERS[field.kind]) return KIND_RENDERERS[field.kind];
	if (TYPE_RENDERERS[field.type]) return TYPE_RENDERERS[field.type];
	return defaultRenderer;
}

/**
 * CurrencyValue — formats a number using the org's default currency code
 * (e.g. AED / USD / EUR / INR). The hook subscribes to the org's settings
 * doc so the cell re-renders the moment an admin saves a new currency.
 */
function CurrencyValue({ value, orgId }: { value: number; orgId?: Id<"orgs"> }) {
	const code = useOrgDefaultCurrency(orgId);
	let formatted: string;
	try {
		formatted = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code,
			maximumFractionDigits: 0,
		}).format(value);
	} catch {
		formatted = `${code} ${value}`;
	}
	return <span className="text-xs font-medium tabular-nums">{formatted}</span>;
}
