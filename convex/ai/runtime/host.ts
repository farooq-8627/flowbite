"use node";
/**
 * Agent host — ONE entrypoint for every channel: `runAgent({...})`.
 *
 * Mechanics: progressive disclosure via `prepareStep` (active tool set
 * grows when `discover_capabilities` returns `data.expand`); prompt caching
 * via the Anthropic ephemeral marker on the stable prefix; retry budget on
 * needs_repair / infra_retry (default 2); `stepCountIs` cap (default 25).
 *
 * Logs `[ai/host] usage: input=X cached=Y output=Z` per turn. Auth/plan/
 * quota are the caller's concern; the host just consumes a `LanguageModel`.
 */
import {
	type LanguageModel,
	type ModelMessage,
	type StopCondition,
	type SystemModelMessage,
	stepCountIs,
	streamText,
	type ToolSet,
} from "ai";
import {
	buildOrgEntityAliases,
	clearPerTurnEntityAliases,
	setPerTurnEntityAliases,
} from "../../_shared/synonyms";
import { capabilitiesInGroups, listGroupKeys } from "../registry/catalog";
import { listCapabilities } from "../registry/define";
import { ANTHROPIC_CACHE_CONTROL_EPHEMERAL, assembleSystemPrompt } from "../registry/drive";
import { renderGroupPlaybooks } from "../registry/groups";
import {
	activeModules,
	EMPTY_ORG_SNAPSHOT,
	filterCapabilitiesByModules,
	type OrgSnapshot,
	renderActiveModuleContext,
} from "../registry/modules";
import { projectAll } from "../registry/projectors/aiSdk";
import { adaptiveRouter, type RouteCtx } from "../registry/router";
import type { Capability, CapabilityCtx, Channel, Principal } from "../registry/types";
import { renderVerticalAddendum } from "../registry/vertical";
import { CORE_CAPABILITIES, CORE_CAPABILITY_NAMES } from "./coreTools";
import { nativeSearchProviderOptions, nativeSearchTools } from "./nativeWebSearch";
import {
	entityTypesForGroups,
	loadPreflightContext,
	type PreflightContext,
	renderPreflightContext,
} from "./preflight";

// Side-effect imports: each registers a domain's capabilities + group
// playbook the first time the host module loads. Keep one line per
// domain so adding/removing a domain is a single-line review delta.
import "../../crm/entities/leads/capabilities";
import "../../crm/entities/deals/capabilities";
import "../../crm/entities/companies/capabilities";
import "../../crm/shared/tasks/capabilities";
import "../../crm/shared/notes/capabilities";
import "../../crm/shared/timeline/capabilities";
import "../../notifications/capabilities";
import "../../crm/fields/pipelines/capabilities";
import "../../crm/fields/fieldDefinitions/capabilities";
import "../../crm/shared/tags/capabilities";
import "../../crm/shared/savedViews/capabilities";
import "../../crm/shared/noteCategories/capabilities";
// S10 — settings + members + roles + bulk/destructive surface.
import "../../orgs/capabilities";
import "../../crm/shared/bulk/capabilities";

// H.13 — V2 ports of the remaining domains. Each side-effect import
// registers its capabilities + group playbook at module load.
import "../../messaging/capabilities";
import "../../files/capabilities";
import "../../dashboard/capabilities";
import "../analytics/capabilities";
import "../creative/capabilities";
import "../interaction/capabilities";
import "../proactive/capabilities";
import "../quarantined/capabilities";

// S14 — WhatsApp outbound (`send_whatsapp` capability + `whatsapp` group).
// Imports must come AFTER the messaging surface above so the playbook order
// reads outbound after in-app chat in the prompt catalog.
import "../channels/capabilities";
// S15 — `escalate_to_agent` capability + the wa_profile persona's
// constrained allow-list. The capability registers via `defineCapability`
// at import time; the principal-resolution logic lives in
// `channels/persona.ts` (Node action — not imported here).
import "../channels/personaCapability";

// Side-effect imports for the module + vertical registries — built-in
// ModuleDef + VerticalProfile rows register at import time.
import "../registry/modules";
import "../registry/vertical";

// ─── Tunables ───────────────────────────────────────────────────────────────

/**
 * Max tool-use steps a turn may take before the host hard-stops.
 *
 * Set to 25 (locked 2026-06-06 by user) to fit our progressive-disclosure
 * pattern: a typical multi-entity flow burns 4–6 steps on `describe_*` /
 * `discover_capabilities` BEFORE the first write, then 8–12 on the actual
 * actions + retries, then 1 on the summary turn. The original cap of 10
 * was hitting the ceiling on routine multi-step CRM tasks (e.g. "create 5
 * inquiries, convert 2, then create projects in two pipelines").
 *
 * Reference: Vercel AI SDK default is `stepCountIs(20)` per
 * https://ai-sdk.dev/docs/agents/loop-control . Their analytical-workflow
 * example uses `stepCountIs(50)`. We sit at 25 so we have headroom over
 * the SDK default without inviting runaway costs. The independent
 * `RETRY_BUDGET` (default 2) still bounds consecutive needs_repair /
 * infra_retry outcomes — so a stuck loop doesn't burn all 25.
 */
export const MAX_STEPS = 25;

/** Max consecutive needs_repair / infra_retry outcomes before the host stops. */
export const RETRY_BUDGET = 2;

/**
 * B.44 — normalised citation shape persisted on `aiMessages.metadata.citations`.
 * Renderers (`AssistantTurn.tsx`) surface these as a "Sources" rail beneath
 * the assistant prose when present.
 */
export type Citation = {
	/** Absolute http(s) URL — required so the rail can `<a target="_blank">`. */
	url: string;
	/** Page title surfaced in the chip; falls back to URL hostname when missing. */
	title?: string;
	/** Optional 1-2 line excerpt under the title. */
	snippet?: string;
	/**
	 * Which surface produced the citation: Firecrawl `web_search`, Anthropic
	 * server-side, OpenAI Responses, or Google grounding. Useful for telemetry
	 * + debugging, not user-facing.
	 */
	source: "firecrawl" | "anthropic" | "openai" | "google";
};

