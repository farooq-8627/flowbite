/**
 * convex/ai/personaContext.ts
 *
 * Phase 4 Part 1 P1.12 (`PHASE-3-AI-AUDIT.md §5`) — durable AI memory
 * per-org and per-user. The agent reads both rows every turn (system
 * prompt block) and writes them via two AI tools when a turn surfaces
 * a fact worth keeping ("calls leads 'opportunities'", "default deal
 * size $5K", "morning person — schedule follow-ups before noon").
 *
 * Two scopes share the same table (`aiPersonaContext`):
 *   - org-level    → `userId === undefined`
 *   - user-level   → `userId` set
 *
 * Hard caps (enforced here so a runaway model can't blow context):
 *   summary  ≤ 600 chars
 *   keyFacts ≤ 30 entries
 *   byteCount ≤ 4 KB (JSON encoding of summary + keyFacts + preferences)
 * Over caps → throws `BUDGET_EXCEEDED`. The AI tool catches it and
 * returns a friendly note so the model knows to remove something
 * before adding the next fact.
 *
 * Auth: every internal mutation validates membership via
 * `requireOrgMemberByIds`. Org-level writes additionally require
 * `org.manage` permission so a viewer can't pollute the org persona.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { requireRole } from "../_shared/permissions";

// ─── Caps ─────────────────────────────────────────────────────────────

export const PERSONA_CAPS = {
	summaryMaxChars: 600,
	keyFactsMax: 30,
	keyFactMaxChars: 240,
	byteCountMax: 4_096,
	/**
	 * `identity` is the owner-edited static blob (replaces `orgs.aiContext`).
	 * It coexists with the AI-managed memory in the same row but is exempt
	 * from the 4 KB byteCount cap (which only governs AI growth). The cap
	 * here matches the previous Settings UI maxLength.
	 */
	identityMaxChars: 10_000,
} as const;

// ─── Types surfaced to callers ────────────────────────────────────────

export type PersonaRow = {
	scope: "org" | "user";
	identity?: string;
	summary: string;
	keyFacts: string[];
	preferences?: Record<string, unknown>;
	lastUpdatedAt: number;
	byteCount: number;
};

// ─── Pure helpers (exported for unit tests) ──────────────────────────

export function computeByteCount(args: {
	summary: string;
	keyFacts: string[];
	preferences?: Record<string, unknown>;
}): number {
	return new TextEncoder().encode(
		JSON.stringify({
			s: args.summary,
			k: args.keyFacts,
			p: args.preferences ?? null,
		}),
	).length;
}

/**
 * Apply `addFacts` / `removeFacts` to an existing keyFacts list.
 *
 * - `removeFacts` are case-insensitive prefix-trimmed string matches
 *   so the model's slightly-different rephrase still removes the
 *   intended fact.
 * - duplicates (after trim + case fold) collapse.
 * - order: existing facts first, new ones appended.
 */
export function applyFactDelta(
	existing: string[],
	delta: { addFacts?: string[]; removeFacts?: string[] },
): string[] {
	const norm = (s: string) => s.trim().toLowerCase();
	const removeSet = new Set((delta.removeFacts ?? []).map(norm).filter((s) => s.length > 0));
	const after = existing.filter((f) => !removeSet.has(norm(f)));
	const seen = new Set(after.map(norm));
	for (const raw of delta.addFacts ?? []) {
		const trimmed = raw.trim();
		if (trimmed.length === 0) continue;
		if (trimmed.length > PERSONA_CAPS.keyFactMaxChars) continue;
		const key = norm(trimmed);
		if (seen.has(key)) continue;
		seen.add(key);
		after.push(trimmed);
	}
	return after;
}

/** Throws BUDGET_EXCEEDED if any cap is breached. Pure / test-friendly. */
export function assertWithinCaps(args: {
	summary: string;
	keyFacts: string[];
	preferences?: Record<string, unknown>;
}): { byteCount: number } {
	if (args.summary.length > PERSONA_CAPS.summaryMaxChars) {
		throw new ConvexError({
			code: "BUDGET_EXCEEDED",
			message: `summary too long (${args.summary.length} chars; max ${PERSONA_CAPS.summaryMaxChars}). Shorten the summary or remove key facts.`,
		});
	}
	if (args.keyFacts.length > PERSONA_CAPS.keyFactsMax) {
		throw new ConvexError({
			code: "BUDGET_EXCEEDED",
			message: `too many key facts (${args.keyFacts.length}; max ${PERSONA_CAPS.keyFactsMax}). Remove an old fact before adding a new one.`,
		});
	}
	const byteCount = computeByteCount(args);
	if (byteCount > PERSONA_CAPS.byteCountMax) {
		throw new ConvexError({
			code: "BUDGET_EXCEEDED",
			message: `persona context too large (${byteCount} bytes; max ${PERSONA_CAPS.byteCountMax}). Shorten the summary or remove key facts.`,
		});
	}
	return { byteCount };
}

