"use node";
/**
 * Autonomous engine — drive the V2 capability host without a user prompt.
 *
 * Runs `runAgent({ trigger:"autonomous", … })` under the AGENT's RBAC over
 * a conversation transcript. The host already injects the autonomous
 * PROJECT-drive variant ("observe; perform implied CRM actions; ask the
 * AGENT, never the customer; never message the customer") when
 * `trigger==="autonomous"` — we feed it the transcript + agent principal.
 *
 * Guardrails (in order): RBAC → org policy gate → per-conversation debounce
 * → model resolve (BYOK n/a here) → run host → marker row + activity log.
 *
 * V8 sister file `autonomousState.ts` owns the internalQuery + internalMutation
 * (Convex forbids them in `"use node"` files) plus the pure helpers + constants.
 *
 * Real Twilio inbound wiring is S13.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";
import type { OrgSnapshot } from "../registry/modules";
import type { Channel, Principal } from "../registry/types";
import {
	AUTONOMOUS_TURN_MARKER,
	buildAutonomousPrompt,
	DEBOUNCE_MS,
	hasRecentAutonomousTurn,
} from "./autonomousState";
import { runAgent } from "./host";

// Re-export pure helpers + constants so tests + S13 callers have a single
// import surface (`runtime/autonomous`) without reaching into the sister.
export { AUTONOMOUS_TURN_MARKER, buildAutonomousPrompt, DEBOUNCE_MS, hasRecentAutonomousTurn };

// ─── Engine ────────────────────────────────────────────────────────────────

/** Closed taxonomy of why an autonomous turn was skipped or failed. */
export type AutonomousTurnSkipReason =
	| "agent_not_member"
	| "no_ai_use_perm"
	| "autonomy_off"
	| "debounced"
	| "no_platform_key"
	| "host_error";

export type AutonomousTurnResult =
	| { ok: false; reason: AutonomousTurnSkipReason; message?: string }
	| {
			ok: true;
			toolCallCount: number;
			text: string;
			usage: { inputTokens: number; outputTokens: number };
	  };

export type RunAutonomousTurnOptions = {
	/** ActionCtx — the engine reads org snapshot + writes the audit row. */
	ctx: NonNullable<Parameters<typeof runAgent>[0]["ctx"]>;
	orgId: Id<"orgs">;
	/** The agent (member) whose RBAC the turn runs under. */
	agentUserId: Id<"users">;
	/** Conversation transcript — joined message-box body for S13; injected for S11 tests. */
	transcript: string;
	/** Optional `aiConversations` row used as the debounce key + audit key. */
	conversationId?: Id<"aiConversations">;
	/** Channel the principal is acting on. Defaults to "chat" for S11. */
	channel?: Channel;
	/** `triggeredBy` provenance for the marker row. Defaults to `autonomous:test`. */
	triggeredBy?: string;
	/** Caller-supplied idempotency hint — forwarded to the prompt + audit row. */
	idempotencyKey?: string;
	/**
	 * Optional model injection — production resolves from `PLATFORM_BRIEFING_MODEL`
	 * (same default as standing orders). Tests pass a `MockLanguageModelV3`.
	 */
	modelOverride?: Parameters<typeof runAgent>[0]["model"];
};

/**
 * Engine entrypoint. Used by the public actions below and by tests via
 * `modelOverride`. Returns a typed envelope; never throws.
 */
