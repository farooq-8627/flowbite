"use node";
/**
 * convex/ai/standingOrders/runner.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). The Node-runtime side
 * of standing orders — runs the prompt with a restricted tool set,
 * persists the textual summary on the row, and emits `aiToolEvents`
 * with `triggeredBy: "standingOrder:<id>"` for every tool call.
 *
 * Architecture:
 *   crons.ts (every minute)
 *     → evaluator.tick (V8) checks shouldFireNow per row
 *         → schedules this action per matching row
 *             → reads row + owner permissions
 *             → builds tool dict (intersection of caller permissions ×
 *               allowedTools[] whitelist)
 *             → opens a synthetic aiConversations row tagged
 *               "standingOrder:<id>" so the trace UI works for free
 *             → streamText with stepCountIs cap
 *             → on every tool-call: recordToolEvent with triggeredBy
 *             → on completion: recordRunResult with summary + status
 *
 * Cost gates:
 *   - Standing orders are PLATFORM-BILLED only (BYOK not supported here).
 *     Future iteration: per-org daily LLM budget gate.
 *   - stepCountIs(8) hard-caps the loop — the model can call at most 8
 *     tools before being forced to summarise. Prevents runaway loops.
 *   - Tool whitelist is ENFORCED — the model never sees tools outside
 *     `allowedTools[]` AND the user's permission set.
 *
 * Telemetry:
 *   `aiToolEvents.triggeredBy = "standingOrder:<id>"` on every tool call,
 *   plus a top-level `synthesis` entry recording the model's final
 *   reply (so the AI changelog surfaces "this is what the AI did").
 */

import { generateText, stepCountIs, type ToolSet } from "ai";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";
import { bindAllToolContexts } from "../orchestrator/toolContextBinder";
import { clearActiveRequestContext, getToolsForRequest, type LayerId } from "../toolRegistry";
import type { ToolContext } from "../tools/_shared";

const MAX_STEPS = 8;
const MAX_OUTPUT_TOKENS = 700;
const SUMMARY_CAP = 1800;

const ALL_LAYERS: LayerId[] = [
	"pipelines",
	"fields",
	"tags",
	"views",
	"categories",
	"members",
	"settings",
	"bulk",
	"templates",
	"data",
	"messaging",
	"files",
	"timeline",
	"notifications",
	"analytics",
];

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * The runner. One invocation per fired schedule tick.
 */
