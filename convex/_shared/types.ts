/**
 * Shared TypeScript types for the Convex backend.
 *
 * WHY THIS EXISTS:
 *   R1: Never duplicate types. Define once here, import everywhere.
 *   These types are derived from validators in validators.ts and are used
 *   across queries, mutations, and frontend code.
 *
 * NOTE:
 *   For Convex document types, use `Doc<"tableName">` from `./_generated/dataModel`.
 *   This file is for custom utility types that don't map 1:1 to a table.
 *
 * Sources:
 * - convex/_shared/validators.ts — source validators
 * - .github/agents/base/schema.md — schema reference
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { OrgRole, OrgPlan } from "./validators";

/** A user document (alias for convenience) */
export type User = Doc<"users">;

/** An org document (alias for convenience) */
export type Org = Doc<"orgs">;

/** An org member document (alias for convenience) */
export type OrgMember = Doc<"orgMembers">;

/** Re-export role/plan types for frontend usage */
export type { OrgRole, OrgPlan };

/** User with their org membership context (used in authenticated function builders) */
export type UserWithOrgContext = {
	user: User;
	org: Org;
	member: OrgMember;
};

/** Org member with user profile joined (used in member list queries) */
export type OrgMemberWithProfile = OrgMember & {
	userName: string | undefined;
	userEmail: string;
	userAvatarUrl: string | undefined;
};

/** Notification payload for sendNotification helper */
export type NotificationPayload = {
	userId: Id<"users">;
	orgId: Id<"orgs">;
	type: string;
	title: string;
	body?: string;
	entityType?: string;
	entityId?: string;
	actionUrl?: string;
	metadata?: Record<string, unknown>;
};

/** Activity log payload for logActivity helper */
export type ActivityLogPayload = {
	userId: Id<"users">;
	orgId: Id<"orgs">;
	action: string;
	entityType: string;
	entityId: string;
	description?: string;
	metadata?: Record<string, unknown>;
};
