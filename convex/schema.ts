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
		platformRole: v.optional(v.literal("super_admin")),
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
		settings: v.optional(
			v.object({
				defaultCurrency: v.optional(v.string()),
				timezone: v.optional(v.string()),
				codePrefixes: v.optional(v.any()), // { person: "P", deal: "D", company: "CO", ... }
				modules: v.optional(v.any()), // ModuleConfig[] — workspace navigation config
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
	orgMembers: defineTable({
		...orgScoped,
		userId: v.id("users"),
		// Phase 1 RBAC refactor: roleId will become required, role will be removed
		roleId: v.optional(v.id("orgRoles")), // FK to orgRoles — dynamic role system
		role: v.optional(v.union(
			v.literal("owner"),
			v.literal("admin"),
			v.literal("member"),
			v.literal("viewer"),
		)),
		permissions: v.optional(v.array(v.string())),
		invitedBy: v.optional(v.id("users")),
		joinedAt: v.number(),
		updatedAt: v.optional(v.number()),
		...softDelete,
	})
		.index("by_orgId_and_userId", ["orgId", "userId"])
		.index("by_userId", ["userId"])
		.index("by_orgId_and_role", ["orgId", "role"]),

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
		description: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
		createdAt: v.number(),
	})
		.index("by_orgId_and_createdAt", ["orgId", "createdAt"])
		.index("by_entityType_and_entityId", ["entityType", "entityId"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"])
		.index("by_orgId_and_actorType_and_createdAt", ["orgId", "actorType", "createdAt"]),

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
});
