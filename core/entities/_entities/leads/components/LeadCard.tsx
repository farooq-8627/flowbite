"use client";

/**
 * LeadCard — thin wrapper around the unified <EntityCard>.
 *
 * Shortcuts (bottom-right icon cluster):
 *   - Convert        → single click = instant convert (tooltip says "Convert")
 *   - Convert+deal   → double click → opens the full convert drawer with the
 *                      "Also create a deal?" toggle. Keyboard users can use
 *                      the overflow menu → "Convert with options".
 *   - Mark lost      → marks the lead as lost (red trash icon)
 *
 * Overflow menu (⋮):
 *   - Convert with options…
 *   - Delete
 */

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
	EntityCard,
	type EntityCardItem,
	type EntityShortcut,
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
	/** Fires on single click of the + shortcut — should instant-convert. */
	onConvert?: () => void;
	/** Fires on double-click of the + shortcut OR menu → "Convert with options". */
	onConvertWithOptions?: () => void;
	onMarkLost?: () => void;
	onDelete?: () => void;
	onEdit?: () => void;
	/** Per-session card fields to show (admin default + ViewOptionsMenu override). */
	cardFields?: string[];
	/** Field defs to surface as highlighted chips (e.g. Budget, MOU date). */
	highlightFieldDefs?: Array<{ name: string; label: string; kind?: string; type?: string }>;
	/** Staleness thresholds from org settings. */
	staleness?: { warningAfterDays?: number; staleAfterDays?: number };
	/** When true, the card briefly flashes (used for search matches). */
	isHighlighted?: boolean;
	/** Incrementing counter that triggers the flash animation to replay. */
	highlightEpoch?: number;
	/** Custom field values for this lead (fieldName → value). */
	customFieldValues?: Record<string, unknown>;
}

export function LeadCard({
	item,
	isDragging,
	onConvert,
	onConvertWithOptions,
	onMarkLost,
	onDelete,
	onEdit,
	cardFields,
	highlightFieldDefs,
	staleness,
	isHighlighted,
	highlightEpoch,
	customFieldValues,
}: LeadCardProps) {
	const labels = useEntityLabels();

	// Differentiate single-click vs. double-click without a setTimeout race.
	// A click that's followed by another click within 240ms fires the "with
	// options" handler; otherwise the single handler runs after that window.
	const clickTimer = useRef<number | null>(null);
	const handleConvertClick = () => {
		if (clickTimer.current !== null) {
			window.clearTimeout(clickTimer.current);
			clickTimer.current = null;
			onConvertWithOptions?.();
			return;
		}
		clickTimer.current = window.setTimeout(() => {
			clickTimer.current = null;
			onConvert?.();
		}, 240);
	};

	const shortcuts: EntityShortcut[] = [];

	if (onMarkLost) {
		shortcuts.push({
			label: "Mark as lost",
			icon: Trash2Icon,
			onSelect: onMarkLost,
			variant: "secondary",
		});
	}

	if (onConvert || onConvertWithOptions) {
		shortcuts.push({
			label: `Convert to ${labels.contact.singular.toLowerCase()} · double-click for options`,
			icon: PlusIcon,
			onSelect: handleConvertClick,
			variant: "primary",
		});
	}

	const menuItems: MenuAction[] = [];
	if (onEdit) {
		menuItems.push({
			label: "Edit",
			icon: PencilIcon,
			onSelect: onEdit,
		});
	}
	if (onConvertWithOptions) {
		menuItems.push({
			label: "Convert with options…",
			icon: PlusIcon,
			onSelect: onConvertWithOptions,
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
			highlightFieldDefs={highlightFieldDefs}
			shortcuts={shortcuts}
			menuItems={menuItems}
			staleness={staleness}
			isDragging={isDragging}
			isHighlighted={isHighlighted}
			highlightEpoch={highlightEpoch}
			customFieldValues={customFieldValues}
		/>
	);
}
