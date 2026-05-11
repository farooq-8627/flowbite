/**
 * Org helper functions for internal use.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ERRORS } from "../_shared/errors";

/**
 * Returns an org by ID. Throws if not found or soft-deleted.
 */
export async function getOrgById(ctx: QueryCtx, orgId: Id<"orgs">): Promise<Doc<"orgs">> {
	const org = await ctx.db.get(orgId);
	if (!org || org.deletedAt !== undefined) throw new Error(ERRORS.ORG_NOT_FOUND);
	return org;
}

/**
 * Returns an org by slug. Returns null if not found.
 */
export async function getOrgBySlug(ctx: QueryCtx, slug: string): Promise<Doc<"orgs"> | null> {
	return await ctx.db
		.query("orgs")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
}

/**
 * Returns the org membership for a user with role and permissions resolved from roleId.
 * Returns null if not a member.
 */
export async function getOrgMember(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
): Promise<
	| (Doc<"orgMembers"> & { role: "owner" | "admin" | "member" | "viewer"; permissions: string[] })
	| null
> {
	const member = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.first();

	if (!member) return null;

	// Resolve role + permissions from roleId (sole source of truth)
	const orgRole = await ctx.db.get(member.roleId);
	if (!orgRole) return null;
	const role = orgRole.name.toLowerCase() as "owner" | "admin" | "member" | "viewer";

	return { ...member, role, permissions: orgRole.permissions };
}

/**
 * Returns all active org memberships for a user.
 */
export async function getUserOrgs(
	ctx: QueryCtx,
	userId: Id<"users">,
): Promise<Array<Doc<"orgMembers"> & { org: Doc<"orgs"> }>> {
	const memberships = await ctx.db
		.query("orgMembers")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.take(100);

	const result = [];
	for (const m of memberships) {
		if (m.deletedAt !== undefined) continue;
		const org = await ctx.db.get(m.orgId);
		if (!org || org.deletedAt !== undefined) continue;
		result.push({ ...m, org });
	}
	return result;
}

/**
 * Generates a URL-safe base slug from an org name (no suffix).
 * Caller is responsible for uniqueness — use ensureUniqueSlug() for that.
 */
export function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/**
 * Ensures a slug is unique by appending -2, -3, etc. (GitHub-style).
 * Returns the first available slug.
 */
export async function ensureUniqueSlug(ctx: QueryCtx, base: string): Promise<string> {
	const existing = await ctx.db
		.query("orgs")
		.withIndex("by_slug", (q) => q.eq("slug", base))
		.unique();
	if (!existing) return base;

	for (let i = 2; i <= 999; i++) {
		const candidate = `${base}-${i}`;
		const taken = await ctx.db
			.query("orgs")
			.withIndex("by_slug", (q) => q.eq("slug", candidate))
			.unique();
		if (!taken) return candidate;
	}
	// Extremely unlikely — fall back to timestamp suffix
	return `${base}-${Date.now()}`;
}
