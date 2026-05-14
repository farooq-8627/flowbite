/**
 * FIELD_CATALOG — renderable fields per entity slot.
 *
 * Every key that can appear on a card, list column, or hover-card must be
 * registered here. Settings → Module Display reads this to populate pickers.
 *
 * Future: dynamic via `fieldDefinitions` table (Phase 2 Slice 6).
 */

import type { EntitySlot, FieldSpec } from "../types";

export const FIELD_CATALOG: Record<EntitySlot, Record<string, FieldSpec>> = {
	lead: {
		avatar: { label: "Avatar", render: "text" },
		personCode: { label: "Person Code", render: "personCode" },
		displayName: { label: "Name", render: "personDisplay", scope: "lead" },
		email: { label: "Email", render: "email" },
		phone: { label: "Phone", render: "phone" },
		status: { label: "Status", render: "badge" },
		source: { label: "Source", render: "badge" },
		assignedTo: { label: "Assignee", render: "personDisplay", scope: "user" },
		tags: { label: "Tags", render: "tags" },
		aiSummary: { label: "AI summary", render: "text" },
		createdAt: { label: "Created", render: "relativeTime" },
		updatedAt: { label: "Updated", render: "relativeTime" },
	},
	contact: {
		avatar: { label: "Avatar", render: "text" },
		personCode: { label: "Person Code", render: "personCode" },
		displayName: { label: "Name", render: "personDisplay", scope: "contact" },
		email: { label: "Email", render: "email" },
		phone: { label: "Phone", render: "phone" },
		companyId: { label: "Company", render: "companyLink" },
		assignedTo: { label: "Assignee", render: "personDisplay", scope: "user" },
		tags: { label: "Tags", render: "tags" },
		aiSummary: { label: "AI summary", render: "text" },
		createdAt: { label: "Created", render: "relativeTime" },
	},
	deal: {
		dealCode: { label: "Deal Code", render: "entityCode" },
		title: { label: "Title", render: "text" },
		personCode: { label: "Person", render: "personCode" },
		value: { label: "Value", render: "currency", permission: "deals.viewValues" },
		currentStageId: { label: "Stage", render: "stageBadge" },
		assignedTo: { label: "Assignee", render: "personDisplay", scope: "user" },
		tags: { label: "Tags", render: "tags" },
		aiSummary: { label: "AI summary", render: "text" },
		staleIndicator: { label: "Stale", render: "stale" },
		createdAt: { label: "Created", render: "relativeTime" },
	},
	company: {
		companyCode: { label: "Company Code", render: "entityCode" },
		name: { label: "Name", render: "text" },
		industry: { label: "Industry", render: "badge" },
		website: { label: "Website", render: "link" },
		assignedTo: { label: "Assignee", render: "personDisplay", scope: "user" },
		tags: { label: "Tags", render: "tags" },
		aiSummary: { label: "AI summary", render: "text" },
		contactCount: { label: "Contacts", render: "count", computed: true },
		openDealCount: { label: "Open Deals", render: "count", computed: true },
		createdAt: { label: "Created", render: "relativeTime" },
	},
};

export function getFieldSpec(slot: EntitySlot, key: string): FieldSpec | null {
	return FIELD_CATALOG[slot]?.[key] ?? null;
}
