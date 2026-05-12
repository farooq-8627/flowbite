"use client";

/**
 * EntityHoverCard — hover on any person/deal/company → quick-view (D9).
 * Wraps HoverCard primitive around EntityOverview.
 */

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
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
			<HoverCardContent sideOffset={sideOffset} className="w-64">
				<EntityOverview person={person} deal={deal} company={company} />
			</HoverCardContent>
		</HoverCard>
	);
}
