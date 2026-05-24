"use node";
/**
 * convex/ai/orchestrator/streamLoop.ts
 *
 * The core for-await chunk-handling loop that walks the AI SDK's
 * `fullStream` and patches DB rows as text/tool/reasoning chunks arrive.
 *
 * Why a separate file: the loop is dense (~250 LOC) and the chunk-shape
 * adapters for AI SDK v6 (with v5/v4 fallbacks) deserve their own
 * reviewable surface. processChat.run becomes a thin orchestrator on top.
 *
 * Public surface: `runStreamLoop()`.
 */
import { stepCountIs, streamText } from "ai";
import { resolveNeedsApproval } from "../toolRegistry";
import { friendlyToolError } from "./friendlyToolError";
import type { ResolvedModel } from "./modelResolver";
import { formatToolErrorForReasoning } from "./reasoningBuffer";

// biome-ignore lint/suspicious/noExplicitAny: _ref/_anyArgs casts required for pre-codegen cross-module refs
const _ref = (path: string) => path as any;

// AI SDK v6 TextStreamPart shape (see node_modules/ai/dist/index.d.ts).
// We type-narrow on chunk.type below, so a single broad type is safe.
type StreamChunk = {
	type: string;
	text?: string;
	toolName?: string;
	toolCallId?: string;
	input?: unknown;
	output?: unknown;
	error?: unknown;
	usage?: { inputTokens?: number; outputTokens?: number };
	totalUsage?: { inputTokens?: number; outputTokens?: number };
	reason?: string;
};

type RunMutationFn = (fn: unknown, args: unknown) => Promise<unknown>;
type RunQueryFn = (fn: unknown, args: unknown) => Promise<unknown>;

/**
 * Tools registered with `confirmation: "twoStep"` define a `propose()`
 * helper inside their `execute` function. The helper returns a payload
 * shaped like:
 *
 *   { ok: false, requiresConfirmation: true,
 *     confirmationPayload: { tool, args, preview: {title, fields} } }
 *
 * `streamLoop` calls `execute` directly to get this payload — that's
 * how the rich `preview` makes it into the DB so `ChatConfirmation`
 * can render the right `<{Lead,Deal,Field,…}PreviewCard>`. When a tool
 * returns nothing (or `undefined`), we fall back to a generic
 * `{tool, args}` payload so the UI never shows an empty card.
 */
type ProposePayload = {
	requiresConfirmation?: boolean;
	confirmationPayload?: {
		tool?: string;
		args?: unknown;
		preview?: { title?: string; fields?: Array<{ label: string; value: unknown }> };
	};
};

function extractConfirmationPayload(
	rawResult: unknown,
	fallback: { tool: string; args: unknown },
): {
	tool: string;
	args: unknown;
	preview?: { title?: string; fields?: Array<{ label: string; value: unknown }> };
} {
	if (!rawResult || typeof rawResult !== "object") {
		return fallback;
	}
	const r = rawResult as ProposePayload;
	if (!r.requiresConfirmation || !r.confirmationPayload) return fallback;
	const cp = r.confirmationPayload;
	return {
		tool: typeof cp.tool === "string" ? cp.tool : fallback.tool,
		args: cp.args ?? fallback.args,
		preview: cp.preview,
	};
}

// ─── Day 1 T1.1 — propose-payload sanitisation ──────────────────────────────
//
// `PHASE-3-AI-AUDIT.md §6.5 E.T1.1`. When a `confirmation: "twoStep"`
// tool's execute() returns a propose-shaped result, we MUST replace what
// the AI SDK feeds into the model's next-step tool-result content. The
// raw payload is `{ ok:false, error, requiresConfirmation:true,
// confirmationPayload: { tool, args, preview: { title, fields:[…] } } }`.
// Models that don't honour the system-prompt "stop after twoStep" rule
// (every Llama variant, Gemini Flash on a bad day) echo that JSON to
// the user as prose.
//
// Fix: at execute-wrap time we detect propose-shaped output, stash the
// full payload on `proposeStash` keyed by toolCallId for the streamLoop
// to drain, and return a flat sanitised string to the SDK so the model
// sees only "Awaiting user approval".
//
// `stopOnAnyTwoStepCall()` (T1.2) backs this up: it tells `streamText`
// to halt after the first twoStep tool call lands, so even a verbose
// model can't pile up multiple approval cards from a single turn.

