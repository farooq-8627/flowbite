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

export type StreamLoopArgs = {
	ctx: { runMutation: RunMutationFn; runQuery: RunQueryFn };
	orgId: string;
	conversationId: string;
	assistantMsgId: string;
	modelResult: ResolvedModel;
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
};

// Poll the abort flag every Nth chunk. With typical streams emitting
// ~30-60 chunks/sec, polling every 8 chunks keeps latency under 200ms
// while keeping the extra Convex read traffic to ~6 queries per second.
const ABORT_POLL_EVERY_N_CHUNKS = 8;

/**
 * Walk the SDK stream. Patches the assistant message and any tool-call
 * messages as chunks arrive. Returns the final usage + termination state.
 *
 * Throws on stream-level errors so the caller can translate to a friendly
 * chat bubble — does not handle errors internally because the friendly
 * text depends on the model's usageMode (BYOK vs platform), which is
 * easier to render at the call site.
 */
export async function runStreamLoop(args: StreamLoopArgs): Promise<StreamLoopResult> {
	const { ctx, modelResult, system, messageHistory, tools, assistantMsgId } = args;
	let accumulatedText = "";
	let accumulatedReasoning = "";
	let finalInputTokens = 0;
	let finalOutputTokens = 0;
	let sawFinish = false;
	let hasStartedStreaming = false;
	let abortPollCounter = 0;
	let expandedLayers = [...args.expandedLayers];
	const pendingToolCalls = new Map<string, string>(); // toolCallId → messageId

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
		tools: tools as Parameters<typeof streamText>[0]["tools"],
		// Week 1 #1.1 — bumped from 5 → 30. The original cap of 5 caused the
		// "Empty message" bug (`PHASE-3-AI-AUDIT.md §1`): on a small model the
		// agent could spend 4 of its 5 steps recovering from a single bad
		// tool call and have nothing left to actually answer.
		//
		// DEFERRED: see Future-Enhancements.md §A.3 — restore tier-aware caps
		//          (small=12, standard=20, premium=30) in Phase 6 / Week 6.
		//          During testing every model gets the full 30-step budget so
		//          we can shake out tool/agent bugs without artificial limits.
		stopWhen: stepCountIs(30),
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
							confirmationPayload: { tool: toolName, args: toolInput },
						},
					)) as string;
					await ctx.runMutation(_ref("ai/messages:setConfirmationPending"), {
						messageId: toolMsgId,
						payload: { tool: toolName, args: toolInput },
					});
					pendingToolCalls.set(toolCallId, toolMsgId);
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
				const toolName = chunk.toolName as string;
				const toolCallId = chunk.toolCallId as string;
				const toolOutput = chunk.output;
				const toolMsgId = pendingToolCalls.get(toolCallId);
				if (toolMsgId) {
					await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
						messageId: toolMsgId,
						output: toolOutput,
						status: "completed",
					});
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
				if (toolMsgId) {
					await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
						messageId: toolMsgId,
						output: { error: errMsg },
						status: "failed",
					});
				}
				await setThinking("thinking", {
					activeTool: "",
					reasoningAppend: `✗ \`${toolName}\` failed: ${formatToolErrorForReasoning(errMsg)}`,
				});
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
				throw new Error(errMsg);
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
				};
			}

			case "finish": {
				sawFinish = true;
				const totalUsage = chunk.totalUsage;
				if (totalUsage) {
					finalInputTokens = totalUsage.inputTokens ?? finalInputTokens;
					finalOutputTokens = totalUsage.outputTokens ?? finalOutputTokens;
				}
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
				break;
			}

			default:
				break;
		}
	}

	return {
		finalInputTokens,
		finalOutputTokens,
		accumulatedText,
		sawFinish,
		cancelled: false,
		expandedLayers,
	};
}
