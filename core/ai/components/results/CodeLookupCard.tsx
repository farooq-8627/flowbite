"use client";

/**
 * core/ai/components/results/CodeLookupCard.tsx
 *
 * Resolves a stable code (P-001 / D-001 / C-001) to its underlying entity id
 * and then renders an `EntityResultCard`. Used by tool results that emit
 * `display: { kind: "personCode" | "dealCode" }` instead of carrying a raw id.
 *
 * The resolver chooses leads or contacts for `P-XXX` based on which query
 * returns first — every personCode is unique across leads and contacts in the
 * same org (by index design).
 */

import { useQuery } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EntityResultCard } from "./EntityResultCard";

type PersonCodeCardProps = { personCode: string; orgId: string };

export function PersonCodeCard({ personCode, orgId }: PersonCodeCardProps) {
	const skipArgs = !personCode || !orgId;
	// Try lead first, fallback to contact. Each query is "skip" when args
	// are empty so we don't blast Convex for invalid props.
	const leadByCode = useQuery(
		api.crm.entities.leads.queries.getByPersonCode,
		skipArgs ? "skip" : { personCode, orgId: orgId as Id<"orgs"> },
	);
	const contactByCode = useQuery(
		api.crm.entities.contacts.queries.getByPersonCode,
		skipArgs ? "skip" : { personCode, orgId: orgId as Id<"orgs"> },
	);

	if (leadByCode === undefined && contactByCode === undefined) {
		return <Skeleton className="h-20 w-full rounded-[var(--radius)]" />;
	}

	if (leadByCode) {
		return (
			<EntityResultCard entityType="lead" entityId={leadByCode._id as string} orgId={orgId} />
		);
	}
	if (contactByCode) {
		return (
			<EntityResultCard
				entityType="contact"
				entityId={contactByCode._id as string}
				orgId={orgId}
			/>
		);
	}

	return (
		<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
			No record found for {personCode}.
		</div>
	);
}

type DealCodeCardProps = { dealCode: string; orgId: string };

export function DealCodeCard({ dealCode, orgId }: DealCodeCardProps) {
	const skipArgs = !dealCode || !orgId;
	const deal = useQuery(
		api.crm.entities.deals.queries.getByDealCode,
		skipArgs ? "skip" : { dealCode, orgId: orgId as Id<"orgs"> },
	);

	if (deal === undefined) {
		return <Skeleton className="h-20 w-full rounded-[var(--radius)]" />;
	}
	if (deal === null) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				No deal found for {dealCode}.
			</div>
		);
	}

	return <EntityResultCard entityType="deal" entityId={deal._id as string} orgId={orgId} />;
}
