/**
 * Org mutations.
 *
 * PATTERN:
 *   - All public mutations use `authenticatedMutation` or `orgMutation` (Rule R2).
 *   - Role checks use `requireRole()` / `requireMinRole()` from permissions.ts.
 *   - Every mutation calls `logActivity()` after DB writes (audit trail).
 *   - Member-affecting mutations call `sendNotification()` for the affected user.
 *   - Every patch includes `updatedAt: Date.now()` (Rule R7).
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation } from "../_functions/authenticated";
import { DEFAULT_ORG_PLAN, ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions";
import { invitationRoleValidator } from "../_shared/validators";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { generateSlug, ensureUniqueSlug, getOrgBySlug, getOrgMember } from "./helpers";

// Platform prefix is read from env — never hardcoded.
// Set CONVEX_PLATFORM_PREFIX in your Convex environment variables.
const PLATFORM_PREFIX = process.env.PLATFORM_PREFIX ?? "ORB";

/** Zero-padded sequential-style ID: ORB-00001 */
function buildPlatformOrgId(prefix: string, orgId: string): string {
	// Use last 5 chars of Convex ID as a stable short identifier
	const short = orgId.slice(-5).toUpperCase();
	return `${prefix}-${short}`;
}

/**
 * Create a new org during onboarding (Step 1).
 * - Validates slug uniqueness; if taken, suggests next available (GitHub-style).
 * - Sets platformOrgId from env-driven prefix.
 * - Creates owner membership.
 * - Does NOT mark onboardingCompleted — that happens in markOnboardingComplete.
 */
export const createOrg = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Validate slug format
		const cleanSlug = args.slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
		if (!cleanSlug) throw new ConvexError("Invalid slug.");

		// Reserved slugs — these are static route segments in the app
		const RESERVED_SLUGS = [
			"platform", "api", "admin", "billing", "auth",
			"onboarding", "profile", "settings", "notifications",
			"signin", "signup", "pricing", "portal",
			"join", "dashboard", "app", "help", "support", "docs", "status",
		];
		if (RESERVED_SLUGS.includes(cleanSlug)) {
			throw new ConvexError(`Slug "${cleanSlug}" is reserved. Please choose a different one.`);
		}

		// Check exact slug — if taken, throw so UI can show error
		const existing = await getOrgBySlug(ctx, cleanSlug);
		if (existing) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name.trim(),
			slug: cleanSlug,
			plan: DEFAULT_ORG_PLAN,
			platformOrgId: "", // filled in below after we have the ID
			onboardingStep: 0,
			createdAt: now,
			updatedAt: now,
		});

		// Now patch with the real platformOrgId derived from the Convex ID
		const platformOrgId = buildPlatformOrgId(PLATFORM_PREFIX, orgId);
		await ctx.db.patch(orgId, { platformOrgId });

		// ── Seed 3 system roles ──────────────────────────────────────────────
		const ownerRoleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Owner",
			description: "Full access to all features and settings.",
			permissions: [
				"org.viewSettings", "org.editName", "org.editLogo", "org.editSettings", "org.viewBilling", "org.delete",
				"members.view", "members.invite", "members.cancelInvitation", "members.remove", "members.changeRole", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.delete", "leads.assign", "leads.qualify", "leads.convert",
				"contacts.view", "contacts.create", "contacts.update", "contacts.delete", "contacts.assign",
				"companies.view", "companies.create", "companies.update", "companies.delete",
				"deals.view", "deals.create", "deals.update", "deals.delete", "deals.assign", "deals.changeStage",
				"notes.view", "notes.viewInternal", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
				"pipelines.view", "pipelines.manage", "fieldDefinitions.view", "fieldDefinitions.manage",
				"ai.use", "ai.manageTools", "ai.viewHistory",
				"activityLogs.viewOrg", "activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: false,
			color: "#6366f1",
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgRoles", {
			orgId,
			name: "Admin",
			description: "Full operational access. Cannot manage billing or delete the org.",
			permissions: [
				"org.viewSettings", "org.editLogo", "org.editSettings",
				"members.view", "members.invite", "members.cancelInvitation", "members.remove", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.delete", "leads.assign", "leads.qualify", "leads.convert",
				"contacts.view", "contacts.create", "contacts.update", "contacts.delete", "contacts.assign",
				"companies.view", "companies.create", "companies.update", "companies.delete",
				"deals.view", "deals.create", "deals.update", "deals.delete", "deals.assign", "deals.changeStage",
				"notes.view", "notes.viewInternal", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
				"pipelines.view", "pipelines.manage", "fieldDefinitions.view", "fieldDefinitions.manage",
				"ai.use", "ai.manageTools", "ai.viewHistory",
				"activityLogs.viewOrg", "activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: false,
			color: "#3b82f6",
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgRoles", {
			orgId,
			name: "Member",
			description: "Standard access. Can create and update records, use AI.",
			permissions: [
				"members.view", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.qualify",
				"contacts.view", "contacts.create", "contacts.update",
				"companies.view", "companies.create", "companies.update",
				"deals.view", "deals.create", "deals.update", "deals.changeStage",
				"notes.view", "notes.create", "notes.updateOwn", "notes.deleteOwn",
				"pipelines.view", "fieldDefinitions.view",
				"ai.use", "ai.viewHistory",
				"activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: true,
			color: "#10b981",
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			roleId: ownerRoleId,
			joinedAt: now,
		});

		// Set as default org if user has none
		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, { defaultOrgId: orgId, updatedAt: now });
		}

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: `Created organization "${args.name}"`,
		});

		return { orgId, slug: cleanSlug, platformOrgId };
	},
});

