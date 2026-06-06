/**
 * 2FA step-up tokens for irreversible AI capabilities (S10).
 *
 * The chat surface renders a `<StepUpCard>` whenever an AI tool result
 * envelope's `status === "needs_step_up"`. The user clicks "Confirm"
 * twice; the second click calls `confirmStepUp` here, which:
 *   1. Issues a single-use token bound to (orgId, userId, capability,
 *      argsHash), 5-minute TTL.
 *   2. Appends a synthetic user message naming the confirmed capability.
 *   3. Schedules `processChat.run` with the token attached so the next
 *      turn re-executes the tool — the wrapper's `stepUpVerifier` accepts
 *      the token + consumes it before `cap.run`.
 *
 * The actual gate lives in `convex/ai/registry/wrapper.ts` (step 6b);
 * the verifier injected by the runtime host calls `verifyAndConsume`
 * here.
 */

import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "./_functions/authenticated";
import { internalMutation } from "./_generated/server";
import { ERRORS } from "./_shared/errors";
import { requireRole } from "./_shared/permissions/helpers";

/** Token TTL — short enough to be hard to abuse, long enough that a slow re-run still finds it. */
export const STEP_UP_TTL_MS = 5 * 60 * 1000;

// Forward reference resolved after codegen — same pattern as `messages.ts`.
const processChatRun = makeFunctionReference<"action", Record<string, unknown>, null>(
	"ai/processChat:run",
);

/**
 * Canonicalise an args object so the same input always yields the same
 * hash. Uses sorted keys + JSON.stringify; arrays preserve order.
 *
 * Exported so callers (UI, tests) can build the same hash the wrapper
 * sees. The hash is server-derived in `confirmStepUp` — the client
 * sends the args directly, never the hash.
 */
export function canonicaliseArgs(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicaliseArgs).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => a.localeCompare(b));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicaliseArgs(v)}`).join(",")}}`;
}

/**
 * SHA-256 hex digest of the canonicalised args. Web Crypto is available
 * in Convex's V8 runtime, so this works in both query/mutation and
 * action contexts without a "use node" boundary.
 */
export async function hashArgs(args: unknown): Promise<string> {
	const canonical = canonicaliseArgs(args);
	const buf = new TextEncoder().encode(canonical);
	const digest = await crypto.subtle.digest("SHA-256", buf);
	const bytes = new Uint8Array(digest);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

/** Generate a 32-byte hex token. */
function newToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

// ─── Issue (internal) ───────────────────────────────────────────────────────

/**
 * Insert a step-up token row. Internal — `confirmStepUp` (orgMutation)
 * is the public entry point so we can authenticate the caller.
 */
export const issueInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		capability: v.string(),
		argsHash: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const token = newToken();
		const _id = await ctx.db.insert("aiStepUpTokens", {
			orgId: args.orgId,
			userId: args.userId,
			conversationId: args.conversationId,
			capability: args.capability,
			argsHash: args.argsHash,
			token,
			issuedAt: now,
			expiresAt: now + STEP_UP_TTL_MS,
		});
		return { token, expiresAt: now + STEP_UP_TTL_MS, _id };
	},
});

// ─── Verify + consume (internal) ────────────────────────────────────────────

/**
 * Look up the token, confirm every field matches, mark consumed.
 * Returns `true` only when the token is fresh, unconsumed, and bound to
 * the exact (orgId, userId, capability, argsHash) tuple. Anything else
 * fails closed.
 *
 * The wrapper's `stepUpVerifier` calls this once per irreversible
 * capability call. Because tokens are single-use, a model that re-runs
 * the same tool a second time after one approval is correctly rejected.
 */
export const verifyAndConsumeInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		token: v.string(),
		capability: v.string(),
		argsHash: v.string(),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("aiStepUpTokens")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();
		if (!row) return { ok: false, reason: "not_found" } as const;
		if (row.consumedAt !== undefined) return { ok: false, reason: "already_used" } as const;
		if (row.expiresAt < Date.now()) return { ok: false, reason: "expired" } as const;
		if (
			row.orgId !== args.orgId ||
			row.userId !== args.userId ||
			row.capability !== args.capability ||
			row.argsHash !== args.argsHash
		) {
			return { ok: false, reason: "mismatch" } as const;
		}
		await ctx.db.patch(row._id, { consumedAt: Date.now() });
		return { ok: true } as const;
	},
});

// ─── Public: confirm + resume ───────────────────────────────────────────────

/**
 * Called by the chat client when the user clicks "Confirm" the SECOND
 * time on the `<StepUpCard>`. Issues a token, appends a synthetic user
 * message that names the confirmed capability, and schedules the next
 * turn with the token bound. The agent then re-issues the same tool
 * call and the wrapper consumes the token.
 *
 * The double-click contract is enforced client-side (the card refuses
 * to call this until two clicks have happened); calling it once is
 * harmless — a single confirmation just kicks off the next turn.
 *
 * RBAC: the caller must hold `ai.use` (same as `sendMessage`). The
 * actual capability permission is rechecked inside the wrapper when the
 * tool runs.
 */
export const confirmStepUp = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		assistantMessageId: v.id("aiMessages"),
		capability: v.string(),
		args: v.any(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");

		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		const msg = await ctx.db.get(args.assistantMessageId);
		if (!msg || msg.orgId !== args.orgId || msg.conversationId !== args.conversationId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		// Hash the args server-side — never trust a client-supplied hash.
		const argsHash = await hashArgs(args.args);

		const now = Date.now();
		const token = newToken();
		await ctx.db.insert("aiStepUpTokens", {
			orgId: args.orgId,
			userId,
			conversationId: args.conversationId,
			capability: args.capability,
			argsHash,
			token,
			issuedAt: now,
			expiresAt: now + STEP_UP_TTL_MS,
		});

		// Append a synthetic user message so the agent has a clear cue to
		// re-run the capability with the just-confirmed args.
		const userMsgId = await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId: args.conversationId,
			role: "user",
			content: `[step-up confirmed] Re-run \`${args.capability}\` with the same arguments — the user has authorised the irreversible action.`,
			createdAt: now,
		});

		// Update conversation lastMessageAt so the history sort surfaces this thread.
		await ctx.db.patch(args.conversationId, { lastMessageAt: now, updatedAt: now });

		await ctx.scheduler.runAfter(0, processChatRun, {
			orgId: args.orgId,
			userId,
			conversationId: args.conversationId,
			userMessageId: userMsgId,
			stepUpToken: token,
		});

		return { ok: true as const };
	},
});

/** Internal mutation used by tests to read a token row by id. */
export const _readForTest = internalMutation({
	args: { tokenId: v.id("aiStepUpTokens") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.tokenId);
	},
});

/** Type-only — the verifier function shape the host injects into CapabilityCtx. */
export type StepUpVerifierResult = { ok: true } | { ok: false; reason: string };
