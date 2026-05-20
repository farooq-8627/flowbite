/**
 * B2B SaaS industry template.
 *
 * Pipeline stages: Discovery → Demo → Proposal → Negotiation → Won / Lost.
 * Deal fields: MRR (currency), contract term (number), product line (select).
 * Entity labels: defaults (Lead / Contact / Deal / Company).
 */
import type { IndustryTemplate } from "../types";

export const b2bSaasTemplate: IndustryTemplate = {
	id: "b2b-saas",
	label: "B2B SaaS",
	description: "Software sales pipeline — discovery, demo, proposal, close.",
	icon: "💻",

	pipeline: {
		name: "Sales Pipeline",
		stages: [
			{
				name: "Discovery",
				code: "DISC",
				color: "#6366f1",
				staleAfterDays: 5,
			},
			{
				name: "Demo Scheduled",
				code: "DEMO",
				color: "#8b5cf6",
				staleAfterDays: 7,
			},
			{
				name: "Proposal Sent",
				code: "PROP",
				color: "#a855f7",
				staleAfterDays: 7,
			},
			{
				name: "Negotiation",
				code: "NEG",
				color: "#d946ef",
				staleAfterDays: 10,
			},
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
	},

	fieldDefinitions: {
		deal: [
			{
				entityType: "deal",
				name: "mrr",
				label: "Monthly Recurring Revenue",
				type: "currency",
				kind: "currency",
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "contract_term_months",
				label: "Contract Term (months)",
				type: "number",
				kind: "number",
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "product_line",
				label: "Product Line",
				type: "select",
				kind: "select",
				options: ["Starter", "Pro", "Enterprise"],
				system: true,
				required: false,
			},
		],
		contact: [
			{
				entityType: "contact",
				name: "job_title",
				label: "Job Title",
				type: "text",
				kind: "text",
				system: true,
				required: false,
			},
		],
	},
};