type ProposeShape = {
	requiresConfirmation: true;
	confirmationPayload: {
		tool?: string;
		args?: unknown;
		preview?: { title?: string; fields?: Array<{ label: string; value: unknown }> };
	};
};

function isProposeShape(v: unknown): v is ProposeShape {
	if (!v || typeof v !== "object") return false;
	const r = v as { requiresConfirmation?: unknown; confirmationPayload?: unknown };
	return r.requiresConfirmation === true && typeof r.confirmationPayload === "object";
}

const APPROVAL_AWAITING_NOTE =
	"⏸ Awaiting user approval. The user will see an approval card and decide. Do NOT call any more tools — the orchestrator will resume on approval. Reply with empty content or wait silently.";

/**
 * Wrap every tool's `execute` so the model never sees raw propose JSON.
 * Tools that don't return a propose shape pass through unchanged.
 *
 * The returned tool object preserves the AI SDK's `tool({...})` shape:
 * description, inputSchema, execute. We only swap `execute`. Other
 * fields (e.g. `description`) are copied verbatim.
 */
function wrapToolsForApprovalSanitisation(
	tools: Record<string, unknown>,
	stash: Map<string, ProposeShape>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, tool] of Object.entries(tools)) {
		if (!tool || typeof tool !== "object") {
			out[name] = tool;
			continue;
		}
		const t = tool as { execute?: (...args: unknown[]) => Promise<unknown> };
		if (typeof t.execute !== "function") {
			out[name] = tool;
			continue;
		}
		const originalExecute = t.execute.bind(tool);
		out[name] = {
			...tool,
			execute: async (input: unknown, options: unknown) => {
				const result = await originalExecute(input, options);
				if (!isProposeShape(result)) return result;
				const opts = (options ?? {}) as { toolCallId?: string };
				const toolCallId = opts.toolCallId;
				if (toolCallId) stash.set(toolCallId, result);
				// Sanitised string — the only thing the model will see.
				return APPROVAL_AWAITING_NOTE;
			},
		};
	}
	return out;
}

/**
 * `stopWhen` predicate that halts the agent loop the moment any twoStep
 * tool call lands in the steps array. Combined with `stepCountIs(30)`,
 * this gives us:
 *   - Cap of 30 steps (safety net for runaway loops on bad models)
 *   - Plus an immediate stop after one twoStep call (UX guarantee:
 *     one approval card per turn, no stacking)
 */
function stopOnAnyTwoStepCall() {
	return ({
		steps,
	}: {
		steps: Array<{ toolCalls?: Array<{ toolName?: string; input?: unknown }> }>;
	}) => {
		for (const step of steps) {
			for (const call of step.toolCalls ?? []) {
				if (!call.toolName) continue;
				const isTwoStep = resolveNeedsApproval(
					call.toolName,
					(call.input ?? {}) as Record<string, unknown>,
				);
				if (isTwoStep) return true;
			}
		}
		return false;
	};
}

export type StreamLoopArgs = {
	ctx: { runMutation: RunMutationFn; runQuery: RunQueryFn };
	orgId: string;
	userId: string;
	conversationId: string;
	assistantMsgId: string;
	/**
	 * Resolved-model chain. The first entry is the primary; subsequent
	 * entries are tried only when the primary throws **before any
	 * text-delta** is emitted (5xx, rate-limit, network error). Once
	 * the user has seen any tokens we propagate the error to the caller
	 * — splitting an answer across providers makes the chat
	 * incomprehensible. Build with `resolveFallbackChain()` in
	 * `modelResolver.ts`.
	 */
	models: ResolvedModel[];
	system: string;
	messageHistory: Array<{ role: "user" | "assistant"; content: string }>;
	tools: unknown;
	expandedLayers: string[];
};

