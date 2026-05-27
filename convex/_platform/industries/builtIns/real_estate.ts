/**
 * General Real Estate industry template.
 *
 * Region: global. Use this when the workspace doesn't need Gulf-specific
 * compliance fields (RERA permit, Form F, Ejari registration, Emirates ID
 * collection, 90-day rent-renewal alerts). Pipeline + fields cover the
 * generic property workflow that fits residential and commercial brokers
 * outside the UAE.
 *
 * For the Gulf-specific variant with RERA / Ejari / Form F see
 * `./dubai_real_estate.ts`.
 *
 * Pipeline (mirrors a typical residential brokerage funnel):
 *   New Inquiry → Viewing → Offer → Negotiation → Under Contract →
 *   Closed Won | Closed Lost
 *
 * Entity-label renames:
 *   Lead    → Inquiry
 *   Contact → Client
 *   Deal    → Listing
 *   Company → Agency
 *
 * Currency / timezone are NOT pinned (fall back to the workspace defaults
 * the user picks during onboarding) so the template ports cleanly to any
 * region.
 */
import type { IndustryTemplate } from "../../../crm/fields/templates/types";

export const realEstateTemplate: IndustryTemplate = {
	id: "real-estate-global",
	label: "Real Estate (Global)",
	description:
		"General property workflow — inquiry, viewing, offer, negotiation, close. No region-specific compliance fields.",
	icon: "🏠",
	region: "global",

	defaults: {
		leadStaleAfterDays: 7,
	},

	entityLabels: {
		lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" },
		contact: { singular: "Client", plural: "Clients", slug: "clients" },
		deal: { singular: "Listing", plural: "Listings", slug: "listings" },
		company: { singular: "Agency", plural: "Agencies", slug: "agencies" },
	},

	codePrefixes: {
		person: "IN",
		deal: "L",
		company: "AG",
	},

	pipeline: {
		name: "Property Pipeline",
		stages: [
			{
				name: "New Inquiry",
				code: "NEW",
				color: "#3b82f6",
				staleAfterDays: 3,
			},
			{
				name: "Viewing",
				code: "VIEW",
				color: "#8b5cf6",
				staleAfterDays: 5,
			},
			{
				name: "Offer",
				code: "OFR",
				color: "#f59e0b",
				staleAfterDays: 5,
			},
			{
				name: "Negotiation",
				code: "NEG",
				color: "#f97316",
				staleAfterDays: 5,
			},
			{
				name: "Under Contract",
				code: "CONT",
				color: "#06b6d4",
				staleAfterDays: 14,
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
		lead: [
			{
				entityType: "lead",
				name: "property_type",
				label: "Property Type",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: [
					"Apartment",
					"House",
					"Condo",
					"Townhouse",
					"Villa",
					"Office",
					"Retail",
					"Land",
					"Other",
				],
			},
			{
				entityType: "lead",
				name: "intent",
				label: "Buy or Rent",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: ["Buy", "Rent", "Lease", "Sell"],
			},
			{
				entityType: "lead",
				name: "bedrooms",
				label: "Bedrooms",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: ["Studio", "1", "2", "3", "4", "5+"],
			},
			{
				entityType: "lead",
				name: "preferred_area",
				label: "Preferred Area",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Property",
			},
			{
				entityType: "lead",
				name: "budget",
				label: "Budget",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
		],
		deal: [
			{
				entityType: "deal",
				name: "property_address",
				label: "Property Address",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Property",
				required: true,
			},
			{
				entityType: "deal",
				name: "property_type",
				label: "Property Type",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: [
					"Apartment",
					"House",
					"Condo",
					"Townhouse",
					"Villa",
					"Office",
					"Retail",
					"Land",
					"Other",
				],
			},
			{
				entityType: "deal",
				name: "asking_price",
				label: "Asking Price",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "deal",
				name: "agreed_price",
				label: "Agreed Price",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["OFR", "NEG", "CONT", "WON"],
			},
			{
				entityType: "deal",
				name: "commission_pct",
				label: "Commission %",
				type: "number",
				kind: "number",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["OFR", "NEG", "CONT", "WON"],
			},
			{
				entityType: "deal",
				name: "closing_date",
				label: "Closing Date",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Tenancy",
				showInStages: ["CONT", "WON"],
			},
		],
	},

	modules: [
		{
			slot: "lead",
			order: 0,
			defaultView: "list",
			cardFields: ["displayName", "phone", "preferred_area", "budget", "assignedTo"],
			listColumns: [
				"displayName",
				"personCode",
				"phone",
				"property_type",
				"intent",
				"budget",
				"assignedTo",
				"status",
			],
			boardGroupBy: "status",
		},
		{
			slot: "contact",
			order: 1,
			defaultView: "list",
			cardFields: ["displayName", "phone", "assignedTo"],
			listColumns: ["displayName", "personCode", "phone", "email", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
		{
			slot: "deal",
			order: 2,
			defaultView: "board",
			cardFields: [
				"title",
				"property_address",
				"agreed_price",
				"assignedTo",
				"expectedCloseDate",
			],
			listColumns: [
				"dealCode",
				"title",
				"property_address",
				"asking_price",
				"agreed_price",
				"currentStageId",
				"assignedTo",
			],
			boardGroupBy: "currentStageId",
		},
		{
			slot: "company",
			order: 3,
			defaultView: "list",
			cardFields: ["name", "industry"],
			listColumns: ["name", "companyCode", "industry", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
	],

	noteCategories: [
		{ name: "Urgent", bgColor: "#fecaca", isDefault: false, position: 0 },
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 1 },
		{ name: "Hot Inquiry", bgColor: "#fed7aa", isDefault: false, position: 2 },
		{ name: "Viewing Notes", bgColor: "#ddd6fe", isDefault: false, position: 3 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 4 },
	],

	tags: [
		{ name: "Hot inquiry", color: "#ef4444" },
		{ name: "Cash buyer", color: "#22c55e" },
		{ name: "Mortgage required", color: "#3b82f6" },
		{ name: "Investor", color: "#14b8a6" },
		{ name: "End user", color: "#10b981" },
		{ name: "VIP client", color: "#ec4899" },
	],

	briefingDefaults: {
		morningBriefingEnabled: true,
		morningBriefingTime: "08:30",
	},

	taskDefaults: {
		defaultDueOffsetDays: 2,
		defaultPriority: "high",
		notifyAssignee: true,
		requireDealCode: false,
		reminderBeforeHours: 2,
	},

	fileUpload: {
		allowedMimeCategories: ["image", "pdf", "document"],
		maxSizeMb: 25,
	},

	aiPersona:
		"You are a real-estate operations assistant. You understand the standard residential / commercial property workflow: New Inquiry → Viewing → Offer → Negotiation → Under Contract → Closed Won. Refer to leads as 'inquiries', contacts as 'clients', deals as 'listings', companies as 'agencies' — those are the workspace's renamed labels. Always confirm before destructive actions (cancelling a contract, marking lost).",

	dashboardMetrics: [
		"ai.morningBriefing",
		"ai.pulseRibbon",
		"ai.quickComposer",
		"leads.open",
		"deals.open",
		"deals.pipelineValue",
		"deals.staleByStage",
		"tasks.list",
		"deals.pipeline",
		"today.focus",
		"calendar.weekAhead",
		"messages.recent",
		"pipeline.velocity",
	],

	savedViews: [
		{
			entityType: "lead",
			name: "Hot inquiries (mine)",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ assignedToMe: true, status: "new" }),
			sortBy: "createdAt",
			sortOrder: "desc",
		},
		{
			entityType: "deal",
			name: "Viewings this week",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "VIEW", dueWithin: "7d" }),
			sortBy: "expectedCloseDate",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Under contract",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "CONT" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Closed Won (this month)",
			scope: "org",
			isPinned: false,
			filters: JSON.stringify({ stage: "WON", wonWithin: "30d" }),
			sortBy: "wonAt",
			sortOrder: "desc",
		},
	],

	// ─── Mock data (Phase 3A — deletable sample records) ──────────────────
	mockData: {
		companies: [
			{
				key: "bay-area-realty",
				name: "Bay Area Realty Group",
				industry: "Real Estate",
				website: "https://bayarearealty.example.com",
			},
		],
		leads: [
			{
				displayName: "Maria Rodriguez",
				email: "maria.r@example.com",
				phone: "+1 415 555 0101",
				status: "new",
				fieldValues: {
					property_type: "House",
					intent: "Buy",
					bedrooms: "3",
					preferred_area: "Mission District, San Francisco",
					budget: 1200000,
				},
				tags: ["Cash buyer", "Hot inquiry"],
			},
			{
				displayName: "James O'Connor",
				email: "j.oconnor@example.com",
				phone: "+44 20 7946 0123",
				status: "contacted",
				fieldValues: {
					property_type: "Apartment",
					intent: "Rent",
					bedrooms: "1",
					preferred_area: "Shoreditch, London",
					budget: 2500,
				},
				tags: ["End user"],
			},
			{
				displayName: "Yuki Tanaka",
				email: "yuki.t@example.com",
				phone: "+1 650 555 0190",
				status: "new",
				fieldValues: {
					property_type: "Condo",
					intent: "Buy",
					bedrooms: "2",
					preferred_area: "Palo Alto, CA",
					budget: 1800000,
				},
				tags: ["Investor"],
			},
		],
		contacts: [
			{
				displayName: "Sofia Martinez",
				email: "sofia@example.com",
				phone: "+1 213 555 0199",
				companyKey: "bay-area-realty",
				tags: ["Agent"],
			},
			{
				displayName: "Ben Holloway",
				email: "ben.h@example.com",
				phone: "+44 7700 900 012",
				tags: ["Landlord"],
			},
		],
		deals: [
			{
				title: "Mission St — 3BR Family Home",
				stageCode: "VIEW",
				value: 1150000,
				contactDisplayName: "Sofia Martinez",
				companyKey: "bay-area-realty",
				fieldValues: {
					property_address: "1247 Mission St, San Francisco, CA",
					property_type: "House",
					asking_price: 1200000,
					commission_pct: 2.5,
				},
				tags: ["Hot inquiry"],
			},
			{
				title: "Shoreditch Studio — 1BR Rental",
				stageCode: "OFR",
				value: 2400,
				contactDisplayName: "Ben Holloway",
				fieldValues: {
					property_address: "42 Bethnal Green Rd, Shoreditch, London",
					property_type: "Apartment",
					asking_price: 2500,
					agreed_price: 2400,
					commission_pct: 8,
				},
				tags: ["Counter-offer"],
			},
		],
		notes: [
			{
				content:
					"Maria is pre-approved up to $1.2M and looking to close before end of quarter. Schedule viewing Saturday AM.",
				categoryName: "Hot Inquiry",
				anchorTo: { kind: "lead", displayName: "Maria Rodriguez" },
			},
			{
				content:
					"James prefers viewings on weekends only. Needs service charge breakdown + broadband speed before committing.",
				categoryName: "Today",
				anchorTo: { kind: "lead", displayName: "James O'Connor" },
			},
			{
				content:
					"Counter-offer at £2,400/month accepted by landlord (Ben). Send tenancy agreement draft.",
				categoryName: "Done",
				anchorTo: { kind: "deal", title: "Shoreditch Studio — 1BR Rental" },
			},
		],
		tasks: [
			{
				title: "Send Mission St listing photos to Maria",
				dueOffsetDays: 0,
				priority: "high",
				source: "manual",
				anchorTo: { kind: "lead", displayName: "Maria Rodriguez" },
			},
			{
				title: "Lease signing — Shoreditch",
				dueOffsetDays: 3,
				priority: "high",
				source: "followup",
				anchorTo: { kind: "deal", title: "Shoreditch Studio — 1BR Rental" },
			},
			{
				title: "Call Yuki — Palo Alto condo shortlist",
				dueOffsetDays: 1,
				priority: "normal",
				source: "manual",
				anchorTo: { kind: "lead", displayName: "Yuki Tanaka" },
			},
		],
	},
};
