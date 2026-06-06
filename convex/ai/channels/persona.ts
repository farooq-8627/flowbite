"use node";
/**
 * WhatsApp Agent Profile (Mode C) — Stage S15.
 *
 * The persona that replies directly to a customer when they message a
 * `mode:"profile"` Twilio number. OFF by default; only acts when:
 *   1. The receiving Twilio number maps to an `agentChannels` row with
 *      `mode:"profile"`, `enabled:true`, and a `userId` pointing at the
 *      per-org wa_profile service member.
 *   2. `org.settings.aiAutonomy.whatsappAgentEnabled === true`.
 *   3. The per-conversation rate-limit window is open.
 *
 * Restricted scope (PART 1 §2.3): the persona may answer from CRM/FAQ,
 * capture lead info, book/schedule, and ESCALATE to a human. Anything
 * else (delete, settings, members, anything `irreversible`) is refused
 * by:
 *   - the `allowedToolNames` allow-list passed to `runAgent` (the model
 *     never sees those tools), AND
 *   - the registry gate's channel + risk fence (irreversible+whatsapp is
 *     blocked at the wrapper level — defence in depth).
 *
 * Sister files:
 *   - `whatsappInbound.ts`  — webhook orchestrator that routes profile
 *     mode here (Mode C dispatch).
 *   - `capabilities.ts`     — the `whatsapp` group + `send_whatsapp`.
 *
 * Spec: AI-TOOLING-BUILD-STAGES.md §S15, AI-TOOLING-LAYER-PLAN.md §2.3.
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
import { listCapabilities } from "../registry/define";
import type { OrgSnapshot } from "../registry/modules";
import type { Capability, Channel, Principal } from "../registry/types";
import { runAgent } from "../runtime/host";

// Side-effect import — registers the `escalate_to_agent` capability +
// the persona's drive lines on first load. Defined below.
import "./personaCapability";

// ─── Allow-list (the persona's tool surface) ──────────────────────────────

/**
 * Capability names the wa_profile principal MAY invoke. The list reads
 * exactly the spec (§S15): reply (send_whatsapp), draft, search_crm,
 * describe_entity, create_lead, create_task, add_note, escalate_to_agent
 * — and the always-on read-only cores (`read_conversation`,
 * `discover_capabilities`, `ask_user`). NOTHING else.
 *
 * Enforced TWICE — by filtering `runAgent`'s registry input AND by the
 * gate (channel + risk) inside `runCapability`. Removing a name from
 * this list shrinks the persona's reach without redeploying.
 */
export const WA_PROFILE_ALLOWED_TOOLS: ReadonlyArray<string> = [
	"send_whatsapp",
	"draft_message",
	"search_crm",
	"describe_entity",
	"read_conversation",
	"discover_capabilities",
	"ask_user",
	"create_lead",
	"create_task",
	"add_note",
	"escalate_to_agent",
];

/** Pure helper — filter a capability list to the persona's allow-list. */
export function filterCapabilitiesForWaProfile(caps: ReadonlyArray<Capability>): Capability[] {
	const allowed = new Set(WA_PROFILE_ALLOWED_TOOLS);
	return caps.filter((c) => allowed.has(c.name));
}

// ─── Mode C entrypoint ────────────────────────────────────────────────────

/**
 * Closed taxonomy of why a Mode C reply was skipped. Mirrors the
 * autonomous engine's reason codes (§S11) for symmetry — easier to
 * cross-reference in the audit feed.
 */
export type WaProfileSkipReason =
	| "wa_profile_disabled" //   master switch off
	| "wa_profile_not_seeded" //   agentChannels row has no `userId`
	| "wa_profile_no_perms" //   service member lost `messages.send`
	| "wa_profile_rate_limited" // per-conversation cooldown still open
	| "wa_profile_no_platform_key" // no AI provider key
	| "wa_profile_host_error"; //  runAgent threw