export type StreamLoopResult = {
	finalInputTokens: number;
	finalOutputTokens: number;
	accumulatedText: string;
	sawFinish: boolean;
	cancelled: boolean;
	expandedLayers: string[];
	/**
	 * Number of `tool-result` chunks observed in this turn. Used by the
	 * caller (`run.ts`) to detect the small-model "called a tool, then
	 * went silent" pattern: when `accumulatedText` is empty AND
	 * `toolResultCount > 0`, surface a generic acknowledgement so the
	 * user doesn't see a blank assistant bubble. Especially common on
	 * NVIDIA NIM Llama-3.3 and OpenRouter free Llama after read tools
	 * (search_crm, list_*, get_entity_detail).
	 */
	toolResultCount: number;
	/**
	 * The model that actually produced the final text. Equal to
	 * `args.models[0]` unless the orchestrator failed over.
	 */
	usedModel: ResolvedModel;
	/**
	 * Indices into `args.models` that were tried and failed BEFORE
	 * emitting any text. Empty when the primary worked. The caller
	 * uses this to surface a one-line "switched to <provider>" notice
	 * to the user.
	 */
	failedProviderAttempts: Array<{
		modelKey: string;
		provider: string;
		error: string;
	}>;
};

// Poll the abort flag every Nth chunk. With typical streams emitting
// ~30-60 chunks/sec, polling every 8 chunks keeps latency under 200ms
// while keeping the extra Convex read traffic to ~6 queries per second.
const ABORT_POLL_EVERY_N_CHUNKS = 8;

/**
 * Walk the SDK stream. Patches the assistant message and any tool-call
 * messages as chunks arrive. Returns the final usage + termination state.
 *
 * **Multi-provider failover (P1.1)** — `args.models` is a chain. If the
 * primary throws BEFORE any `text-delta` lands, we try the next
 * candidate transparently. Failovers are recorded in
 * `result.failedProviderAttempts` so the caller can render a one-line
 * notice ("Switched to Gemini Flash because Anthropic returned 503").
 *
 * Once the user has seen any tokens we re-raise — splitting an answer
 * across providers would render incoherent text. The caller's outer
 * try/catch (in `run.ts`) translates that into a friendly "❌ …" bubble.
 */
export async function runStreamLoop(args: StreamLoopArgs): Promise<StreamLoopResult> {
	if (args.models.length === 0) {
		throw new Error("runStreamLoop: at least one model is required");
	}

	const failedProviderAttempts: StreamLoopResult["failedProviderAttempts"] = [];
	let lastError: unknown = null;

	for (let i = 0; i < args.models.length; i++) {
		const candidate = args.models[i];
		try {
			const result = await runStreamLoopOnce({
				...args,
				modelResult: candidate,
			});
			return {
				...result,
				usedModel: candidate,
				failedProviderAttempts,
			};
		} catch (err) {
			lastError = err;
			const errMsg = err instanceof Error ? err.message : String(err);
			const hasStartedStreaming =
				typeof err === "object" &&
				err !== null &&
				(err as { hasStartedStreaming?: boolean }).hasStartedStreaming === true;

			failedProviderAttempts.push({
				modelKey: candidate.modelKey,
				provider: candidate.provider,
				error: errMsg,
			});
			console.warn(
				`[streamLoop] provider ${candidate.provider}/${candidate.modelKey} failed (hasStartedStreaming=${hasStartedStreaming}): ${errMsg}`,
			);

			// Don't fail over if the user has already seen tokens — the
			// partial text would mix with the fallback's response and
			// the result would be incomprehensible.
			if (hasStartedStreaming) break;

			// Only retry if there's another candidate AND the cancellation
			// flag isn't set (user pressed cancel mid-failover, weird race).
			if (i + 1 >= args.models.length) break;
			const aborted = (await args.ctx.runQuery(_ref("ai/messages:isAborted"), {
				messageId: args.assistantMsgId as string,
			})) as boolean;
			if (aborted) break;
			// Patch the placeholder so the user sees the fallback narrative
			// before tokens start streaming from the next provider.
			await args.ctx.runMutation(_ref("ai/messages:patchThinkingState"), {
				messageId: args.assistantMsgId,
				thinkingState: "thinking",
				reasoningAppend: `↩ ${candidate.provider}/${candidate.modelKey} failed: ${errMsg.slice(0, 120)}. Trying ${args.models[i + 1].provider}/${args.models[i + 1].modelKey} …`,
			});
		}
	}

	// All providers in the chain failed before producing text. Re-raise so
	// the outer try/catch in `run.ts` renders a friendly error.
	throw lastError ?? new Error("All AI providers failed.");
}

