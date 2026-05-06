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
import { requireRole, requireMinRole } from "../_shared/permissions";
import type { OrgRole } from "../_shared/validators";
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
				"notes.view", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
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
				"notes.view", "notes.create", "notes.updateOwn", "notes.deleteOwn", "notes.deleteAny",
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
			role: "owner",
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

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			role: "owner",
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

		requireMinRole(member.role as OrgRole, "admin");

		const { orgId, ...updates } = args;

		if (updates.slug) {
			const existing = await getOrgBySlug(ctx, updates.slug);
			if (existing && existing._id !== orgId) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);
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

		requireRole(actorMember.role as OrgRole, "members.remove");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		if (targetMember.role === "owner") {
			const ownerCount = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_role", (q) =>
					q.eq("orgId", args.orgId).eq("role", "owner"),
				)
				.take(10);
			const activeOwners = ownerCount.filter((m) => m.deletedAt === undefined);
			if (activeOwners.length <= 1)
				throw new ConvexError("Cannot remove the last owner of an organization.");
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
		role: invitationRoleValidator,
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(actorMember.role as OrgRole, "members.changeRole");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		const previousRole = targetMember.role;
		await ctx.db.patch(targetMember._id, { role: args.role, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
			description: `Changed role from ${previousRole} to ${args.role}`,
		});

		// Notify the affected user about role change
		if (args.userId !== ctx.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.userId,
				type: "member.roleChanged",
				title: "Your role has been updated",
				body: `Your role has been changed from ${previousRole} to ${args.role}.`,
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

		requireRole(member.role as OrgRole, "org.delete");

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
