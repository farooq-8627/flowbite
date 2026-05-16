/**
 * Industry pipeline stage templates — convex/orgs/templates/pipelineStages.ts
 *
 * Seeds the default pipeline for a new org during onboarding (Step 2 —
 * `updateOrgIndustry`). The org admin can rename, reorder, recolor, and
 * re-threshold stages from Settings → Pipelines after seeding.
 *
 * This file is the SSOT for default stage sets — never inline industry
 * stages elsewhere. To add a new industry, add a new entry below.
 */

export type StageInput = {
	name: string;
	color: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
};

const INDUSTRY_STAGES: Record<string, StageInput[]> = {
	"real-estate": [
		{ name: "New Inquiry", color: "#3b82f6" },
		{ name: "Viewing", color: "#8b5cf6", staleAfterDays: 3 },
		{ name: "Offer / MOU", color: "#f59e0b", staleAfterDays: 5 },
		{ name: "Under Contract", color: "#10b981" },
		{ name: "Closed Won", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	technology: [
		{ name: "Prospecting", color: "#3b82f6" },
		{ name: "Qualified", color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Demo", color: "#f59e0b" },
		{ name: "Proposal", color: "#f97316", staleAfterDays: 5 },
		{ name: "Negotiation", color: "#10b981" },
		{ name: "Closed Won", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Closed Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	finance: [
		{ name: "Lead", color: "#3b82f6" },
		{ name: "Discovery", color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Proposal", color: "#f59e0b" },
		{ name: "Due Diligence", color: "#f97316" },
		{ name: "Closed", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	healthcare: [
		{ name: "Inquiry", color: "#3b82f6" },
		{ name: "Assessment", color: "#8b5cf6" },
		{ name: "Proposal", color: "#f59e0b" },
		{ name: "Contract", color: "#10b981" },
		{ name: "Won", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
};

const DEFAULT_STAGE_SET: StageInput[] = [
	{ name: "New", color: "#3b82f6" },
	{ name: "Contacted", color: "#8b5cf6", staleAfterDays: 7 },
	{ name: "Proposal", color: "#f59e0b" },
	{ name: "Won", color: "#22c55e", isFinal: true, finalType: "positive" },
	{ name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
];

/**
 * Returns the seeded stage list for an industry. Falls back to DEFAULT_STAGE_SET
 * when the industry is unknown. Stage IDs are deterministic from the orgId so
 * the same id is generated across replays of the same input.
 */
export function getDefaultStages(industry: string, orgId: string) {
	const set: StageInput[] = INDUSTRY_STAGES[industry] ?? DEFAULT_STAGE_SET;
	return set.map((s, i) => ({
		id: `stage_${orgId.slice(-6)}_${i}`,
		name: s.name,
		order: i,
		color: s.color,
		isFinal: s.isFinal,
		finalType: s.finalType,
		staleAfterDays: s.staleAfterDays,
	}));
}