/** Single-pass implementation. The public `runStreamLoop` wraps this with retry. */
async function runStreamLoopOnce(
	args: StreamLoopArgs & { modelResult: ResolvedModel },
): Promise<Omit<StreamLoopResult, "usedModel" | "failedProviderAttempts">> {
	const { ctx, modelResult, system, messageHistory, tools, assistantMsgId } = args;
	let accumulatedText = "";
	let accumulatedReasoning = "";
	let finalInputTokens = 0;
	let finalOutputTokens = 0;
	let sawFinish = false;
	let hasStartedStreaming = false;
	let abortPollCounter = 0;
	let expandedLayers = [...args.expandedLayers];
	let toolResultCount = 0;
	const pendingToolCalls = new Map<string, string>(); // toolCallId → messageId
	// Per-tool-call execution start time, for telemetry.
	const toolStartByCallId = new Map<string, number>();
	// Sequence enforcement (2026-05-24) — toolCallIds that triggered an
	// approval card. When the SDK emits a `tool-result` for one of these,
	// we lift the propose() preview onto the pending DB row and BREAK
	// out of the loop so the model can't run more tools in the same turn.
	// The user's approval triggers `processChat.resume`, which re-enters
	// the loop with `commit_<tool>`.
	const pendingTwoStepToolCallIds = new Set<string>();
	let stoppedForApproval = false;

	// Day 1 T1.1 (`PHASE-3-AI-AUDIT.md §6.5 E`) — proposeStash is the side
	// channel used by `wrapToolsForApprovalSanitisation` below. When a
	// twoStep tool's `execute()` returns a `requiresConfirmation: true`
	// payload, the wrapper:
	//   1. Stashes the full propose payload here, keyed by toolCallId.
	//   2. Returns a sanitised string to the AI SDK so the MODEL never
	//      sees the raw `{ tool, args, preview }` JSON in its next-step
	//      tool-result content. (Fixes Llama-3.3 echoing the JSON back
	//      to the user as prose — symptom A in §6.5.)
	// `case "tool-result"` below drains the stash to keep the rich
	// preview that ChatConfirmation needs.
	const proposeStash = new Map<string, ProposeShape>();

	// Helper: bump the live thinking-state without touching the body.
	const setThinking = async (
		state: "thinking" | "calling_tool" | "streaming" | "done" | "error",
		opts?: { activeTool?: string; reasoningAppend?: string },
	) => {
		await ctx.runMutation(_ref("ai/messages:patchThinkingState"), {
			messageId: assistantMsgId,
			thinkingState: state,
			...(opts?.activeTool !== undefined ? { activeTool: opts.activeTool } : {}),
			...(opts?.reasoningAppend !== undefined
				? { reasoningAppend: opts.reasoningAppend }
				: {}),
		});
	};

	const { fullStream } = streamText({
		model: modelResult.model as Parameters<typeof streamText>[0]["model"],
		system,
		messages: messageHistory,
		tools: wrapToolsForApprovalSanitisation(
			tools as Record<string, unknown>,
			proposeStash,
		) as Parameters<typeof streamText>[0]["tools"],
		// Week 1 #1.1 — bumped from 5 → 30. The original cap of 5 caused the
		// "Empty message" bug (`PHASE-3-AI-AUDIT.md §1`): on a small model the
		// agent could spend 4 of its 5 steps recovering from a single bad
		// tool call and have nothing left to actually answer.
		//
		// Day 1 T1.2 (PHASE-3-AI-AUDIT.md §6.5 E) — composite stopWhen.
		// `stepCountIs(30)` is the absolute cap. The custom predicate fires
		// the moment any twoStep tool call lands in the steps array — that
		// way Llama-class models that emit multiple tool-calls in one step
		// can't pile up multiple approval cards. The orchestrator's resume
		// flow re-enters the loop on user approval, so stopping here is
		// safe.
		//
		// DEFERRED: see Future-Enhancements.md §A.3 — restore tier-aware caps
		//          (small=12, standard=20, premium=30) in Phase 6 / Week 6.
		//          During testing every model gets the full 30-step budget so
		//          we can shake out tool/agent bugs without artificial limits.
		stopWhen: [stepCountIs(30), stopOnAnyTwoStepCall()],
		temperature: 0.2, // Low temp for tool calling reliability
	});

	for await (const chunk of fullStream as AsyncIterable<StreamChunk>) {
		// Abort-poll: check the user's `cancelStream` flag periodically.
		abortPollCounter++;
		if (abortPollCounter % ABORT_POLL_EVERY_N_CHUNKS === 0) {
			const aborted = (await ctx.runQuery(_ref("ai/messages:isAborted"), {
				messageId: assistantMsgId as string,
			})) as boolean;
			if (aborted) {
				console.log("[streamLoop] cancelled by user mid-stream");
				return {
					finalInputTokens,
					finalOutputTokens,
					accumulatedText,
					sawFinish: false,
					cancelled: true,
					expandedLayers,
					toolResultCount,
				};
			}
		}

		switch (chunk.type) {
			case "text-delta": {
				const delta = chunk.text ?? "";
				if (!delta) break;
				if (!hasStartedStreaming) {
					hasStartedStreaming = true;
					await setThinking("streaming");
				}
				accumulatedText += delta;
				// Patch DB every ~50 chars to balance reactivity vs write rate.
				if (accumulatedText.length % 50 < delta.length) {
					await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
						messageId: assistantMsgId,
						content: accumulatedText,
					});
				}
				break;
			}

			case "reasoning-delta": {
				const delta = chunk.text ?? "";
				if (!delta) break;
				accumulatedReasoning += delta;
				// Throttle reasoning patches: only every ~80 chars.
				if (accumulatedReasoning.length % 80 < delta.length) {
					await setThinking("thinking", { reasoningAppend: delta });
				}
				break;
			}

			case "tool-call": {
				const toolName = chunk.toolName as string;
				const toolCallId = chunk.toolCallId as string;
				const toolInput = chunk.input;
				toolStartByCallId.set(toolCallId, Date.now());
				// Week 3.3 — single source of truth: combines new
				// `needsApproval` (boolean | (args)=>boolean) with the
				// legacy `confirmation: "twoStep"` flag for back-compat.
				const isTwoStep = resolveNeedsApproval(
					toolName,
					(toolInput ?? {}) as Record<string, unknown>,
				);

				await setThinking("calling_tool", {
					activeTool: toolName,
					reasoningAppend: `→ Calling \`${toolName}\`…`,
				});

				if (isTwoStep) {
					// Sequence enforcement (2026-05-24) — for twoStep tools we
					// insert a pending tool-message with the model's INPUT args
					// as the preview source. The SDK's natural call to
					// `execute()` will run the tool's `propose()` helper and
					// emit a `tool-result` chunk; the `case "tool-result"`
					// branch below catches that, lifts the rich `preview`
					// out of the `propose()` payload onto our pending row,
					// and breaks out of the loop so the model can't run any
					// more tools in the same turn. The user's approval
					// triggers `processChat.resume`, which re-enters the
					// loop with `commit_<tool>`.
					const toolMsgId = (await ctx.runMutation(
						_ref("ai/messages:appendToolCallRecord"),
						{
							orgId: args.orgId,
							conversationId: args.conversationId,
							toolName,
							toolCallId,
							input: toolInput,
							status: "started",
							confirmationState: "pending",
							// Initial payload uses the model's raw input. The
							// rich `preview` from propose() is layered in by
							// the tool-result handler below.
							confirmationPayload: { tool: toolName, args: toolInput },
						},
					)) as string;
					await ctx.runMutation(_ref("ai/messages:setConfirmationPending"), {
						messageId: toolMsgId,
						payload: { tool: toolName, args: toolInput },
					});
					pendingToolCalls.set(toolCallId, toolMsgId);
					pendingTwoStepToolCallIds.add(toolCallId);
				} else {
					const toolMsgId = (await ctx.runMutation(
						_ref("ai/messages:appendToolCallRecord"),
						{
							orgId: args.orgId,
							conversationId: args.conversationId,
							toolName,
							toolCallId,
							input: toolInput,
							status: "started",
						},
					)) as string;
					pendingToolCalls.set(toolCallId, toolMsgId);
				}
				break;
			}

			case "tool-result": {
				toolResultCount++;
				const toolName = chunk.toolName as string;
				const toolCallId = chunk.toolCallId as string;
				const toolOutput = chunk.output;
				const toolMsgId = pendingToolCalls.get(toolCallId);

				// Sequence enforcement — twoStep tools' execute() returned
				// the propose() payload `{ requiresConfirmation, confirmationPayload }`.
				// Lift the rich preview onto the pending DB row, mark the
				// inline tool record as `started` (NOT `completed`) so the
				// UI keeps showing the approval card, and break out of the
				// for-await so the model can't keep running more tools.
				//
				// Day 1 T1.1 — the model sees ONLY a sanitised string in
				// the SDK tool-result chunk (the wrapper replaced the raw
				// payload). To recover the rich preview for the UI, we
				// drain `proposeStash` keyed by toolCallId.
				if (pendingTwoStepToolCallIds.has(toolCallId)) {
					const stashed = proposeStash.get(toolCallId);
					proposeStash.delete(toolCallId);
					const enriched = extractConfirmationPayload(stashed ?? toolOutput, {
						tool: toolName,
						args: chunk.input ?? {},
					});
					if (toolMsgId) {
						await ctx.runMutation(_ref("ai/messages:setConfirmationPending"), {
							messageId: toolMsgId,
							payload: enriched,
						});
					}
					await setThinking("done", {
						activeTool: "",
						reasoningAppend: `⏸ \`${toolName}\` is awaiting your approval.`,
					});
					stoppedForApproval = true;
					// Settle the assistant body now so the UI exits the
					// streaming spinner and surfaces the approval card.
					await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
						messageId: assistantMsgId,
						content: accumulatedText,
						model: modelResult.modelKey,
						provider: modelResult.provider,
						usageMode: modelResult.usageMode,
						inputTokens: finalInputTokens,
						outputTokens: finalOutputTokens,
						thinkingState: "done",
					});
					break; // exit switch — loop guard below exits the for-await
				}

				if (toolMsgId) {
					await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
						messageId: toolMsgId,
						output: toolOutput,
						status: "completed",
					});
				}
				// Telemetry — record successful tool execution.
				{
					const startedAt = toolStartByCallId.get(toolCallId);
					toolStartByCallId.delete(toolCallId);
					if (startedAt !== undefined) {
						await ctx.runMutation(_ref("ai/telemetry:recordToolEvent"), {
							orgId: args.orgId,
							userId: args.userId,
							conversationId: args.conversationId,
							toolName,
							model: modelResult.modelKey,
							provider: modelResult.provider,
							startedAt,
							durationMs: Math.max(0, Date.now() - startedAt),
							ok: true,
						});
					}
				}
				await setThinking("thinking", {
					activeTool: "",
					reasoningAppend: `✓ \`${toolName}\` returned.`,
				});
				// If tool triggered a layer expansion, update expanded layers
				if (toolName === "expand_tools" && typeof toolOutput === "object") {
					const result = toolOutput as { activated?: string };
					if (result?.activated && !expandedLayers.includes(result.activated)) {
						expandedLayers = [...expandedLayers, result.activated];
					}
				}
				break;
			}

			case "tool-error": {
				const toolName = chunk.toolName as string;
				const toolCallId = chunk.toolCallId as string;
				const toolMsgId = pendingToolCalls.get(toolCallId);
				const errObj = chunk.error as { message?: string } | string | undefined;
				const errMsg =
					typeof errObj === "object" && errObj?.message
						? errObj.message
						: String(errObj ?? "Tool call failed.");
				// 2026-05-24 — wire the same friendly mapper that resume.ts
				// uses for commit failures into live-loop tool errors.
				// `friendly.markdown` is a 3-line user-facing explanation
				// with concrete next steps; `rawError` keeps the original
				// message available for the model's next step (so it can
				// recover) and for engineers debugging.
				const friendly = friendlyToolError({ ok: false, error: errMsg }, toolName);
				if (toolMsgId) {
					await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
						messageId: toolMsgId,
						output: {
							ok: false,
							error: friendly.short,
							code: friendly.code,
							friendlyMarkdown: friendly.markdown,
							// Phase 4 Part 1 P1.11 — surface the multi-tier
							// envelope to the chat renderer so it can show
							// the headline always-visible and the details /
							// manual steps / recovery chips on demand.
							friendlyError: {
								code: friendly.code,
								short: friendly.short,
								summary: friendly.summary,
								details: friendly.details,
								manualSteps: friendly.manualSteps,
								recoveryActions: friendly.recoveryActions,
							},
							rawError: errMsg,
						},
						status: "failed",
					});
				}
				await setThinking("thinking", {
					activeTool: "",
					reasoningAppend: `✗ \`${toolName}\` failed: ${formatToolErrorForReasoning(errMsg)}`,
				});
				// Telemetry — record failed tool execution.
				{
					const startedAt = toolStartByCallId.get(toolCallId);
					toolStartByCallId.delete(toolCallId);
					if (startedAt !== undefined) {
						await ctx.runMutation(_ref("ai/telemetry:recordToolEvent"), {
							orgId: args.orgId,
							userId: args.userId,
							conversationId: args.conversationId,
							toolName,
							model: modelResult.modelKey,
							provider: modelResult.provider,
							startedAt,
							durationMs: Math.max(0, Date.now() - startedAt),
							ok: false,
							errorCode: friendly.code,
							errorMessage: errMsg,
						});
					}
				}
				break;
			}

			case "finish-step": {
				const stepUsage = chunk.usage;
				if (stepUsage) {
					finalInputTokens += stepUsage.inputTokens ?? 0;
					finalOutputTokens += stepUsage.outputTokens ?? 0;
				}
				break;
			}

			case "error": {
				const errObj = chunk.error as { message?: string } | string | undefined;
				const errMsg =
					typeof errObj === "object" && errObj?.message
						? errObj.message
						: String(errObj ?? "Unknown stream error");
				// P1.1 — tag the thrown error with whether we'd already
				// streamed any text. The outer fallback wrapper uses this to
				// decide whether failing over to the next provider is safe
				// (no text yet) or whether to propagate (text already
				// rendered — splitting providers would corrupt the answer).
				const tagged = Object.assign(new Error(errMsg), {
					hasStartedStreaming,
				});
				throw tagged;
			}

			case "abort": {
				console.log("[streamLoop] upstream abort received");
				return {
					finalInputTokens,
					finalOutputTokens,
					accumulatedText,
					sawFinish: false,
					cancelled: true,
					expandedLayers,
					toolResultCount,
				};
			}

			case "finish": {
				sawFinish = true;
				const totalUsage = chunk.totalUsage;
				if (totalUsage) {
					finalInputTokens = totalUsage.inputTokens ?? finalInputTokens;
					finalOutputTokens = totalUsage.outputTokens ?? finalOutputTokens;
				}
				// 2026-05-24 fix — small open models (NVIDIA NIM Llama-3.3,
				// OpenRouter free Llama, Mistral Small) routinely call a
				// read tool, receive its result, then emit a `finish` event
				// with NO text. The user sees a blank assistant bubble even
				// though the tool's result card rendered. Substitute a
				// concise fallback so there's always SOMETHING in the
				// assistant message body. The structured tool-result card
				// already shows the actual data — this is just the prose
				// envelope around it.
				const finalContent =
					accumulatedText.trim().length === 0 && toolResultCount > 0
						? "Done. See the result above."
						: accumulatedText;
				await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
					messageId: assistantMsgId,
					content: finalContent,
					model: modelResult.modelKey,
					provider: modelResult.provider,
					usageMode: modelResult.usageMode,
					inputTokens: finalInputTokens,
					outputTokens: finalOutputTokens,
					thinkingState: "done",
				});
				// Telemetry — record one synthetic row per chat turn with
				// total token usage so the AI Usage dashboard + the AI
				// quota gate have something to aggregate. `toolName` uses
				// a reserved underscore prefix so per-tool rollups can
				// filter it out.
				if (finalInputTokens > 0 || finalOutputTokens > 0) {
					await ctx.runMutation(_ref("ai/telemetry:recordToolEvent"), {
						orgId: args.orgId,
						userId: args.userId,
						conversationId: args.conversationId,
						toolName: "_chat_turn",
						model: modelResult.modelKey,
						provider: modelResult.provider,
						startedAt: Date.now(),
						durationMs: 0,
						ok: true,
						inputTokens: finalInputTokens,
						outputTokens: finalOutputTokens,
					});
				}
				break;
			}

			default:
				break;
		}

		// Sequence enforcement — once a twoStep tool fired we exit the
		// loop so the model has no chance to call another tool. The
		// orchestrator's resume action will re-enter on user approval.
		if (stoppedForApproval) {
			console.log("[streamLoop] paused for two-step approval — exiting loop until resume");
			return {
				finalInputTokens,
				finalOutputTokens,
				accumulatedText,
				sawFinish: true, // we already settled the placeholder
				cancelled: false,
				expandedLayers,
				toolResultCount,
			};
		}
	}

	return {
		finalInputTokens,
		finalOutputTokens,
		accumulatedText,
		sawFinish,
		cancelled: false,
		expandedLayers,
		toolResultCount,
	};
}
