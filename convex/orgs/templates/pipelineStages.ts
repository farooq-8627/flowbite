/**
 * Industry pipeline stage templates — convex/orgs/templates/pipelineStages.ts
 *
 * LEGACY shim. Kept only for back-compat with onboarding paths that
 * still call `getDefaultStages(...)`. The canonical seeder is
 * `convex/crm/fields/templates/mutations.ts::setupWorkspaceFromTemplate`,
 * which reads template data from the `platformTemplates` DB rows
 * (Stage 3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md). Adding a new
 * industry = clone-or-create via `/xowner/industries/new`, NOT a
 * code change here.
 */
import { deriveStageCode } from "../../crm/fields/pipelines/helpers";

export type StageInput = {
	name: string;
	code?: string;
	color: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
};

const INDUSTRY_STAGES: Record<string, StageInput[]> = {
	"real-estate": [
		{ name: "New Inquiry", code: "NEW", color: "#3b82f6" },
		{ name: "Viewing", code: "VIEW", color: "#8b5cf6", staleAfterDays: 3 },
		{ name: "Offer", code: "OFR", color: "#f59e0b", staleAfterDays: 5 },
		{ name: "Negotiation", code: "NEG", color: "#f97316", staleAfterDays: 5 },
		{ name: "Under Contract", code: "CONT", color: "#10b981" },
		{
			name: "Closed Won",
			code: "WON",
			color: "#22c55e",
			isFinal: true,
			finalType: "positive",
		},
		{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"dubai-real-estate": [
		{ name: "New Inquiry", code: "NEW", color: "#3b82f6" },
		{ name: "Viewing", code: "VIEW", color: "#8b5cf6", staleAfterDays: 3 },
		{ name: "Offer / MOU", code: "OFR", color: "#f59e0b", staleAfterDays: 5 },
		{ name: "Form F", code: "FORMF", color: "#f97316", staleAfterDays: 5 },
		{ name: "Ejari Registration", code: "EJ", color: "#10b981", staleAfterDays: 7 },
		{ name: "Handover", code: "HO", color: "#06b6d4", staleAfterDays: 5 },
		{
			name: "Won (Active)",
			code: "WON",
			color: "#22c55e",
			isFinal: true,
			finalType: "positive",
		},
		{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	technology: [
		{ name: "Prospecting", code: "PROS", color: "#3b82f6" },
		{ name: "Qualified", code: "QUAL", color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Demo", code: "DEMO", color: "#f59e0b" },
		{ name: "Proposal", code: "PROP", color: "#f97316", staleAfterDays: 5 },
		{ name: "Negotiation", code: "NEG", color: "#10b981" },
		{
			name: "Closed Won",
			code: "WON",
			color: "#22c55e",
			isFinal: true,
			finalType: "positive",
		},
		{
			name: "Closed Lost",
			code: "LOST",
			color: "#ef4444",
			isFinal: true,
			finalType: "negative",
		},
	],
	finance: [
		{ name: "Lead", code: "LEAD", color: "#3b82f6" },
		{ name: "Discovery", code: "DISC", color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Proposal", code: "PROP", color: "#f59e0b" },
		{ name: "Due Diligence", code: "DD", color: "#f97316" },
		{ name: "Closed", code: "WON", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	healthcare: [
		{ name: "Inquiry", code: "INQ", color: "#3b82f6" },
		{ name: "Assessment", code: "ASSESS", color: "#8b5cf6" },
		{ name: "Proposal", code: "PROP", color: "#f59e0b" },
		{ name: "Contract", code: "CTR", color: "#10b981" },
		{ name: "Won", code: "WON", color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
	],
};

const DEFAULT_STAGE_SET: StageInput[] = [
	{ name: "New", code: "NEW", color: "#3b82f6" },
	{ name: "Contacted", code: "CONT", color: "#8b5cf6", staleAfterDays: 7 },
	{ name: "Proposal", code: "PROP", color: "#f59e0b" },
	{ name: "Won", code: "WON", color: "#22c55e", isFinal: true, finalType: "positive" },
	{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
];

/**
 * Returns the seeded stage list for an industry. Falls back to DEFAULT_STAGE_SET
 * when the industry is unknown. Stage IDs are deterministic from the orgId so
 * the same id is generated across replays of the same input.
 *
 * Stage codes — required as of 2026-05-20 (see `pipelines/MODULE.md`).
 * Hard-coded per stage above; falls back to `deriveStageCode` if a future
 * edit forgets to set one.
 */
export function getDefaultStages(industry: string, orgId: string) {
	const set: StageInput[] = INDUSTRY_STAGES[industry] ?? DEFAULT_STAGE_SET;
	const usedCodes = new Set<string>();
	return set.map((s, i) => {
		const code = s.code ?? deriveStageCode(s, usedCodes);
		usedCodes.add(code);
		return {
			id: `stage_${orgId.slice(-6)}_${i}`,
			name: s.name,
			code,
			order: i,
			color: s.color,
			isFinal: s.isFinal,
			finalType: s.finalType,
			staleAfterDays: s.staleAfterDays,
		};
	});
}
