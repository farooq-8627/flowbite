/**
 * Real estate (Gulf-region focus) industry template.
 *
 * Pipeline stages: New → Viewing → Offer → Documentation → Ejari → Handover → Won / Lost.
 * Deal fields: property type, budget AED, preferred area.
 * Entity labels: lead → Inquiry, contact → Client, deal → Listing, company → Agency.
 */
import type { IndustryTemplate } from "../types";

export const realEstateTemplate: IndustryTemplate = {
	id: "real-estate",
	label: "Real Estate",
	description: "Property sales — inquiry, viewing, MOU, Ejari, handover.",
	icon: "🏠",

	pipeline: {
		name: "Real Estate Pipeline",
		stages: [
			{
				name: "New Inquiry",
				code: "NEW",
				color: "#6366f1",
				staleAfterDays: 3,
			},
			{
				name: "Viewing Scheduled",
				code: "VIEW",
				color: "#8b5cf6",
				staleAfterDays: 5,
			},
			{
				name: "Offer / MOU",
				code: "OFR",
				color: "#f59e0b",
				staleAfterDays: 7,
			},
			{
				name: "Documentation",
				code: "DOC",
				color: "#3b82f6",
				staleAfterDays: 10,
			},
			{
				name: "Ejari / Registration",
				code: "EJ",
				color: "#10b981",
				staleAfterDays: 14,
			},
			{
				name: "Handover",
				code: "HO",
				color: "#06b6d4",
				staleAfterDays: 7,
			},
			{
				name: "Won",
				code: "WON",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{
				name: "Lost",
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
				name: "property_type",
				label: "Property Type",
				type: "select",
				kind: "select",
				options: ["Apartment", "Villa", "Townhouse", "Office", "Retail", "Land"],
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "budget_aed",
				label: "Budget (AED)",
				type: "currency",
				kind: "currency",
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "preferred_area",
				label: "Preferred Area",
				type: "text",
				kind: "text",
				system: true,
				required: false,
			},
			{
				entityType: "deal",
				name: "ejari_number",
				label: "Ejari Number",
				type: "text",
				kind: "text",
				system: true,
				required: false,
				// Stage-aware: only show in Documentation + Ejari stages.
				// Stage IDs are assigned at insert time, so this is set as
				// a string of stage CODES — `setupWorkspaceFromTemplate`
				// resolves them to ids before insert.
				showInStages: ["DOC", "EJ"],
			},
		],
	},

	entityLabels: {
		lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" },
		contact: { singular: "Client", plural: "Clients", slug: "clients" },
		deal: { singular: "Listing", plural: "Listings", slug: "listings" },
		company: { singular: "Agency", plural: "Agencies", slug: "agencies" },
	},
};