export const run = internalAction({
	args: {
		standingOrderId: v.id("aiStandingOrders"),
	},
	handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
		// 1. Reload the row inside an internalQuery so a row that was
		// disabled / deleted in the scheduling window is honoured.
		const row = (await ctx.runQuery(
			_ref("ai/standingOrders/queries:getForRun"),
			_anyArgs({ standingOrderId: args.standingOrderId }),
		)) as {
			id: Id<"aiStandingOrders">;
			orgId: Id<"orgs">;
			userId: Id<"users">;
			name: string;
			prompt: string;
			allowedTools: string[];
			enabled: boolean;
		} | null;
		if (!row?.enabled) {
			return { ok: false, reason: "row_disabled_or_missing" };
		}

		// 2. Resolve owner permissions + plan via the existing helper used
		// by the chat orchestrator. If the owner lost membership / lost
		// `ai.automation.manage`, the run is skipped — cleanly.
		const ownerInfo = (await ctx.runQuery(
			_ref("orgs/queries:getMemberWithPermissions"),
			_anyArgs({
				orgId: row.orgId,
				userId: row.userId,
			}),
		)) as {
			permissions: string[];
			plan: string;
			settings: Record<string, unknown>;
			aiMessagesUsed: number;
		} | null;
		if (!ownerInfo?.permissions.includes("ai.automation.manage")) {
			await ctx.runMutation(
				_ref("ai/standingOrders/mutations:recordRunResult"),
				_anyArgs({
					standingOrderId: row.id,
					summary: "Skipped — owner has lost ai.automation.manage permission.",
					status: "skipped",
				}),
			);
			return { ok: false, reason: "owner_lost_permission" };
		}

		// 3. Resolve platform-billed model. Standing orders never use BYOK
		// (we'd otherwise need to ask the user every run for their key).
		const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			await ctx.runMutation(
				_ref("ai/standingOrders/mutations:recordRunResult"),
				_anyArgs({
					standingOrderId: row.id,
					summary: `Skipped — no platform API key configured for provider ${info.provider}.`,
					status: "skipped",
				}),
			);
			return { ok: false, reason: "no_platform_key" };
		}
		const model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		});

		// 4. Open a synthetic conversation for trace + audit purposes.
		const conversationId = (await ctx.runMutation(
			_ref("ai/standingOrders/mutations:openConversationForRun"),
			_anyArgs({
				orgId: row.orgId,
				userId: row.userId,
				standingOrderId: row.id,
				name: row.name,
			}),
		)) as Id<"aiConversations">;

		// 5. Bind tool contexts so each tool's _ctx variable resolves.
		const toolCtx: ToolContext = {
			ctx: ctx as never,
			orgId: row.orgId,
			userId: row.userId,
			permissions: ownerInfo.permissions,
			conversationId,
		};
		bindAllToolContexts(toolCtx);

		// 6. Build the tool dict. Start with everything the user can do
		// across every layer, then narrow to the allowedTools whitelist.
		const allTools = getToolsForRequest({
			permissions: ownerInfo.permissions,
			modelTier: "standard",
			expandedLayers: ALL_LAYERS,
		});
		const whitelist = new Set(row.allowedTools);
		const tools: ToolSet = {};
		for (const [name, def] of Object.entries(allTools)) {
			if (whitelist.has(name)) tools[name] = def as ToolSet[string];
		}

		// 7. The prompt — short, autonomous-mode-aware. We tell the model
		// it is running unattended so it shouldn't ask clarifying
		// questions; on ambiguity it should describe what it would have
		// done and stop.
		const system = [
			"You are running a STANDING ORDER on behalf of an organisation user — autonomously, without a person watching.",
			"Rules:",
			"- Do NOT ask clarifying questions. If the request is ambiguous, summarise what you would have done and stop.",
			"- Use ONLY the tools registered in this turn. Other tools are explicitly forbidden.",
			"- Reply with a 1-3 sentence summary of what you did (or what you decided not to do, and why).",
			`- You are user ${row.userId} in workspace ${row.orgId}. The orchestrator already authenticated you.`,
		].join("\n");

		const startedAt = Date.now();
		try {
			const result = await generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				system,
				prompt: row.prompt,
				tools: Object.keys(tools).length > 0 ? tools : undefined,
				stopWhen: stepCountIs(MAX_STEPS),
				temperature: 0.3,
				maxOutputTokens: MAX_OUTPUT_TOKENS,
			});

			// Telemetry — one row per tool call seen, with the triggeredBy
			// set so trace UIs can attribute the action to this standing
			// order. We DON'T duplicate the per-call telemetry that the
			// streamText tool wrappers already emit during chat — those
			// don't fire for `generateText`. Standing orders use
			// `generateText` (single-shot, non-streaming) so we record
			// here.
			const toolCalls = (result as unknown as { toolCalls?: Array<{ toolName: string }> })
				.toolCalls;
			if (Array.isArray(toolCalls)) {
				for (const call of toolCalls) {
					await ctx.runMutation(_ref("ai/telemetry:recordToolEvent"), {
						orgId: row.orgId,
						userId: row.userId,
						conversationId,
						toolName: call.toolName,
						model: briefingModelKey,
						provider: info.provider,
						startedAt,
						durationMs: Date.now() - startedAt,
						ok: true,
						triggeredBy: `standingOrder:${row.id}`,
					});
				}
			}

			const summary =
				(result.text ?? "").trim().length > 0
					? (result.text ?? "").trim().slice(0, SUMMARY_CAP)
					: `(no text reply — ${toolCalls?.length ?? 0} tool call${
							(toolCalls?.length ?? 0) === 1 ? "" : "s"
						} fired)`;
			const status: "ok" | "skipped" =
				summary.length > 0 || (toolCalls?.length ?? 0) > 0 ? "ok" : "skipped";

			await ctx.runMutation(
				_ref("ai/standingOrders/mutations:recordRunResult"),
				_anyArgs({
					standingOrderId: row.id,
					summary,
					status,
				}),
			);

			clearActiveRequestContext();
			return { ok: true };
		} catch (err) {
			console.error("[standingOrders.runner] failed:", err);
			const message = err instanceof Error ? err.message : "Unknown error.";
			await ctx.runMutation(
				_ref("ai/standingOrders/mutations:recordRunResult"),
				_anyArgs({
					standingOrderId: row.id,
					summary: `Error: ${message}`.slice(0, SUMMARY_CAP),
					status: "error",
				}),
			);
			// Telemetry — one error row.
			await ctx.runMutation(_ref("ai/telemetry:recordToolEvent"), {
				orgId: row.orgId,
				userId: row.userId,
				conversationId,
				toolName: "(standing-order)",
				model: briefingModelKey,
				provider: info.provider,
				startedAt,
				durationMs: Date.now() - startedAt,
				ok: false,
				errorMessage: message,
				triggeredBy: `standingOrder:${row.id}`,
			});
			clearActiveRequestContext();
			return { ok: false, reason: "exception" };
		}
	},
});
