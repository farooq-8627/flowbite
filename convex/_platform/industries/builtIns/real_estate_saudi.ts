/**
 * Saudi Arabia Real Estate industry template — Phase 3A.
 *
 * Region: Saudi Arabia (KSA). The Saudi market has a distinct regulatory
 * surface from Dubai/Gulf:
 *
 *   - Ejar — REGA's mandatory tenancy contract registration platform
 *     (https://momah.gov.sa). Every rental agreement must be registered.
 *   - Sakani — the Ministry of Housing's home-buyer assistance programme
 *     (https://sakani.sa). Buyers may attach a Sakani reference for
 *     subsidised mortgages and government-built developments.
 *   - Iqama — residency permit; the equivalent of Dubai's Emirates ID for
 *     non-Saudi residents. Saudi nationals use the National ID instead.
 *   - SAR currency, Riyadh / Jeddah / Dammam / Mecca / Medina / Khobar markets.
 *   - 30-day lease renewal notice (vs UAE's 90-day).
 *
 * This template is the "minimal" Saudi template per Q4 of the user-confirmed
 * answers in CODE-ARCHITECTURE-PHASE-3A.md §2 — Wafi (off-plan registration)
 * is deferred to Phase 4.
 *
 * For Dubai / Gulf brokers, see ./dubai_real_estate.ts.
 * For non-region-specific brokers, see ./real_estate.ts.
 *
 * Sources:
 *   - https://www.momah.gov.sa/en — Ministry of Municipalities, Rural Affairs and Housing
 *   - https://sakani.sa — Sakani housing programme
 *   - REGA (Real Estate General Authority) tenancy regulations
 */
import type { IndustryTemplate } from "../../../crm/fields/templates/types";
import { realEstateSaudiMockData } from "../mockData/real_estate_saudi";

