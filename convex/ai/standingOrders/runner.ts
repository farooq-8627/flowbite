"use node";
/**
 * convex/ai/standingOrders/runner.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). One invocation per
 * fired schedule tick. Reloads the row, resolves the owner's RBAC,
 * picks a platform-billed model, then runs the V2 capability host
 * (`runtime/host.ts`) with a registry filtered to the standing order's
 * `allowedTools[]` whitelist.
 *
 * S10 port — replaced the V1 `getToolsForRequest` + `bindAllToolContexts`
 * pair with `runAgent({...registry: filtered})`. The whitelist is
 * applied as a name-filter over `listCapabilities()` — capabilities
 * not in the user's permissions are still hidden by the host's own
 * gate, so the whitelist is purely a domain-narrow.
 */

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
import { listCapabilities } from "../registry/define";
import { runAgent } from "../runtime/host";

const SUMMARY_CAP = 1800;

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

		// 5. Filter the V2 registry to the whitelist. Capabilities the
		// owner can't run are still removed by the host's gate, so this
		// is purely a domain-narrow.
		const whitelist = new Set(row.allowedTools);
		const filteredRegistry = listCapabilities().filter((c) => whitelist.has(c.name));

		// 6. Standing-order PROJECT drive variant. We tell the model it
		// runs unattended so it shouldn't ask clarifying questions; on
		// ambiguity it summarises what it would have done.
		const standingOrderPrompt = [
			"You are running a STANDING ORDER on behalf of an organisation user — autonomously, without a person watching.",
			"",
			"Rules:",
			"- Do NOT ask clarifying questions. If the request is ambiguous, summarise what you would have done and stop.",
			"- Use ONLY the tools available in this turn. Irreversible tools require a 2FA step-up that no human will provide here — they will return `needs_step_up` and you must stop.",
			"- Reply with a 1-3 sentence summary of what you did (or what you decided not to do, and why).",
			"",
			`The standing order's instructions: ${row.prompt}`,
		].join("\n");

		const startedAt = Date.now();
		try {
			const result = await runAgent({
				model: model as Parameters<typeof runAgent>[0]["model"],
				channel: "chat",
				trigger: "autonomous",
				principal: {
					kind: "member",
					userId: row.userId,
					orgId: row.orgId,
					permissions: ownerInfo.permissions,
					channel: "chat",
				},
				conversation: {
					conversationId: conversationId as unknown as string,
				},
				message: standingOrderPrompt,
				ctx: ctx as unknown as Parameters<typeof runAgent>[0]["ctx"],
				registry: filteredRegistry,
			});

			const summary =
				(result.text ?? "").trim().length > 0
					? (result.text ?? "").trim().slice(0, SUMMARY_CAP)
					: `(no text reply — ${result.toolCallCount} tool call${
							result.toolCallCount === 1 ? "" : "s"
						} fired)`;
			const status: "ok" | "skipped" =
				summary.length > 0 || result.toolCallCount > 0 ? "ok" : "skipped";

			await ctx.runMutation(
				_ref("ai/standingOrders/mutations:recordRunResult"),
				_anyArgs({
					standingOrderId: row.id,
					summary,
					status,
				}),
			);
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
			return { ok: false, reason: "exception" };
		}
	},
});