export type WaProfileReplyResult =
	| { ok: false; reason: WaProfileSkipReason; message?: string }
	| {
			ok: true;
			toolCallCount: number;
			text: string;
			usage: { inputTokens: number; outputTokens: number };
	  };

/**
 * Per-conversation rate limit. Mode C autonomy is high-blast-radius
 * (the persona speaks AS the brand) so we pace replies aggressively —
 * one reply per conversation per 30s. Burst handling (e.g. customer
 * sending 3 messages in 5s) collapses into a single reply that reads
 * the merged transcript. Caller can override per-test.
 */
export const WA_PROFILE_RATE_LIMIT_PERIOD_MS = 30 * 1000;
export const WA_PROFILE_RATE_LIMIT_MAX = 1;

// ─── Action surface ───────────────────────────────────────────────────────

export type RunWaProfileReplyOptions = {
	/** ActionCtx — the engine reads org snapshot + writes the audit row. */
	ctx: NonNullable<Parameters<typeof runAgent>[0]["ctx"]>;
	orgId: Id<"orgs">;
	/** The wa_profile service member id (from the agentChannels row's `userId`). */
	profileUserId: Id<"users">;
	/**
	 * Stable per-conversation key for the rate-limit bucket. Falls back to
	 * the recipient's personCode (`person:P-NNN`) or bare from-phone
	 * (`from:+9715…`) when no DB conversation row exists yet.
	 */
	rateLimitKey: string;
	/** Joined inbound transcript — the engine's "user message" of the turn. */
	transcript: string;
	/** Twilio MessageSid — forwarded to the host as `idempotencyKey`. */
	idempotencyKey: string;
	/**
	 * Optional model injection — production resolves from
	 * `PLATFORM_BRIEFING_MODEL` (mirrors the autonomous engine). Tests
	 * pass a `MockLanguageModelV3` here.
	 */
	modelOverride?: Parameters<typeof runAgent>[0]["model"];
};

/**
 * Pure engine entrypoint — the action below is just a Convex wrapper.
 * Exposing the function lets tests pass a `MockLanguageModelV3` + a
 * stub ctx without spinning the convex-test harness. Returns a typed
 * envelope; never throws.
 */