// ─── Read path — internal queries (called from buildSystemPrompt) ──

/**
 * Fetch the org-level persona row (userId === undefined). Returns null
 * if no row exists yet.
 */
export const getOrgPersonaForAI = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<PersonaRow | null> => {
		const row = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
			.first();
		if (!row) return null;
		return {
			scope: "org",
			identity: row.identity,
			summary: row.summary,
			keyFacts: row.keyFacts,
			preferences: row.preferences,
			lastUpdatedAt: row.lastUpdatedAt,
			byteCount: row.byteCount,
		};
	},
});

/** Fetch the per-user persona row. Returns null if none exists yet. */
export const getUserPersonaForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args): Promise<PersonaRow | null> => {
		const row = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.first();
		if (!row) return null;
		return {
			scope: "user",
			identity: row.identity,
			summary: row.summary,
			keyFacts: row.keyFacts,
			preferences: row.preferences,
			lastUpdatedAt: row.lastUpdatedAt,
			byteCount: row.byteCount,
		};
	},
});

// ─── Write path — internal mutations called from AI tools ────────────

const upsertArgs = {
	orgId: v.id("orgs"),
	userId: v.id("users"), // who is writing — used for auth + as the key on user-scope writes
	scope: v.union(v.literal("org"), v.literal("user")),
	addFacts: v.optional(v.array(v.string())),
	removeFacts: v.optional(v.array(v.string())),
	summary: v.optional(v.string()),
	preferences: v.optional(v.record(v.string(), v.any())),
} as const;

export const upsertPersonaForAI = internalMutation({
	args: upsertArgs,
	handler: async (
		ctx,
		args,
	): Promise<{
		scope: "org" | "user";
		summary: string;
		keyFacts: string[];
		preferences?: Record<string, unknown>;
		byteCount: number;
		removed: number;
		added: number;
	}> => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		// Org-level writes require org.manage so a viewer can't pollute
		// the shared org persona. Per-user writes are always self-scoped
		// (we only let the user write their own row).
		if (args.scope === "org") {
			requireRole(member.permissions, "org.manage");
		}

		// On user-scope writes the row key is `(orgId, args.userId)`.
		// We deliberately do NOT accept a different `targetUserId` arg
		// — the model can only update the calling user's persona.
		const rowUserId = args.scope === "org" ? undefined : args.userId;

		const existing = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", rowUserId))
			.first();

		const prevFacts = existing?.keyFacts ?? [];
		const newFacts = applyFactDelta(prevFacts, {
			addFacts: args.addFacts,
			removeFacts: args.removeFacts,
		});
		const newSummary = (args.summary ?? existing?.summary ?? "").trim();
		// Merge preferences (per-user only); org row never carries prefs.
		const newPrefs =
			args.scope === "user"
				? { ...(existing?.preferences ?? {}), ...(args.preferences ?? {}) }
				: undefined;

		const { byteCount } = assertWithinCaps({
			summary: newSummary,
			keyFacts: newFacts,
			preferences: newPrefs,
		});

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				summary: newSummary,
				keyFacts: newFacts,
				preferences: newPrefs,
				byteCount,
				lastUpdatedAt: now,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("aiPersonaContext", {
				orgId: args.orgId,
				userId: rowUserId,
				summary: newSummary,
				keyFacts: newFacts,
				preferences: newPrefs,
				byteCount,
				lastUpdatedAt: now,
				createdAt: now,
				updatedAt: now,
			});
		}

		return {
			scope: args.scope,
			summary: newSummary,
			keyFacts: newFacts,
			preferences: newPrefs,
			byteCount,
			removed: prevFacts.length - newFacts.length + (args.addFacts?.length ?? 0),
			added: args.addFacts?.length ?? 0,
		};
	},
});

// ─── Test exports ─────────────────────────────────────────────────────

export const __test = {
	PERSONA_CAPS,
	applyFactDelta,
	assertWithinCaps,
	computeByteCount,
};

// ─── Org-level identity (replaces orgs.aiContext) ─────────────────────

/**
 * Owner-edited "What is this organisation?" blob — the static identity
 * description that ships with onboarding's industry template and that
 * admins can edit in Settings → AI → Business Context.
 *
 * Stored on the `aiPersonaContext` row keyed by `(orgId, userId=undefined)`,
 * coexisting with the AI-managed `summary` + `keyFacts`. The two are
 * read together in the system prompt (see `convex/ai/systemPrompt.ts`).
 *
 * Soft cap: 10 000 chars. Permission: `org.manage`.
 */
