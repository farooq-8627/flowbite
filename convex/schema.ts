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
	// Pattern ref: https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts
	users: defineTable({
		tokenIdentifier: v.string(), // links to @convex-dev/auth createOrUpdateUser callback
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
		avatarStorageId: v.optional(v.id("_storage")),
		defaultOrgId: v.optional(v.id("orgs")),
		locale: v.optional(v.string()),
		timezone: v.optional(v.string()),
		onboardingCompleted: v.boolean(),
		lastActiveAt: v.optional(v.number()),
		// Platform role — only super_admin is elevated. Absent = regular user.
		// Super admin controls orgs from OUTSIDE — cannot enter/operate within orgs.
		// Ref: .github/agents/base/rbac.md — Platform Roles
		platformRole: v.optional(v.literal("super_admin")),
		...timestamps,
		...softDelete,
	})
		.index("by_tokenIdentifier", ["tokenIdentifier"])
		.index("by_email", ["email"]),

	// ── orgs ─────────────────────────────────────────────────────────────────
	// Multi-tenant root. Every downstream row has orgId.
	// Pattern ref: https://github.com/dbjpanda/convex-tenants
	orgs: defineTable({
		name: v.string(),
		slug: v.string(), // URL-safe unique identifier
		logoStorageId: v.optional(v.id("_storage")),
		plan: v.union(
			v.literal("free"),
			v.literal("starter"),
			v.literal("pro"),
			v.literal("enterprise"),
		),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		settings: v.optional(
			v.object({
				defaultCurrency: v.optional(v.string()),
				timezone: v.optional(v.string()),
			}),
		),
		...timestamps,
		...softDelete,
	})
		.index("by_slug", ["slug"])
		.index("by_stripeCustomerId", ["stripeCustomerId"]),

	// ── orgMembers ───────────────────────────────────────────────────────────
	// Maps users → orgs with role. One row per user-org pair.
	// Pattern ref: https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
	orgMembers: defineTable({
		...orgScoped,
		userId: v.id("users"),
		role: v.union(
			v.literal("owner"),
			v.literal("admin"),
			v.literal("member"),
			v.literal("viewer"),
		),
		permissions: v.optional(v.array(v.string())), // fine-grained overrides
		invitedBy: v.optional(v.id("users")),
		joinedAt: v.number(),
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
		metadata: v.optional(v.any()),
		...timestamps,
	})
		.index("by_userId_and_read", ["userId", "read"])
		.index("by_orgId_and_userId", ["orgId", "userId"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"]),

	// ── activityLogs ─────────────────────────────────────────────────────────
	// Audit trail for all mutations. Always call logActivity() after mutations.
	activityLogs: defineTable({
		...orgScoped,
		userId: v.id("users"), // actor
		action: v.string(), // "created", "updated", "deleted"
		entityType: v.string(), // "connection", "invoice"
		entityId: v.string(),
		description: v.optional(v.string()),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
	})
		.index("by_orgId_and_createdAt", ["orgId", "createdAt"])
		.index("by_entityType_and_entityId", ["entityType", "entityId"])
		.index("by_userId_and_createdAt", ["userId", "createdAt"]),

	// ── featureFlags ─────────────────────────────────────────────────────────
	// Kill-switch / rollout flags. Checked via useFeatureFlag() hook.
	featureFlags: defineTable({
		key: v.string(), // "connections.kanban_view"
		enabled: v.boolean(),
		rolloutPercent: v.optional(v.number()),
		orgOverrides: v.optional(v.any()),
		description: v.optional(v.string()),
		...timestamps,
	}).index("by_key", ["key"]),
});