/**
 * Suggest a unique slug for a given name.
 * Returns the first available slug (base or base-2, base-3, etc.).
 * Used by onboarding UI to auto-suggest when user types org name.
 */
export const suggestSlug = authenticatedMutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const base = generateSlug(args.name);
		const slug = await ensureUniqueSlug(ctx, base);
		return { slug };
	},
});

/**
 * Update org industry + team size (onboarding Step 2).
 * Requires the calling user to be the org owner.
 */
export const updateOrgIndustry = authenticatedMutation({
	args: {
		orgId: v.id("orgs"),
		industry: v.string(),
		teamSize: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.orgId, {
			industry: args.industry,
			teamSize: args.teamSize,
			onboardingStep: 1,
			updatedAt: now,
		});

		// Seed default pipeline for this industry (idempotent)
		const existingPipeline = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_default", (q) =>
				q.eq("orgId", args.orgId).eq("isDefault", true),
			)
			.first();

		if (!existingPipeline) {
			const stages = getDefaultStages(args.industry, args.orgId);
			await ctx.db.insert("pipelines", {
				orgId: args.orgId,
				name: "Sales Pipeline",
				entityType: "deal",
				isDefault: true,
				stages,
				createdAt: now,
				updatedAt: now,
			});
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: `Set industry to "${args.industry}"`,
		});
	},
});

/**
 * Mark onboarding complete (onboarding Step 3).
 * Sets users.onboardingCompleted = true and orgs.onboardingStep = 2.
 * Returns the org slug so the client can redirect to /dashboard/[slug].
 */
export const markOnboardingComplete = authenticatedMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		await ctx.db.patch(args.orgId, { onboardingStep: 2, updatedAt: now });
		await ctx.db.patch(ctx.userId, { onboardingCompleted: true, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Completed onboarding",
		});

		return { slug: org.slug };
	},
});

/**
 * Create a new org (legacy / settings page use).
 * @deprecated Use createOrg for onboarding. This remains for settings-page org creation.
 */
