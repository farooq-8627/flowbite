"use node";
/**
 * convex/ai/orchestrator/run.ts
 *
 * `processChat.run` — entry point for a chat turn.
 *
 * Flow:
 *   1. Auth + RBAC (requireOrgMember, ai.use permission)
 *   2. Plan + quota gate (platform-billed only; BYOK unlimited)
 *   3. Resolve model + BYOK key
 *   4. Build system prompt (3 layers)
 *   5. Resolve tool set (always-on + expanded layers)
 *   6. Run streamText loop with DB-patching on each token chunk
 *   7. Settle the placeholder + log activity + auto-title
 *
 * Each numbered phase is delegated to a helper module:
 *   - getOrgMemberAndPermissions / getUserPreferences (this file, stays small)
 *   - resolveModelAndKey → modelResolver.ts
 *   - bindAllToolContexts → toolContextBinder.ts
 *   - runStreamLoop → streamLoop.ts
 *   - formatToolErrorForReasoning + REASONING_HARD_CAP → reasoningBuffer.ts
 *
 * The function is still exported as `run` and Convex registers it at
 * `api.ai.orchestrator.run.run`. The legacy path `api.ai.processChat.run`
 * is preserved by `convex/ai/processChat.ts` re-exporting from here.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { OrgPlan } from "../modelRegistry";
import { FALLBACK_SUBAGENT_ID, getSubagent, selectToolsForSubagent } from "../subagents";
import {
	clearActiveRequestContext,
	getRegisteredToolNames,
	getToolsForRequest,
	type LayerId,
} from "../toolRegistry";
import type { ToolContext } from "../tools/_shared";
import { resolveFallbackChain, resolveModelAndKey } from "./modelResolver";
import { checkAiQuota } from "./quotaGate";
import { classifyRequest, type RouterDecision } from "./router";
import { runStreamLoop } from "./streamLoop";
import { generateSuggestions } from "./suggestionGenerator";
import { bindAllToolContexts } from "./toolContextBinder";
import { auditTwoStepSchemas, KNOWN_SAFE_MISMATCHES } from "./twoStepSchemaAudit";

// ─── P1.6 — Dev-time twoStep schema-diff log ─────────────────────────────────
//
// Walks the registry once per Node worker on the first chat turn in a dev
// environment and prints any propose/commit field-set mismatches that
// AREN'T in the `KNOWN_SAFE_MISMATCHES` allow-list. Catches the kind of
// regression that caused the 2026-05-24 incident (a propose-only field
// silently leaking into the underlying mutation validator) the moment a
// tool author lands it, instead of waiting for a user report.
//
// Hard-fail in CI is handled by `convex/ai/agentScorer.test.ts`. This is
// the developer-facing equivalent: visible in `npx convex dev` logs.

let _auditedTwoStepSchemas = false;
function logTwoStepSchemaAuditOnce(): void {
	if (_auditedTwoStepSchemas) return;
	_auditedTwoStepSchemas = true;
	const env = (process.env.CONVEX_DEPLOYMENT_NAME ?? "").toLowerCase();
	const isDev = env.startsWith("dev:") || env.includes("local") || !env;
	if (!isDev) return;
	try {
		const diffs = auditTwoStepSchemas(getRegisteredToolNames());
		const surprises = diffs.filter(
			(d) => d.verdict !== "ok" && KNOWN_SAFE_MISMATCHES[d.proposeName] === undefined,
		);
		if (surprises.length === 0) {
			console.log(`[ai] twoStep schema audit: ${diffs.length} pairs — all clean.`);
			return;
		}
		console.warn(`[ai] twoStep schema audit: ${surprises.length} unexpected mismatch(es):`);
		for (const d of surprises) {
			console.warn(
				`  • ${d.proposeName} → ${d.commitName} (${d.verdict})\n      proposeOnly: [${d.proposeOnly.join(", ")}]\n      commitOnly:  [${d.commitOnly.join(", ")}]`,
			);
		}
	} catch (err) {
		console.warn("[ai] twoStep schema audit skipped:", err);
	}
}

// Forward references using string-path pattern (resolved after convex dev codegen).
// biome-ignore lint/suspicious/noExplicitAny: _ref/_anyArgs casts required for pre-codegen cross-module refs
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: _ref/_anyArgs casts required for pre-codegen cross-module refs
const _anyArgs = (a: Record<string, unknown>) => a as any;

type RunQueryFn = (fn: unknown, args: unknown) => Promise<unknown>;

async function getOrgMemberAndPermissions(
	ctx: { runQuery: RunQueryFn },
	orgId: Id<"orgs">,
	userId: Id<"users">,
): Promise<{
	permissions: string[];
	plan: OrgPlan;
	settings: Record<string, unknown>;
	aiMessagesUsed: number;
}> {
	const result = (await ctx.runQuery("orgs/queries:getMemberWithPermissions", {
		orgId,
		userId,
	})) as {
		permissions: string[];
		plan: OrgPlan;
		settings: Record<string, unknown>;
		aiMessagesUsed: number;
	} | null;
	if (!result) throw new Error("Not a member of this org.");
	return result;
}

async function getUserPreferences(
	ctx: { runQuery: RunQueryFn },
	userId: Id<"users">,
): Promise<{
	aiAutoContextLoad?: boolean;
	aiDefaultModel?: string | null;
	aiDefaultProvider?: string | null;
}> {
	const prefs = (await ctx.runQuery("users/queries:getPreferences", { userId })) as {
		aiAutoContextLoad?: boolean;
		aiDefaultModel?: string | null;
		aiDefaultProvider?: string | null;
	} | null;
	return prefs ?? {};
}

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("aiConversations"),
		userMessageId: v.id("aiMessages"),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		routeContext: v.optional(
			v.object({
				entityType: v.string(),
				entityId: v.string(),
				personCode: v.optional(v.string()),
				dealCode: v.optional(v.string()),
				name: v.optional(v.string()),
				aiContextSummary: v.optional(v.string()),
				aiContextKeyFacts: v.optional(v.array(v.string())),
			}),
		),
		// P1.13 — broad page-mode info from the frontend.
		pageContext: v.optional(
			v.object({
				mode: v.union(
					v.literal("entity"),
					v.literal("list"),
					v.literal("dashboard"),
					v.literal("calendar"),
					v.literal("settings"),
					v.literal("reports"),
					v.literal("other"),
				),
				path: v.string(),
				label: v.optional(v.string()),
			}),
		),
		expandedLayers: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		// 0. Dev-only one-shot: audit twoStep tool schemas. Cheap to call
		// every turn (idempotent + early-returns after first pass);
		// catches NEW propose/commit mismatches the moment a tool author
		// lands them instead of waiting for a user report. P1.6.
		logTwoStepSchemaAuditOnce();

		// 1. Auth + RBAC + quota
		let memberInfo: { permissions: string[]; plan: OrgPlan; settings: Record<string, unknown> };
		try {
			memberInfo = await getOrgMemberAndPermissions(ctx as never, args.orgId, args.userId);
		} catch {
			return; // user was removed from org between submit and execute
		}
		if (!memberInfo.permissions.includes("ai.use")) return;

		// 2. User preferences
		const prefs = await getUserPreferences(ctx as never, args.userId);

		// 3. Insert the assistant placeholder FIRST.
		// If anything below fails, we patch the placeholder with a friendly
		// error so the UI's `isStreaming` flag (last assistant message has
		// empty content) can transition out and the user sees what went
		// wrong instead of a silent void.
		const assistantMsgId = (await ctx.runMutation(
			_ref("ai/messages:appendAssistantPlaceholder"),
			{
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			},
		)) as string;

		const failChat = async (message: string) => {
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: assistantMsgId,
				content: message,
				thinkingState: "error",
			});
		};

		// 4. Resolve model + BYOK
		// Resolution happens BEFORE the quota gate so we know whether
		// the user is on platform or BYOK — BYOK is unmetered on every
		// plan, platform is blocked on free + metered on starter/pro.
		let modelResult: Awaited<ReturnType<typeof resolveModelAndKey>>;
		try {
			modelResult = await resolveModelAndKey({
				ctx: ctx as never,
				orgId: args.orgId,
				userId: args.userId,
				requestedModel: args.model,
				requestedProvider: args.provider,
				defaultModel: prefs.aiDefaultModel,
				defaultProvider: prefs.aiDefaultProvider,
				plan: memberInfo.plan,
			});
		} catch (err) {
			const raw = err instanceof Error ? err.message : "Could not load AI model.";
			const isMissingKey = /Platform API key not configured/i.test(raw);
			const friendly = isMissingKey
				? `❌ ${raw}.\n\nNo API key is set for this provider. To start chatting:\n• Add a key under **Settings → AI** (Bring-Your-Own-Key), OR\n• Ask an admin to set the platform env var on the Convex dashboard.\n\nOnce a key is added, try again — no need to reload.`
				: `❌ ${raw}`;
			console.error("[processChat] model resolution failed:", err);
			await failChat(friendly);
			return;
		}

		// 4.5 — AI token quota gate (post-resolution).
		// • BYOK → always allowed regardless of plan.
		// • Platform on free → blocked with "add BYOK or upgrade" message.
		// • Platform on starter / pro → metered against `aiTokensPerMonth`.
		// • Platform on enterprise → unmetered.
		try {
			const quotaResult = await checkAiQuota({
				ctx: ctx as never,
				orgId: args.orgId,
				plan: memberInfo.plan,
				usageMode: modelResult.usageMode,
			});
			if (!quotaResult.allowed) {
				await failChat(quotaResult.message);
				return;
			}
		} catch (err) {
			console.warn("[processChat] AI quota check failed; allowing turn:", err);
		}

		// 5. Build system prompt
		// Step 4.5 — load the conversation so we can pass its contextBag
		// (Week 3.2) AND the router can see the last assistant turn for
		// classification context.
		const conversation = (await ctx.runQuery(
			_ref("ai/conversations:getInternal"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as { contextBag?: Record<string, unknown> } | null;
		const contextBag = conversation?.contextBag ?? {};

		// 6. Load prior messages for context (we need them BEFORE the
		// router so we can feed it the latest user turn + previous assistant
		// snippet).
		const priorMessages = (await ctx.runQuery(
			_ref("ai/messages:listForConversationInternal"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{ role: string; content: string }>;

		// Filter out the empty assistant placeholder we just inserted (it has
		// content === "") and any prior empty placeholders so the SDK doesn't
		// see a half-finished assistant turn at the tail.
		const messageHistory = priorMessages
			.filter(
				(m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0,
			)
			.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

		// Week 2.2/2.3 — classify the request to a subagent. The router
		// never throws; on any failure it returns the catch-all subagent.
		const lastUserMessage = [...messageHistory].reverse().find((m) => m.role === "user");
		const lastAssistant = [...messageHistory].reverse().find((m) => m.role === "assistant");
		let routerDecision: RouterDecision;
		if (lastUserMessage) {
			routerDecision = await classifyRequest({
				userMessage: lastUserMessage.content,
				priorAssistant: lastAssistant?.content ?? null,
				routeContextSummary: args.routeContext?.aiContextSummary ?? null,
				permissions: memberInfo.permissions,
			});
		} else {
			// No user turn yet (shouldn't happen — sendMessage inserts one
			// before scheduling). Fall back deterministically.
			routerDecision = {
				subagent: getSubagent(FALLBACK_SUBAGENT_ID),
				requested: FALLBACK_SUBAGENT_ID,
				demoted: false,
				confidence: 0,
				source: "fallback",
			};
		}

		// Persist the chosen subagent on the placeholder so the UI + activity
		// log know which specialist is handling the turn. Patches are merged
		// later when the body arrives.
		await ctx
			.runMutation(_ref("ai/messages:patchAssistantSubagent"), {
				messageId: assistantMsgId,
				subagent: routerDecision.subagent.id,
			})
			.catch(() => {}); // non-fatal — telemetry only

		// Architecture fix (2026-05-24) — `streamText` is invoked ONCE per
		// turn with a frozen tools dict. If the model calls `expand_tools`
		// mid-stream, the dict can't grow — the next call to a layer tool
		// would hit "Model tried to call unavailable tool". To stop the
		// loop, we expose every layer the user's permissions allow at turn
		// start. The subagent's allow-list still narrows below.
		//
		// `expand_tools` is kept as a no-op-style hint so existing prompts
		// and tests don't break — calling it just acknowledges the layer
		// is already active. Token cost is bounded because runbooks are
		// only emitted for tools the subagent allows (see systemPrompt.ts).
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
		];
		const requestedLayers = new Set<string>(args.expandedLayers ?? []);
		for (const l of ALL_LAYERS) requestedLayers.add(l);
		const effectiveExpandedLayers = Array.from(requestedLayers);

		const promptResult = (await ctx.runQuery(
			_ref("ai/systemPrompt:buildSystemPromptQuery"),
			_anyArgs({
				orgId: args.orgId as string,
				userId: args.userId as string,
				permissions: memberInfo.permissions,
				modelTier: modelResult.tier,
				routeContext: args.routeContext,
				autoContextLoad: prefs.aiAutoContextLoad !== false,
				expandedLayers: effectiveExpandedLayers,
				subagentId: routerDecision.subagent.id,
				contextBag,
				pageContext: args.pageContext,
			}),
		)) as { system: string; allowedLayers: string[]; subagentId: string };

		// 7. Bind tool contexts and resolve tool set
		const toolCtx: ToolContext = {
			ctx: ctx as never,
			orgId: args.orgId,
			userId: args.userId,
			permissions: memberInfo.permissions,
			conversationId: args.conversationId,
		};
		bindAllToolContexts(toolCtx);

		const allTools = getToolsForRequest({
			permissions: memberInfo.permissions,
			modelTier: modelResult.tier,
			expandedLayers: effectiveExpandedLayers,
		});

		// Week 2.3 — narrow to only the tools the chosen subagent allows.
		// `selectToolsForSubagent` honours the `"*"` wildcard for the
		// catch-all `crm_action` subagent so the existing tool surface
		// is unchanged when no router rules fire.
		const tools = selectToolsForSubagent(allTools, routerDecision.subagent);

		// 8. Stream
		// Week 1 #1.2 — `getToolsForRequest` above stamps a per-request
		// context onto a module-level holder so `expand_tools.execute` can
		// apply the same filters when previewing layer contents. We MUST
		// clear it after the stream finishes (success, cancellation, or
		// error) so a subsequent run.ts invocation in the same Node worker
		// doesn't read stale permissions/tier.
		//
		// P1.1 — multi-provider failover. `resolveFallbackChain` returns
		// the user's primary model first plus up to 2 cross-family
		// candidates with working keys. `runStreamLoop` tries each in
		// order on transient errors (5xx, rate-limit, network) BEFORE
		// any text streams; once tokens land, errors propagate.
		const fallbackChain = await resolveFallbackChain({
			ctx: ctx as never,
			orgId: args.orgId,
			userId: args.userId,
			primary: modelResult,
			plan: memberInfo.plan,
		});

		let result: Awaited<ReturnType<typeof runStreamLoop>>;
		try {
			result = await runStreamLoop({
				ctx: ctx as never,
				orgId: args.orgId as unknown as string,
				userId: args.userId as unknown as string,
				conversationId: args.conversationId as unknown as string,
				assistantMsgId,
				models: fallbackChain,
				system: promptResult.system,
				messageHistory,
				tools,
				expandedLayers: effectiveExpandedLayers,
			});
		} catch (err) {
			clearActiveRequestContext();
			const raw = err instanceof Error ? err.message : "An error occurred. Please try again.";
			const isAuthError =
				/\b(401|403|unauthor|invalid[_ -]?api[_ -]?key|authentication)\b/i.test(raw);
			const isQuotaError =
				/\b(429|rate[_ -]?limit|quota|insufficient[_ -]?(quota|credits))\b/i.test(raw);
			const friendly = isAuthError
				? `❌ The AI provider rejected the API key (${modelResult.usageMode === "byok" ? "BYOK" : "platform"}).\n\nPlease verify the key under **Settings → AI** is current and has access to **${modelResult.modelKey}**.`
				: isQuotaError
					? `❌ The AI provider returned a rate-limit / quota error.\n\n${raw}`
					: `❌ ${raw}`;
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: assistantMsgId,
				content: friendly,
				thinkingState: "error",
			});
			console.error("[processChat] stream error:", err);
			return;
		}
		clearActiveRequestContext();

		// P1.1 — Surface the failover chain to the user when one happened.
		// The DB-streamed reasoning channel already received a "Trying X" line
		// from inside the loop; here we add a permanent footer to the
		// assistant body so it survives the patchAssistantBody settle below.
		if (result.failedProviderAttempts.length > 0) {
			const switched = `${result.usedModel.provider}/${result.usedModel.modelKey}`;
			const reasons = result.failedProviderAttempts
				.map((a) => `${a.provider}/${a.modelKey}`)
				.join(", ");
			console.log(`[run] failed providers: ${reasons} → succeeded with ${switched}`);
		}

		// 9. Cancellation short-circuit (cancelStream already settled the row)
		if (result.cancelled) return;

		// 10. If the stream ended without a "finish" chunk (provider quirk),
		// settle the placeholder ourselves so the UI doesn't spin forever.
		if (!result.sawFinish) {
			const trimmed = result.accumulatedText.trim();
			let fallbackContent: string;
			if (trimmed.length > 0) {
				fallbackContent = result.accumulatedText;
			} else if (result.toolResultCount > 0) {
				// Small open models (Llama-class) often call a tool, then
				// emit a stream end without text. Don't fail the turn —
				// the structured tool-result card already shows the data.
				fallbackContent = "Done. See the result above.";
			} else {
				fallbackContent =
					"❌ The AI response ended without producing any text. Please try again.";
			}
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: assistantMsgId,
				content: fallbackContent,
				// Reflect the model that ACTUALLY produced the text — this
				// might be a fallback if the primary failed before any
				// text-delta. P1.1.
				model: result.usedModel.modelKey,
				provider: result.usedModel.provider,
				usageMode: result.usedModel.usageMode,
				inputTokens: result.finalInputTokens,
				outputTokens: result.finalOutputTokens,
				thinkingState:
					result.accumulatedText.trim().length > 0 || result.toolResultCount > 0
						? "done"
						: "error",
			});
		}

		// 11. Log activity
		await ctx.runMutation(_ref("ai/_logAIActivityInternal:logAIActivity"), {
			orgId: args.orgId as string,
			userId: args.userId as string,
			action: "ai.chat",
			entityType: "conversation",
			entityId: args.conversationId as string,
			description: `AI responded (${result.usedModel.modelKey}${result.failedProviderAttempts.length > 0 ? ` after ${result.failedProviderAttempts.length} fallback(s)` : ""}, ${result.finalInputTokens + result.finalOutputTokens} tokens)`,
		});

		// 11b. Sprint 5 — generate 2-3 follow-up prompt suggestions and
		// attach them to the assistant message. Best-effort + silent on
		// failure — the chat already settled; bad suggestions must never
		// surface as user-visible errors. Only run when the reply actually
		// contains text (skips tool-only turns where chips wouldn't help).
		const finalText = (result.accumulatedText ?? "").trim();
		if (finalText.length > 20) {
			try {
				const suggestions = await generateSuggestions({
					userMessages: messageHistory
						.filter((m) => m.role === "user")
						.slice(-2)
						.map((m) => m.content),
					assistantReply: finalText,
				});
				if (suggestions.length > 0) {
					await ctx.runMutation(_ref("ai/messages:patchSuggestions"), {
						messageId: assistantMsgId,
						suggestions,
					});
				}
			} catch (err) {
				console.warn("[run] suggestion generation skipped:", err);
			}
		}

		// 12. Platform quota: increment on platform-billed mode
		if (modelResult.usageMode === "platform") {
			await ctx
				.runMutation(
					_ref("orgs/mutations:incrementAiMessageCount"),
					_anyArgs({ orgId: args.orgId as string }),
				)
				.catch(() => {}); // non-fatal
		}

		// 13. Auto-title on first reply (Week-6 doc-cleanup follow-up). The
		// trigger gate used to be `process.env.AI_BRIEFING_MODEL`, which is
		// the briefing-only feature flag — most deployments leave it unset
		// and the auto-title silently never fired. Now we trigger on every
		// first turn with a user message ≥10 chars; the action itself
		// short-circuits if no provider key is configured.
		if (messageHistory.length <= 1) {
			const lastUserMsg = messageHistory.at(-1)?.content ?? "";
			if (lastUserMsg.length > 10) {
				ctx.scheduler
					?.runAfter?.(
						2000,
						_ref("ai/titleGeneration:autoTitle"),
						_anyArgs({
							conversationId: args.conversationId as string,
							orgId: args.orgId as string,
							firstUserMessage: lastUserMsg.slice(0, 400),
						}),
					)
					.catch(() => {});
			}
		}
	},
});
