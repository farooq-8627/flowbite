/**
 * Entity code validators — convex/_shared/entityCodes.ts
 *
 * The conversational/chat surface (messages, conversations, calendar events,
 * timeline entries) is polymorphic — it attaches to a record-like target via
 * (entityType, entityId). Pre-2026-05-16 these were both raw `v.string()`,
 * which let the frontend pass either the entity's stable code (`P-001`,
 * `D-042`, `CO-007`) or its Convex `_id`. The two are interchangeable for
 * indexing but only the code is stable across renames and the AI tool layer
 * (which never sees Convex IDs).
 *
 * Production rule (locked 2026-05-16):
 *   - `entityType` is a closed `v.union` literal.
 *   - `entityId` is always the **entity code** (P-001, D-001, CO-001) for
 *     CRM entities. For project/task chat (Phase 4) the code is the
 *     project/task id.
 *
 * The `entityTypeForChatValidator` exported below is the single source of
 * truth — schemas + mutation arg validators import it, never re-define.
 *
 * If a future entity type joins the chat surface, add it here once.
 */

import { v } from "convex/values";

// ─── Closed union of entity types that participate in chat ───────────────────

export const ENTITY_TYPES_FOR_CHAT = [
	"lead",
	"contact",
	"deal",
	"company",
	"person", // a unified "person" thread (lead OR contact, addressed by personCode)
	"user", // 1:1 direct message between org members
	"project", // Phase 4
	"task", // Phase 4
] as const;

export type EntityTypeForChat = (typeof ENTITY_TYPES_FOR_CHAT)[number];

export const entityTypeForChatValidator = v.union(
	v.literal("lead"),
	v.literal("contact"),
	v.literal("deal"),
	v.literal("company"),
	v.literal("person"),
	v.literal("user"),
	v.literal("project"),
	v.literal("task"),
);

// ─── Code prefixes per entity type ───────────────────────────────────────────
//
// Default prefixes — orgs may override via `orgs.settings.codePrefixes` (which
// only changes the prefix portion, never the structure).

export const ENTITY_CODE_PREFIXES: Record<EntityTypeForChat, string> = {
	lead: "P", // person
	contact: "P", // person (same as lead — converted lead keeps personCode)
	person: "P", // unified
	user: "U", // org member DM
	deal: "D",
	company: "CO",
	project: "PJ",
	task: "T",
};

// ─── Format guard ────────────────────────────────────────────────────────────

const CODE_PATTERN = /^[A-Z]{1,4}-[0-9]{1,9}$/;

/**
 * Soft format check — does this string look like an entity code?
 * Used for validation messages, not security. Server-side resolution
 * always queries by index (entity-existence check) before use.
 */
export function looksLikeEntityCode(value: string): boolean {
	return CODE_PATTERN.test(value);
}

// ─── DM pair key helpers ─────────────────────────────────────────────────────

/**
 * Build a deterministic entityId for a 1:1 DM between two users.
 * Both directions (A→B, B→A) produce the same key so the conversation
 * is shared. Format: `<smallerId>:<largerId>` (lexicographic sort).
 */
export function buildDmPairKey(userIdA: string, userIdB: string): string {
	return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

/**
 * Extract the "other" userId from a DM pair key given the viewer's id.
 * Returns `undefined` if the key doesn't contain the viewer.
 */
export function getOtherUserFromPairKey(pairKey: string, viewerUserId: string): string | undefined {
	const parts = pairKey.split(":");
	if (parts.length !== 2) return undefined;
	if (parts[0] === viewerUserId) return parts[1];
	if (parts[1] === viewerUserId) return parts[0];
	return undefined;
}