/**
 * Extract citations from a per-tool envelope returned by our Firecrawl-backed
 * `web_search` capability. The capability returns `data.results: Array<{title,
 * url, description}>` (see `convex/ai/creative/capabilities.ts:web_search`),
 * which we normalise into `Citation[]` here. Returns `[]` when the envelope
 * is from a different tool or has no results.
 */
function extractCitationsFromWebSearchEnvelope(toolName: string, envelope: unknown): Citation[] {
	if (toolName !== "web_search") return [];
	if (!envelope || typeof envelope !== "object") return [];
	const data = (envelope as { data?: unknown }).data;
	if (!data || typeof data !== "object") return [];
	const results = (data as { results?: unknown }).results;
	if (!Array.isArray(results)) return [];
	const out: Citation[] = [];
	for (const r of results) {
		if (!r || typeof r !== "object") continue;
		const url = (r as { url?: unknown }).url;
		if (typeof url !== "string" || url.length === 0) continue;
		const title = (r as { title?: unknown }).title;
		const description = (r as { description?: unknown }).description;
		out.push({
			url,
			...(typeof title === "string" && title.length > 0 ? { title } : {}),
			...(typeof description === "string" && description.length > 0
				? { snippet: description }
				: {}),
			source: "firecrawl",
		});
	}
	return out;
}

/**
 * Extract citations from `result.providerMetadata` post-stream. Today this
 * covers Google Gemini grounding chunks (the only provider that surfaces
 * citations purely on `providerMetadata`). Anthropic + OpenAI native
 * server-side search return citations as `tool_result` chunks during the
 * stream — collected via `onStepFinish` from the `web_search_native` tool
 * envelopes if/when we promote that surface past v1.
 *
 * Sources:
 *  - Google grounding metadata: https://ai.google.dev/gemini-api/docs/grounding#response-metadata
 *  - AI SDK Google provider: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
 */
function extractCitationsFromProviderMetadata(metadata: unknown): Citation[] {
	if (!metadata || typeof metadata !== "object") return [];
	const google = (metadata as { google?: unknown }).google;
	if (!google || typeof google !== "object") return [];
	const grounding = (google as { groundingMetadata?: unknown }).groundingMetadata;
	if (!grounding || typeof grounding !== "object") return [];
	const chunks = (grounding as { groundingChunks?: unknown }).groundingChunks;
	if (!Array.isArray(chunks)) return [];
	const out: Citation[] = [];
	for (const c of chunks) {
		if (!c || typeof c !== "object") continue;
		const web = (c as { web?: unknown }).web;
		if (!web || typeof web !== "object") continue;
		const uri = (web as { uri?: unknown }).uri;
		if (typeof uri !== "string" || uri.length === 0) continue;
		const title = (web as { title?: unknown }).title;
		out.push({
			url: uri,
			...(typeof title === "string" && title.length > 0 ? { title } : {}),
			source: "google",
		});
	}
	return out;
}

/**
 * Extract citations from `result.sources` — the AI SDK v6 normalised
 * post-stream view that aggregates `source-url` / `source-document`
 * stream parts emitted by Anthropic + OpenAI Responses native web
 * search. The shape is:
 *
 *   Array<{
 *     sourceType: 'url' | 'document',
 *     id?: string,
 *     url?: string,
 *     title?: string,
 *     providerMetadata?: { [provider]: { ... } },
 *   }>
 *
 * The provider hint (`anthropic` / `openai`) is best-effort — when
 * `providerMetadata` carries a recognisable provider key we tag the
 * citation accordingly so the chat UI's Sources rail can colour-code
 * if it ever needs to. Missing/unknown providers fall through to
 * `firecrawl` as a defensive default (the rail still renders fine).
 *
 * Source: https://ai-sdk.dev/providers/ai-sdk-providers/openai#web-search-tool
 *         (`result.sources` returns `{ type: 'url', url: string }` rows)
 *         + https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#web-search-tool
 *         (Anthropic web_search_20250305 streams `source-url` parts that
 *          land here post-stream)
 */
function extractCitationsFromSources(sources: unknown): Citation[] {
	if (!Array.isArray(sources)) return [];
	const out: Citation[] = [];
	for (const s of sources) {
		if (!s || typeof s !== "object") continue;
		// Document sources (file_search / code_interpreter) carry no URL,
		// so we can't render them in the rail. Skip — the model still
		// inlines an annotation in the prose body.
		const sourceType = (s as { sourceType?: unknown }).sourceType;
		if (sourceType !== "url" && sourceType !== undefined) continue;
		const url = (s as { url?: unknown }).url;
		if (typeof url !== "string" || url.length === 0) continue;
		const title = (s as { title?: unknown }).title;
		const providerMetadata = (s as { providerMetadata?: unknown }).providerMetadata;
		// Best-effort provider tagging. The Sources rail surface is the
		// same regardless; this is informational telemetry.
		let provider: Citation["source"] = "firecrawl";
		if (providerMetadata && typeof providerMetadata === "object") {
			if ("anthropic" in providerMetadata) provider = "anthropic";
			else if ("openai" in providerMetadata) provider = "openai";
			else if ("google" in providerMetadata) provider = "google";
		}
		out.push({
			url,
			...(typeof title === "string" && title.length > 0 ? { title } : {}),
			source: provider,
		});
	}
	return out;
}

/**
 * Dedup a citation list by URL — sometimes the model triggers the same
 * `web_search` call twice and we don't want duplicate chips. Order is
 * preserved from first occurrence so the [n] ordering remains stable.
 */
function dedupeCitations(citations: Citation[]): Citation[] {
	const seen = new Set<string>();
	const out: Citation[] = [];
	for (const c of citations) {
		if (seen.has(c.url)) continue;
		seen.add(c.url);
		out.push(c);
	}
	return out;
}

// ─── Public surface ─────────────────────────────────────────────────────────

