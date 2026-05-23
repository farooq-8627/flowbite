"use client";

/**
 * core/ai/components/results/EntityResultCard.tsx
 *
 * Renders a single CRM entity (lead / contact / deal / company) as a
 * read-only card inside a chat bubble. Looks the entity up by Id from the
 * matching `crm.entities.X.queries.getById` and forwards to `<EntityCard>`
 * in `readOnly` mode.
 *
 * Why look up by Id (not pass a snapshot from the tool)?
 *   - Guarantees the chat shows the LIVE state, not what existed when the
 *     tool ran. Edits made anywhere else in the app appear here too via
 *     Convex's reactive useQuery.
 *   - Tool authors don't have to keep their snapshot shape in sync with
 *     the entity card's prop expectations — the card hits the same
 *     query the rest of the app uses.
 *
 * If the entity has been deleted between the tool call and the render,
 * we render a quiet placeholder ("Lead deleted") instead of throwing.
 */

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Trash2Icon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import type { EntitySlot } from "@/core/entities/shared/types";
import { cn } from "@/lib/utils";

const SLOT_TO_QUERY_PATH: Record<
	"lead" | "contact" | "deal" | "company",
	{ getById: string; entityLabel: string }
> = {
	lead: { getById: "crm.entities.leads.queries.getById", entityLabel: "Lead" },
	contact: { getById: "crm.entities.contacts.queries.getById", entityLabel: "Contact" },
	deal: { getById: "crm.entities.deals.queries.getById", entityLabel: "Deal" },
	company: { getById: "crm.entities.companies.queries.getById", entityLabel: "Company" },
};

type EntityResultCardProps = {
	entityType: "lead" | "contact" | "deal" | "company";
	entityId: string;
	orgId: string;
};

export function EntityResultCard({ entityType, entityId, orgId }: EntityResultCardProps) {
	const cfg = SLOT_TO_QUERY_PATH[entityType];

	// Walk the dotted path on `anyApi` so the typed `api` doesn't need to
	// resolve at this layer. The actual function is registered as
	// `crm.entities.<x>.queries.getById` in `_generated/api.d.ts`.
	const queryRef = cfg.getById
		.split(".")
		.reduce<Record<string, unknown>>(
			(acc, k) => acc?.[k] as Record<string, unknown>,
			anyApi as unknown as Record<string, unknown>,
		);

	const entity = useQuery(
		queryRef as Parameters<typeof useQuery>[0],
		entityId && orgId
			? ({ id: entityId, orgId } as Record<string, unknown>)
			: ("skip" as never),
	) as Record<string, unknown> | null | undefined;

	if (entity === undefined) {
		return <Skeleton className="h-20 w-full rounded-[var(--radius)]" />;
	}

	if (entity === null) {
		return (
			<div
				className={cn(
					"flex items-center gap-2 rounded-[var(--radius)] border border-dashed",
					"bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
				)}
			>
				<Trash2Icon className="size-3.5" />
				<span>{cfg.entityLabel} no longer exists.</span>
			</div>
		);
	}

	// Pick a sensible default cardFields set per slot — chat doesn't have
	// access to the user's per-view settings so we surface the most-useful
	// 3-4 fields universally.
	const cardFields =
		entityType === "deal"
			? ["title", "personCode", "dealCode", "assignedTo", "tags"]
			: entityType === "company"
				? ["name", "companyCode", "industry", "tags"]
				: ["displayName", "email", "personCode", "tags", "assignedTo"];

	return (
		<EntityCard
			slot={entityType as EntitySlot}
			item={entity as never}
			cardFields={cardFields}
			readOnly
		/>
	);
}