export const realEstateSaudiTemplate: IndustryTemplate = {
	id: "real-estate-saudi",
	label: "Real Estate (Saudi Arabia)",
	description:
		"Saudi property workflow — inquiry, viewing, offer, Ejar registration, Sakani verification, handover. SAR + Iqama built in.",
	icon: "🇸🇦",
	region: "gcc",

	// ─── Workspace defaults ───────────────────────────────────────────────
	defaults: {
		currency: "SAR",
		timezone: "Asia/Riyadh",
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

	codePrefixes: { person: "IN", deal: "L", company: "AG" },

	// ─── Pipeline (Saudi journey: Ejar + Sakani specific stages) ──────────
	pipeline: {
		name: "Property Pipeline (Saudi)",
		stages: [
			{ name: "New Inquiry", code: "NEW", color: "#3b82f6", staleAfterDays: 3 },
			{ name: "Viewing", code: "VIEW", color: "#8b5cf6", staleAfterDays: 5 },
			{ name: "Offer", code: "OFR", color: "#f59e0b", staleAfterDays: 5 },
			{ name: "Ejar Registration", code: "EJAR", color: "#f97316", staleAfterDays: 7 },
			{ name: "Sakani Verification", code: "SAKANI", color: "#10b981", staleAfterDays: 7 },
			{ name: "Handover", code: "HO", color: "#06b6d4", staleAfterDays: 5 },
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

	// ─── Field definitions ────────────────────────────────────────────────
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
					"Riyadh - Olaya",
					"Riyadh - Diplomatic Quarter",
					"Riyadh - Al Malqa",
					"Riyadh - Hittin",
					"Jeddah - Al Hamra",
					"Jeddah - Al Shati",
					"Jeddah - Al Rawdah",
					"Dammam - Al Faisaliah",
					"Al Khobar - Corniche",
					"Mecca - Al Aziziyah",
					"Medina - Al Haram",
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
				name: "budget_sar",
				label: "Budget (SAR)",
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
				options: ["Arabic", "English", "Urdu", "Other"],
			},
			{
				entityType: "contact",
				name: "iqama_number",
				label: "Iqama / National ID",
				labelAr: "رقم الإقامة / الهوية الوطنية",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Documents",
				sensitive: true,
			},
		],
		company: [
			{
				entityType: "company",
				name: "rega_license",
				label: "REGA License No.",
				labelAr: "رقم رخصة REGA",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				required: true,
			},
			{
				entityType: "company",
				name: "commercial_registration",
				label: "Commercial Registration",
				labelAr: "السجل التجاري",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
			},
		],
		deal: [
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
				name: "asking_price_sar",
				label: "Asking Price (SAR)",
				labelAr: "السعر المطلوب",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "deal",
				name: "agreed_price_sar",
				label: "Agreed Price (SAR)",
				labelAr: "السعر المتفق عليه",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["OFR", "EJAR", "SAKANI", "HO", "WON"],
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
				showInStages: ["OFR", "EJAR", "SAKANI", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "ejar_contract_number",
				label: "Ejar Contract No.",
				labelAr: "رقم عقد إيجار",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["EJAR", "SAKANI", "HO", "WON"],
			},
			{
				entityType: "deal",
				name: "sakani_reference",
				label: "Sakani Reference",
				labelAr: "مرجع سكني",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Compliance",
				showInStages: ["SAKANI", "HO", "WON"],
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
				showInStages: ["EJAR", "SAKANI", "HO", "WON"],
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
				showInStages: ["EJAR", "SAKANI", "HO", "WON"],
			},
		],
	},

	// ─── Modules slot map ─────────────────────────────────────────────────
	modules: [
		{
			slot: "lead",
			order: 0,
			defaultView: "board",
			cardFields: ["displayName", "phone", "preferred_area", "budget_sar", "assignedTo"],
			listColumns: [
				"displayName",
				"personCode",
				"phone",
				"preferred_area",
				"budget_sar",
				"intent",
				"assignedTo",
				"status",
			],
			boardGroupBy: "status",
		},
		{
			slot: "contact",
			order: 1,
			defaultView: "board",
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
				"agreed_price_sar",
				"assignedTo",
				"expectedCloseDate",
			],
			listColumns: [
				"dealCode",
				"title",
				"property_address",
				"agreed_price_sar",
				"currentStageId",
				"assignedTo",
			],
			boardGroupBy: "currentStageId",
		},
		{
			slot: "company",
			order: 3,
			defaultView: "board",
			cardFields: ["name", "rega_license"],
			listColumns: ["name", "companyCode", "rega_license", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
	],

	// ─── Note categories (semantic, standardized) ─────────────────────────
	noteCategories: [
		{ name: "Urgent", bgColor: "#fecaca", isDefault: false, position: 0 },
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 1 },
		{ name: "Hot Inquiry", bgColor: "#fed7aa", isDefault: false, position: 2 },
		{ name: "Documents Pending", bgColor: "#bae6fd", isDefault: false, position: 3 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 4 },
	],

	// ─── Tags ─────────────────────────────────────────────────────────────
	tags: [
		{ name: "Hot inquiry", color: "#ef4444" },
		{ name: "Cash buyer", color: "#22c55e" },
		{ name: "Mortgage required", color: "#3b82f6" },
		{ name: "Off-plan", color: "#a855f7" },
		{ name: "Ejar pending", color: "#f97316" },
		{ name: "Sakani pending", color: "#eab308" },
		{ name: "VIP client", color: "#ec4899" },
		{ name: "Renewal upcoming", color: "#06b6d4" },
	],

	// ─── Reminder defaults (Saudi-specific 30-day rent renewal) ───────────
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
		"You are a Saudi real-estate operations assistant. You understand Ejar (REGA's mandatory tenancy contract registration via momah.gov.sa for every rental agreement), Sakani (the Ministry of Housing's home-buyer assistance programme at sakani.sa for subsidised mortgages and government developments), Iqama / National ID requirements at documentation, and the standard 1-year lease cycle in Saudi Arabia with 30-day renewal notice. Use SAR for all values. Areas to recognise without translation: Riyadh (Olaya, Diplomatic Quarter, Al Malqa, Hittin), Jeddah (Al Hamra, Al Shati, Al Rawdah), Dammam, Al Khobar, Mecca, Medina. Refer to leads as 'inquiries', contacts as 'clients', deals as 'listings', companies as 'agencies'. Always confirm before destructive actions.",

	// ─── Dashboard widgets (ranked) ────────────────────────────────────────
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
		"deals.renewingIn30Days",
		"pipeline.salesPanel",
	],

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
				"tasks.view",
				"tasks.create",
				"tasks.manage",
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
				"tasks.view",
				"tasks.create",
				"tasks.manage",
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
			name: "Pending Ejar",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "EJAR" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Pending Sakani",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "SAKANI" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Renewing in 30 days",
			scope: "org",
			isPinned: true,
			filters: JSON.stringify({ stage: "WON", leaseExpiryWithin: "30d" }),
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

	// ─── Mock data (Phase 3A — deletable sample records) ──────────────
	// Lives in ../mockData/real_estate_saudi.ts so this file stays focused on
	// the structural template (pipelines, fields, modules, etc.).
	mockData: realEstateSaudiMockData,
};