export async function runAutonomousTurn(
	opts: RunAutonomousTurnOptions,
): Promise<AutonomousTurnResult> {
	const channel: Channel = opts.channel ?? "chat";
	const triggeredBy = opts.triggeredBy ?? "autonomous:test";

	// 1. Resolve agent membership + permissions + plan + settings.
	const ownerInfo = (await opts.ctx.runQuery(internal.orgs.queries.getMemberWithPermissions, {
		orgId: opts.orgId,
		userId: opts.agentUserId,
	})) as {
		permissions: string[];
		plan: string;
		settings: Record<string, unknown>;
	} | null;

	if (!ownerInfo) return { ok: false, reason: "agent_not_member" };
	if (!ownerInfo.permissions.includes("ai.use")) return { ok: false, reason: "no_ai_use_perm" };

	// 2. Org policy gate. Default behaviour is auto-act on; the migration
	//    seeds `autoActFromConversations: true`. Only an explicit `false`
	//    disables the engine.
	const aiAutonomy = (ownerInfo.settings.aiAutonomy ?? {}) as {
		autoActFromConversations?: boolean;
	};
	if (aiAutonomy.autoActFromConversations === false) {
		return { ok: false, reason: "autonomy_off" };
	}

	// 3. Debounce — only when we have a conversationId to key on. The
	//    aiToolEvents marker row written at the end of every turn is the
	//    debounce surface; reading via `(orgId, toolName, startedAt)` keeps
	//    the scan tiny (rows in the last 8s).
	if (opts.conversationId) {
		const recent = (await opts.ctx.runQuery(
			internal.ai.runtime.autonomousState.recentAutonomousTurns,
			{ orgId: opts.orgId, sinceMs: DEBOUNCE_MS },
		)) as Array<{
			startedAt: number;
			conversationId?: Id<"aiConversations"> | null | undefined;
		}>;
		if (hasRecentAutonomousTurn(recent, opts.conversationId, Date.now(), DEBOUNCE_MS)) {
			return { ok: false, reason: "debounced" };
		}
	}

	// 4. Resolve LanguageModel. Standing orders use the same picker — keep
	//    the autonomous engine on the cheap briefing model so a chatty lead
	//    box doesn't burn premium tokens. BYOK isn't available here (no
	//    user is at the keyboard to surface a missing-key error).
	let model = opts.modelOverride;
	if (!model) {
		const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) return { ok: false, reason: "no_platform_key" };
		model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		}) as Parameters<typeof runAgent>[0]["model"];
	}

	// 5. OrgSnapshot for the module + vertical gates (same shape the chat
	//    orchestrator loads). Cheap; one indexed read.
	const orgSnapshotRaw = (await opts.ctx.runQuery(internal.orgs.queries.getOrgSnapshotForAI, {
		orgId: opts.orgId,
		userId: opts.agentUserId,
	})) as {
		hiddenSlots: string[];
		industryKey?: string;
		entityLabels?: OrgSnapshot["entityLabels"];
		currency?: string;
	};
	const org: OrgSnapshot = {
		hiddenSlots: new Set(orgSnapshotRaw.hiddenSlots),
		industryKey: orgSnapshotRaw.industryKey,
		entityLabels: orgSnapshotRaw.entityLabels,
		currency: orgSnapshotRaw.currency,
	};

	// 6. Build the principal — agent's RBAC is what every capability call
	//    inside the host gates against.
	const principal: Principal = {
		kind: "member",
		userId: opts.agentUserId,
		orgId: opts.orgId,
		permissions: ownerInfo.permissions,
		channel,
	};

	// 7. Run the host with `trigger:"autonomous"`. The host injects the
	//    "## Autonomy mode" block + the autonomous PROJECT-drive variant.
	const startedAt = Date.now();
	let runResult: Awaited<ReturnType<typeof runAgent>> | undefined;
	let runError: unknown;
	try {
		runResult = await runAgent({
			model,
			principal,
			channel,
			trigger: "autonomous",
			conversation: opts.conversationId
				? { conversationId: opts.conversationId as unknown as string }
				: undefined,
			message: buildAutonomousPrompt({
				transcript: opts.transcript,
				idempotencyKey: opts.idempotencyKey,
			}),
			history: [],
			ctx: opts.ctx,
			org,
		});
	} catch (err) {
		runError = err;
		console.error("[ai/autonomous] turn failed:", err);
	}

	const durationMs = Date.now() - startedAt;
	const errorMessage =
		runError instanceof Error ? runError.message : runError ? String(runError) : undefined;

	// 8. Marker row — debounce + audit. Written BEFORE the activity log so
	//    the next concurrent caller's debounce check sees this row even if
	//    the activity log write fails downstream.
	await opts.ctx.runMutation(internal.ai.runtime.autonomousState.recordAutonomousTurn, {
		orgId: opts.orgId,
		userId: opts.agentUserId,
		conversationId: opts.conversationId,
		startedAt,
		durationMs,
		ok: !runError && !!runResult,
		triggeredBy,
		inputTokens: runResult?.usage.inputTokens,
		outputTokens: runResult?.usage.outputTokens,
		errorMessage,
	});

	// 9. Activity log line — `actorType:"ai"`, mirrors what the chat
	//    orchestrator writes at the end of every turn. `entityId` is a
	//    free-form string on the activityLogs schema; `(no-conv)` marker
	//    keeps the row shape valid when the engine ran without a thread.
	if (runResult) {
		await opts.ctx
			.runMutation(internal.ai._logAIActivityInternal.logAIActivity, {
				orgId: opts.orgId,
				userId: opts.agentUserId,
				action: "ai.autonomous.turn",
				entityType: "conversation",
				entityId: (opts.conversationId as unknown as string) ?? AUTONOMOUS_TURN_MARKER,
				description: `Autonomous turn (${triggeredBy}) — ${runResult.toolCallCount} tool call${runResult.toolCallCount === 1 ? "" : "s"}, ${runResult.usage.inputTokens + runResult.usage.outputTokens} tokens.`,
				toolName: AUTONOMOUS_TURN_MARKER,
			})
			.catch(() => {});
	}

	if (runError || !runResult) {
		return { ok: false, reason: "host_error", message: errorMessage };
	}
	return {
		ok: true,
		toolCallCount: runResult.toolCallCount,
		text: runResult.text,
		usage: {
			inputTokens: runResult.usage.inputTokens,
			outputTokens: runResult.usage.outputTokens,
		},
	};
}

// ─── Public action surface ─────────────────────────────────────────────────

/**
 * The engine action. S13 wiring (Twilio webhook → handler) will schedule
 * this directly with `triggeredBy:"autonomous:whatsapp:<MessageSid>"`.
 */
export const autonomousTurn = internalAction({
	args: {
		orgId: v.id("orgs"),
		agentUserId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		transcript: v.string(),
		channel: v.optional(
			v.union(v.literal("chat"), v.literal("whatsapp"), v.literal("mcp"), v.literal("rest")),
		),
		triggeredBy: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		return await runAutonomousTurn({
			ctx,
			orgId: args.orgId,
			agentUserId: args.agentUserId,
			transcript: args.transcript,
			conversationId: args.conversationId,
			channel: (args.channel ?? "chat") as Channel,
			triggeredBy: args.triggeredBy,
			idempotencyKey: args.idempotencyKey,
		});
	},
});

/**
 * Manual / dev / test entrypoint. Same engine; distinct `triggeredBy`
 * default so the audit row clearly says "this came from a human kicking
 * the engine, not from real inbound." Real Twilio inbound is S13.
 */
export const triggerAutonomousTurnForTest = internalAction({
	args: {
		orgId: v.id("orgs"),
		agentUserId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		transcript: v.string(),
	},
	handler: async (ctx, args) => {
		return await runAutonomousTurn({
			ctx,
			orgId: args.orgId,
			agentUserId: args.agentUserId,
			transcript: args.transcript,
			conversationId: args.conversationId,
			channel: "chat",
			triggeredBy: "autonomous:manual",
		});
	},
});
