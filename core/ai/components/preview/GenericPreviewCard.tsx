"use client";
/**
 * core/ai/components/preview/GenericPreviewCard.tsx
 *
 * Fallback preview card for two-step tools that don't yet have a custom
 * layout. Renders the `{label, value}` list that `propose()` generated.
 *
 * Used by ChatConfirmation when `getPreviewCard(toolName)` returns no
 * specific card.
 *
 * Auto-fallback (2026-05-24): when `fields` is empty / missing, the card
 * derives a sensible row list from the raw tool args. This avoids the
 * "(no preview details)" placeholder for any new two-step tool whose
 * `propose()` payload doesn't reach the orchestrator (e.g. legacy code
 * paths or tools that author their preview server-side via a different
 * mechanism). The model's intent is still visible to the user.
 */
import { Sparkles } from "lucide-react";
import type { PreviewCardProps } from "./index";

const HIDDEN_KEYS = new Set([
	// Internal/transport keys we don't want to surface in the preview.
	"orgId",
	"userId",
	"conversationId",
	"_ctx",
]);

const MAX_ROWS = 8;
const MAX_VALUE_LEN = 80;

function humanise(key: string): string {
	return key
		.replace(/^[a-z]/, (c) => c.toUpperCase())
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/_/g, " ");
}

function stringifyValue(v: unknown): string {
	if (v === null || v === undefined) return "—";
	if (typeof v === "boolean") return v ? "Yes" : "No";
	if (typeof v === "number") return String(v);
	if (typeof v === "string") {
		const trimmed = v.trim();
		return trimmed.length > MAX_VALUE_LEN ? `${trimmed.slice(0, MAX_VALUE_LEN)}…` : trimmed;
	}
	if (Array.isArray(v)) {
		const flat = v.map(stringifyValue).join(", ");
		return flat.length > MAX_VALUE_LEN ? `${flat.slice(0, MAX_VALUE_LEN)}…` : flat;
	}
	try {
		const s = JSON.stringify(v);
		return s.length > MAX_VALUE_LEN ? `${s.slice(0, MAX_VALUE_LEN)}…` : s;
	} catch {
		return String(v);
	}
}

function buildFallbackFields(args: Record<string, unknown> | undefined) {
	if (!args || typeof args !== "object") return [];
	const entries = Object.entries(args).filter(
		([k, v]) => !HIDDEN_KEYS.has(k) && v !== undefined && v !== null && v !== "",
	);
	return entries
		.slice(0, MAX_ROWS)
		.map(([k, v]) => ({ label: humanise(k), value: stringifyValue(v) }));
}

export function GenericPreviewCard({ args, fields, title }: PreviewCardProps) {
	const list = fields && fields.length > 0 ? fields : buildFallbackFields(args);
	return (
		<div className="space-y-2.5 min-w-0">
			{title && (
				<div className="flex items-center gap-2 min-w-0">
					<Sparkles className="size-3.5 text-primary shrink-0" />
					<p className="font-semibold text-sm truncate">{title}</p>
				</div>
			)}
			<dl className="space-y-1">
				{list.length === 0 ? (
					<div className="text-[11px] italic text-muted-foreground">
						(no preview details)
					</div>
				) : (
					list.map((f) => (
						<div key={f.label} className="flex gap-2 text-[11px] min-w-0">
							<dt className="min-w-24 max-w-[40%] shrink-0 text-muted-foreground truncate">
								{f.label}
							</dt>
							<dd className="min-w-0 flex-1 break-words font-medium">
								{String(f.value ?? "—")}
							</dd>
						</div>
					))
				)}
			</dl>
		</div>
	);
}
