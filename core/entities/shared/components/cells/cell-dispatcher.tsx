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
 */

import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import type { EntitySlot } from "@/core/entities/shared/types";
import { PersonCodeBadge } from "../../PersonCodeBadge";
import { AssigneeCell } from "../AssigneeCell";
import { CompanyCell } from "../CompanyCell";
import { CopyField } from "../CopyField";
import { TagsCell } from "../TagsCell";

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

	email: ({ field, row }) => (
		<CopyField
			value={row[field.columnKey ?? field.name] as string | undefined}
			kind="email"
			className="text-xs text-muted-foreground"
		/>
	),

	phone: ({ field, row }) => (
		<CopyField
			value={row[field.columnKey ?? field.name] as string | undefined}
			kind="phone"
			className="text-xs text-muted-foreground"
		/>
	),

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

	tags: ({ slot, row }) => (
		<TagsCell
			orgId={row.orgId}
			entityType={slot}
			entityId={(row._id ?? row.id) as string}
			size="xs"
		/>
	),

	"company-ref": ({ slot, row }) => (
		<CompanyCell
			orgId={row.orgId}
			personCode={row.personCode as string | undefined}
			entityType={slot as "lead" | "contact"}
		/>
	),

	currency: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (value === undefined || value === null || value === "") {
			return <span className="text-xs text-muted-foreground">—</span>;
		}
		const num = Number(value);
		if (Number.isNaN(num)) return <span className="text-xs">{String(value)}</span>;
		return (
			<span className="text-xs font-medium">
				{new Intl.NumberFormat(undefined, {
					style: "currency",
					currency: "USD",
					maximumFractionDigits: 0,
				}).format(num)}
			</span>
		);
	},

	url: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!value) return <span className="text-xs text-muted-foreground">—</span>;
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
	number: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (value === undefined || value === null || value === "") {
			return <span className="text-xs text-muted-foreground">—</span>;
		}
		return <span className="text-xs">{String(value)}</span>;
	},
	date: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (typeof value !== "number")
			return <span className="text-xs text-muted-foreground">—</span>;
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
	select: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!value) return <span className="text-xs text-muted-foreground">—</span>;
		return (
			<Badge variant="outline" className="h-5 text-[10px] capitalize">
				{String(value)}
			</Badge>
		);
	},
	multiselect: ({ field, row, customValues }) => {
		const value = readFieldValue(field, row, customValues);
		if (!Array.isArray(value) || value.length === 0) {
			return <span className="text-xs text-muted-foreground">—</span>;
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
function defaultRenderer({ field, row, customValues }: CellContext): ReactNode {
	const value = readFieldValue(field, row, customValues);
	if (value === undefined || value === null || value === "") {
		return <span className="text-xs text-muted-foreground">—</span>;
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