/** Token usage returned to the caller (in addition to the streamed text). */
export type AgentUsage = {
	inputTokens: number;
	cachedInputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

/** The shape `runAgent` resolves to once the stream finishes. */
export type AgentRunResult = {
	/** Concatenated assistant text from every step. */
	text: string;
	/** AI SDK finish reason: "stop", "tool-calls", "length", "content-filter", "error", "other". */
	finishReason: string;
	/** Aggregated usage across every step, including cache-read tokens. */
	usage: AgentUsage;
	/** Tool calls executed across every step (not flushed mid-stream — settle-time only). */
	toolCallCount: number;
	/** Snapshots of progressive-disclosure decisions, useful for tests / debugging. */
	stepActiveToolHistory: string[][];
	/** The router's decision for step 0 — useful to log alongside usage. */
	router: ReturnType<typeof adaptiveRouter>;
	/**
	 * B.44 — provider grounding metadata captured post-stream + during the
	 * stream. Currently `{ citations: Citation[] }`; future provider
	 * metadata (e.g. token-by-token timings) can be folded into the same
	 * envelope. `undefined` when no citations were produced — caller should
	 * treat that as "no Sources rail" and persist nothing on the message.
	 */
	metadata?: { citations?: Citation[] };
	/**
	 * A — V1-style inline approval (locked 2026-06-06). Set when the
	 * stream stopped because an irreversible capability returned a
	 * `needs_step_up` envelope. The orchestrator settles the assistant
	 * message with `thinkingState: "awaiting_approval"` and surfaces the
	 * capability + args + headline so `<StepUpCard>` mounts inline at
	 * the right timeline row. After the user confirms twice,
	 * `aiStepUp.confirmStepUp` schedules `processChat.runResume` which
	 * re-enters this host with the same `assistantMsgId` and the
	 * issued token; the wrapper consumes the token and the stream
	 * continues into the SAME message bubble.
	 */
	awaitingApproval?: {
		capability: string;
		args: Record<string, unknown>;
		headline: string;
	};
};

/** What the caller passes to `runAgent`. */
export type RunAgentArgs = {
	/** A LanguageModelV3 instance — typically built via `models.ts:buildLanguageModel`. */
	model: LanguageModel;
	/**
	 * Provider id of `model` ("anthropic" / "openai" / "google" / "groq" / …).
	 * Used to decide whether to inject native server-side web search tools
	 * (`web_search_native` for Anthropic + OpenAI Responses, or grounding
	 * via `providerOptions.google` for Gemini). Optional — when absent we
	 * skip the native injection and only the Firecrawl-backed `web_search`
	 * capability is available, which is the safe path on every provider.
	 */
	providerHint?: string;
	/** Acting principal — used for RBAC + channel + cap.run(ctx). */
	principal: Principal;
	/** Channel this turn ran on. Mirrors `principal.channel` but explicit for clarity. */
	channel: Channel;
	/** Trigger — used by router defaults and (S11+) by autonomousTurn. */
	trigger?: "chat" | "autonomous" | "autonomous_reply";
	/** Conversation context — page mode, route summary, optional aiConversations id. */
	conversation?: {
		conversationId?: string;
		routeCtx?: RouteCtx;
	};
	/** The user (or trigger source) message that started this turn. */
	message: string;
	/** Prior turns for context — already filtered to non-empty user/assistant rows. */
	history?: Array<{ role: "user" | "assistant"; content: string }>;
	/**
	 * Optional dependency-injection seam for tests. Defaults to
	 * `listCapabilities()` so production code reads the live registry; tests
	 * can pass a fixed list for deterministic assertions.
	 */
	registry?: Capability[];
	/**
	 * Optional per-org snapshot — used by the module gate (`activeModules`)
	 * and the vertical addendum (`renderVerticalAddendum`). Defaults to
	 * `EMPTY_ORG_SNAPSHOT` (every module enabled, no vertical persona) so
	 * tests + back-compat callers don't need to construct one.
	 */
	org?: OrgSnapshot;
	/** Optional ActionCtx so capabilities can call internal queries. Required at runtime; tests can omit. */
	ctx?: CapabilityCtx["ctx"];
	/**
	 * S10 — single-use 2FA step-up token. Set when the chat client just
	 * issued a token via `aiStepUp.confirmStepUp` and is re-running the
	 * turn. The host injects a verifier into every CapabilityCtx that
	 * looks the token up in `aiStepUpTokens`, confirms it matches the
	 * (orgId, userId, capability, argsHash) tuple, and consumes it.
	 * Forwarded to `runCapability` as `ctx.stepUpToken`; the wrapper's
	 * step 6b consumes it before any irreversible cap.run().
	 */
	stepUpToken?: string;
	/** Optional async callback called for each text-delta chunk — caller writes to DB. */
	onTextDelta?: (textDelta: string, accumulated: string) => Promise<void> | void;
	/** Optional async callback called when a step finishes — caller can log telemetry. */
	onStepFinish?: (event: {
		stepNumber: number;
		text: string;
		toolCallNames: string[];
	}) => Promise<void> | void;
	/**
	 * Optional async callback fired AFTER each step finishes, ONCE per
	 * tool call that completed in that step (joined `toolCalls ↔
	 * toolResults` by `toolCallId`). Chat uses this to persist the call
	 * as an `aiMessages` `role: "tool"` row so the `<ThinkingTimeline>`
	 * panel can render the per-step rail. Other channels (WhatsApp,
	 * MCP, REST, autonomous) just don't pass a callback — channel-
	 * agnostic. The wrapper's `runCapability` already wrote the audit
	 * row at step 7; this callback is purely a UI surfacing seam.
	 */
	onToolEvent?: (event: {
		toolCallId: string;
		toolName: string;
		input: unknown;
		output: unknown;
		ok: boolean;
	}) => Promise<void> | void;
};

// ─── runAgent ───────────────────────────────────────────────────────────────

export async function runAgent(args: RunAgentArgs): Promise<AgentRunResult> {
	const turnStartedAt = Date.now();
	const allCaps = (args.registry ?? listCapabilities()).slice();
	const org = args.org ?? EMPTY_ORG_SNAPSHOT;

	// 1. Ensure CORE caps are in the registry. Tests that pass a fixed
	//    registry sometimes forget; the host always adds them so the
	//    catalog + active set are coherent.
	for (const core of CORE_CAPABILITIES) {
		if (!allCaps.find((c) => c.name === core.name)) allCaps.push(core);
	}

	// 2. Compute the active-module set ONCE per turn. Module-off hides BOTH
	//    the capability and its context block — the single switch the §1.7
	//    plan calls out (pipelines off → pipeline tools AND context gone).
	const active = activeModules(org);

	// 3. Filter to capabilities reachable from this principal+channel+module.
	//    The catalog is what the model sees on every turn — listing tools the
	//    user can't run wastes tokens AND tempts the model to call them.
	const moduleFiltered = filterCapabilitiesByModules(allCaps, active);
	const visibleCaps = moduleFiltered.filter((c) => {
		if (!c.channels.includes(args.channel)) return false;
		// Permission check: `null` means unguarded. Otherwise the principal
		// must hold the permission. (Defence-in-depth — the wrapper enforces
		// it again at execute time.)
		if (c.permission !== null && !args.principal.permissions.includes(c.permission)) {
			return false;
		}
		return true;
	});

	// 3. Router → the groups to preload in step 0. Intersected with the
	//    registered groups + visibleCaps so a typo or absent group doesn't
	//    crash; the model can still call discover_capabilities.
	const router = adaptiveRouter(args.message, args.conversation?.routeCtx, visibleCaps);
	const preloadedNames = new Set<string>(CORE_CAPABILITY_NAMES);
	for (const cap of capabilitiesInGroups(visibleCaps, router.groups)) {
		preloadedNames.add(cap.name);
	}

	// 3b. Pre-flight context (locked 2026-06-06) — collapse the typical
	//     `describe_entity` round-trip by inlining live `fieldDefinitions`
	//     for the entity types implied by the router's preloaded groups.
	//     The block lands in the per-turn TAIL so it rides the prompt
	//     cache; cost is one query per relevant entity type. Skipped when
	//     `args.ctx` is absent (test harness path) or no entity-related
	//     group is preloaded — non-CRM turns add no preflight tokens.
	let preflight: PreflightContext = { byEntity: {} };
	const preflightEntityTypes = entityTypesForGroups(router.groups);
	if (args.ctx && preflightEntityTypes.length > 0) {
		try {
			preflight = await loadPreflightContext(
				{
					ctx: args.ctx as CapabilityCtx["ctx"],
					principal: { orgId: args.principal.orgId, userId: args.principal.userId },
				},
				preflightEntityTypes,
			);
		} catch (err) {
			// Failure-tolerant — pre-flight is an OPTIMISATION, not a
			// requirement. A read failure should never break a turn; the
			// model falls back to `describe_entity` exactly as before.
			console.warn("[ai/host] preflight load failed:", err);
		}
	}

	// 4. Build the system prompt. Stable prefix = PROJECT drive + catalog of
	//    every visible cap; tail = per-turn route + group playbooks + active tail.
	const tail = buildPromptTail({
		routeCtx: args.conversation?.routeCtx,
		trigger: args.trigger ?? "chat",
		preloaded: Array.from(preloadedNames),
		availableGroups: listGroupKeys(visibleCaps),
		activeGroups: router.groups,
		caps: visibleCaps,
		org,
		activeModuleKeys: active,
		preflight,
		userMessage: args.message,
	});
	const assembled = assembleSystemPrompt(visibleCaps, tail);

	// 5. system messages: two parts so the cache breakpoint lands cleanly.
	const systemMessages: SystemModelMessage[] = [
		{
			role: "system",
			content: assembled.stablePrefix,
			providerOptions: ANTHROPIC_CACHE_CONTROL_EPHEMERAL,
		},
	];
	if (assembled.tail.length > 0) {
		systemMessages.push({ role: "system", content: assembled.tail });
	}

	// 6. Project capabilities → AI SDK tools dict. We pass EVERY visible cap
	//    so progressive disclosure can flip them on without re-projecting.
	//
	//    B.38 — Forward `args.trigger` into every CapabilityCtx so the
	//    wrapper's audit-write step can override `source` to `"autonomous"`
	//    / `"autonomous_reply"` when the engine drove the turn (rather
	//    than letting `source` mirror the principal's `channel`).
	const ctxTrigger: CapabilityCtx["trigger"] =
		args.trigger === "autonomous"
			? "autonomous"
			: args.trigger === "autonomous_reply"
				? "autonomous_reply"
				: "request";
	const getCtx: () => CapabilityCtx = () => ({
		// `ctx` is only needed when a tool's `run` actually calls a Convex
		// query/mutation. The S2 acceptance test (a plain "hi") never does,
		// so omitting `ctx` from the test-side path is safe — runCapability
		// just won't invoke any DB-backed tool.
		ctx: args.ctx as CapabilityCtx["ctx"],
		principal: args.principal,
		conversationId: args.conversation?.conversationId as CapabilityCtx["conversationId"],
		trigger: ctxTrigger,
		stepUpToken: args.stepUpToken,
		// S10 — inject the live token verifier. Calls
		// `aiStepUp.verifyAndConsumeInternal` with the same args the
		// wrapper saw, hashed server-side. Single-use: the row is
		// marked `consumedAt` on success so a model that re-runs the
		// same tool a second time during one turn is rejected.
		stepUpVerifier: args.ctx
			? async (cap, capArgs) => {
					if (!args.stepUpToken) return false;
					const { hashArgs } = await import("../../aiStepUp");
					const { internal } = await import("../../_generated/api");
					const argsHash = await hashArgs(capArgs);
					const result = (await args.ctx?.runMutation(
						internal.aiStepUp.verifyAndConsumeInternal,
						{
							orgId: args.principal.orgId,
							userId: args.principal.userId,
							token: args.stepUpToken,
							capability: cap.name,
							argsHash,
						},
					)) as { ok: boolean } | undefined;
					return result?.ok === true;
				}
			: undefined,
	});
	const tools: ToolSet = projectAll(visibleCaps, getCtx) as ToolSet;

	// 6b. Native server-side web search injection. When the provider
	//     supports it (Anthropic / OpenAI Responses / Google), we layer
	//     the provider's own search tool ON TOP of our Firecrawl-backed
	//     `web_search` capability so the model can pick the fastest path
	//     inline. On every other provider (Groq, Mistral, NVIDIA, etc.)
	//     this is a no-op; only the Firecrawl-backed `web_search`
	//     remains. See `nativeWebSearch.ts` for the per-provider mapping.
	const nativeTools = nativeSearchTools(args.providerHint ?? "");
	for (const [name, tool] of Object.entries(nativeTools)) {
		// `tool` is a provider-defined tool the AI SDK forwards to the
		// provider unchanged; we deliberately don't implement `execute()`.
		(tools as Record<string, unknown>)[name] = tool;
	}
	const nativeProviderOptions = nativeSearchProviderOptions(args.providerHint ?? "");

	// 7. Convert message history → ModelMessage[].
	const messages = buildModelMessages(args.history ?? [], args.message);

	// 8. Progressive disclosure state — observable from tests.
	const stepActiveToolHistory: string[][] = [];
	const activeNames = new Set<string>(preloadedNames);

	// 9. Track usage + step results so we can settle the result and log
	//    tokens. AI SDK aggregates usage across steps inside the stream
	//    result, but reading it is awkward without onFinish.
	let aggregatedUsage: AgentUsage = {
		inputTokens: 0,
		cachedInputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};
	let toolCallCount = 0;
	// B.44 — collected per-step from web_search envelopes; merged with
	// post-stream providerMetadata citations before we return.
	const collectedCitations: Citation[] = [];
	// A — captured inside onStepFinish whenever a tool returns a
	// `needs_step_up` envelope. The first match wins (multi-tool steps
	// are rare; if the model triggers two irreversibles in one step we
	// approve them one at a time). Surfaced on AgentRunResult so the
	// orchestrator can settle thinkingState as "awaiting_approval".
	let awaitingApproval: AgentRunResult["awaitingApproval"];

	// Stop-conditions:
	//   • stepCountIs(MAX_STEPS) — the design ceiling.
	//   • exhaustedRetryBudget   — bail when the retry budget is gone.
	//   • awaitingApprovalStop   — A: bail RIGHT after a tool returns
	//     `needs_step_up` so the model can't generate "Shall I proceed?"
	//     prose. The user sees the inline approval card at the
	//     awaiting tool row, clicks Confirm twice, and the stream
	//     resumes via `processChat.runResume`.
	const stopConditions: Array<StopCondition<typeof tools>> = [
		stepCountIs(MAX_STEPS),
		makeRetryBudgetStopCondition(RETRY_BUDGET),
		makeAwaitingApprovalStopCondition(),
	];

	// AI SDK streams are "secure-by-default" — provider errors land on the
	// onError callback instead of throwing out of `await result.text` (see
	// `sdk.vercel.ai/docs/troubleshooting/stream-text-not-working` and
	// `vercel/ai#4099`). Capture here so the post-stream block below can
	// surface the underlying provider error to the orchestrator's failover
	// chain instead of silently resolving with text="" + finishReason="error".
	let streamError: unknown = null;

	// Entity-label fix (locked 2026-06-06) — install the per-turn alias map
	// BEFORE `streamText` so the Zod preprocessor in `entityTypeEnum()` sees
	// custom labels like "Inquiry" / "Client" / etc. Cleared in the
	// `finally` below so a leaked alias from a previous turn never coerces
	// an unrelated org's input. Builder accepts `undefined` and returns an
	// empty map so non-org-snapshot callers (tests) are no-ops.
	setPerTurnEntityAliases(buildOrgEntityAliases(args.org?.entityLabels));

	const result = streamText({
		model: args.model,
		system: systemMessages,
		messages,
		tools,
		stopWhen: stopConditions,
		// Native search grounding (Google) — merged when providerHint matches.
		// Anthropic + OpenAI native search ride on the `tools` dict above.
		...(Object.keys(nativeProviderOptions).length > 0
			? { providerOptions: nativeProviderOptions }
			: {}),
		prepareStep: ({ stepNumber }) => {
			// Step 0 uses the router-seeded set. Subsequent steps may grow it
			// when discover_capabilities returned `data.expand: string[]` —
			// we re-read the snapshot history below.
			const snapshot = Array.from(activeNames).sort();
			stepActiveToolHistory[stepNumber] = snapshot;
			return { activeTools: snapshot as Array<keyof typeof tools> };
		},
		onStepFinish: async (step) => {
			toolCallCount += step.toolCalls.length;

			// Progressive disclosure: scan tool results for a discovery
			// envelope's `data.expand` and union those names into the
			// active set BEFORE the next prepareStep fires.
			//
			// B.44 — same loop pulls citations out of every `web_search`
			// envelope. Cheap (we already iterate the array); avoids a
			// second pass post-stream.
			for (const tr of step.toolResults) {
				// AI SDK shape: tr.toolName + tr.output (typed). For the
				// permissive-input projector our `output` IS the
				// CapabilityResult envelope.
				const envelope = (tr as unknown as { output?: unknown }).output;
				const toolName = (tr as unknown as { toolName?: unknown }).toolName;
				if (envelope && typeof envelope === "object") {
					const data = (envelope as { data?: unknown }).data;
					if (
						data &&
						typeof data === "object" &&
						Array.isArray((data as { expand?: unknown[] }).expand)
					) {
						for (const name of (data as { expand: unknown[] }).expand) {
							if (typeof name === "string") activeNames.add(name);
						}
					}
					// A — capture the first `needs_step_up` envelope so the
					// host can surface it on AgentRunResult. The
					// awaitingApprovalStop condition (above) will halt the
					// loop after this step finishes; no risk of capturing
					// a SECOND step-up because there isn't one.
					const status = (envelope as { status?: unknown }).status;
					if (status === "needs_step_up" && !awaitingApproval) {
						const matchingCall = step.toolCalls.find(
							(c) =>
								c.toolCallId ===
								(tr as unknown as { toolCallId?: unknown }).toolCallId,
						);
						const capName =
							typeof toolName === "string"
								? toolName
								: (matchingCall?.toolName ?? "");
						const callInput = matchingCall
							? ((matchingCall as unknown as { input?: unknown }).input ?? {})
							: {};
						const headline =
							typeof (envelope as { headline?: unknown }).headline === "string"
								? (envelope as { headline: string }).headline
								: `"${capName}" is irreversible — confirm to proceed.`;
						awaitingApproval = {
							capability: capName,
							args:
								callInput && typeof callInput === "object"
									? (callInput as Record<string, unknown>)
									: {},
							headline,
						};
					}
				}
				if (typeof toolName === "string") {
					const hits = extractCitationsFromWebSearchEnvelope(toolName, envelope);
					for (const hit of hits) collectedCitations.push(hit);
				}
			}

			// Per-tool persistence — fires onToolEvent for every call that
			// completed in this step. Joined toolCalls↔toolResults by id;
			// callers (chat) translate this into an `aiMessages` row so
			// the <ThinkingTimeline> rail renders. We classify status from
			// the envelope's `status` field (set by `runCapability`); any
			// `ok`/`partial` is a successful row, anything else is failed.
			if (args.onToolEvent) {
				for (const call of step.toolCalls) {
					const result = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
					if (!result) continue;
					const envelope = (result as unknown as { output?: unknown }).output;
					const status =
						envelope && typeof envelope === "object"
							? (envelope as { status?: unknown }).status
							: null;
					const ok = status === "ok" || status === "partial";
					try {
						await args.onToolEvent({
							toolCallId: call.toolCallId,
							toolName: call.toolName,
							input: (call as unknown as { input?: unknown }).input,
							output: envelope,
							ok,
						});
					} catch (err) {
						// Persistence is best-effort — never let a UI
						// surfacing failure break a turn.
						console.warn("[ai/host] onToolEvent failed:", err);
					}
				}
			}

			if (args.onStepFinish) {
				await args.onStepFinish({
					stepNumber:
						step.finishReason === "tool-calls"
							? snapshotIndex(stepActiveToolHistory)
							: snapshotIndex(stepActiveToolHistory),
					text: step.text,
					toolCallNames: step.toolCalls.map((c) => c.toolName),
				});
			}
		},
		onChunk: args.onTextDelta
			? async (event) => {
					// AI SDK v6 onChunk receives `{ chunk: TextStreamPart }`
					// — narrow to text-delta to forward the running text.
					const chunk = event.chunk;
					if (chunk.type === "text-delta") {
						const delta = chunk.text;
						if (typeof delta === "string" && delta.length > 0) {
							// We can't easily expose "accumulated" here without
							// double-reading the stream, so pass the delta and
							// let the caller maintain its own buffer.
							await args.onTextDelta?.(delta, "");
						}
					}
				}
			: undefined,
		onError: ({ error }) => {
			// Provider errors arrive here (see comment near streamError).
			// Last-write-wins is fine — only the post-stream check reads it.
			streamError = error;
		},
	});

	// Drain the stream by awaiting the final-resolved promises.
	//
	// The AI SDK throws `AI_NoOutputGeneratedError` synchronously from
	// `await result.text` (and friends) when the model produces NEITHER
	// text NOR tool calls — common with free OpenRouter / Llama / Qwen
	// models that occasionally close the stream early under rate-limit
	// pressure. That throw bypasses the `onError` callback above (which
	// only fires on `error` chunks), so we'd lose the friendly fallback
	// path entirely. Catch it here, route it through `streamError`, and
	// let the post-stream guard below decide what to do based on whether
	// anything useful actually happened this turn (partial text + tool
	// calls disable the throw — same logic, single decision point).
	let finalText = "";
	let finalFinishReason: string | undefined;
	let finalUsage: Awaited<typeof result.totalUsage> = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	} as unknown as Awaited<typeof result.totalUsage>;
	try {
		finalText = await result.text;
	} catch (err) {
		streamError = streamError ?? err;
	}
	try {
		finalFinishReason = await result.finishReason;
	} catch (err) {
		streamError = streamError ?? err;
	}
	try {
		finalUsage = await result.totalUsage;
	} catch (err) {
		streamError = streamError ?? err;
	}

	// If the stream ended on an `error` chunk with no usable output, surface
	// the captured provider error so the orchestrator can route to the
	// failover chain (or translate to a friendly chat bubble). We only throw
	// when nothing useful happened — partial text or a tool call means the
	// turn already produced visible work and retrying would duplicate it.
	if (
		streamError !== null &&
		finalText.trim().length === 0 &&
		(finalUsage.outputTokens ?? 0) === 0 &&
		toolCallCount === 0
	) {
		// Clear per-turn aliases before bailing — leaving them set would
		// leak this org's labels into the next turn in the same isolate.
		clearPerTurnEntityAliases();
		throw streamError instanceof Error ? streamError : new Error(String(streamError));
	}

	// `cachedInputTokens` is deprecated in favour of `inputTokenDetails.cacheReadTokens`
	// (per ai@6.0.191 d.ts) — read the new shape first, fall through to the
	// legacy field for older providers, and otherwise zero.
	const cachedRead =
		finalUsage.inputTokenDetails?.cacheReadTokens ?? finalUsage.cachedInputTokens ?? 0;
	aggregatedUsage = {
		inputTokens: finalUsage.inputTokens ?? 0,
		cachedInputTokens: cachedRead,
		outputTokens: finalUsage.outputTokens ?? 0,
		totalTokens: finalUsage.totalTokens ?? 0,
	};

	// Token log line — the §2.2 measurement surface.
	console.log(
		`[ai/host] usage: input=${aggregatedUsage.inputTokens} cached=${aggregatedUsage.cachedInputTokens} output=${aggregatedUsage.outputTokens} total=${aggregatedUsage.totalTokens}`,
	);

	// S12 — persist a turn-level row so the token report can compute
	// averages over a sample window. Schedules via `internal.ai.telemetry`
	// when we have a live ctx; tests + the test harness skip this.
	if (args.ctx && typeof args.ctx.runMutation === "function") {
		try {
			const { internal } = await import("../../_generated/api");
			await args.ctx.runMutation(internal.ai.telemetry.recordToolEvent, {
				orgId: args.principal.orgId,
				userId: args.principal.userId,
				...(args.conversation?.conversationId
					? {
							conversationId: args.conversation
								.conversationId as unknown as import("../../_generated/dataModel").Id<"aiConversations">,
						}
					: {}),
				toolName: "(turn)",
				layer: "host",
				startedAt: turnStartedAt,
				durationMs: Math.max(0, Date.now() - turnStartedAt),
				ok: finalFinishReason !== "error",
				inputTokens: aggregatedUsage.inputTokens,
				cachedInputTokens: aggregatedUsage.cachedInputTokens,
				outputTokens: aggregatedUsage.outputTokens,
				triggeredBy: `${args.trigger ?? "chat"}:${args.principal.userId}`,
			});
		} catch (err) {
			// Telemetry must never break a turn — log + swallow.
			console.warn("[ai/host] turn telemetry failed:", err);
		}
	}

	return {
		text: finalText,
		finishReason: String(finalFinishReason),
		usage: aggregatedUsage,
		toolCallCount,
		stepActiveToolHistory,
		router,
		// A — when the stop condition halted the loop on a `needs_step_up`
		// envelope, surface the captured capability + args + headline so
		// the orchestrator can settle the assistant message with
		// `thinkingState: "awaiting_approval"` and the `<StepUpCard>` UI
		// can mount inline at the awaiting tool row.
		...(awaitingApproval ? { awaitingApproval } : {}),
		// B.44 — provider grounding citations. Read providerMetadata for
		// Google grounding chunks; merge with the per-step Firecrawl
		// `web_search` citations collected during the stream. Dedup by URL
		// so the [n] ordering stays stable. Empty list ⇒ omit the slot
		// entirely so the caller persists nothing on `aiMessages.metadata`.
		metadata: await (async (): Promise<{ citations?: Citation[] } | undefined> => {
			let providerCitations: Citation[] = [];
			let nativeSourceCitations: Citation[] = [];
			try {
				const providerMetadata = await result.providerMetadata;
				providerCitations = extractCitationsFromProviderMetadata(providerMetadata);
			} catch (err) {
				// Provider metadata is best-effort. A read failure here
				// should never break a turn that already settled; log + drop.
				console.warn("[ai/host] providerMetadata read failed:", err);
			}
			try {
				// C — `result.sources` is the AI SDK v6 normalised view
				// of stream-parts of type `source-url` / `source-document`,
				// which Anthropic web_search_20250305 + OpenAI Responses
				// webSearchPreview emit during the stream. We read it
				// post-settle and merge with the per-step Firecrawl rail.
				const sources = await (
					result as unknown as { sources?: Promise<unknown> | unknown }
				).sources;
				nativeSourceCitations = extractCitationsFromSources(sources);
			} catch (err) {
				console.warn("[ai/host] result.sources read failed:", err);
			} finally {
				// Last awaited point on the normal-return path — clear the
				// per-turn entity-alias map so the next turn in this
				// isolate starts clean.
				clearPerTurnEntityAliases();
			}
			const merged = dedupeCitations([
				...collectedCitations,
				...providerCitations,
				...nativeSourceCitations,
			]);
			if (merged.length === 0) return undefined;
			return { citations: merged };
		})(),
	};
}

