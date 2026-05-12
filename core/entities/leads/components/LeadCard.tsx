"use client";

/**
 * LeadCard — thin wrapper around the unified <EntityCard>.
 *
 * Everything heavy (layout, drag event-stops, tags, staleness border,
 * enrichment badges, profile link) lives in EntityCard. This wrapper just
 * passes the lead-specific menu items (Convert / Delete) and slot="lead".
 *
 * Contact/Deal/Company cards follow the same pattern — see their respective
 * `views/*View.tsx` where they render `<EntityCard slot="..." ... />` inline.
 */

import { ArrowRightCircleIcon, Trash2Icon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
	EntityCard,
	type EntityCardItem,
	type MenuAction,
} from "@/core/entities/shared/components/EntityCard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

type LeadCardItem = EntityCardItem & {
	_id?: Id<"leads">;
	orgId?: Id<"orgs">;
	displayName: string;
};

interface LeadCardProps {
	item: LeadCardItem;
	isDragging?: boolean;
	onConvert?: () => void;
	onDelete?: () => void;
	/** Per-session card fields to show (admin default + BoardOptionsMenu override). */
	cardFields?: string[];
	/** Staleness thresholds from org settings. */
	staleness?: { warningAfterDays?: number; staleAfterDays?: number };
}

export function LeadCard({
	item,
	isDragging,
	onConvert,
	onDelete,
	cardFields,
	staleness,
}: LeadCardProps) {
	const labels = useEntityLabels();

	const menuItems: MenuAction[] = [];
	if (onConvert) {
		menuItems.push({
			label: `Convert to ${labels.contact.singular.toLowerCase()}`,
			icon: ArrowRightCircleIcon,
			onSelect: onConvert,
		});
	}
	if (onDelete) {
		menuItems.push({
			label: "Delete",
			icon: Trash2Icon,
			onSelect: onDelete,
			variant: "destructive",
			separatorBefore: menuItems.length > 0,
		});
	}

	return (
		<EntityCard
			slot="lead"
			item={item}
			cardFields={cardFields}
			menuItems={menuItems}
			staleness={staleness}
			isDragging={isDragging}
		/>
	);
}
