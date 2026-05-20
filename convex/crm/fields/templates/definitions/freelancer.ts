/**
 * Freelancer / agency industry template.
 *
 * Pipeline stages: Inquiry → Quote → Accepted → Working → Invoiced → Done / Cancelled.
 * Deal fields: project type, quoted hours, hourly rate.
 */
import type { IndustryTemplate } from "../types";

export const freelancerTemplate: IndustryTemplate = {
	id: "freelancer",
	label: "Freelancer / Agency",
	description: "Project-based work — inquiry, quote, deliver, invoice.",
	icon: "🎨",

	pipeline: {
		name: "Client Pipeline",
		stages: [
			{
				name: "Inquiry",
				code: "INQ",
				color: "#6366f1",
				staleAfterDays: 7,
			},
			{
				name: "Quote Sent",
				code: "QUOTE",
				color: "#8b5cf6",
				staleAfterDays: 5,
			},
			{
				name: "Accepted",
				code: "ACC",
				color: "#a855f7",
				staleAfterDays: 14,
			},
			{
				name: "Working",
				code: "WORK",
				color: "#f59e0b",
				staleAfterDays: 21,
			},
			{
				name: "Invoiced",
				code: "INV",
				color: "#3b82f6",
				staleAfterDays: 7,
			},
			{
				name: "Complete",
				code: "DONE",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{
				name: "Cancelled",
				code: "CXL",
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
				name: "project_type",
				label: "Project Type",
				type: "select",
				kind: "select",
				options: ["Design", "Development", "Consulting", "Writing", "Other"],
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "quoted_hours",
				label: "Quoted Hours",
				type: "number",
				kind: "number",
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "hourly_rate",
				label: "Hourly Rate",
				type: "currency",
				kind: "currency",
				system: true,
				required: false,
			},
		],
	},
};
