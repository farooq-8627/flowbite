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

/**
 * Phase 3A — AI exclusion flag.
 *
 * When `excludeFromAI === true`, the row is treated as private from the AI
 * runtime's perspective:
 *   - The Phase 3B AI tool registry filters it out of search/lookup tools.
 *   - The system prompt's "context" section never mentions it.
 *   - Embeddings are not generated for it (Phase 3B+ feature).
 *
 * Set automatically on every record inserted by the template seeder
 * (`source: "template_seed"`). Owners can flip it on individual real
 * records via Settings → Privacy (Phase 3B UI).
 *
 * Optional + non-narrowed so legacy rows just have `excludeFromAI ===
 * undefined`, which the AI runtime treats as "include" (the safe default
 * — AI sees it).
 */
export const aiExcluded = { excludeFromAI: v.optional(v.boolean()) };

// AI-written context blob attached to leads, contacts, deals. Replaces v.any().
// Persisted across lead → contact conversion (never recreated).
export const aiContextValidator = v.optional(
	v.object({
		summary: v.optional(v.string()),
		keyFacts: v.optional(v.array(v.string())),
		lastUpdatedAt: v.optional(v.number()),
		rawNotes: v.optional(v.string()),
	}),
);

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

// ─── CRM Entity Type validators (BACKFIX-04) ──────────────────────────────────
//
// Shared across: activityLogs, notes, fieldDefinitions, pipelines, notifications.
// Ref: .github/agents/base/schema.md — entity types
export const entityTypeValues = [
	"lead",
	"contact",
	"company",
	"deal",
	"project",
	"task",
	"note",
] as const;
export const entityTypeValidator = v.union(...entityTypeValues.map((t) => v.literal(t)));
export type EntityType = (typeof entityTypeValues)[number];

// ─── Actor Type validators (BACKFIX-04) ───────────────────────────────────────
//
// Used in activityLogs to distinguish who (or what) performed an action.
// user:        Human via UI. userId is always the acting user.
// ai:          Convex AI action on behalf of userId (the user who triggered it).
// integration: External sync job (HubSpot import, etc.) — userId is the sync initiator.
// system:      Convex cron / internal job — userId is the org owner or service account.
//
// Rule: userId is ALWAYS required. actorType clarifies the medium, not the identity.
// Ref: .github/agents/base/schema.md — actorType design note
export const actorTypeValues = ["user", "ai", "integration", "system"] as const;
export const actorTypeValidator = v.union(...actorTypeValues.map((t) => v.literal(t)));
export type ActorType = (typeof actorTypeValues)[number];

// ─── Field Type validators (Dynamic Fields — Phase 2) ─────────────────────────
//
// fieldDefinitions.fieldType values. Determines how a field is rendered + validated.
// Ref: .github/agents/base/schema.md — fieldDefinitions table
export const fieldTypeValues = [
	"text",
	"number",
	"select",
	"multiselect",
	"date",
	"boolean",
	"url",
	"email",
	"relation",
	"file",
] as const;
export const fieldTypeValidator = v.union(...fieldTypeValues.map((t) => v.literal(t)));
export type FieldType = (typeof fieldTypeValues)[number];

// ─── Lead/Signal Source validators (BACKFIX-04) ───────────────────────────────
//
// How a lead was originally captured. Used for attribution + routing rules.
// manual: Created directly by a team member.
// csv:    Imported via CSV upload.
// Others: Sync'd from external integration (Phase 4+).
export const sourceValues = ["manual", "csv", "hubspot", "reddit", "linkedin", "hn"] as const;
export const sourceValidator = v.union(...sourceValues.map((t) => v.literal(t)));
export type Source = (typeof sourceValues)[number];

// ─── Sentiment validators (AI classification — Phase 3) ───────────────────────
//
// AI-generated sentiment on notes, emails, and conversation snippets.
// Used in the unified timeline and lead scoring.
export const sentimentValues = ["positive", "negative", "neutral"] as const;
export const sentimentValidator = v.union(...sentimentValues.map((t) => v.literal(t)));
export type Sentiment = (typeof sentimentValues)[number];
