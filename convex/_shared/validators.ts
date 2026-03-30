/**
 * Shared Convex validators — define once, import everywhere.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts (validator patterns)
 * - .github/agents/base/schema.md (project-specific field groups)
 * - .github/agents/base/rbac.md (role definitions)
 *
 * Rule R1: NEVER redefine these inline in queries/mutations. Import from here.
 */
import { v } from "convex/values";

// ─── Field groups ─────────────────────────────────────────────────────────────

export const orgScoped = { orgId: v.id("orgs") };
export const timestamps = { createdAt: v.number(), updatedAt: v.number() };
export const softDelete = { deletedAt: v.optional(v.number()) };
export const createdBy = { createdBy: v.id("users") };

// ─── Platform Role validators ─────────────────────────────────────────────────
//
// Platform roles live on the `users` table (`users.platformRole`).
// A user with no platformRole is a regular user who belongs to orgs.
// `super_admin` can manage orgs from outside but CANNOT enter any org.
//
// Ref: .github/agents/base/rbac.md — Platform Roles section

export const platformRoleValues = ["super_admin"] as const;
export const platformRoleValidator = v.literal("super_admin");
export type PlatformRole = (typeof platformRoleValues)[number];

// ─── Org Role validators ──────────────────────────────────────────────────────
//
// Org roles live on the `orgMembers` table (`orgMembers.role`).
// These are for INTERNAL team members only.
//
// Role hierarchy (highest → lowest authority):
//   owner > admin > member > viewer
//
// owner:  Full authority. Pre-approved. Cannot do client/partner-side workflows.
// admin:  Full operational control. Same as owner for day-to-day operations.
// member: Assigned worker. Work items, view connections, message.
// viewer: Read-only. No mutations.
//
// External parties (client, partner) are managed per-connection in the
// Connections module (Phase 1) — NOT in orgMembers.
//
// Ref: .github/agents/base/rbac.md — Org Roles section

export const orgRoleValues = ["owner", "admin", "member", "viewer"] as const;
export const orgRoleValidator = v.union(...orgRoleValues.map((r) => v.literal(r)));
export type OrgRole = (typeof orgRoleValues)[number];

// Role hierarchy for `hasMinRole()` checks.
// Higher index = more authority.
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
	viewer: 0,
	member: 1,
	admin: 2,
	owner: 3,
};

// ─── Invitation Role validators ───────────────────────────────────────────────
//
// Invitations can only create admin/member/viewer members.
// `owner` cannot be assigned via invitation — only the org creator becomes owner.
// `client` and `partner` are invited through the Connections module (Phase 1).

export const invitationRoleValues = ["admin", "member", "viewer"] as const;
export const invitationRoleValidator = v.union(...invitationRoleValues.map((r) => v.literal(r)));
export type InvitationRole = (typeof invitationRoleValues)[number];

// ─── External Party Role validators (Connections module — Phase 1) ────────────
//
// These roles are NOT in orgMembers. They are managed per-connection in the
// `connectionParticipants` table (built in Phase 1 — Connections module).
//
// client:  External client. Portal access scoped to their own connections.
//          Can submit client-side requests.
// partner: External partner. Portal access scoped to their own connections.
//          Can submit partner-side responses.
//
// Status: NOT YET IMPLEMENTED — Phase 1

export const externalRoleValues = ["client", "partner"] as const;
export const externalRoleValidator = v.union(...externalRoleValues.map((r) => v.literal(r)));
export type ExternalRole = (typeof externalRoleValues)[number];

// ─── Status validators ────────────────────────────────────────────────────────

export const orgPlanValues = ["free", "starter", "pro", "enterprise"] as const;
export const orgPlanValidator = v.union(...orgPlanValues.map((p) => v.literal(p)));
export type OrgPlan = (typeof orgPlanValues)[number];

export const invitationStatusValues = ["pending", "accepted", "declined", "expired"] as const;
export const invitationStatusValidator = v.union(
	...invitationStatusValues.map((s) => v.literal(s)),
);
export type InvitationStatus = (typeof invitationStatusValues)[number];

