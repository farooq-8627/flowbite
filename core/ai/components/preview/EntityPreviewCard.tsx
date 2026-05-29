"use client";
import type { Id } from "@/convex/_generated/dataModel";
/**
 * core/ai/components/preview/EntityPreviewCard.tsx
 *
 * Approval preview for create_lead / create_contact / create_deal /
 * create_company. Instead of a bespoke per-tool layout, this renders the
 * SAME `<EntityCard>` the rest of the app uses — populated from the
 * proposed args — so the user sees the exact card they'll get once they
 * approve. Below the card we list every remaining proposed field (the
 * card surfaces at most the identity + a few chips) plus any initial note,
 * so nothing the model proposed is hidden before approval.
 *
 * Replaces LeadPreviewCard / ContactPreviewCard / DealPreviewCard /
 * CompanyPreviewCard in the registry (those stay exported for any direct
 * imports, but the registry now points create_* here).
 */
import { EntityCard, type EntityCardItem } from "@/core/entities/shared/components/EntityCard";
import type { EntitySlot } from "@/core/entities/shared/types";
import type { PreviewCardProps } from "./index";

const TOOL_TO_SLOT: Record<string, EntitySlot> = {
	create_lead: "lead",
	create_contact: "contact",
	create_deal: "deal",
	create_company: "company",
};

/** Keys handled by the card itself (or transport-only) — excluded from the detail list. */
const HANDLED_KEYS = new Set([
	"displayName",
	"firstName",
	"lastName",
	"title",
	"name",
	"customFields",
	"notes",
	"orgId",
	"userId",
	"conversationId",
]);

function str(v: unknown): string | undefined {
	if (v === null || v === undefined) return undefined;
	const s = String(v).trim();
	return s.length > 0 ? s : undefined;
}

function humanise(key: string): string {
	return key
		.replace(/^[a-z]/, (c) => c.toUpperCase())
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/_/g, " ");
}

function buildItem(slot: EntitySlot, a: Record<string, unknown>): EntityCardItem {
	const base: EntityCardItem = { id: "preview" };
	if (slot === "contact") {
		base.displayName =
			`${str(a.firstName) ?? ""} ${str(a.lastName) ?? ""}`.trim() || "New contact";
		base.email = str(a.email);
	} else if (slot === "deal") {
		base.title = str(a.title) ?? "New deal";
		if (a.value != null && !Number.isNaN(Number(a.value))) base.value = Number(a.value);
	} else if (slot === "company") {
		base.name = str(a.name) ?? "New company";
		base.industry = str(a.industry);
	} else {
		base.displayName = str(a.displayName) ?? "New lead";
		base.email = str(a.email);
	}
	return base;
}

export function EntityPreviewCard({ args, toolName, orgId }: PreviewCardProps) {
	const slot: EntitySlot = (toolName ? TOOL_TO_SLOT[toolName] : undefined) ?? "lead";
	const a = args ?? {};
	const item = buildItem(slot, a);
	if (orgId) item.orgId = orgId as Id<"orgs">;

	// cardFields: identity + email; deal shows value subtitle, company shows
	// industry subtitle automatically. We deliberately omit tags/assignee
	// (no real entity id yet, so those would query nothing).
	const cardFields =
		slot === "deal" ? ["title"] : slot === "company" ? ["name"] : ["displayName", "email"];

	// Remaining proposed fields the card doesn't surface → a compact detail list.
	const detailRows: Array<{ label: string; value: string }> = [];
	for (const [k, v] of Object.entries(a)) {
		if (HANDLED_KEYS.has(k)) continue;
		// Email/value/industry are already on the card.
		if (slot !== "deal" && slot !== "company" && k === "email") continue;
		if (slot === "deal" && k === "value") continue;
		if (slot === "company" && k === "industry") continue;
		const s = str(v);
		if (s) detailRows.push({ label: humanise(k), value: s });
	}
	// Flatten customFields into the detail list so org-defined values are visible.
	const cf = a.customFields;
	if (cf && typeof cf === "object" && !Array.isArray(cf)) {
		for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
			const s = str(v);
			if (s) detailRows.push({ label: humanise(k), value: s });
		}
	}

	const note = str(a.notes);

	return (
		<div className="space-y-2 min-w-0">
			<EntityCard slot={slot} item={item} cardFields={cardFields} readOnly />

			{detailRows.length > 0 && (
				<dl className="space-y-1 ps-1">
					{detailRows.map((r) => (
						<div key={r.label} className="flex gap-2 text-[11px] min-w-0">
							<dt className="min-w-24 max-w-[40%] shrink-0 text-muted-foreground truncate">
								{r.label}
							</dt>
							<dd className="min-w-0 flex-1 break-words font-medium">{r.value}</dd>
						</div>
					))}
				</dl>
			)}

			{note && (
				<div className="rounded-[var(--radius)] bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground italic line-clamp-3">
					“{note}”
				</div>
			)}
		</div>
	);
}
