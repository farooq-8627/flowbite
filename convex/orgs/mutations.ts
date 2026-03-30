/**
 * Org mutations.
 *
 * PATTERN EXPLANATION:
 *   All public org mutations use `authenticatedMutation` or `orgMutation` (Rule R2).
 *   `orgMutation` is the org-scoped naming convention — functionally identical to
 *   `authenticatedMutation` but signals "this mutation operates on an org."
 *
 *   Role authorization is performed INSIDE the handler via `getOrgMember` (which
 *   uses `.withIndex()` for O(log n) lookup, Rule R4). The role check then gates
 *   the mutation: only owners/admins can mutate org settings, only owners can
 *   delete orgs or change roles.
 *
 * WHY shared validators (Rule R1):
 *   `updateMemberRole` accepts an `invitationRoleValidator` (admin/member/viewer)
 *   from `_shared/validators.ts`. The owner role is intentionally excluded —
 *   ownership transfer is a separate, more deliberate operation not yet implemented.
 *   Importing from the shared module ensures the allowed values are defined in
 *   exactly one place and re-used by the invitations module too.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation } from "../_functions/authenticated";
import { DEFAULT_ORG_PLAN } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { invitationRoleValidator } from "../_shared/validators";
import { generateSlug, getOrgBySlug, getOrgMember } from "./helpers";

/**
 * Create a new org. The creating user automatically becomes the owner.
 *
 * HOW IT WORKS:
 *   1. `authenticatedMutation` injects `ctx.userId` (verified JWT, Rule R2/R3).
 *   2. Resolves or auto-generates a URL-safe slug from the org name.
 *   3. Checks slug uniqueness via `by_slug` index (O(log n), Rule R4).
 *   4. Inserts the org, then inserts an `orgMembers` row with role: "owner".
 *   5. Sets the new org as `defaultOrgId` on the user if they don't have one yet —
 *      this powers the auto-redirect to the first org after signup.
 *
 * WHY `onboardingCompleted: true` in step 5:
 *   Creating an org is the final step of the onboarding flow. We colocate this
 *   flag update here so the middleware redirect fires on the next page load.
 *
 * RETURN: The new org's `Id<"orgs">` — used by the client to redirect to `/dashboard/[orgSlug]`.
 */
export const create = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const slug = args.slug ?? generateSlug(args.name);

		const existing = await getOrgBySlug(ctx, slug);
		if (existing) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name,
			slug,
			plan: DEFAULT_ORG_PLAN,
			createdAt: now,
			updatedAt: now,
		});

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

		return orgId;
	},
});

/**
 * Update org settings (name, slug, currency/timezone settings). Owner/admin only.
 *
 * HOW IT WORKS:
 *   1. Verifies calling user's membership and role via `by_orgId_and_userId` index.
 *   2. Enforces that only `owner` or `admin` can update org settings.
 *   3. If `slug` is being changed, checks the new slug for uniqueness (excluding self).
 *   4. `ctx.db.patch` shallow-merges only the provided fields (Rule R7: updates updatedAt).
 *
 * WHY exclude `orgId` from the patch args destructure:
 *   `args` contains `orgId` which must not be passed to `ctx.db.patch`. Destructuring
 *   `{ orgId, ...updates }` cleanly separates the target ID from the update payload.
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

		if (member.role !== "owner" && member.role !== "admin")
			throw new ConvexError(ERRORS.FORBIDDEN);

		const { orgId, ...updates } = args;

		if (updates.slug) {
			const existing = await getOrgBySlug(ctx, updates.slug);
			if (existing && existing._id !== orgId)
				throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);
		}

		await ctx.db.patch(orgId, { ...updates, updatedAt: now });
	},
});

/**
 * Remove a member from the org (soft-delete). Owner/admin only.
 *
 * HOW IT WORKS:
 *   1. Verifies the calling user (actor) is an active owner or admin.
 *   2. Fetches the target member and validates they exist.
 *   3. If the target is an owner, counts active owners via `by_orgId_and_role` index.
 *      Rejects if they are the last owner (would leave the org without an owner).
 *   4. Soft-deletes the membership row (sets `deletedAt`), not the user.
 *
 * WHY accept `args.userId` for the target (not a Rule R3 violation):
 *   Rule R3 says "never accept userId for AUTH purposes." Here, `args.userId`
 *   identifies WHO to remove — an operational argument, not an identity claim.
 *   The ACTOR is always derived from `ctx.userId` (the JWT).
 *
 * WHY soft-delete membership (not hard delete):
 *   Activity logs, notifications, and invitations reference the membership.
 *   Soft-delete preserves that history while preventing access.
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

		if (actorMember.role !== "owner" && actorMember.role !== "admin")
			throw new ConvexError(ERRORS.FORBIDDEN);

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
	},
});

/**
 * Update a member's role. Owner only.
 *
 * HOW IT WORKS:
 *   1. Verifies the calling user is an active owner (only owners can assign roles).
 *   2. Validates the target member exists and is active.
 *   3. Applies the role change via `ctx.db.patch`.
 *
 * WHY only admin/member/viewer (not owner) in the role validator (Rule R1):
 *   The `invitationRoleValidator` from `_shared/validators.ts` covers
 *   `["admin", "member", "viewer"]`. The `owner` role is excluded because
 *   ownership transfer is a significant, separate operation (requires explicit
 *   confirmation from both parties in a production SaaS). It is not built yet.
 *
 * WHY import `invitationRoleValidator` not inline the union (Rule R1):
 *   Validators defined in `_shared/validators.ts` are the single source of truth.
 *   Inline `v.union(v.literal("admin"), ...)` in function args would duplicate the
 *   definition and drift out of sync with the invitation flow.
 */
export const updateMemberRole = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		role: invitationRoleValidator,
	},
	handler: async (ctx, args) => {
		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined || actorMember.role !== "owner")
			throw new ConvexError(ERRORS.FORBIDDEN);

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		await ctx.db.patch(targetMember._id, { role: args.role });
	},
});

/**
 * Soft-delete the org. Owner only.
 *
 * HOW IT WORKS:
 *   Sets `deletedAt` on the org document. All queries/helpers check
 *   `org.deletedAt !== undefined` and treat soft-deleted orgs as non-existent.
 *
 * WHY only owner (not admin):
 *   Deleting an org is irreversible from the user's perspective (even though
 *   the data persists in the DB). Only the owner who created the org should
 *   have this capability.
 *
 * IMPORTANT: In production, a background job should also:
 *   - Soft-delete all orgMembers
 *   - Archive or transfer ownership of connected resources
 *   - Cancel the Stripe subscription if active
 */
export const deleteOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.role !== "owner")
			throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.orgId, { deletedAt: now, updatedAt: now });
	},
});