async function setOrgIdentityImpl(ctx: MutationCtx, args: { orgId: Id<"orgs">; identity: string }) {
	if (args.identity.length > PERSONA_CAPS.identityMaxChars) {
		throw new ConvexError({
			code: "BUDGET_EXCEEDED",
			message: `identity too long (${args.identity.length} chars; max ${PERSONA_CAPS.identityMaxChars}).`,
		});
	}
	const existing = await ctx.db
		.query("aiPersonaContext")
		.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
		.first();
	const now = Date.now();
	const trimmed = args.identity.trim();
	const identity = trimmed.length > 0 ? trimmed : undefined;
	if (existing) {
		// Re-compute byteCount including identity so the persona surface
		// stays bounded together with the AI-managed memory.
		const byteCount = computeByteCount({
			summary: existing.summary,
			keyFacts: existing.keyFacts,
			preferences: existing.preferences,
		});
		await ctx.db.patch(existing._id, {
			identity,
			byteCount,
			lastUpdatedAt: now,
			updatedAt: now,
		});
		return { _id: existing._id, identity };
	}
	const inserted = await ctx.db.insert("aiPersonaContext", {
		orgId: args.orgId,
		userId: undefined,
		identity,
		summary: "",
		keyFacts: [],
		preferences: undefined,
		byteCount: computeByteCount({ summary: "", keyFacts: [] }),
		lastUpdatedAt: now,
		createdAt: now,
		updatedAt: now,
	});
	return { _id: inserted, identity };
}

export const setOrgIdentity = orgMutation({
	args: { orgId: v.id("orgs"), identity: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "org.manage");
		return setOrgIdentityImpl(ctx, args);
	},
});

/**
 * AI-callable twin so the agent can also amend the org identity blob
 * when an authorised user (org.manage) asks it to. Per AGENTS.md
 * "AI tools call `*ForAI` internal twins" rule.
 */
export const setOrgIdentityForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users"), identity: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "org.manage");
		const { userId: _u, ...rest } = args;
		return setOrgIdentityImpl(ctx, rest);
	},
});

// Public read for the settings page.
export const getOrgIdentity = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const row = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
			.first();
		return { identity: row?.identity ?? "" };
	},
});

// ─── Memory read + forget (Settings → AI → Memory) ────────────────────
//
// Surfaces the AI-managed dynamic memory the agent has built up about
// this organisation and the current user. Read-only by default — the
// "Forget all" button calls one of the forget* mutations below.
//
// Identity (owner-edited static blob) is NEVER touched by these
// mutations; the user manages it directly under "Business Context".

/**
 * Public read — returns both the org-level row and the current user's
 * row. Each row is `{ summary, keyFacts, preferences?, lastUpdatedAt, byteCount }`.
 */
export const getMemoryForSettings = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const orgRow = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
			.first();
		const userRow = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId as Id<"users">),
			)
			.first();
		return {
			org: orgRow
				? {
						summary: orgRow.summary,
						keyFacts: orgRow.keyFacts,
						lastUpdatedAt: orgRow.lastUpdatedAt,
						byteCount: orgRow.byteCount,
					}
				: null,
			user: userRow
				? {
						summary: userRow.summary,
						keyFacts: userRow.keyFacts,
						preferences: userRow.preferences ?? {},
						lastUpdatedAt: userRow.lastUpdatedAt,
						byteCount: userRow.byteCount,
					}
				: null,
		};
	},
});

/**
 * Clear org-level dynamic memory. Identity blob is preserved.
 * Requires `org.manage` because org-level memory is shared across
 * the workspace.
 */
export const forgetOrgMemory = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "org.manage");
		const row = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
			.first();
		if (!row) return { cleared: false };
		const now = Date.now();
		await ctx.db.patch(row._id, {
			summary: "",
			keyFacts: [],
			byteCount: computeByteCount({ summary: "", keyFacts: [] }),
			lastUpdatedAt: now,
			updatedAt: now,
		});
		return { cleared: true };
	},
});

/**
 * Clear the current user's dynamic memory + preferences. Always
 * self-scoped — every member can wipe their own memory.
 */
export const forgetUserMemory = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const row = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId as Id<"users">),
			)
			.first();
		if (!row) return { cleared: false };
		const now = Date.now();
		await ctx.db.patch(row._id, {
			summary: "",
			keyFacts: [],
			preferences: undefined,
			byteCount: computeByteCount({ summary: "", keyFacts: [] }),
			lastUpdatedAt: now,
			updatedAt: now,
		});
		return { cleared: true };
	},
});
