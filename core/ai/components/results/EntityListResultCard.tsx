"use client";

/**
 * core/ai/components/results/EntityListResultCard.tsx
 *
 * Renders a vertical stack of `EntityResultCard`s for a search-style
 * tool result. Caps visible rows so a "find me all leads" doesn't paint
 * 200 cards inside the chat bubble; user clicks "Show N more" to expand.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EntityResultCard } from "./EntityResultCard";

const VISIBLE_INITIAL = 5;

type EntityListResultCardProps = {
	entityType: "lead" | "contact" | "deal" | "company";
	entityIds: string[];
	orgId: string;
};

export function EntityListResultCard({ entityType, entityIds, orgId }: EntityListResultCardProps) {
	const [expanded, setExpanded] = useState(false);

	if (entityIds.length === 0) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				No matching {plural(entityType)} found.
			</div>
		);
	}

	const visible = expanded ? entityIds : entityIds.slice(0, VISIBLE_INITIAL);
	const hidden = entityIds.length - visible.length;

	return (
		<div className="flex flex-col gap-1.5">
			{visible.map((id) => (
				<EntityResultCard key={id} entityType={entityType} entityId={id} orgId={orgId} />
			))}
			{hidden > 0 && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="self-start text-xs"
					onClick={() => setExpanded(true)}
				>
					Show {hidden} more
				</Button>
			)}
		</div>
	);
}

function plural(slot: "lead" | "contact" | "deal" | "company"): string {
	if (slot === "company") return "companies";
	return `${slot}s`;
}
