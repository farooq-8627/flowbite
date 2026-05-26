/**
 * Dubai / Gulf Real Estate industry template — full end-to-end.
 *
 * Region focus: UAE (Dubai/Abu Dhabi) + GCC. The Gulf real-estate market has
 * a unique compliance + workflow surface that no generic CRM template
 * captures:
 *
 *   - RERA (Real Estate Regulatory Agency) registration of every listing
 *   - Form F (memorandum of understanding) stage gating
 *   - Ejari (Dubai's tenancy contract registration system) for handover
 *   - Emirates ID + passport collection during documentation
 *   - 90-day rent renewal alert window (UAE law mandates 90-day notice)
 *
 * Pipeline reflects the UAE buyer / tenant journey:
 *   New Inquiry → Viewing Scheduled → Offer / MOU → Form F → Ejari →
 *   Handover → Won (Active Tenancy) | Lost
 *
 * Entities are renamed to Gulf-market vocabulary:
 *   Lead    → Inquiry  (إستفسار)
 *   Contact → Client   (عميل)
 *   Deal    → Listing  (إدراج)
 *   Company → Agency   (وكالة)
 *
 * For a non-Dubai general real-estate template (no RERA / Ejari / Form F)
 * see `./real_estate.ts`.
 *
 * Sources:
 *   - https://dubailand.gov.ae/en/eservices/ejari/ — Ejari overview
 *   - https://rera.dubailand.gov.ae/ — RERA registration rules
 *   - https://u.ae/ — UAE government portal (rent + tenancy laws)
 */
import type { IndustryTemplate } from "../types";