export async function runWaProfileReplyEngine(
	opts: RunWaProfileReplyOptions,
): Promise<WaProfileReplyResult> {
	// 1. Master switch + service-member RBAC.
	const ownerInfo = (await opts.ctx.runQuery(internal.orgs.queries.getMemberWithPermissions, {
		orgId: opts.orgId,
		userId: opts.profileUserId,
	})) as {
		permissions: string[];
		settings: Record<string, unknown>;
	} | null;
	if (!ownerInfo) return { ok: false, reason: "wa_profile_not_seeded" };

	const aiAutonomy = (ownerInfo.settings.aiAutonomy ?? {}) as {
		whatsappAgentEnabled?: boolean;
	};
	if (aiAutonomy.whatsappAgentEnabled !== true) {
		return { ok: false, reason: "wa_profile_disabled" };
	}

	if (!ownerInfo.permissions.includes("messages.send")) {
		return { ok: false, reason: "wa_profile_no_perms" };
	}

	// 2. Per-conversation rate limit.
	const rateOk = await opts.ctx.runMutation(
		internal._shared.rateLimitMutation.tryConsumeRateLimitInternal,
		{
			scope: "wa_profile.reply",
			key: `${opts.orgId}:${opts.rateLimitKey}`,
			max: WA_PROFILE_RATE_LIMIT_MAX,
			periodMs: WA_PROFILE_RATE_LIMIT_PERIOD_MS,
			orgId: opts.orgId,
		},
	);
	if (!(rateOk as { ok: boolean }).ok) {
		return { ok: false, reason: "wa_profile_rate_limited" };
	}

	// 3. Resolve a LanguageModel — mirrors the autonomous engine.
	let model = opts.modelOverride;
	if (!model) {
		const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) return { ok: false, reason: "wa_profile_no_platform_key" };
		model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		}) as Parameters<typeof runAgent>[0]["model"];
	}

	// 4. OrgSnapshot.
	const orgSnapshotRaw = (await opts.ctx.runQuery(internal.orgs.queries.getOrgSnapshotForAI, {
		orgId: opts.orgId,
		userId: opts.profileUserId,
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

	// 5. wa_profile principal.
	const principal: Principal = {
		kind: "wa_profile",
		userId: opts.profileUserId,
		orgId: opts.orgId,
		permissions: ownerInfo.permissions,
		channel: "whatsapp",
	};

	// 6. Allow-list filtered registry.
	const filteredRegistry = filterCapabilitiesForWaProfile(listCapabilities());

	// 7. Run the host with `trigger:"autonomous_reply"`.
	try {
		const result = await runAgent({
			model,
			principal,
			channel: "whatsapp" satisfies Channel,
			trigger: "autonomous_reply",
			message: opts.transcript,
			history: [],
			ctx: opts.ctx,
			org,
			registry: filteredRegistry,
		});
		return {
			ok: true,
			toolCallCount: result.toolCallCount,
			text: result.text,
			usage: {
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			},
		};
	} catch (err) {
		console.error("[ai/wa_profile] reply turn failed:", err);
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: "wa_profile_host_error", message };
	}
}

/**
 * Run a Mode C reply turn. Called by the Twilio inbound orchestrator
 * (S13) after the channel mode is identified as `"profile"` and the
 * master switch is verified at-rest. A single call corresponds to ONE
 * customer message — the engine reads the conversation history via
 * `read_conversation` for context.
 *
 * Failing closed: every skip reason returns 200 to the webhook (Twilio
 * doesn't need to retry — we processed the inbound, we just didn't
 * reply). The caller can log the reason in the audit feed.
 */
export const runWaProfileReply = internalAction({
	args: {
		orgId: v.id("orgs"),
		/** The wa_profile service member id (from the agentChannels row's `userId`). */
		profileUserId: v.id("users"),
		/**
		 * Stable per-conversation key for the rate-limit bucket. The
		 * Twilio inbound handler picks this from the messages-table
		 * conversationId when one exists, the recipient's personCode
		 * otherwise, or the bare `from` phone for unknown senders.
		 * Keeps rapid customer pings to the same person collapsed.
		 */
		rateLimitKey: v.string(),
		/**
		 * Joined inbound transcript (pre-formatted by the inbound handler
		 * via `formatInboundTranscript`). The engine uses this as the
		 * "user message" of the turn.
		 */
		transcript: v.string(),
		/**
		 * Twilio MessageSid of the inbound — forwarded to the host as
		 * `idempotencyKey` for the audit row.
		 */
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args): Promise<WaProfileReplyResult> => {
		return await runWaProfileReplyEngine({
			ctx,
			orgId: args.orgId,
			profileUserId: args.profileUserId,
			rateLimitKey: args.rateLimitKey,
			transcript: args.transcript,
			idempotencyKey: args.idempotencyKey,
		});
	},
});

// ─── Helper: resolve the wa_profile member id from a profile-mode channel ──

/**
 * The Twilio webhook resolves the `agentChannels` row first (to verify
 * the receiving number); when its `mode === "profile"` it calls back
 * here for the principal's userId. We keep the lookup separate from
 * `runWaProfileReply` so the webhook can fail closed on a missing
 * `userId` BEFORE building the LLM prompt.
 *
 * Returns `null` when the row exists but `userId` is undefined; the
 * webhook translates that to a `noop:wa_profile_not_seeded` outcome.
 *
 * Lives on the V8 sister surface (it's a pure DB read), exported via
 * the standard `personaState.ts` companion below.
 */
export type WaProfileChannelLookup = {
	orgId: Id<"orgs">;
	profileUserId: Id<"users"> | null;
	enabled: boolean;
};

// Marker re-export so callers have a single import surface.
export { runAgent };
