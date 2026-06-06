/**
 * Core capability types shared by every channel (chat, WhatsApp, MCP, REST).
 * Plain data — no AI-SDK coupling, no runtime dep on the legacy `tools/` layer.
 * Mirrors `AI-TOOLING-BUILD-STAGES.md` PART 1 §1.2.
 */
import type { z } from "zod";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";

/**
 * Discriminated union the chat surface uses to render structured tool
 * results (entity card, list, diff, note, task, settings card, …). Was
 * previously imported from the V1 `tools/_shared.ts`; co-located here
 * after S10 deleted that file. Keep this in sync with
 * `core/ai/components/results/ToolResultRenderer.tsx`.
 */
export type ToolDisplay =
	| { kind: "text"; text: string }
	| {
			kind: "entity";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
	  }
	| {
			kind: "entityList";
			entityType: "lead" | "contact" | "deal" | "company";
			entityIds: string[];
	  }
	| { kind: "personCode"; personCode: string }
	| { kind: "dealCode"; dealCode: string }
	| { kind: "note"; noteId: string }
	| { kind: "task"; taskId: string }
	| {
			kind: "diff";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
			before: Record<string, unknown>;
			after: Record<string, unknown>;
	  }
	| { kind: "insight"; insightId: string }
	| { kind: "settings"; sectionId: string }
	| { kind: "custom"; componentKey: string; props: Record<string, unknown> };

/** Reversibility of a capability — drives the autonomy / 2FA gate (§1.6). */
export type RiskTier = "safe" | "reversible" | "irreversible";

/** Where a capability call originated. */
export type Channel = "chat" | "whatsapp" | "mcp" | "rest";

/**
 * Who is acting. Permissions ALWAYS come from the server-side RBAC record,
 * never from the request body. `wa_profile` is the WhatsApp AI agent persona
 * (a per-org service member).
 */
export type Principal = {
	kind: "member" | "wa_profile";
	userId: Id<"users">;
	orgId: Id<"orgs">;
	permissions: string[];
	channel: Channel;
};

/**
 * Why this turn ran. Plumbed from `runAgent({ trigger })` through the host
 * into every CapabilityCtx so the audit feed (S12) can tag rows with
 * `source:"autonomous"` instead of conflating them with the principal's
 * channel (e.g. an agent-typed `whatsapp` request vs the autonomous engine
 * acting on a customer's inbound — same channel, very different intent).
 *
 * Optional + `"request"`-default — pre-S12 callers (and tests) keep the
 * historical behaviour where the audit row's `source` mirrored the
 * principal's `channel`.
 */
export type CapabilityTrigger = "request" | "autonomous" | "autonomous_reply";

/** Everything a capability's `run()` needs to execute. */
export type CapabilityCtx = {
	ctx: ActionCtx;
	principal: Principal;
	conversationId?: Id<"aiConversations">;
	/**
	 * What kicked off this turn. Forwarded by the host from
	 * `runAgent({ trigger })` so the wrapper can override the audit
	 * `source` field — distinguishing "the autonomous engine acted on
	 * an inbound WhatsApp" (`source:"autonomous"`) from "an agent
	 * typed a chat command" (`source:"chat"`) even when the principal's
	 * `channel` is the same.
	 *
	 * Optional. When undefined the wrapper falls back to
	 * `principal.channel`, preserving the pre-B.38 behaviour.
	 */
	trigger?: CapabilityTrigger;
	/** Present when a 2FA / double-confirm step-up has been completed. */
	stepUpToken?: string;
	/**
	 * Optional verifier the wrapper calls inside step 6 (risk gate) when
	 * `cap.risk === "irreversible"` AND `stepUpToken` is set. The verifier
	 * looks the token up in `aiStepUpTokens`, confirms it matches the
	 * (orgId, userId, capability, argsHash) tuple, and consumes it
	 * (single-use). Returns `false` for an unknown / expired / consumed
	 * token; the wrapper turns that into a `needs_step_up` envelope.
	 *
	 * Injected by the runtime host in production; left undefined in
	 * tests where the bare-token check (token present → ok) is enough.
	 */
	stepUpVerifier?: (cap: Capability, args: unknown) => Promise<boolean>;
};

/** Closed taxonomy of how a capability call can end (§1.5). */
export type Outcome =
	| "ok"
	| "partial"
	| "needs_repair"
	| "not_found"
	| "ambiguous"
	| "denied"
	| "channel_blocked"
	| "needs_step_up"
	| "business_error"
	| "infra_retry";

/** One field/value row rendered in a result card. */
export type ResultChange = {
	label: string;
	value: string;
	emphasis?: "added" | "changed" | "unchanged";
};

/** A clickable follow-up the user can run next. */
export type ResultSuggestion = { label: string; intent: string };

/** Self-correction hint the model reads to fix a bad argument and retry. */
export type ResultRepair = {
	field: string;
	expected: string;
	received: string;
	fix: string;
	example: object;
};

/**
 * The ONE envelope every capability returns. `headline` is required and must
 * never be empty — it kills the bare "Done." reply. `run()` cannot return a
 * raw string; the type forbids it.
 */
export type CapabilityResult = {
	status: Outcome;
	headline: string;
	changes?: ResultChange[];
	facts?: string[];
	/** Per-row failures for bulk / partial outcomes. */
	errors?: { item: string; reason: string }[];
	suggestedNext?: ResultSuggestion[];
	repair?: ResultRepair;
	data?: unknown;
	/** Reuse the existing FE union for chat result cards. */
	display?: ToolDisplay;
};

/** The model-facing contract — built from structured spec, not free text. */
export type CapabilitySpec = {
	whenToCall: string;
	whenNotToCall?: string;
	requiredClarifications?: string[];
	synonyms?: string[];
	goodExample: object;
	badExample?: { args: object; why: string };
};

/** Per-tool driving lines emitted for in-scope tools (§1.8). */
export type CapabilityDrive = {
	onSuccess: string;
	onValidationError?: string;
	onEmpty?: string;
	onPartial?: string;
	onDenied?: string;
	suggestNext?: string;
};

/**
 * A capability: a plain object usable by every channel. `input` is the STRICT
 * schema parsed inside the wrapper (S1); `run` is the single execution path.
 *
 * `run` receives `unknown` args at the base type because the registry erases
 * the per-capability arg type when it stores the capability. Authors get full
 * arg inference through {@link CapabilityDef} + `defineCapability` — see
 * `define.ts`. (`unknown`, not `any`: biome forbids `any` in non-test files.)
 */
export type Capability = {
	name: string;
	module: string;
	group: string;
	permission: string | null;
	risk: RiskTier;
	channels: Channel[];
	spec: CapabilitySpec;
	drive: CapabilityDrive;
	input: z.ZodType;
	run: (ctx: CapabilityCtx, args: unknown) => Promise<CapabilityResult>;
};

/**
 * Authoring shape for `defineCapability<TArgs>` — identical to {@link Capability}
 * but `input`/`run` are tied to `TArgs` so the `run` body gets typed args
 * inferred from the zod schema. `defineCapability` widens it to `Capability`.
 */
export type CapabilityDef<TArgs> = Omit<Capability, "input" | "run"> & {
	input: z.ZodType<TArgs>;
	run: (ctx: CapabilityCtx, args: TArgs) => Promise<CapabilityResult>;
};