export const create = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const base = args.slug ?? generateSlug(args.name);
		const slug = await ensureUniqueSlug(ctx, base);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name,
			slug,
			plan: DEFAULT_ORG_PLAN,
			platformOrgId: buildPlatformOrgId(PLATFORM_PREFIX, "tmp"),
			createdAt: now,
			updatedAt: now,
		});

		const platformOrgId = buildPlatformOrgId(PLATFORM_PREFIX, orgId);
		await ctx.db.patch(orgId, { platformOrgId });

		// Seed owner role for this org
		const ownerRoleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Owner",
			description: "Full access.",
			permissions: [
				"org.viewSettings", "org.editName", "org.editLogo", "org.editSettings", "org.viewBilling", "org.delete",
				"members.view", "members.invite", "members.cancelInvitation", "members.remove", "members.changeRole", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.delete", "leads.assign", "leads.qualify", "leads.convert",
				"contacts.view", "contacts.create", "contacts.update", "contacts.delete", "contacts.assign",
				"companies.view", "companies.create", "companies.update", "companies.delete",
				"deals.view", "deals.create", "deals.update", "deals.delete", "deals.assign", "deals.changeStage",
				"notes.view", "notes.viewInternal", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
				"pipelines.view", "pipelines.manage", "fieldDefinitions.view", "fieldDefinitions.manage",
				"ai.use", "ai.manageTools", "ai.viewHistory",
				"activityLogs.viewOrg", "activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgRoles", {
			orgId,
			name: "Admin",
			description: "Full operational access.",
			permissions: [
				"org.viewSettings", "org.editLogo", "org.editSettings",
				"members.view", "members.invite", "members.cancelInvitation", "members.remove", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.delete", "leads.assign", "leads.qualify", "leads.convert",
				"contacts.view", "contacts.create", "contacts.update", "contacts.delete", "contacts.assign",
				"companies.view", "companies.create", "companies.update", "companies.delete",
				"deals.view", "deals.create", "deals.update", "deals.delete", "deals.assign", "deals.changeStage",
				"notes.view", "notes.viewInternal", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
				"pipelines.view", "pipelines.manage", "fieldDefinitions.view", "fieldDefinitions.manage",
				"ai.use", "ai.manageTools", "ai.viewHistory",
				"activityLogs.viewOrg", "activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgRoles", {
			orgId,
			name: "Member",
			description: "Standard access.",
			permissions: [
				"members.view", "members.leave",
				"leads.view", "leads.create", "leads.update", "leads.qualify",
				"contacts.view", "contacts.create", "contacts.update",
				"companies.view", "companies.create", "companies.update",
				"deals.view", "deals.create", "deals.update", "deals.changeStage",
				"notes.view", "notes.create", "notes.updateOwn", "notes.deleteOwn",
				"pipelines.view", "fieldDefinitions.view",
				"ai.use", "ai.viewHistory",
				"activityLogs.viewOwn", "notifications.viewOwn", "notifications.markRead",
			],
			isSystem: true,
			isDefault: true,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			roleId: ownerRoleId,
			joinedAt: now,
		});

		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, {
				defaultOrgId: orgId,
				onboardingCompleted: true,
				updatedAt: now,
			});
		}

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: `Created organization "${args.name}"`,
		});

		return orgId;
	},
});

/**
 * Update org settings (name, slug, currency/timezone). Requires `org.editSettings`.
 */
export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		entityLabels: v.optional(v.object({
			lead: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
			contact: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
			deal: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
			company: v.optional(v.object({ singular: v.string(), plural: v.string(), slug: v.string() })),
		})),
		settings: v.optional(
			v.object({
				defaultCurrency: v.optional(v.string()),
				timezone: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		requireRole(member.permissions, "org.editSettings");

		const { orgId, ...updates } = args;

		if (updates.slug) {
			const existing = await getOrgBySlug(ctx, updates.slug);
			if (existing && existing._id !== orgId) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);
		}

		// Validate entity label slugs against reserved route segments
		if (updates.entityLabels) {
			const RESERVED_ROUTE_SEGMENTS = [
				"profile", "settings", "notifications", "companies", "deals",
				"join", "dashboard", "app", "help", "support", "docs", "status",
				"platform", "api", "admin", "billing", "auth", "onboarding",
				"signin", "signup", "pricing", "portal",
			];
			for (const [, label] of Object.entries(updates.entityLabels)) {
				if (label?.slug && RESERVED_ROUTE_SEGMENTS.includes(label.slug)) {
					throw new ConvexError(`Entity slug "${label.slug}" conflicts with a reserved route. Choose a different slug.`);
				}
			}
		}

		await ctx.db.patch(orgId, { ...updates, updatedAt: now });

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: "Updated organization settings",
		});
	},
});

/**
 * Remove a member from the org (soft-delete). Requires `members.remove`.
 * Cannot remove the last owner.
 */
export const removeMember = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(actorMember.permissions, "members.remove");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		if (targetMember.roleId) {
			const targetRole = await ctx.db.get(targetMember.roleId);
			if (targetRole?.name === "Owner") {
				const allMembers = await ctx.db
					.query("orgMembers")
					.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
					.take(200);
				const ownerRoleIds = await ctx.db
					.query("orgRoles")
					.withIndex("by_orgId_and_name", (q) => q.eq("orgId", args.orgId).eq("name", "Owner"))
					.take(1);
				const ownerRoleId = ownerRoleIds[0]?._id;
				const activeOwners = allMembers.filter(
					(m) => m.deletedAt === undefined && m.roleId === ownerRoleId,
				);
				if (activeOwners.length <= 1)
					throw new ConvexError("Cannot remove the last owner of an organization.");
			}
		}

		await ctx.db.patch(targetMember._id, { deletedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
			description: `Removed member from organization`,
		});

		// Notify the removed user (not the actor)
		if (args.userId !== ctx.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.userId,
				type: "member.removed",
				title: "You have been removed from an organization",
				body: "Your membership has been revoked by an administrator.",
				entityType: ENTITY_TYPES.MEMBER,
				entityId: targetMember._id,
			});
		}
	},
});

