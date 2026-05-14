/**
 * Convex Schema — FlowBite B2B SaaS
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts
 * - https://github.com/dbjpanda/convex-tenants
 * - .github/agents/base/schema.md (project-specific design)
 */
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared field groups (mirrors convex/_shared/validators.ts) ───────────────
const orgScoped = { orgId: v.id("orgs") };
const timestamps = { createdAt: v.number(), updatedAt: v.number() };
const softDelete = { deletedAt: v.optional(v.number()) };

// Typed aiContext — replaces v.any() for AI-written fields
const aiContextValidator = v.optional(
	v.object({
		summary: v.optional(v.string()),
		keyFacts: v.optional(v.array(v.string())),
		lastUpdatedAt: v.optional(v.number()),
		rawNotes: v.optional(v.string()),
	}),
);

export default defineSchema({
	// ── Convex Auth managed tables (DO NOT TOUCH) ────────────────────────────
	...authTables,

	// ── users ────────────────────────────────────────────────────────────────
	// App-level user profile. Separate from authTables which handles credentials.
	users: defineTable({
		tokenIdentifier: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
		avatarStorageId: v.optional(v.id("_storage")),
		defaultOrgId: v.optional(v.id("orgs")),
		locale: v.optional(v.string()),
		timezone: v.optional(v.string()),
		onboardingCompleted: v.boolean(),
		lastActiveAt: v.optional(v.number()),
		dismissedCards: v.optional(v.array(v.string())),
		preferredLanguage: v.optional(v.string()),
		notificationPreferences: v.optional(
			v.object({
				// Group: CRM
				lead_assigned: v.optional(v.boolean()),
				lead_converted: v.optional(v.boolean()),
				contact_assigned: v.optional(v.boolean()),
				deal_assigned: v.optional(v.boolean()),
				deal_stage_changed: v.optional(v.boolean()),
				deal_won: v.optional(v.boolean()),
				deal_stale: v.optional(v.boolean()),
				// Group: Reminders
				reminder_due: v.optional(v.boolean()),
				reminder_overdue: v.optional(v.boolean()),
				// Group: AI
				ai_action_completed: v.optional(v.boolean()),
				ai_workspace_setup: v.optional(v.boolean()),
				// Group: Team
				member_invited: v.optional(v.boolean()),
				member_joined: v.optional(v.boolean()),
				role_changed: v.optional(v.boolean()),
				// Group: System
				billing_trial_ending: v.optional(v.boolean()),
				billing_suspended: v.optional(v.boolean()),
				csv_import_complete: v.optional(v.boolean()),
				csv_import_failed: v.optional(v.boolean()),
			}),
		),
		platformRole: v.optional(v.literal("super_admin")),
		preferences: v.optional(
			v.object({
				entityDefaultView: v.optional(
					v.record(v.string(), v.union(v.literal("list"), v.literal("board"))),
				),
			}),
		),
		...timestamps,
		...softDelete,
	})
		.index("by_tokenIdentifier", ["tokenIdentifier"])
		.index("by_email", ["email"]),

	// ── orgs ─────────────────────────────────────────────────────────────────
	// Multi-tenant root. Every downstream row has orgId.
	orgs: defineTable({
		name: v.string(),
		slug: v.string(),
		logoStorageId: v.optional(v.id("_storage")),
		platformOrgId: v.optional(v.string()), // "ORB-001" — set on org creation
		plan: v.union(
			v.literal("free"),
			v.literal("starter"),
			v.literal("pro"),
			v.literal("enterprise"),
		),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		aiContext: v.optional(v.string()),
		industry: v.optional(v.string()), // e.g. "real-estate", "technology" — set during onboarding
		teamSize: v.optional(v.string()), // e.g. "1–5", "6–20" — set during onboarding
		onboardingStep: v.optional(v.number()), // 0=org-created, 1=industry-set, 2=complete
		entityLabels: v.optional(
			v.object({
				// Each slot: singular label, plural label, URL slug
				// Defaults: lead/leads/leads, contact/contacts/contacts, deal/deals/deals, company/companies/companies
				lead: v.optional(
					v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
				),
				contact: v.optional(
					v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
				),
				deal: v.optional(
					v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
				),
				company: v.optional(
					v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
				),
			}),
		),
		settings: v.optional(
			v.object({
				defaultCurrency: v.optional(v.string()),
				timezone: v.optional(v.string()),
				leadStaleAfterDays: v.optional(v.number()), // staleness for leads (no pipeline stages)
				badgeCountsVisible: v.optional(v.boolean()), // show/hide nav badge counts
				codePrefixes: v.optional(
					v.object({
						person: v.optional(v.string()),
						deal: v.optional(v.string()),
						company: v.optional(v.string()),
						followup: v.optional(v.string()),
					}),
				),
				modules: v.optional(
					v.array(
						v.object({
							slot: v.string(),
							label: v.optional(v.string()),
							hidden: v.optional(v.boolean()),
							order: v.optional(v.number()),
							defaultView: v.optional(v.union(v.literal("list"), v.literal("board"))),
							cardFields: v.optional(v.array(v.string())),
							listColumns: v.optional(v.array(v.string())),
							boardGroupBy: v.optional(v.string()),
							defaultFilters: v.optional(v.array(v.string())),
							meta: v.optional(v.any()),
						}),
					),
				),
				reminderDefaults: v.optional(
					v.object({
						followUpWindowHours: v.optional(v.number()), // auto-suggest follow-up after N hours
						staleAlertDays: v.optional(v.number()), // mark deal as stale after N days
						morningBriefingEnabled: v.optional(v.boolean()),
						morningBriefingTime: v.optional(v.string()), // "09:00"
						rentAlertDays: v.optional(v.number()), // 95-day renewal alert (Dubai RE)
						rentAlertEnabled: v.optional(v.boolean()),
					}),
				),
			}),
		),
		...timestamps,
		...softDelete,
	})
		.index("by_slug", ["slug"])
		.index("by_stripeCustomerId", ["stripeCustomerId"]),

	// ── orgRoles ─────────────────────────────────────────────────────────────
	// Dynamic roles per org. Seeded with Owner/Admin/Member on org creation.
	orgRoles: defineTable({
		...orgScoped,
		name: v.string(), // "Owner", "Admin", "Member", or custom
		description: v.optional(v.string()),
		permissions: v.array(v.string()), // ["leads.create", "deals.view", ...]
		isSystem: v.boolean(), // true = cannot be deleted (Owner, Admin, Member)
		isDefault: v.boolean(), // true = assigned to new members by default
		color: v.optional(v.string()),
		...timestamps,
	})
		.index("by_orgId", ["orgId"])
		.index("by_orgId_and_name", ["orgId", "name"]),

	// ── orgMembers ───────────────────────────────────────────────────────────
	// Maps users → orgs with role. One row per user-org pair.
	// roleId is the sole source of truth. Role name is resolved at runtime by
	// requireOrgMember() / getOrgMember() — never stored on this document.
	orgMembers: defineTable({
		...orgScoped,
		userId: v.id("users"),
		roleId: v.id("orgRoles"), // FK to orgRoles — sole source of truth
		permissions: v.optional(v.array(v.string())),
		invitedBy: v.optional(v.id("users")),
		joinedAt: v.number(),
		updatedAt: v.optional(v.number()),
		...softDelete,
	})
		.index("by_orgId_and_userId", ["orgId", "userId"])
		.index("by_userId", ["userId"]),

	// ── invitations ──────────────────────────────────────────────────────────
	// Pending invitations to join an org. Token-based for email links.
	invitations: defineTable({
		...orgScoped,
		email: v.string(),
		role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
		status: v.union(
			v.literal("pending"),
			v.literal("accepted"),
			v.literal("declined"),
			v.literal("expired"),
		),
		invitedBy: v.id("users"),
		token: v.string(), // UUID sent in email link
		expiresAt: v.number(),
		...timestamps,
	})
		.index("by_orgId_and_email", ["orgId", "email"])
		.index("by_token", ["token"])
		.index("by_orgId_and_status", ["orgId", "status"]),

	// ── notifications ────────────────────────────────────────────────────────
	// In-app notifications for users. Generic — fed by feature mutations.
	notifications: defineTable({
		...orgScoped,
		userId: v.id("users"), // recipient
		type: v.string(), // "connection.created", "member.invited"
		title: v.string(),
		body: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		actionUrl: v.optional(v.string()),
		read: v.boolean(),
		readAt: v.optional(v.number()),
		archivedAt: v.optional(v.number()),
		metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
		...timestamps,
	})
		.index("by_userId_and_read", ["userId", "read"])
		.index("by_orgId_and_userId", ["orgId", "userId"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"]),

	// ── activityLogs ─────────────────────────────────────────────────────────
	// Audit trail for all mutations. Always call logActivity() after mutations.
	//
	// actorType enables unified timeline to distinguish AI vs human vs integration actions.
	// userId is ALWAYS required — actorType clarifies the medium, not the identity.
	// For AI actions: userId = user who triggered the conversation, actorType = "ai".
	// Email content belongs in a dedicated emailMessages table (Phase 4).
	// Ref: .github/agents/base/schema.md — activityLogs + actorType design note
	activityLogs: defineTable({
		...orgScoped,
		userId: v.id("users"), // actor identity (always a user, even for AI/integration)
		actorType: v.union(
			v.literal("user"),
			v.literal("ai"),
			v.literal("integration"),
			v.literal("system"),
		),
		action: v.string(), // "created", "updated", "deleted", "qualified", "stage_changed"
		entityType: v.string(), // from ENTITY_TYPES constants
		entityId: v.string(),
		personCode: v.optional(v.string()), // denormalized for timeline queries — P-001
		description: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
		createdAt: v.number(),
	})
		.index("by_orgId_and_createdAt", ["orgId", "createdAt"])
		.index("by_entityType_and_entityId", ["entityType", "entityId"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"])
		.index("by_orgId_and_actorType_and_createdAt", ["orgId", "actorType", "createdAt"])
		.index("by_org_and_personCode", ["orgId", "personCode"]),

	// ── pipelines ────────────────────────────────────────────────────────────
	// Deal pipelines with inline stages. Seeded on industry selection.
	pipelines: defineTable({
		...orgScoped,
		name: v.string(),
		entityType: v.string(), // "deal" only for now
		isDefault: v.boolean(),
		stages: v.array(
			v.object({
				id: v.string(),
				name: v.string(),
				order: v.number(),
				color: v.optional(v.string()),
				isFinal: v.optional(v.boolean()),
				finalType: v.optional(
					v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
				),
				staleAfterDays: v.optional(v.number()),
				staleColor: v.optional(v.string()), // hex color for stale indicator
				warningAfterDays: v.optional(v.number()), // days before stale to show warning
				warningColor: v.optional(v.string()), // hex color for warning indicator
			}),
		),
		...timestamps,
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_entity", ["orgId", "entityType"])
		.index("by_org_and_default", ["orgId", "isDefault"]),

	// ── entityCodeCounters ───────────────────────────────────────────────────
	// Per-org, per-type atomic counters for personCode, dealCode, etc.
	entityCodeCounters: defineTable({
		orgId: v.id("orgs"),
		entityType: v.string(), // "person" | "deal" | "company" | "followup" | "project" | "task"
		count: v.number(),
		createdAt: v.number(),
	}).index("by_org_and_type", ["orgId", "entityType"]),

	// ── orbitLinks ────────────────────────────────────────────────────────────
	// Universal junction table for lateral connections between entities.
	// personCode handles vertical (everything → person). orbitLinks handles lateral.
	// Examples: deal ↔ company, contact ↔ whatsapp thread, document ↔ contact.
	orbitLinks: defineTable({
		orgId: v.id("orgs"),
		fromCode: v.string(), // "P-001" | "D-007" | "CO-003"
		fromType: v.string(), // "lead" | "contact" | "deal" | "company"
		toCode: v.string(), // target entity code or system ID
		toType: v.string(), // "contact" | "deal" | "company" | "whatsapp_msg" | "document"
		linkType: v.string(), // "converted_to" | "has_deal" | "works_at" | "whatsapp_thread" | "has_document"
		metadata: v.optional(v.any()),
		createdAt: v.number(),
		createdBy: v.optional(v.id("users")),
	})
		.index("by_org_and_from", ["orgId", "fromCode"])
		.index("by_org_and_to", ["orgId", "toCode"])
		.index("by_org_and_type", ["orgId", "linkType"]),

	// ── platformTemplates ─────────────────────────────────────────────────────
	// Industry templates stored in DB — not TypeScript config files.
	// Platform_admin creates/edits from admin UI. AI can generate templates.
	// Org owners can customize after seeding.
	platformTemplates: defineTable({
		key: v.string(), // "dubai_re" | "b2b_sales" | "freelancer"
		name: v.string(),
		description: v.string(),
		isBuiltIn: v.boolean(), // true = created by platform_admin
		entityLabels: v.optional(v.any()), // { lead: { singular: "Inquiry", plural: "Inquiries" } }
		entityVisibility: v.optional(v.any()), // { company: true, entity5: false }
		codePrefixDefaults: v.optional(v.any()), // { person: "IN", deal: "D" }
		defaultPipelineName: v.string(),
		defaultStages: v.array(v.any()), // [{ id, name, order, color, isFinal, finalType, staleAfterDays }]
		defaultFieldDefinitions: v.optional(v.array(v.any())),
		defaultReminderSettings: v.optional(
			v.object({
				followUpWindowHours: v.optional(v.number()),
				staleAlertDays: v.optional(v.number()),
				morningBriefingEnabled: v.optional(v.boolean()),
				rentAlertEnabled: v.optional(v.boolean()),
				rentAlertDays: v.optional(v.number()),
			}),
		),
		dashboardMetrics: v.optional(v.array(v.string())),
		aiPersona: v.optional(v.string()),
		navHiddenSlots: v.optional(v.array(v.string())),
		createdBy: v.optional(v.id("users")),
		...timestamps,
	})
		.index("by_key", ["key"])
		.index("by_builtin", ["isBuiltIn"]),

	// ── featureFlags ─────────────────────────────────────────────────────────
	// Kill-switch / rollout flags. Checked via useFeatureFlag() hook.
	featureFlags: defineTable({
		key: v.string(), // "connections.kanban_view"
		enabled: v.boolean(),
		rolloutPercent: v.optional(v.number()),
		orgOverrides: v.optional(v.record(v.string(), v.boolean())),
		description: v.optional(v.string()),
		...timestamps,
	}).index("by_key", ["key"]),

	// ── fieldDefinitions ─────────────────────────────────────────────────────
	// Admin-defined custom fields per entity type. AI reads these to know what fields exist.
	fieldDefinitions: defineTable({
		...orgScoped,
		entityType: v.string(), // "lead" | "contact" | "company" | "deal"
		name: v.string(), // internal: "budget", "tech_stack"
		label: v.string(), // display: "Budget", "Tech Stack"
		labelAr: v.optional(v.string()),
		type: v.string(), // "text"|"number"|"select"|"multiselect"|"date"|"boolean"|"url"|"email"|"relation"|"file"
		options: v.optional(v.array(v.string())),
		required: v.boolean(),
		order: v.number(),
		groupName: v.optional(v.string()),
		sensitive: v.optional(v.boolean()),
		defaultValue: v.optional(v.any()),
		showInStages: v.optional(v.array(v.string())),
		...timestamps,
	}).index("by_org_and_entity", ["orgId", "entityType"]),

	// ── fieldValues ──────────────────────────────────────────────────────────
	// Actual data per record. One row per field per entity.
	fieldValues: defineTable({
		...orgScoped,
		entityType: v.string(),
		entityId: v.string(),
		fieldId: v.id("fieldDefinitions"),
		fieldName: v.string(), // denormalized for fast lookup
		value: v.any(),
		updatedAt: v.number(),
	})
		.index("by_entity", ["orgId", "entityType", "entityId"])
		.index("by_field", ["orgId", "fieldId"]),

	// ── leads ────────────────────────────────────────────────────────────────
	// Entry point for every person. personCode generated HERE only.
	leads: defineTable({
		...orgScoped,
		personCode: v.string(), // "P-001" — generated on create, NEVER regenerated
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		normalizedPhone: v.optional(v.string()), // digits only — for dedup index lookup
		status: v.string(), // "new"|"contacted"|"qualified"|"converted"|"lost"
		source: v.string(), // "manual"|"ai"|"csv"|"whatsapp"|"gmail"|"zapier"|"rest_api"
		assignedTo: v.optional(v.id("users")),
		convertedAt: v.optional(v.number()),
		contactId: v.optional(v.id("contacts")), // set on conversion
		aiContext: aiContextValidator,
		...timestamps,
		...softDelete,
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_status", ["orgId", "status"])
		.index("by_org_and_assignee", ["orgId", "assignedTo"])
		.index("by_org_and_personCode", ["orgId", "personCode"])
		.index("by_org_and_email", ["orgId", "email"])
		.index("by_org_and_normalizedPhone", ["orgId", "normalizedPhone"])
		.searchIndex("search_leads_displayName", {
			searchField: "displayName",
			filterFields: ["orgId"],
		}),

	// ── contacts ─────────────────────────────────────────────────────────────
	// Qualified leads promoted to contacts. personCode PASSED from lead.
	contacts: defineTable({
		...orgScoped,
		personCode: v.string(), // passed from lead OR generated if direct create
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		normalizedPhone: v.optional(v.string()), // digits only — for dedup index lookup
		leadId: v.optional(v.id("leads")), // traceability
		companyId: v.optional(v.id("companies")),
		companyCode: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		aiContext: aiContextValidator, // passed from lead on conversion, never recreated
		...timestamps,
		...softDelete,
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_personCode", ["orgId", "personCode"])
		.index("by_org_and_company", ["orgId", "companyId"])
		.index("by_org_and_assignee", ["orgId", "assignedTo"])
		.index("by_org_and_email", ["orgId", "email"])
		.index("by_org_and_normalizedPhone", ["orgId", "normalizedPhone"])
		.searchIndex("search_contacts_displayName", {
			searchField: "displayName",
			filterFields: ["orgId"],
		}),

	// ── companies ────────────────────────────────────────────────────────────
	// B2B company entity. companyCode auto-generated (CO-001).
	//
	// CANONICAL MODEL (2026-05): people belong to a company via
	// `companies.personCodes[]` — a single source of truth that works for both
	// leads and contacts (both share a personCode). The `teamMembers` +
	// `contacts.companyId` / `deals.companyId` fields are kept only for
	// back-compat while the UI finishes migrating to personCodes.
	companies: defineTable({
		...orgScoped,
		companyCode: v.string(), // "CO-001" — auto-generated
		name: v.string(),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		size: v.optional(v.string()), // "1-10"|"11-50"|"51-200"|"201-1000"|"1000+"
		/** Primary assignee — kept for back-compat / notifications routing. */
		assignedTo: v.optional(v.id("users")),
		/**
		 * Multi-assignee team — 2–3 members that jointly manage this company.
		 * Replaces the older `teamMembers` concept.
		 */
		assignees: v.optional(v.array(v.id("users"))),
		/**
		 * People (leads or contacts) attached to this company. Canonical join.
		 * Any personCode listed here treats the company as their employer.
		 */
		personCodes: v.optional(v.array(v.string())),
		/** @deprecated — use `assignees` instead. */
		teamMembers: v.optional(v.array(v.id("users"))),
		aiContext: aiContextValidator,
		...timestamps,
		...softDelete,
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_companyCode", ["orgId", "companyCode"])
		.index("by_org_and_assignee", ["orgId", "assignedTo"])
		.searchIndex("search_companies_name", {
			searchField: "name",
			filterFields: ["orgId"],
		}),

	// ── deals ────────────────────────────────────────────────────────────────
	// Opportunities in pipeline. dealCode auto-generated (D-001).
	deals: defineTable({
		...orgScoped,
		dealCode: v.string(), // "D-001" — auto-generated
		personCode: v.optional(v.string()), // links to person
		companyCode: v.optional(v.string()), // links to company
		title: v.string(),
		value: v.optional(v.number()),
		currency: v.optional(v.string()), // "AED"|"USD"
		pipelineId: v.id("pipelines"),
		currentStageId: v.string(), // stage.id from pipeline.stages[]
		stageEnteredAt: v.number(), // for staleness calculation
		contactId: v.optional(v.id("contacts")),
		companyId: v.optional(v.id("companies")),
		assignedTo: v.optional(v.id("users")),
		source: v.string(),
		wonAt: v.optional(v.number()),
		lostAt: v.optional(v.number()),
		outcomeReason: v.optional(v.string()),
		expectedCloseDate: v.optional(v.number()),
		aiContext: aiContextValidator,
		...timestamps,
		...softDelete,
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_pipeline", ["orgId", "pipelineId"])
		.index("by_org_and_stage", ["orgId", "currentStageId"])
		.index("by_org_and_personCode", ["orgId", "personCode"])
		.index("by_org_and_dealCode", ["orgId", "dealCode"])
		.index("by_org_and_assignee", ["orgId", "assignedTo"])
		.searchIndex("search_deals_title", {
			searchField: "title",
			filterFields: ["orgId"],
		}),

	// ── notes ────────────────────────────────────────────────────────────────
	// Rich text notes attached to any entity. authorType distinguishes user vs AI.
	notes: defineTable({
		...orgScoped,
		entityType: v.string(), // "lead"|"contact"|"company"|"deal"
		entityId: v.string(),
		personCode: v.optional(v.string()), // for cross-entity person linking
		content: v.string(),
		authorId: v.id("users"),
		authorType: v.string(), // "user"|"ai"|"portal_client" — REQUIRED
		isPinned: v.boolean(),
		isInternal: v.boolean(),
		isActivityChat: v.optional(v.boolean()), // true = message (Messages tab), false/undefined = note (Notes tab)
		embedding: v.optional(v.array(v.float64())), // Phase 3: vector embedding for semantic search
		...timestamps,
	})
		.index("by_entity", ["orgId", "entityType", "entityId"])
		.index("by_org_and_author", ["orgId", "authorId"])
		.index("by_org_and_created", ["orgId", "createdAt"])
		.vectorIndex("by_embedding", {
			vectorField: "embedding",
			dimensions: 1536, // OpenAI text-embedding-3-small
			filterFields: ["orgId"],
		}),

	// ── reminders ────────────────────────────────────────────────────────────
	// Follow-up reminders. followUpCode auto-generated (FU-001).
	reminders: defineTable({
		...orgScoped,
		followUpCode: v.string(), // "FU-001" — auto-generated
		personCode: v.string(), // REQUIRED — always linked to a person
		dealCode: v.optional(v.string()),
		entityType: v.string(),
		entityId: v.string(),
		title: v.string(),
		note: v.optional(v.string()),
		dueAt: v.number(),
		assignedTo: v.id("users"),
		status: v.string(), // "pending"|"completed"|"overdue"
		completedAt: v.optional(v.number()),
		source: v.string(), // "manual"|"ai"|"automation"
		createdAt: v.number(),
	})
		.index("by_org_and_person", ["orgId", "personCode"])
		.index("by_org_and_due", ["orgId", "dueAt"])
		.index("by_org_and_status", ["orgId", "status"])
		.index("by_user_and_due", ["assignedTo", "dueAt"]),

	// ── tags ─────────────────────────────────────────────────────────────────
	// Org-wide tag definitions.
	tags: defineTable({
		...orgScoped,
		name: v.string(),
		color: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_and_name", ["orgId", "name"]),

	// ── entityTags ───────────────────────────────────────────────────────────
	// Junction table linking tags to any entity.
	entityTags: defineTable({
		...orgScoped,
		tagId: v.id("tags"),
		entityType: v.string(),
		entityId: v.string(),
		createdAt: v.number(),
	})
		.index("by_entity", ["orgId", "entityType", "entityId"])
		.index("by_tag", ["orgId", "tagId"]),

	// ── savedViews ───────────────────────────────────────────────────────────
	// Filter presets pinnable to sidebar. scope: "user" (personal) | "org" (shared).
	savedViews: defineTable({
		...orgScoped,
		name: v.string(),
		entityType: v.string(), // "lead"|"contact"|"deal"|"company"
		scope: v.string(), // "user" | "org"
		filters: v.string(), // JSON-serialized filter config
		sortBy: v.optional(v.string()),
		sortOrder: v.optional(v.string()), // "asc" | "desc"
		columns: v.optional(v.array(v.string())),
		isPinned: v.boolean(),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org_and_entity", ["orgId", "entityType"])
		.index("by_org_and_creator", ["orgId", "createdBy"])
		.index("by_org_and_pinned", ["orgId", "isPinned"]),

	// ── aiConversations ──────────────────────────────────────────────────────
	// Phase 3: AI chat panel conversations. One per user per org (or per entity context).
	aiConversations: defineTable({
		...orgScoped,
		userId: v.id("users"),
		title: v.optional(v.string()),
		entityType: v.optional(v.string()), // context: "lead"|"contact"|"deal" or null for general
		entityId: v.optional(v.string()),
		personCode: v.optional(v.string()),
		status: v.string(), // "active"|"archived"
		...timestamps,
	})
		.index("by_org_and_user", ["orgId", "userId"])
		.index("by_org_and_entity", ["orgId", "entityType", "entityId"]),

	// ── aiMessages ───────────────────────────────────────────────────────────
	// Phase 3: Individual messages in an AI conversation.
	aiMessages: defineTable({
		...orgScoped,
		conversationId: v.id("aiConversations"),
		role: v.union(
			v.literal("user"),
			v.literal("assistant"),
			v.literal("system"),
			v.literal("tool"),
		),
		content: v.string(),
		toolCalls: v.optional(v.any()), // Phase 3: structured tool call results
		tokenCount: v.optional(v.number()),
		createdAt: v.number(),
	}).index("by_conversation", ["conversationId", "createdAt"]),

	// ── files ────────────────────────────────────────────────────────────────
	// Universal attachment table. Works for every entity in the app:
	//   - `scope`    — namespace the attachment lives in ("lead", "contact",
	//                  "deal", "company", "user", "org", or any custom slot).
	//   - `scopeId`  — the record id inside that scope (e.g. a leadId). For the
	//                  "org" scope this is just the orgId itself. For "user"
	//                  this is the userId.
	//   - `fieldKey` — optional hint for dynamic-field attachments so we can
	//                  route file pickers to the right field (e.g. a custom
	//                  "contract" file field vs free-form attachments).
	// storageId is the Convex File Storage id — actual bytes live there.
	files: defineTable({
		...orgScoped,
		storageId: v.id("_storage"),
		scope: v.string(),
		scopeId: v.string(),
		fieldKey: v.optional(v.string()),
		name: v.string(), // original filename (user-visible)
		size: v.number(), // bytes
		mimeType: v.string(), // e.g. "application/pdf"
		uploadedBy: v.id("users"),
		...timestamps,
		...softDelete,
	})
		.index("by_org_and_scope", ["orgId", "scope", "scopeId"])
		.index("by_org_scope_field", ["orgId", "scope", "scopeId", "fieldKey"])
		.index("by_storageId", ["storageId"])
		.index("by_uploader", ["orgId", "uploadedBy"]),
});
