"use client";

/**
 * core/ai/components/results/DiffResultCard.tsx
 *
 * Renders the post-state of an updated entity as a read-only EntityCard,
 * with a small "Changes" strip below listing what fields changed and
 * their before → after values.
 *
 * Used for `display: { kind: "diff" }` returned by `commit_update_entity`.
 */

import { ArrowRightIcon } from "lucide-react";
import { EntityResultCard } from "./EntityResultCard";

type DiffResultCardProps = {
	entityType: "lead" | "contact" | "deal" | "company";
	entityId: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	orgId: string;
};

export function DiffResultCard({
	entityType,
	entityId,
	before,
	after,
	orgId,
}: DiffResultCardProps) {
	const changes = computeChanges(before, after);

	return (
		<div className="flex flex-col gap-1.5">
			<EntityResultCard entityType={entityType} entityId={entityId} orgId={orgId} />

			{changes.length > 0 && (
				<div className="rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-[11px]">
					<div className="mb-1 font-medium text-muted-foreground">Changes</div>
					<ul className="flex flex-col gap-1">
						{changes.map((c) => (
							<li key={c.field} className="flex items-center gap-1.5">
								<span className="font-medium">{prettyField(c.field)}:</span>
								<span className="line-through text-muted-foreground">
									{formatValue(c.before)}
								</span>
								<ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="font-medium">{formatValue(c.after)}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

type Change = { field: string; before: unknown; after: unknown };

/**
 * Compute a flat list of changed top-level fields. Skips equal values and
 * skips fields the AI tool didn't actually touch (i.e. only present in
 * `after`, not different from `before`).
 *
 * Stage code shifts (currentStageId) get special treatment in the spec —
 * they're hinted to use move_deal_stage; for the diff card we still
 * surface them as a normal change.
 */
function computeChanges(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
	const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
	const changes: Change[] = [];
	for (const k of keys) {
		const b = before[k];
		const a = after[k];
		if (sameValue(b, a)) continue;
		// Skip metadata + unhelpful internal fields
		if (k === "updatedAt" || k === "_creationTime") continue;
		changes.push({ field: k, before: b, after: a });
	}
	return changes.slice(0, 8); // cap so the card stays readable
}

function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null && b == null) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => sameValue(v, b[i]));
	}
	if (typeof a === "object" && typeof b === "object" && a && b) {
		try {
			return JSON.stringify(a) === JSON.stringify(b);
		} catch {
			return false;
		}
	}
	return false;
}

function prettyField(name: string): string {
	return name
		.replace(/([A-Z])/g, " $1")
		.replace(/_/g, " ")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}

function formatValue(v: unknown): string {
	if (v === null || v === undefined || v === "") return "—";
	if (Array.isArray(v)) return v.length === 0 ? "—" : v.slice(0, 3).join(", ");
	if (typeof v === "number") return String(v);
	if (typeof v === "boolean") return v ? "yes" : "no";
	if (typeof v === "object") {
		try {
			return JSON.stringify(v).slice(0, 60);
		} catch {
			return "[object]";
		}
	}
	return String(v).slice(0, 60);
}