// ─── Internals ──────────────────────────────────────────────────────────────

/** Build the per-turn tail. Vertical addendum + active-module context are
 *  injected here (per S9 §1.7) — they live in the per-turn TAIL so the
 *  cached PROJECT prefix never depends on per-tenant data. */
function buildPromptTail(args: {
	routeCtx?: RouteCtx;
	trigger: "chat" | "autonomous" | "autonomous_reply";
	preloaded: string[];
	availableGroups: string[];
	activeGroups: string[];
	caps: Capability[];
	org: OrgSnapshot;
	activeModuleKeys: ReadonlySet<string>;
	preflight: PreflightContext;
	/**
	 * The latest user message — read for "fake / sample / seed / demo /
	 * mock / dummy / test data" intent so the safety-net instruction
	 * block can fire. Optional so other callers (e.g. autonomous turns
	 * driven from a transcript) skip the block by passing `undefined`.
	 */
	userMessage?: string;
}): string {
	const lines: string[] = [];

	// Vertical persona — config-only, no capability changes. Empty when the
	// org has no industry or the industry has no registered profile.
	const verticalAddendum = renderVerticalAddendum(args.org.industryKey);
	if (verticalAddendum.length > 0) {
		lines.push(verticalAddendum, "");
	}

	if (args.trigger === "autonomous" || args.trigger === "autonomous_reply") {
		lines.push(
			"## Autonomy mode",
			args.trigger === "autonomous_reply"
				? "You are replying directly to a customer over WhatsApp. Stay within the policy: answer from CRM/FAQ, capture lead info, book or schedule, otherwise escalate to a human. Never make up information."
				: "You are running on a conversation transcript without a user prompt. Observe; perform implied CRM actions (dedupe + create + update + add follow-up + add note). Ask the AGENT only — never the customer — for missing required fields. Do not message the customer in this turn.",
			"",
		);
	}

	if (args.routeCtx?.routeSummary) {
		lines.push("## Page context", args.routeCtx.routeSummary.trim(), "");
	} else if (args.routeCtx?.entityCode) {
		lines.push(
			"## Page context",
			`The user is currently viewing \`${args.routeCtx.entityCode}\`${args.routeCtx.entityType ? ` (${args.routeCtx.entityType})` : ""}.`,
			"",
		);
	}

	// Per-module context — only the modules that are enabled for this org.
	// `pipelines` off → no pipelines context block, identical mechanism to
	// the capability filter. Single switch.
	const moduleContext = renderActiveModuleContext(args.org, args.activeModuleKeys);
	if (moduleContext.length > 0) {
		lines.push(moduleContext, "");
	}

	// Pre-flight custom-field summary — collapses the `describe_entity`
	// round-trip when the router preloaded an entity group. Empty when
	// the org has no custom fields for the relevant entity types OR
	// when no entity group is active. Sits between the module context
	// and the group playbooks because it's reference data that informs
	// HOW the playbooks should be applied (which key to fill).
	const preflightBlock = renderPreflightContext(args.preflight);
	if (preflightBlock.length > 0) {
		lines.push(preflightBlock, "");
	}

	// Fake-data safety net — small models routinely emit sparse rows when
	// asked to seed demo data ("fake N leads", "create some sample
	// contacts", "seed 5 deals"). The Project drive's rule #7 already
	// covers this, but the doctrine is buried in the cached prefix and
	// small models lose the thread. Re-asserting it in the per-turn
	// tail — RIGHT NEXT TO the live "## Custom fields" block — keeps
	// the instruction co-located with the keys/options the model needs
	// to fill. No-op when the user isn't asking for fake data.
	const safetyNet = renderFakeDataSafetyNet(args.userMessage, args.preflight);
	if (safetyNet.length > 0) {
		lines.push(safetyNet, "");
	}

	// Active group playbooks — only the router-preloaded groups, only when the
	// group has registered capabilities. Keeps the per-turn tail tight.
	const playbooks = renderGroupPlaybooks(args.activeGroups, args.caps);
	if (playbooks.length > 0) {
		lines.push(playbooks, "");
	}

	lines.push(
		"## Active tools",
		`Step 0 active set: ${args.preloaded.length === 0 ? "(none)" : args.preloaded.map((n) => `\`${n}\``).join(", ")}.`,
		`Other capability groups available via \`discover_capabilities\`: ${args.availableGroups.length === 0 ? "(none)" : args.availableGroups.map((g) => `\`${g}\``).join(", ")}.`,
	);

	return lines.join("\n").trim();
}

/**
 * Detect "fake / sample / seed / demo / mock / dummy / test data" creation
 * intent in the user's latest message. The detector is intentionally
 * narrow — keyword + a creation verb — so casual prose like "is this real
 * or fake?" doesn't trigger.
 *
 * Returns an empty string when:
 *   - no user message was passed (e.g. autonomous turn);
 *   - the message doesn't carry both a fake-data noun and a create verb;
 *   - the preflight context has no entity types with custom fields, in
 *     which case the model has nothing extra to fill anyway.
 */
function renderFakeDataSafetyNet(
	userMessage: string | undefined,
	preflight: PreflightContext,
): string {
	if (!userMessage || userMessage.trim().length === 0) return "";
	const msg = userMessage.toLowerCase();
	const hasFakeNoun =
		/\b(fake|sample|seed|demo|mock|dummy|test data|test record|test lead|placeholder)\b/.test(
			msg,
		);
	if (!hasFakeNoun) return "";
	const hasCreateVerb = /\b(create|add|generate|seed|insert|populate|fill|make)\b/.test(msg);
	if (!hasCreateVerb) return "";
	const entityTypes = (
		Object.entries(preflight.byEntity) as Array<[string, ReadonlyArray<unknown> | undefined]>
	)
		.filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
		.map(([t]) => t);
	if (entityTypes.length === 0) return "";
	return [
		"## Fake-data turn",
		"The user asked for sample / fake / seed / demo / mock / test records. Treat this as a single high-leverage write turn:",
		"1. **Use the `## Custom fields` block above** as the schema. For every field with `options:[...]`, pick a VALID option per row — never invent one off-list, never leave the slot blank.",
		"2. **Invent realistic values yourself.** Full names, plausible emails AND phone numbers, a `source` (e.g. `referral`, `web`, `whatsapp`), and one option per dropdown / select / multiselect / number / date custom field. Numbers go as numbers, not strings.",
		"3. **Prefer ONE `bulk_create_entities` call** with FULLY-POPULATED `customFields` objects per row over many sparse single creates. The bulk runner accepts `customFields` for leads today; for deals/companies/contacts, fall back to per-row `create_*` capabilities.",
		"4. **Do not ask the user for the values.** Generating them IS the request. Only call `ask_user` if a column field (displayName / title / name) is genuinely ambiguous — never for fillable custom-field slots.",
		`5. The relevant entity type${entityTypes.length === 1 ? "" : "s"} for this turn ${entityTypes.length === 1 ? "is" : "are"}: ${entityTypes.map((e) => `\`${e}\``).join(", ")}.`,
	].join("\n");
}

/** Build ModelMessage[] from `history` + the latest user message. */
function buildModelMessages(
	history: Array<{ role: "user" | "assistant"; content: string }>,
	message: string,
): ModelMessage[] {
	const out: ModelMessage[] = [];
	for (const h of history) {
		out.push({ role: h.role, content: h.content });
	}
	if (message.length > 0) {
		// If the last history row is already this message, don't double-add.
		const last = out.at(-1);
		if (!last || last.role !== "user" || last.content !== message) {
			out.push({ role: "user", content: message });
		}
	}
	return out;
}

/**
 * Stop-condition that bails when too many tool results in a row are
 * `needs_repair` or `infra_retry` — the retry budget is exhausted, the
 * model is looping, and we need to surface what we have.
 */
function makeRetryBudgetStopCondition(budget: number): StopCondition<ToolSet> {
	return ({ steps }) => {
		if (steps.length === 0) return false;
		// Count consecutive retry-class outcomes from the tail backwards.
		let consecutive = 0;
		for (let i = steps.length - 1; i >= 0; i--) {
			const step = steps[i];
			let hadRetry = false;
			for (const tr of step.toolResults) {
				const envelope = (tr as unknown as { output?: unknown }).output;
				if (envelope && typeof envelope === "object") {
					const status = (envelope as { status?: unknown }).status;
					if (status === "needs_repair" || status === "infra_retry") {
						hadRetry = true;
						break;
					}
				}
			}
			if (!hadRetry) break;
			consecutive++;
			if (consecutive > budget) return true;
		}
		return false;
	};
}

/** Tiny helper used inside onStepFinish — counts how many step entries we've snapshotted so far. */
function snapshotIndex(history: string[][]): number {
	return Math.max(0, history.length - 1);
}

/**
 * A — V1-style inline approval stop condition (locked 2026-06-06).
 *
 * Halt the streamText loop the moment a tool returns a `needs_step_up`
 * envelope. Without this stop, the model sees the envelope as a normal
 * tool result and generates closing prose ("This action is irreversible.
 * Shall I proceed?") that ends up beside the inline approval card —
 * exactly the duplicate-asking UX the user reported. With it, the loop
 * exits cleanly after the awaiting tool row; the assistant message
 * settles with `thinkingState: "awaiting_approval"` and the inline
 * `<StepUpCard>` is the ONLY ask the user sees. After confirm,
 * `processChat.runResume` re-enters the loop with a fresh stepUpToken
 * and the SAME assistant message id, so the stream visually continues.
 */
function makeAwaitingApprovalStopCondition(): StopCondition<ToolSet> {
	return ({ steps }) => {
		if (steps.length === 0) return false;
		const last = steps[steps.length - 1];
		for (const tr of last.toolResults) {
			const envelope = (tr as unknown as { output?: unknown }).output;
			if (envelope && typeof envelope === "object") {
				const status = (envelope as { status?: unknown }).status;
				if (status === "needs_step_up") return true;
			}
		}
		return false;
	};
}
