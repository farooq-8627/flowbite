/**
 * core/ai/components/preview/index.ts
 *
 * Per-tool preview card registry.
 *
 * `ChatConfirmation` looks up the right card by `payload.tool` and falls
 * back to `GenericPreviewCard` for tools that don't have a custom layout.
 *
 * The card receives the raw `payload.args` (whatever the model passed to
 * the tool) and renders a rich, contextual preview. It does NOT own the
 * approve/reject buttons — those stay in `ChatConfirmation`. Cards can
 * optionally surface inline edits, but for Phase 3B the approve→commit
 * path always sends back the original args; editing is Phase 4.
 *
 * Each card is responsible for:
 *   - Showing what's about to change in a way that matches that domain
 *     (lead avatar, deal currency, bulk row count, danger banner, etc.)
 *   - Defending against missing fields (the model might omit optionals)
 *   - Truncating long values so the card stays compact in the side panel
 */

import type { ComponentType } from "react";
import { BulkPreviewCard } from "./BulkPreviewCard";
import { CompanyPreviewCard } from "./CompanyPreviewCard";
import { ContactPreviewCard } from "./ContactPreviewCard";
import { DangerPreviewCard } from "./DangerPreviewCard";
import { DealPreviewCard } from "./DealPreviewCard";
import { EntityDiffCard } from "./EntityDiffCard";
import { GenericPreviewCard } from "./GenericPreviewCard";
import { LeadPreviewCard } from "./LeadPreviewCard";
import { PipelinePreviewCard } from "./PipelinePreviewCard";
import { SettingsPreviewCard } from "./SettingsPreviewCard";

export interface PreviewCardProps {
	/** Raw args the model passed to the tool. */
	args: Record<string, unknown>;
	/** Optional fallback fields list passed by `propose()`. */
	fields?: Array<{ label: string; value: unknown }>;
	/** Optional preview title from `propose()`. */
	title?: string;
}

/**
 * Map of tool name → preview component. Keys must match the `name` field
 * of the tool definition in `convex/ai/tools/*`.
 *
 * Two-step tools that share a card layout:
 *   • create_lead              → LeadPreviewCard
 *   • create_contact           → ContactPreviewCard
 *   • create_company           → CompanyPreviewCard
 *   • create_deal              → DealPreviewCard
 *   • update_entity            → EntityDiffCard (renders a key-by-key diff)
 *   • bulk_update_entities     → BulkPreviewCard
 *   • bulk_close_deals         → BulkPreviewCard (uses outcome variant)
 *   • close_deal               → DealPreviewCard (won/lost variant)
 *   • restore_entity           → DangerPreviewCard (low-risk variant)
 *   • create_pipeline          → PipelinePreviewCard
 *   • add_pipeline_stage       → PipelinePreviewCard (stage variant)
 *   • update_org_settings      → SettingsPreviewCard
 *   • rename_entity_labels     → SettingsPreviewCard (label variant)
 *
 * Anything not listed falls through to GenericPreviewCard, which renders
 * the {label,value} list propose() generated.
 */
export const PREVIEW_REGISTRY: Record<string, ComponentType<PreviewCardProps>> = {
	create_lead: LeadPreviewCard,
	create_contact: ContactPreviewCard,
	create_company: CompanyPreviewCard,
	create_deal: DealPreviewCard,
	update_entity: EntityDiffCard,
	bulk_update_entities: BulkPreviewCard,
	bulk_close_deals: BulkPreviewCard,
	close_deal: DealPreviewCard,
	restore_entity: DangerPreviewCard,
	create_pipeline: PipelinePreviewCard,
	add_pipeline_stage: PipelinePreviewCard,
	update_org_settings: SettingsPreviewCard,
	rename_entity_labels: SettingsPreviewCard,
};

export function getPreviewCard(toolName: string): ComponentType<PreviewCardProps> {
	return PREVIEW_REGISTRY[toolName] ?? GenericPreviewCard;
}

export {
	BulkPreviewCard,
	CompanyPreviewCard,
	ContactPreviewCard,
	DangerPreviewCard,
	DealPreviewCard,
	EntityDiffCard,
	GenericPreviewCard,
	LeadPreviewCard,
	PipelinePreviewCard,
	SettingsPreviewCard,
};
