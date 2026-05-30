/**
 * Mock data for the B2B SaaS template.
 *
 * Pipeline: DISC → DEMO → PROP → NEG → WON | LOST.
 *
 * Field coverage strategy:
 *   - Always-visible (mrr_usd, acv_usd, product_line) on every deal.
 *   - DISC + DEMO fields (primary_use_case, current_solution,
 *     evaluation_criteria) on the DISC + DEMO seeds.
 *   - DEMO + PROP + NEG BANT fields (budget_band, decision_maker,
 *     decision_timeline, champion) on the DEMO + PROP + NEG seeds.
 *   - PROP + NEG + WON contract fields (contract_term_months,
 *     billing_cycle, discount_pct, expected_start_date) populated past
 *     PROP.
 *   - LOST diagnostics (lost_reason_category, lost_to_competitor) on
 *     the LOST seed.
 *
 * One deal per stage so the board is fully populated; the WON + LOST
 * deals exercise the post-decision fields the user otherwise never
 * sees in a fresh workspace.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const b2bSaasMockData: MockDataSeed = {
	companies: [
		{
			key: "acme-corp",
			name: "Acme Corp",
			industry: "SaaS",
			website: "https://acme.example.com",
			fieldValues: {
				domain: "acme.example.com",
				headcount: 120,
				tech_stack: ["AWS", "HubSpot", "Slack", "Linear", "Notion"],
			},
		},
		{
			key: "buildplex",
			name: "Buildplex",
			industry: "Construction Tech",
			website: "https://buildplex.example.com",
			fieldValues: {
				domain: "buildplex.example.com",
				headcount: 480,
				tech_stack: ["GCP", "Salesforce", "Microsoft Teams", "Office 365", "Jira"],
			},
		},
		{
			key: "novatech",
			name: "NovaTech Labs",
			industry: "Fintech",
			website: "https://novatech.example.com",
			fieldValues: {
				domain: "novatech.example.com",
				headcount: 28,
				tech_stack: ["AWS", "Slack", "Notion", "Linear"],
			},
		},
	],
	leads: [
		{
			displayName: "Julia Rodriguez",
			email: "julia.r@acme.example.com",
			phone: "+1 415 555 0201",
			status: "new",
			fieldValues: {
				company_size: "51-200",
				industry_vertical: "SaaS",
				lead_source_detail: "Inbound — website",
			},
			tags: ["ICP fit", "Inbound"],
		},
		{
			displayName: "Marcus Lee",
			email: "marcus@buildplex.example.com",
			phone: "+1 213 555 0202",
			status: "contacted",
			fieldValues: {
				company_size: "201-1000",
				industry_vertical: "Logistics",
				lead_source_detail: "Outbound — LinkedIn",
			},
			tags: ["Champion", "Outbound"],
		},
		{
			displayName: "Fatima Al-Hassan",
			email: "fatima.h@novatech.example.com",
			phone: "+44 20 7946 0203",
			status: "new",
			fieldValues: {
				company_size: "11-50",
				industry_vertical: "Fintech",
				lead_source_detail: "Event / conference",
			},
			tags: ["ICP fit", "Decision maker"],
		},
		{
			displayName: "Henrik Svensson",
			email: "henrik@example.com",
			phone: "+46 8 555 0204",
			status: "contacted",
			fieldValues: {
				company_size: "1000-5000",
				industry_vertical: "Manufacturing",
				lead_source_detail: "Referral — partner",
			},
			tags: ["ICP fit", "Influencer"],
		},
	],
	contacts: [
		{
			displayName: "Daniel Kim",
			email: "daniel.k@acme.example.com",
			phone: "+1 415 555 0211",
			companyKey: "acme-corp",
			fieldValues: {
				job_title: "VP Engineering",
				seniority: "VP",
				is_decision_maker: true,
				linkedin_url: "https://linkedin.com/in/daniel-kim-example",
			},
			tags: ["Champion", "Decision maker"],
		},
		{
			displayName: "Sarah Chen",
			email: "sarah.c@acme.example.com",
			phone: "+1 415 555 0212",
			companyKey: "acme-corp",
			fieldValues: {
				job_title: "Senior Engineering Manager",
				seniority: "Senior Manager / Director",
				is_decision_maker: false,
				linkedin_url: "https://linkedin.com/in/sarah-chen-example",
			},
			tags: ["Influencer"],
		},
		{
			displayName: "Marcus Lee",
			email: "marcus.contact@buildplex.example.com",
			phone: "+1 213 555 0213",
			companyKey: "buildplex",
			fieldValues: {
				job_title: "VP Operations",
				seniority: "VP",
				is_decision_maker: true,
				linkedin_url: "https://linkedin.com/in/marcus-lee-example",
			},
			tags: ["Champion", "Decision maker"],
		},
		{
			displayName: "Aisha Patel",
			email: "aisha.p@novatech.example.com",
			phone: "+44 20 7946 0214",
			companyKey: "novatech",
			fieldValues: {
				job_title: "CEO",
				seniority: "C-Level",
				is_decision_maker: true,
				linkedin_url: "https://linkedin.com/in/aisha-patel-example",
			},
			tags: ["Decision maker"],
		},
	],
	deals: [
		{
			title: "Acme Corp — Pro plan, 50 seats",
			stageCode: "DISC",
			value: 60000,
			contactDisplayName: "Daniel Kim",
			companyKey: "acme-corp",
			fieldValues: {
				mrr_usd: 5000,
				acv_usd: 60000,
				product_line: "Pro",
				primary_use_case: "Internal CRM consolidation across BD + AE teams",
				current_solution: "HubSpot Sales Hub",
				evaluation_criteria: "Stage-aware fields + AI assistant + India compliance",
			},
			tags: ["ICP fit", "Inbound"],
		},
		{
			title: "NovaTech — Demo Scheduled",
			stageCode: "DEMO",
			value: 84000,
			contactDisplayName: "Aisha Patel",
			companyKey: "novatech",
			fieldValues: {
				mrr_usd: 7000,
				acv_usd: 84000,
				product_line: "Business",
				primary_use_case: "Replace 3 spreadsheets with a unified pipeline view",
				current_solution: "Mix of Notion + Google Sheets",
				evaluation_criteria: "Speed of setup + AI assistant",
				budget_band: "$50K – $100K",
				decision_maker: "Aisha Patel (CEO)",
				decision_timeline: "Next quarter",
				champion: "Aisha Patel",
			},
			tags: ["ICP fit", "Champion"],
		},
		{
			title: "Buildplex — Enterprise rollout",
			stageCode: "PROP",
			value: 240000,
			contactDisplayName: "Marcus Lee",
			companyKey: "buildplex",
			fieldValues: {
				mrr_usd: 20000,
				acv_usd: 240000,
				product_line: "Enterprise",
				primary_use_case: "Replace Salesforce for ops team — too rigid for field work",
				evaluation_criteria: "Custom roles + offline mobile + Slack integration",
				budget_band: "$100K+",
				decision_maker: "Marcus Lee (VP Operations)",
				decision_timeline: "Next quarter",
				champion: "Marcus Lee",
				contract_term_months: 12,
				billing_cycle: "Annual",
			},
			tags: ["Champion", "ICP fit"],
		},
		{
			title: "Acme Corp — expansion seats Q4",
			stageCode: "NEG",
			value: 36000,
			contactDisplayName: "Sarah Chen",
			companyKey: "acme-corp",
			fieldValues: {
				mrr_usd: 3000,
				acv_usd: 36000,
				product_line: "Pro",
				budget_band: "$25K – $50K",
				decision_maker: "Sarah Chen (Senior EM)",
				decision_timeline: "This month",
				champion: "Daniel Kim",
				contract_term_months: 12,
				billing_cycle: "Annual",
				discount_pct: 10,
				expected_start_date: Date.now() + 14 * DAY_MS,
			},
			tags: ["Expansion", "Champion"],
		},
		{
			title: "NovaTech — pilot conversion (won)",
			stageCode: "WON",
			value: 48000,
			contactDisplayName: "Aisha Patel",
			companyKey: "novatech",
			fieldValues: {
				mrr_usd: 4000,
				acv_usd: 48000,
				product_line: "Business",
				budget_band: "$25K – $50K",
				decision_maker: "Aisha Patel (CEO)",
				decision_timeline: "This month",
				champion: "Aisha Patel",
				contract_term_months: 12,
				billing_cycle: "Annual",
				discount_pct: 5,
				expected_start_date: Date.now() - 7 * DAY_MS,
			},
			tags: ["ICP fit", "Decision maker"],
		},
		{
			title: "Henrik @ Manufacturing Co. — lost",
			stageCode: "LOST",
			value: 120000,
			fieldValues: {
				mrr_usd: 10000,
				acv_usd: 120000,
				product_line: "Enterprise",
				budget_band: "$100K+",
				decision_maker: "CFO (unknown)",
				decision_timeline: "Unsure",
				champion: "Henrik Svensson",
				contract_term_months: 24,
				billing_cycle: "Multi-year",
				lost_reason_category: "Lost to competitor",
				lost_to_competitor: "Salesforce",
			},
			tags: ["Win-back"],
		},
	],
	notes: [
		{
			content:
				"Discovery call done — Daniel confirmed BANT. Acme uses HubSpot today, frustrated with stage-field mapping. Strong fit.",
			categoryName: "Discovery",
			anchorTo: { kind: "deal", title: "Acme Corp — Pro plan, 50 seats" },
		},
		{
			content:
				"Demo scheduled Thursday 2pm PT for Acme. Prep: industry-template flow + AI assistant teaser.",
			categoryName: "Demo Prep",
			anchorTo: { kind: "deal", title: "Acme Corp — Pro plan, 50 seats" },
		},
		{
			content:
				"Buildplex sent revised proposal — they want 12-month term + 15% discount. Need to confirm with sales leadership.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "Buildplex — Enterprise rollout" },
		},
		{
			content: "Fatima at NovaTech mentioned competitor X — research how we differentiate.",
			categoryName: "Today",
			anchorTo: { kind: "lead", displayName: "Fatima Al-Hassan" },
		},
		{
			content:
				"Henrik went with Salesforce — schedule 6-month win-back outreach focused on AI assistant features.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Henrik @ Manufacturing Co. — lost" },
		},
	],
	tasks: [
		{
			title: "Acme demo prep — finalize deck",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Acme Corp — Pro plan, 50 seats" },
		},
		{
			title: "Send Buildplex revised proposal",
			dueOffsetDays: 1,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "Buildplex — Enterprise rollout" },
		},
		{
			title: "Discovery call — Fatima at NovaTech",
			dueOffsetDays: 2,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Fatima Al-Hassan" },
		},
		{
			title: "Acme expansion — confirm 10% discount with leadership",
			dueOffsetDays: 1,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Acme Corp — expansion seats Q4" },
		},
		{
			title: "NovaTech onboarding kickoff (won deal)",
			dueOffsetDays: 3,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "NovaTech — pilot conversion (won)" },
		},
	],
};