export const dubaiRealEstateTemplate: IndustryTemplate = {
	id: "real-estate-dubai",
	label: "Real Estate (Dubai / Gulf)",
	description:
		"UAE / Gulf property workflow — inquiry, viewing, MOU, Form F, Ejari, handover. RERA + Emirates ID built in.",
	icon: "🏙️",
	region: "gcc",

	// ─── Workspace defaults ───────────────────────────────────────────────
	defaults: {
		currency: "AED",
		timezone: "Asia/Dubai",
		leadStaleAfterDays: 5,
		locale: "en",
	},

	// ─── Entity labels (English + Arabic) ──────────────────────────────────
	entityLabels: {
		lead: {
			singular: "Inquiry",
			plural: "Inquiries",
			slug: "inquiries",
			singularAr: "إستفسار",
			pluralAr: "إستفسارات",
		},
		contact: {
			singular: "Client",
			plural: "Clients",
			slug: "clients",
			singularAr: "عميل",
			pluralAr: "عملاء",
		},
		deal: {
			singular: "Listing",
			plural: "Listings",
			slug: "listings",
			singularAr: "إدراج",
			pluralAr: "إدراجات",
		},
		company: {
			singular: "Agency",
			plural: "Agencies",
			slug: "agencies",
			singularAr: "وكالة",
			pluralAr: "وكالات",
		},
	},

	// ─── Code prefixes (IN-001, AG-001, D-001, FU-001) ─────────────────────
	codePrefixes: {
		person: "IN",
		deal: "D",
		company: "AG",
		followup: "FU",
	},

	// ─── Pipeline ──────────────────────────────────────────────────────────
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
				name: "Viewing Scheduled",
				code: "VIEW",
				color: "#8b5cf6",
				staleAfterDays: 5,
			},
			{
				name: "Offer / MOU",
				code: "OFR",
				color: "#f59e0b",
				staleAfterDays: 4,
			},
			{
				name: "Form F",
				code: "FORMF",
				color: "#f97316",
				staleAfterDays: 5,
			},
			{
				name: "Ejari Registration",
				code: "EJ",
				color: "#10b981",
				staleAfterDays: 7,
			},
			{
				name: "Handover",
				code: "HO",
				color: "#06b6d4",
				staleAfterDays: 5,
			},
			{
				name: "Won (Active)",
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

	// ─── Field definitions (system fields are seeded universally — these
	//     are the industry-specific overlays) ───────────────────────────────
	fieldDefinitions: {
		lead: [
			{
				entityType: "lead",
				name: "preferred_area",
				label: "Preferred Area",
				labelAr: "المنطقة المفضلة",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: [
					"Downtown Dubai",
					"Dubai Marina",
					"Business Bay",
					"Palm Jumeirah",
					"JVC",
					"JLT",
					"Arabian Ranches",
					"Dubai Hills",
					"Mirdif",
					"Deira",
					"Bur Dubai",
					"Abu Dhabi - Saadiyat",
					"Abu Dhabi - Al Reem",
					"Abu Dhabi - Yas Island",
					"Other",
				],
			},
			{
				entityType: "lead",
				name: "property_type",
				label: "Property Type",
				labelAr: "نوع العقار",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: ["Apartment", "Villa", "Townhouse", "Office", "Retail", "Land"],
			},
			{
				entityType: "lead",
				name: "bedrooms",
				label: "Bedrooms",
				labelAr: "غرف النوم",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: ["Studio", "1BR", "2BR", "3BR", "4BR", "5BR+"],
			},
			{
				entityType: "lead",
				name: "budget_aed",
				label: "Budget (AED)",
				labelAr: "الميزانية",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "lead",
				name: "intent",
				label: "Buy or Rent",
				labelAr: "شراء أم إيجار",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Property",
				options: ["Buy", "Rent — Annual", "Rent — Short term", "Off-plan"],
			},
		],
		contact: [
			{
				entityType: "contact",
				name: "nationality",
				label: "Nationality",
				labelAr: "الجنسية",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Personal",
			},
			{
				entityType: "contact",
				name: "preferred_language",
				label: "Preferred Language",
				labelAr: "اللغة المفضلة",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Personal",
				options: ["English", "Arabic", "Hindi", "Urdu", "Russian", "Other"],
			},
		],
		company: [
			{
				entityType: "company",
				name: "rera_orn",
				label: "RERA ORN",
				labelAr: "رقم تسجيل RERA",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				required: true,
			},
			{
				entityType: "company",
				name: "trade_license",
				label: "Trade License No.",
				labelAr: "رقم الرخصة التجارية",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
			},
		],
		deal: [
			// Stage-aware fields. `showInStages` references stage CODES; the
			// seeder resolves codes to ids before insert.
			{
				entityType: "deal",
				name: "property_address",
				label: "Property Address",
				labelAr: "عنوان العقار",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Property",
				required: true,
			},
			{
				entityType: "deal",
				name: "rera_permit_number",
				label: "RERA Permit No.",
				labelAr: "رقم تصريح RERA",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				required: true,
			},
			{
				entityType: "deal",
				name: "asking_price_aed",
				label: "Asking Price (AED)",
				labelAr: "السعر المطلوب",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "deal",
				name: "agreed_price_aed",
				label: "Agreed Price (AED)",
				labelAr: "السعر المتفق عليه",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["OFR", "FORMF", "EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "commission_pct",
				label: "Commission %",
				labelAr: "نسبة العمولة",
				type: "number",
				kind: "number",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["OFR", "FORMF", "EJ", "HO", "WON"],
			},
			// Documents — collected during the FORMF / EJ stages
			{
				entityType: "deal",
				name: "emirates_id_number",
				label: "Emirates ID No.",
				labelAr: "رقم الهوية الإماراتية",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Documents",
				sensitive: true,
				showInStages: ["FORMF", "EJ", "HO"],
			},
			{
				entityType: "deal",
				name: "emirates_id_file",
				label: "Emirates ID Copy",
				labelAr: "صورة الهوية الإماراتية",
				type: "file",
				kind: "file",
				storage: "fieldValues",
				groupName: "Documents",
				sensitive: true,
				showInStages: ["FORMF", "EJ", "HO"],
			},
			{
				entityType: "deal",
				name: "passport_number",
				label: "Passport No.",
				labelAr: "رقم جواز السفر",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Documents",
				sensitive: true,
				showInStages: ["FORMF", "EJ", "HO"],
			},
			{
				entityType: "deal",
				name: "passport_file",
				label: "Passport Copy",
				labelAr: "صورة جواز السفر",
				type: "file",
				kind: "file",
				storage: "fieldValues",
				groupName: "Documents",
				sensitive: true,
				showInStages: ["FORMF", "EJ", "HO"],
			},
			{
				entityType: "deal",
				name: "form_f_signed_date",
				label: "Form F Signed Date",
				labelAr: "تاريخ توقيع نموذج F",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["FORMF", "EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "form_f_file",
				label: "Form F Document",
				labelAr: "وثيقة نموذج F",
				type: "file",
				kind: "file",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["FORMF", "EJ", "HO"],
			},
			{
				entityType: "deal",
				name: "ejari_number",
				label: "Ejari Number",
				labelAr: "رقم إيجاري",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "ejari_file",
				label: "Ejari Certificate",
				labelAr: "شهادة إيجاري",
				type: "file",
				kind: "file",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "lease_start_date",
				label: "Lease Start Date",
				labelAr: "تاريخ بداية العقد",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Tenancy",
				showInStages: ["EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "lease_expiry_date",
				label: "Lease Expiry Date",
				labelAr: "تاريخ انتهاء العقد",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Tenancy",
				showInStages: ["EJ", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "handover_date",
				label: "Handover Date",
				labelAr: "تاريخ التسليم",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Tenancy",
				showInStages: ["HO", "WON"],
			},
		],
	},

	// ─── Modules slot map ──────────────────────────────────────────────────
	modules: [
		{
			slot: "lead",
			order: 0,
			defaultView: "list",
			cardFields: ["displayName", "phone", "preferred_area", "budget_aed", "assignedTo"],
			listColumns: [
				"displayName",
				"personCode",
				"phone",
				"preferred_area",
				"budget_aed",
				"intent",
				"assignedTo",
				"status",
			],
			boardGroupBy: "status",
		},
		{
			slot: "contact",
			order: 1,
			defaultView: "list",
			cardFields: ["displayName", "phone", "nationality", "assignedTo"],
			listColumns: [
				"displayName",
				"personCode",
				"phone",
				"email",
				"nationality",
				"preferred_language",
				"assignedTo",
			],
			boardGroupBy: "assignedTo",
		},
		{
			slot: "deal",
			order: 2,
			defaultView: "board",
			cardFields: [
				"title",
				"property_address",
				"agreed_price_aed",
				"assignedTo",
				"expectedCloseDate",
			],
			listColumns: [
				"dealCode",
				"title",
				"property_address",
				"rera_permit_number",
				"agreed_price_aed",
				"currentStageId",
				"assignedTo",
			],
			boardGroupBy: "currentStageId",
		},
		{
			slot: "company",
			order: 3,
			defaultView: "list",
			cardFields: ["name", "rera_orn", "industry"],
			listColumns: ["name", "companyCode", "rera_orn", "trade_license", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
	],

	// ─── Sticky-note categories (real-estate workflow) ─────────────────────
	noteCategories: [
		{ name: "Urgent", bgColor: "#fecaca", isDefault: false, position: 0 },
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 1 },
		{ name: "Hot Inquiry", bgColor: "#fed7aa", isDefault: false, position: 2 },
		{ name: "Viewing Notes", bgColor: "#ddd6fe", isDefault: false, position: 3 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 4 },
	],

	// ─── Tag presets ───────────────────────────────────────────────────────
	tags: [
		{ name: "Hot inquiry", color: "#ef4444" },
		{ name: "Cash buyer", color: "#22c55e" },
		{ name: "Mortgage required", color: "#3b82f6" },
		{ name: "Off-plan", color: "#a855f7" },
		{ name: "Form F submitted", color: "#f97316" },
		{ name: "Ejari pending", color: "#eab308" },
		{ name: "VIP client", color: "#ec4899" },
		{ name: "Renewal upcoming", color: "#06b6d4" },
		{ name: "Investor", color: "#14b8a6" },
		{ name: "End user", color: "#10b981" },
	],

	// ─── Reminder defaults (Gulf-specific: 90-day rent renewal alert) ──────
	reminderDefaults: {
		followUpWindowHours: 24,
		staleAlertDays: 5,
		morningBriefingEnabled: true,
		morningBriefingTime: "08:30",
		rentAlertEnabled: true,
		// 95 days = 3 months + buffer. UAE rental law mandates 90-day
		// notice; we alert 5 days early to give the agent time to act.
		rentAlertDays: 95,
	},

	// ─── Follow-up cadence defaults ────────────────────────────────────────
	followupDefaults: {
		defaultDueOffsetDays: 2,
		defaultPriority: "high",
		notifyAssignee: true,
		requireDealCode: false,
		reminderBeforeHours: 2,
	},

	// ─── File uploads (Emirates ID + passport scans need PDF + image) ──────
	fileUpload: {
		allowedMimeCategories: ["image", "pdf", "document"],
		// 25MB covers typical scanned IDs + multi-page contracts.
		maxSizeMb: 25,
	},

	// ─── AI persona (RERA + Ejari + Form F vocabulary) ────────────────────
	aiPersona:
		"You are a Dubai / UAE real-estate operations assistant. You understand RERA registration (every listing must have a RERA permit number), Form F (the standard MOU for property sales/rentals in Dubai), Ejari (Dubai's mandatory tenancy contract registration), the 90-day rent renewal notice required by UAE law, Emirates ID + passport requirements at the Documentation stage, and the standard buyer/tenant journey: New Inquiry → Viewing → Offer/MOU → Form F → Ejari → Handover → Active Tenancy. Use AED for all values. Areas to recognise without translation: Downtown Dubai, Dubai Marina, Business Bay, Palm Jumeirah, JVC, JLT, Arabian Ranches, Dubai Hills, Mirdif, Deira, Bur Dubai, Saadiyat, Al Reem, Yas Island. Refer to leads as 'inquiries', contacts as 'clients', deals as 'listings', companies as 'agencies' — those are the workspace's renamed labels. Always confirm before destructive actions (cancelling Form F, marking lost).",

	// ─── Dashboard widgets (ranked list — top = first row) ────────────────
	// Order matches §9.6 of CODE-ARCHITECTURE-PHASE-3A.md.
	dashboardMetrics: [
		"ai.morningBriefing",
		"ai.pulseRibbon",
		"ai.quickComposer",
		"leads.open",
		"deals.open",
		"deals.pipelineValue",
		"deals.staleByStage",
		"reminders.list",
		"deals.pipeline",
		"today.focus",
		"calendar.weekAhead",
		"messages.recent",
		"deals.renewingIn30Days",
	],

	// ─── Custom orgRoles (Listing Agent + BD Rep) ──────────────────────────
	customRoles: [
		{
			name: "Listing Agent",
			description: "Front-line agent — owns inquiries through handover.",
			color: "#3b82f6",
			permissions: [
				"leads.view",
				"leads.create",
				"leads.update",
				"leads.qualify",
				"leads.convert",
				"contacts.view",
				"contacts.create",
				"contacts.update",
				"companies.view",
				"deals.view",
				"deals.create",
				"deals.update",
				"deals.changeStage",
				"deals.viewValues",
				"notes.view",
				"notes.create",
				"notes.updateOwn",
				"notes.deleteOwn",
				"messages.view",
				"messages.send",
				"messages.editOwn",
				"messages.deleteOwn",
				"messages.subscribe",
				"reminders.view",
				"reminders.create",
				"reminders.manage",
				"tags.view",
				"tags.attach",
				"savedViews.view",
				"savedViews.createPersonal",
				"pipelines.view",
				"fieldDefinitions.view",
				"ai.use",
				"ai.viewHistory",
				"activityLogs.viewOwn",
				"notifications.viewOwn",
				"notifications.markRead",
				"files.view",
				"files.upload",
				"files.delete",
			],
		},
		{
			name: "BD Rep",
			description: "Top-of-funnel rep — qualifies inquiries before handover.",
			color: "#a855f7",
			permissions: [
				"leads.view",
				"leads.create",
				"leads.update",
				"leads.qualify",
				"contacts.view",
				"contacts.create",
				"companies.view",
				"deals.view",
				"deals.viewValues",
				"notes.view",
				"notes.create",
				"notes.updateOwn",
				"notes.deleteOwn",
				"messages.view",
				"messages.send",
				"messages.editOwn",
				"messages.deleteOwn",
				"messages.subscribe",
				"reminders.view",
				"reminders.create",
				"reminders.manage",
				"tags.view",
				"tags.attach",
				"savedViews.view",
				"savedViews.createPersonal",
				"pipelines.view",
				"fieldDefinitions.view",
				"ai.use",
				"ai.viewHistory",
				"activityLogs.viewOwn",
				"notifications.viewOwn",
				"notifications.markRead",
				"files.view",
				"files.upload",
				"files.delete",
			],
		},
	],

	// ─── Saved views (every member sees these in the sidebar) ──────────────
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
			entityType: "lead",
			name: "Stale inquiries (>5 days)",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ staleAfterDays: 5 }),
			sortBy: "updatedAt",
			sortOrder: "asc",
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
			name: "Pending Form F",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "FORMF" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Pending Ejari",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "EJ" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Renewing in 90 days",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({
				stage: "WON",
				leaseExpiryWithin: "90d",
			}),
			sortBy: "lease_expiry_date",
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
				key: "driven-properties",
				name: "Driven Properties LLC",
				industry: "Real Estate",
				website: "https://drivenproperties.example.ae",
				fieldValues: { rera_orn: "ORN-12345", trade_license: "TL-987654" },
			},
		],
		leads: [
			{
				displayName: "Sarah Khan",
				email: "sarah.khan@example.com",
				phone: "+971 50 123 4567",
				status: "new",
				fieldValues: {
					preferred_area: "Dubai Marina",
					property_type: "Apartment",
					bedrooms: "2BR",
					budget_aed: 1800000,
					intent: "Buy",
				},
				tags: ["Hot inquiry", "End user"],
			},
			{
				displayName: "Ahmed Al-Maktoum",
				email: "ahmed.al@example.com",
				phone: "+971 55 987 6543",
				status: "contacted",
				fieldValues: {
					preferred_area: "JVC",
					property_type: "Villa",
					bedrooms: "3BR",
					budget_aed: 2500000,
					intent: "Buy",
				},
				tags: ["Cash buyer", "VIP client"],
			},
			{
				displayName: "Priya Sharma",
				email: "priya.s@example.com",
				phone: "+971 52 456 7890",
				status: "new",
				fieldValues: {
					preferred_area: "Business Bay",
					property_type: "Office",
					bedrooms: "Studio",
					budget_aed: 950000,
					intent: "Rent — Annual",
				},
				tags: ["Mortgage required"],
			},
		],
		contacts: [
			{
				displayName: "Omar Hassan",
				email: "omar.hassan@example.com",
				phone: "+971 50 111 2222",
				companyKey: "driven-properties",
				fieldValues: { nationality: "UAE", preferred_language: "Arabic" },
			},
			{
				displayName: "Lisa Chen",
				email: "lisa.chen@example.com",
				phone: "+971 56 333 4444",
				fieldValues: { nationality: "Singapore", preferred_language: "English" },
				tags: ["Investor"],
			},
		],
		deals: [
			{
				title: "Marina Heights — 2BR Rental",
				stageCode: "VIEW",
				value: 145000,
				contactDisplayName: "Lisa Chen",
				fieldValues: {
					property_address: "Marina Heights Tower, Dubai Marina",
					rera_permit_number: "RP-2024-0001",
					asking_price_aed: 145000,
					commission_pct: 5,
				},
				tags: ["Hot inquiry"],
			},
			{
				title: "JVC District 14 — 3BR Villa Sale",
				stageCode: "FORMF",
				value: 2400000,
				contactDisplayName: "Omar Hassan",
				companyKey: "driven-properties",
				fieldValues: {
					property_address: "District 14, Jumeirah Village Circle",
					rera_permit_number: "RP-2024-0002",
					asking_price_aed: 2500000,
					agreed_price_aed: 2400000,
					commission_pct: 2,
				},
				tags: ["Form F submitted", "Cash buyer"],
			},
		],
		notes: [
			{
				content:
					"Sarah called — wants to see Marina Heights this Saturday at 4pm. Bring floor plans + service charge breakdown.",
				categoryName: "Today",
				anchorTo: { kind: "lead", displayName: "Sarah Khan" },
			},
			{
				content: "Ahmed pre-approved for AED 2.5M mortgage. Ready to move on JVC villa.",
				categoryName: "Hot Inquiry",
				anchorTo: { kind: "lead", displayName: "Ahmed Al-Maktoum" },
			},
			{
				content:
					"Form F signed. Awaiting Emirates ID copy from buyer + Ejari registration this week.",
				categoryName: "Urgent",
				anchorTo: { kind: "deal", title: "JVC District 14 — 3BR Villa Sale" },
			},
			{
				content: "Lisa interested in second viewing — wants to bring her husband.",
				categoryName: "Viewing Notes",
				anchorTo: { kind: "deal", title: "Marina Heights — 2BR Rental" },
			},
		],
		reminders: [
			{
				title: "Marina Heights viewing — Sarah Khan",
				dueOffsetDays: 0,
				priority: "high",
				source: "manual",
				anchorTo: { kind: "lead", displayName: "Sarah Khan" },
			},
			{
				title: "Collect Emirates ID copy — JVC sale",
				dueOffsetDays: 1,
				priority: "urgent",
				source: "followup",
				anchorTo: { kind: "deal", title: "JVC District 14 — 3BR Villa Sale" },
			},
			{
				title: "Call Priya re: Business Bay availability",
				dueOffsetDays: 2,
				priority: "normal",
				source: "manual",
				anchorTo: { kind: "lead", displayName: "Priya Sharma" },
			},
		],
	},
};