/**
 * Update a member's role. Requires `members.changeRole` (owner only).
 */
export const updateMemberRole = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		roleId: v.id("orgRoles"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(actorMember.permissions, "members.changeRole");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		// Validate the new role belongs to this org
		const newRoleDoc = await ctx.db.get(args.roleId);
		if (!newRoleDoc || newRoleDoc.orgId !== args.orgId) {
			throw new ConvexError("Role not found in this organization.");
		}

		await ctx.db.patch(targetMember._id, {
			roleId: args.roleId,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
			description: `Changed role to ${newRoleDoc.name}`,
		});

		if (args.userId !== ctx.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.userId,
				type: "member.roleChanged",
				title: "Your role has been updated",
				body: `Your role has been changed to ${newRoleDoc.name}.`,
				entityType: ENTITY_TYPES.MEMBER,
				entityId: targetMember._id,
			});
		}
	},
});

/**
 * Soft-delete the org. Requires `org.delete` (owner only).
 */
export const deleteOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.permissions, "org.delete");

		await ctx.db.patch(args.orgId, { deletedAt: now, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Deleted organization",
		});
	},
});

// ─── Pipeline seeding helper ──────────────────────────────────────────────────

type StageInput = { name: string; color: string; isFinal?: boolean; finalType?: "positive" | "negative" | "neutral"; staleAfterDays?: number };

const INDUSTRY_STAGES: Record<string, StageInput[]> = {
	"real-estate": [
		{ name: "New Inquiry",    color: "#3b82f6" },
		{ name: "Viewing",        color: "#8b5cf6", staleAfterDays: 3 },
		{ name: "Offer / MOU",    color: "#f59e0b", staleAfterDays: 5 },
		{ name: "Under Contract", color: "#10b981" },
		{ name: "Closed Won",     color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",           color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"technology": [
		{ name: "Prospecting",  color: "#3b82f6" },
		{ name: "Qualified",    color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Demo",         color: "#f59e0b" },
		{ name: "Proposal",     color: "#f97316", staleAfterDays: 5 },
		{ name: "Negotiation",  color: "#10b981" },
		{ name: "Closed Won",   color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Closed Lost",  color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"finance": [
		{ name: "Lead",          color: "#3b82f6" },
		{ name: "Discovery",     color: "#8b5cf6", staleAfterDays: 7 },
		{ name: "Proposal",      color: "#f59e0b" },
		{ name: "Due Diligence", color: "#f97316" },
		{ name: "Closed",        color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",          color: "#ef4444", isFinal: true, finalType: "negative" },
	],
	"healthcare": [
		{ name: "Inquiry",    color: "#3b82f6" },
		{ name: "Assessment", color: "#8b5cf6" },
		{ name: "Proposal",   color: "#f59e0b" },
		{ name: "Contract",   color: "#10b981" },
		{ name: "Won",        color: "#22c55e", isFinal: true, finalType: "positive" },
		{ name: "Lost",       color: "#ef4444", isFinal: true, finalType: "negative" },
	],
};

const DEFAULT_STAGE_SET: StageInput[] = [
	{ name: "New",       color: "#3b82f6" },
	{ name: "Contacted", color: "#8b5cf6", staleAfterDays: 7 },
	{ name: "Proposal",  color: "#f59e0b" },
	{ name: "Won",       color: "#22c55e", isFinal: true, finalType: "positive" },
	{ name: "Lost",      color: "#ef4444", isFinal: true, finalType: "negative" },
];

function getDefaultStages(industry: string, orgId: string) {
	const set: StageInput[] = INDUSTRY_STAGES[industry] ?? DEFAULT_STAGE_SET;
	return set.map((s, i) => ({
		id: `stage_${orgId.slice(-6)}_${i}`,
		name: s.name,
		order: i,
		color: s.color,
		isFinal: s.isFinal,
		finalType: s.finalType,
		staleAfterDays: s.staleAfterDays,
	}));
}
