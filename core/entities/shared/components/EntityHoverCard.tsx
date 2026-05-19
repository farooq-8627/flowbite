"use client";

/**
 * EntityHoverCard — hover on any person/deal/company → quick-view (D9).
 *
 * Wraps the `HoverCard` primitive. For PEOPLE we reuse the unified
 * `<OverviewCard compact />` so the hover preview shows the SAME content
 * shape as the profile page's Overview tab. That guarantees parity:
 * upgrades to the overview (e.g. a new "Latest activity" row) appear
 * everywhere automatically. Deals + companies still use `EntityOverview`
 * — those quick-views are simpler and don't fetch cross-section data.
 */

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { OverviewCard } from "@/core/platform/profile/components/OverviewCard";
import type { PersonRef } from "../types";
import { EntityOverview } from "./EntityOverview";

interface EntityHoverCardProps {
	person?: PersonRef;
	deal?: { dealCode: string; title: string; value?: number; stage?: string };
	company?: { companyCode: string; name: string; industry?: string; contactCount?: number };
	children: React.ReactNode;
	openDelay?: number;
	sideOffset?: number;
}

export function EntityHoverCard({
	person,
	deal,
	company,
	children,
	openDelay = 400,
	sideOffset = 6,
}: EntityHoverCardProps) {
	return (
		<HoverCard openDelay={openDelay}>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent sideOffset={sideOffset} className={person ? "w-80 p-0" : "w-64"}>
				{person?.personCode ? (
					<OverviewCard personCode={person.personCode} compact />
				) : (
					<EntityOverview person={person} deal={deal} company={company} />
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
