"use node";
/**
 * `processChat.run` — entry point for a chat turn.
 *
 * Flow: auth + plan/quota gate → resolve model + BYOK key → insert
 * placeholder → load conversation history → call `runtime/host.ts:runAgent`
 * → settle the placeholder + log activity + auto-title.
 *
 * The V2 capability host is the ONE chat path. The legacy subagent /
 * propose-commit / fallback-chain runtime was deleted in S3. Domains are
 * ported into the registry stage-by-stage (S3+); each port deletes the
 * matching legacy tool files in the same edit.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalAction } from "../../_generated/server";
import type { OrgPlan } from "../modelRegistry";
import { runAgent } from "../runtime/host";
import { resolveFallbackChain, resolveModelAndKey } from "./modelResolver";
import { checkAiQuota } from "./quotaGate";

// biome-ignore lint/suspicious/noExplicitAny: pre-codegen string-path refs need a cast.
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen string-path refs need a cast.
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
	subscriptionStatus?: string;
	currentPeriodEnd?: number;
}> {
	const result = (await ctx.runQuery("orgs/queries:getMemberWithPermissions", {
		orgId,
		userId,
	})) as {
		permissions: string[];
		plan: OrgPlan;
		settings: Record<string, unknown>;
		aiMessagesUsed: number;
		subscriptionStatus?: string;
		currentPeriodEnd?: number;
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

/** Pick the latest user message out of the message history (empty if none). */
function lastUserMessageOrEmpty(
	history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i].role === "user") return history[i].content;
	}
	return "";
}

/**
 * Build a one-paragraph deterministic summary from per-tool envelope
 * headlines collected during the stream. Fires only when the model
 * settled the turn after running tools but emitted no prose — the
 * project drive's `## Response shape` rule says it should always close
 * with a recap, but smaller models (Llama-3.3-70B / Gemini Flash /
 * Mistrals) sometimes don't comply. This is the safety net so the user
 * never sees a blank assistant bubble.
 *
 * Output shape:
 *   - 0 successful headlines + ≥1 tool call ⇒ generic completion notice
 *   - 1 successful headline                 ⇒ "Done — <headline>"
 *   - N successful headlines (N ≥ 2)        ⇒ "Completed N actions:" + bullets
 *
 * Pure helper — no DB read, no network, no LLM. Tested in
 * `convex/ai-summary-fallback.test.ts`.
 */
export function buildToolOnlyFallbackSummary(
	headlines: Array<{ headline: string; status: "ok" | "partial" }>,
	toolCallCount: number,
): string {
	if (headlines.length === 0) {
		if (toolCallCount === 0) return "";
		return `Completed ${toolCallCount} action${toolCallCount === 1 ? "" : "s"} — see the steps above for details.`;
	}
	if (headlines.length === 1) {
		const { headline, status } = headlines[0];
		const prefix = status === "partial" ? "Partially complete — " : "Done — ";
		return `${prefix}${headline}`;
	}
	const bullets = headlines
		.map(({ headline, status }) => `- ${status === "partial" ? "(partial) " : ""}${headline}`)
		.join("\n");
	return `Completed ${headlines.length} actions:\n${bullets}`;
}

/**
 * Bridge between the run.ts entry (auth + plan + placeholder + model
 * resolution) and `runtime/host.ts:runAgent`. Walks the resolved fallback
 * chain — each candidate is tried once; on a transient/quota/auth error
 * with no streamed output yet, the placeholder is reset and the next
 * candidate is attempted. The first candidate that emits text or runs a
 * tool wins; partial output + tool calls disable failover so we never
 * duplicate visible work across providers.
 */
async function runChatTurn(args: {
	ctx: ActionCtx;
	orgId: Id<"orgs">;
	userId: Id<"users">;
	assistantMsgId: Id<"aiMessages">;
	candidates: Array<{
		model: unknown;
		modelKey: string;
		provider: string;
		usageMode: "platform" | "byok";
	}>;
	permissions: string[];
	message: string;
	history: Array<{ role: "user" | "assistant"; content: string }>;
	conversationId: Id<"aiConversations">;
	routeContext?: {
		entityType?: string;
		entityId?: string;
		personCode?: string;
		dealCode?: string;
		name?: string;
		aiContextSummary?: string;
		aiContextKeyFacts?: string[];
	};
	pageContext?: { mode: string; path: string; label?: string };
	stepUpToken?: string;
	/**
	 * A — V1-style inline approval (locked 2026-06-06). When set, the
	 * per-attempt `accumulated` buffer starts with this prefix so
	 * `onTextDelta` snapshots APPEND to the existing assistant body
	 * instead of replacing it. Used by `runResume` to keep whatever
	 * prose the model emitted before the awaiting-approval pause.
	 */
	resumePrefix?: string;
}): Promise<void> {
	const { ctx, assistantMsgId } = args;

	if (args.candidates.length === 0) {
		throw new Error("runChatTurn called with no model candidates");
	}

	// Load the per-turn org snapshot for the module + vertical gate (S9).
	// Cheap (one indexed read, narrow projection); read once at the top.
	const orgSnapshotRaw = (await ctx.runQuery(_ref("orgs/queries:getOrgSnapshotForAI"), {
		orgId: args.orgId,
		userId: args.userId,
	})) as {
		hiddenSlots: string[];
		industryKey?: string;
		entityLabels?: {
			lead?: { singular: string; plural: string };
			contact?: { singular: string; plural: string };
			deal?: { singular: string; plural: string };
			company?: { singular: string; plural: string };
		};
		currency?: string;
	};
	const orgSnapshot = {
		hiddenSlots: new Set(orgSnapshotRaw.hiddenSlots),
		industryKey: orgSnapshotRaw.industryKey,
		entityLabels: orgSnapshotRaw.entityLabels,
		currency: orgSnapshotRaw.currency,
	};

	// Match expressions safe to retry on the next provider — quota / rate
	// limit / transient 5xx / auth-rejection. A real bug (validator,
	// permission, etc.) shouldn't burn through the chain.
	const TRANSIENT_RE =
		/\b(429|5\d\d|rate[_ -]?limit|quota|insufficient|RESOURCE_EXHAUSTED|timeout|ETIMEDOUT|ECONNRESET|overloaded|service[_ -]?unavailable)\b/i;
	const AUTH_RE = /\b(401|403|unauthor|invalid[_ -]?api[_ -]?key|authentication)\b/i;

	let lastError: unknown = null;

	for (let i = 0; i < args.candidates.length; i++) {
		const candidate = args.candidates[i];
		const isLast = i === args.candidates.length - 1;

		// Per-attempt buffer so a previous candidate's partial output
		// can never leak into the next attempt.
		//
		// A — when called via `runResume`, seed with `resumePrefix` on
		// the FIRST attempt so the snapshot mutation's `content:
		// accumulated` write APPENDS to the existing body (the prose
		// emitted before the awaiting pause) instead of stomping it.
		// Failover resets to "" because each candidate runs against a
		// fresh stream — the prior body is already on disk.
		let accumulated = i === 0 ? (args.resumePrefix ?? "") : "";
		let lastFlushAt = 0;
		const FLUSH_INTERVAL_MS = 80;

		// Per-attempt headline collector — drives the deterministic
		// fallback summary for the "model ran tools but emitted no
		// prose" case (see post-stream block below). Resets per
		// candidate so a previous failed attempt's headlines never
		// leak into the next provider's response.
		const collectedHeadlines: Array<{ headline: string; status: "ok" | "partial" }> = [];
		const flushSnapshot = async (next: string, opts?: { final?: boolean }): Promise<void> => {
			await ctx.runMutation(_ref("ai/messages:patchAssistantSnapshot"), {
				messageId: assistantMsgId as unknown as string,
				content: next,
				thinkingState: opts?.final ? "done" : "streaming",
			});
		};

		// Mark streaming up-front so the spinner shows even when the model takes
		// a beat to emit its first token.
		await ctx
			.runMutation(_ref("ai/messages:patchThinkingState"), {
				messageId: assistantMsgId as unknown as string,
				thinkingState: "streaming",
			})
			.catch(() => {});

		try {
			const result = await runAgent({
				// biome-ignore lint/suspicious/noExplicitAny: the LanguageModelV3 instance is opaque on this side.
				model: candidate.model as any,
				providerHint: candidate.provider,
				channel: "chat",
				trigger: "chat",
				principal: {
					kind: "member",
					userId: args.userId,
					orgId: args.orgId,
					permissions: args.permissions,
					channel: "chat",
				},
				conversation: {
					conversationId: args.conversationId as unknown as string,
					routeCtx: {
						entityType: args.routeContext?.entityType,
						entityCode:
							args.routeContext?.personCode ??
							args.routeContext?.dealCode ??
							args.routeContext?.entityId,
						routeSummary: args.routeContext?.aiContextSummary,
						trigger: "chat",
					},
				},
				message: args.message,
				history: args.history,
				ctx: ctx as unknown as Parameters<typeof runAgent>[0]["ctx"],
				org: orgSnapshot,
				stepUpToken: args.stepUpToken,
				onTextDelta: async (delta) => {
					accumulated += delta;
					const now = Date.now();
					if (now - lastFlushAt >= FLUSH_INTERVAL_MS) {
						lastFlushAt = now;
						await flushSnapshot(accumulated);
					}
				},
				// Persist each tool call as an `aiMessages` `role: "tool"`
				// row so the <ThinkingTimeline> rail can render the
				// per-step pipeline (search → describe → update → …). Best
				// effort — a write failure is logged but doesn't break
				// the turn.
				onToolEvent: async (event) => {
					// Capture envelope headline for the deterministic
					// fallback summary (post-stream block below). Only
					// successful / partial-success envelopes carry a
					// user-visible headline worth surfacing — failures
					// are already on the timeline rail.
					const envelope = event.output;
					if (envelope && typeof envelope === "object") {
						const status = (envelope as { status?: unknown }).status;
						const headline = (envelope as { headline?: unknown }).headline;
						if (
							typeof headline === "string" &&
							headline.trim().length > 0 &&
							(status === "ok" || status === "partial")
						) {
							collectedHeadlines.push({
								headline: headline.trim(),
								status: status as "ok" | "partial",
							});
						}
					}
					try {
						// A — needs_step_up envelopes are PAUSED, not
						// FAILED. Persisting them as `failed` made the
						// timeline rail render a red ❌ (the bulkk.png
						// regression). Re-classify here so the rail
						// stays neutral; the frontend's TimelineRow
						// detects the envelope status separately and
						// renders an amber "Awaiting confirmation" pill
						// + the inline `<StepUpCard>` at the right row.
						const envelopeStatus =
							event.output && typeof event.output === "object"
								? ((event.output as { status?: unknown }).status as
										| string
										| undefined)
								: undefined;
						const persistStatus = event.ok
							? "completed"
							: envelopeStatus === "needs_step_up"
								? "completed"
								: "failed";
						await ctx.runMutation(_ref("ai/messages:appendToolCallRecord"), {
							orgId: args.orgId as string,
							conversationId: args.conversationId as string,
							toolName: event.toolName,
							toolCallId: event.toolCallId,
							input: event.input,
							output: event.output,
							status: persistStatus,
						});
					} catch (err) {
						console.warn("[processChat] persist tool call failed:", err);
					}
				},
			});

			// Final settle — write the full body + usage on the placeholder.
			//
			// AI summary delivery guarantee (2026-06-06): some models
			// (Llama-3.3-70B, Gemini Flash, smaller Mistrals) sometimes
			// settle a turn after a successful tool call without
			// emitting any prose, even though the project drive's
			// `## Response shape` rule demands it. When that happens we
			// build a deterministic fallback summary from the envelope
			// headlines collected via `onToolEvent` so the user always
			// sees what changed — never "(no response from the model)".
			// The prior `<AssistantTurn>` "AI completed N actions" recap
			// is now a defence-in-depth path; under the new branch it
			// only fires for the rare zero-headline case.
			//
			// A — when the host's awaitingApprovalStop fired, the stream
			// halted right after the irreversible tool call. We DON'T
			// emit a fallback summary in that case (the inline
			// `<StepUpCard>` at the awaiting tool row is the user's
			// next action, not a recap), and we settle thinkingState as
			// "awaiting_approval" so the chat UI knows the stream is
			// paused — not done. The runResume action picks up from
			// here when the user confirms.
			const awaiting = result.awaitingApproval;
			const streamedBody = result.text.length > 0 ? result.text : accumulated;
			const finalContent = awaiting
				? streamedBody // keep whatever the model streamed before pausing — usually empty
				: streamedBody.trim().length > 0
					? streamedBody
					: buildToolOnlyFallbackSummary(collectedHeadlines, result.toolCallCount);
			const settleThinkingState = awaiting
				? "awaiting_approval"
				: finalContent.trim().length > 0 || result.toolCallCount > 0
					? "done"
					: "error";
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: assistantMsgId as unknown as string,
				content: finalContent,
				model: candidate.modelKey,
				provider: candidate.provider,
				usageMode: candidate.usageMode,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				thinkingState: settleThinkingState,
				// B.44 — persist provider grounding citations on the assistant
				// row when the host's post-stream extractor produced any.
				// `result.metadata` is `undefined` when there were no citations
				// (most CRM turns) — the patch helper skips the field in that
				// case so we never overwrite an existing row's metadata with
				// `undefined`.
				...(result.metadata ? { metadata: result.metadata } : {}),
			});

			// Activity log line — mirrors what dashboards ingest.
			await ctx
				.runMutation(_ref("ai/_logAIActivityInternal:logAIActivity"), {
					orgId: args.orgId as unknown as string,
					userId: args.userId as unknown as string,
					action: "ai.chat",
					entityType: "conversation",
					entityId: args.conversationId as unknown as string,
					description: `AI responded (${candidate.modelKey}, ${result.usage.inputTokens + result.usage.outputTokens} tokens, ${result.toolCallCount} tool calls${i > 0 ? `, fellback from ${args.candidates[0].modelKey}` : ""})`,
				})
				.catch(() => {});

			return;
		} catch (err) {
			lastError = err;

			const errStr = err instanceof Error ? err.message : String(err);
			const safeToRetry = accumulated.length === 0 && !isLast;
			const retryClass = TRANSIENT_RE.test(errStr) || AUTH_RE.test(errStr);

			if (!safeToRetry || !retryClass) {
				// Either nothing to fall back to, partial output already streamed,
				// or a non-transient bug. Surface to the caller.
				throw err;
			}

			// Failover is operating normally — the next candidate will retry.
			// Use `console.info` (not `console.warn`) so the line doesn't
			// surface as red in the Convex dashboard when the chain is just
			// doing its job (audit §6 fix, 2026-06-05). The activity-log
			// row that lands on success still records the fallback (see
			// `description: "fellback from <primary>"` below), so we keep
			// the diagnostic visibility for ops without the alarm UX.
			console.info(
				`[processChat] candidate ${candidate.modelKey} (${candidate.provider}) ${retryClass ? "transient" : "auth"}-failed: ${errStr}. Failing over to ${args.candidates[i + 1].modelKey}…`,
			);

			// Reset the placeholder so the next candidate starts clean.
			await ctx
				.runMutation(_ref("ai/messages:patchAssistantSnapshot"), {
					messageId: assistantMsgId as unknown as string,
					content: "",
					thinkingState: "thinking",
				})
				.catch(() => {});
		}
	}

	// Should be unreachable — the loop either returns or throws — but keep a
	// belt-and-braces throw so a future refactor can't silently fall through.
	throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
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
		// Carried for legacy callers (messages.ts:sendMessage). The V2 host runs
		// progressive disclosure via discover_capabilities — this list is no longer
		// read but the arg stays optional so existing schedulers compile while we
		// roll out the cutover.
		expandedLayers: v.optional(v.array(v.string())),
		// S10 — passed by `aiStepUp.confirmStepUp` after the user double-
		// confirms an irreversible capability. The host injects a verifier
		// that consumes the token once the wrapper sees it.
		stepUpToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// 1. Auth + RBAC.
		let memberInfo: {
			permissions: string[];
			plan: OrgPlan;
			settings: Record<string, unknown>;
			subscriptionStatus?: string;
			currentPeriodEnd?: number;
		};
		try {
			memberInfo = await getOrgMemberAndPermissions(ctx as never, args.orgId, args.userId);
		} catch {
			return; // user was removed from org between submit and execute
		}
		if (!memberInfo.permissions.includes("ai.use")) return;

		// 2. User preferences.
		const prefs = await getUserPreferences(ctx as never, args.userId);

		// 3. Insert the assistant placeholder FIRST. If anything below fails
		//    we patch it with a friendly error so the UI's `isStreaming` flag
		//    can transition out instead of spinning forever.
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

		// 4. Resolve model + BYOK BEFORE the quota gate so we know whether the
		//    user is on platform (metered) or BYOK (unmetered).
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

		// 5. AI quota gate. BYOK is unmetered; platform-billed checks the org's
		//    monthly token + message-credit budgets.
		try {
			const quotaResult = await checkAiQuota({
				ctx: ctx as never,
				orgId: args.orgId,
				plan: memberInfo.plan,
				usageMode: modelResult.usageMode,
				subscriptionStatus: memberInfo.subscriptionStatus,
				currentPeriodEnd: memberInfo.currentPeriodEnd,
			});
			if (!quotaResult.allowed) {
				await failChat(quotaResult.message);
				return;
			}
		} catch (err) {
			console.warn("[processChat] AI quota check failed; allowing turn:", err);
		}

		// 6. Load prior messages so the host has conversation context. Filter
		//    out the empty placeholder + any prior empty assistant rows so the
		//    SDK doesn't see a half-finished assistant turn at the tail.
		const priorMessages = (await ctx.runQuery(
			_ref("ai/messages:listForConversationInternal"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{ role: string; content: string }>;
		const messageHistory = priorMessages
			.filter(
				(m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0,
			)
			.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

		// 7. Run the V2 capability host. Resolve the fallback chain so a
		//    quota-exhausted / 5xx primary can transparently land on a
		//    cross-family provider that has a working key. The chain always
		//    leads with the resolved primary (B.19 — wired 2026-06-05).
		try {
			const fallbackChain = await resolveFallbackChain({
				ctx: ctx as never,
				orgId: args.orgId,
				userId: args.userId,
				primary: modelResult,
				plan: memberInfo.plan,
			});
			await runChatTurn({
				ctx,
				orgId: args.orgId,
				userId: args.userId,
				assistantMsgId: assistantMsgId as unknown as Id<"aiMessages">,
				candidates: fallbackChain.map((m) => ({
					model: m.model,
					modelKey: m.modelKey,
					provider: m.provider,
					usageMode: m.usageMode,
				})),
				permissions: memberInfo.permissions,
				message: lastUserMessageOrEmpty(messageHistory),
				history: messageHistory,
				conversationId: args.conversationId,
				routeContext: args.routeContext,
				pageContext: args.pageContext,
				stepUpToken: args.stepUpToken,
			});
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			const isAuthError =
				/\b(401|403|unauthor|invalid[_ -]?api[_ -]?key|authentication)\b/i.test(raw);
			const isQuotaError =
				/\b(429|rate[_ -]?limit|quota|insufficient[_ -]?(quota|credits))\b/i.test(raw);
			const friendly = isAuthError
				? `❌ The AI provider rejected the API key (${modelResult.usageMode === "byok" ? "BYOK" : "platform"}).\n\nPlease verify the key under **Settings → AI** is current and has access to **${modelResult.modelKey}**.`
				: isQuotaError
					? `❌ The AI provider returned a rate-limit / quota error.\n\n${raw}`
					: `❌ ${raw}`;
			console.error("[processChat] turn failed:", err);
			await failChat(friendly);
			return;
		}

		// 8. Platform quota: increment on platform-billed mode (BYOK is free).
		if (modelResult.usageMode === "platform") {
			await ctx
				.runMutation(
					_ref("orgs/mutations:incrementAiMessageCount"),
					_anyArgs({ orgId: args.orgId as string }),
				)
				.catch(() => {}); // non-fatal
		}

		// 9. Auto-title now fires at SEND time from `ai/messages.ts:sendMessage`
		//    (audit §4 fix, 2026-06-05). Title appears ~1.5s after the user
		//    sends, parallel with the main turn, instead of waiting for the
		//    assistant reply to settle. Nothing to do here.
	},
});

/**
 * runResume — A: V1-style inline approval (locked 2026-06-06).
 *
 * Scheduled by `aiStepUp.confirmStepUp` after the user clicks Confirm
 * twice on the inline `<StepUpCard>`. Re-enters `runAgent` with the
 * EXISTING assistantMessageId so the same chat bubble keeps streaming —
 * no new message, no synthetic user prompt visible in the timeline.
 *
 * Differences vs `run`:
 *   • No new placeholder — patches the existing assistant message.
 *   • Reads the existing content as a prefix so `onTextDelta` appends
 *     rather than replaces (the prior pre-pause prose stays).
 *   • Synthesises a one-line resume cue prepended to the conversation
 *     history (NOT persisted) telling the model "you may re-call X
 *     with these args" so it issues the tool call the wrapper now has
 *     a token for. Without the inlined args the model would
 *     regenerate fresh values, the argsHash wouldn't match, and the
 *     wrapper's stepUpVerifier would reject the token.
 *   • Every other step (auth, quota, model resolution, fallback chain)
 *     is identical to `run` so a chained second irreversible inside
 *     the same turn re-uses the awaiting_approval path automatically.
 */
export const runResume = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("aiConversations"),
		assistantMessageId: v.id("aiMessages"),
		capability: v.string(),
		capabilityArgs: v.any(),
		stepUpToken: v.string(),
	},
	handler: async (ctx, args) => {
		// 1. Auth + RBAC.
		let memberInfo: {
			permissions: string[];
			plan: OrgPlan;
			settings: Record<string, unknown>;
			subscriptionStatus?: string;
			currentPeriodEnd?: number;
		};
		try {
			memberInfo = await getOrgMemberAndPermissions(ctx as never, args.orgId, args.userId);
		} catch {
			return;
		}
		if (!memberInfo.permissions.includes("ai.use")) return;

		// 2. User preferences.
		const prefs = await getUserPreferences(ctx as never, args.userId);

		// 3. Read the existing assistant message — this is the bubble we
		//    keep streaming into. Bail safely if it was deleted.
		//
		//    Locked 2026-06-07. The prior code called
		//    `ai/messages:_readForTest` here — a path that never
		//    existed in `convex/ai/messages.ts` (the `_readForTest`
		//    that does exist is in `convex/aiStepUp.ts`, an
		//    internalMutation that takes `tokenId`, not `messageId`).
		//    Because `_ref()` is a `path as any` cast, the typecheck
		//    pass never caught it, and there was no test exercising
		//    `runResume`. Every 2FA approval ended up here, the
		//    `runQuery` threw "function not found", the throw
		//    bubbled out uncaught (no try/catch around step 3), and
		//    the assistant message stayed stuck on
		//    `thinkingState: "thinking"` forever — the user-visible
		//    "Bulk Create Entities · Awaiting confirmation"
		//    permanent-spinner regression. Two protections now: the
		//    typed `internal.ai.messages.getMessageContent`
		//    reference imported dynamically (matching the
		//    `host.ts` pattern at line 858), AND a try/catch so a
		//    future broken read patches a friendly error instead of
		//    leaving the bubble stuck.
		let existingContent = "";
		try {
			const { internal } = await import("../../_generated/api");
			const existing = (await ctx.runQuery(internal.ai.messages.getMessageContent, {
				messageId: args.assistantMessageId,
			})) as { content?: string } | null;
			if (existing && typeof existing.content === "string") {
				existingContent = existing.content;
			}
		} catch (err) {
			console.error("[runResume] failed to read existing assistant message:", err);
			// Failure-tolerant: an unreachable read shouldn't strand the
			// bubble — patch a friendly error and bail. The user can
			// re-issue the request; the step-up token has already been
			// consumed so they'll get a fresh approval prompt.
			await ctx
				.runMutation(_ref("ai/messages:patchAssistantBody"), {
					messageId: args.assistantMessageId as unknown as string,
					content:
						"❌ Could not resume the action after confirmation. Please try the request again.",
					thinkingState: "error",
				})
				.catch(() => {});
			return;
		}

		// 4. Resolve model + key (same path as `run`).
		let modelResult: Awaited<ReturnType<typeof resolveModelAndKey>>;
		try {
			modelResult = await resolveModelAndKey({
				ctx: ctx as never,
				orgId: args.orgId,
				userId: args.userId,
				requestedModel: undefined,
				requestedProvider: undefined,
				defaultModel: prefs.aiDefaultModel,
				defaultProvider: prefs.aiDefaultProvider,
				plan: memberInfo.plan,
			});
		} catch (err) {
			const raw = err instanceof Error ? err.message : "Could not load AI model.";
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: args.assistantMessageId as unknown as string,
				content: existingContent ? `${existingContent}\n\n❌ ${raw}` : `❌ ${raw}`,
				thinkingState: "error",
			});
			return;
		}

		// 5. AI quota gate (BYOK is unmetered).
		try {
			const quotaResult = await checkAiQuota({
				ctx: ctx as never,
				orgId: args.orgId,
				plan: memberInfo.plan,
				usageMode: modelResult.usageMode,
				subscriptionStatus: memberInfo.subscriptionStatus,
				currentPeriodEnd: memberInfo.currentPeriodEnd,
			});
			if (!quotaResult.allowed) {
				await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
					messageId: args.assistantMessageId as unknown as string,
					content: existingContent
						? `${existingContent}\n\n${quotaResult.message}`
						: quotaResult.message,
					thinkingState: "error",
				});
				return;
			}
		} catch (err) {
			console.warn("[runResume] AI quota check failed; allowing turn:", err);
		}

		// 6. Load prior conversation messages — exactly as `run` does.
		const priorMessages = (await ctx.runQuery(
			_ref("ai/messages:listForConversationInternal"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{ role: string; content: string }>;
		const messageHistory = priorMessages
			.filter(
				(m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0,
			)
			.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

		// 7. Build the resume cue. The SAME structured args the model
		//    saw before — embedded so its argsHash matches the token
		//    bound to (orgId, userId, capability, argsHash). Without
		//    verbatim args the wrapper rejects the token and bounces
		//    back to needs_step_up.
		let argsJson = "";
		try {
			argsJson = JSON.stringify(args.capabilityArgs);
		} catch {
			argsJson = "";
		}
		const MAX_INLINE_ARGS = 6000;
		const inlineArgs =
			argsJson.length > 0 && argsJson.length <= MAX_INLINE_ARGS
				? `\n\nRe-call \`${args.capability}\` with EXACTLY these arguments (verbatim — do not regenerate any value):\n\`\`\`json\n${argsJson}\n\`\`\``
				: ` Re-call \`${args.capability}\` with the previously-proposed arguments.`;
		const resumeCue = `[step-up confirmed by the user — you may now proceed]${inlineArgs}\n\nThe action is authorised. Run it, then continue with any remaining work and close with a concrete summary.`;

		// 8. Run the V2 host with the existing assistantMsgId. Resolve
		//    the fallback chain so a quota-exhausted primary still
		//    lands on a working provider.
		try {
			const fallbackChain = await resolveFallbackChain({
				ctx: ctx as never,
				orgId: args.orgId,
				userId: args.userId,
				primary: modelResult,
				plan: memberInfo.plan,
			});
			await runChatTurn({
				ctx,
				orgId: args.orgId,
				userId: args.userId,
				assistantMsgId: args.assistantMessageId as unknown as Id<"aiMessages">,
				candidates: fallbackChain.map((m) => ({
					model: m.model,
					modelKey: m.modelKey,
					provider: m.provider,
					usageMode: m.usageMode,
				})),
				permissions: memberInfo.permissions,
				message: resumeCue,
				history: messageHistory,
				conversationId: args.conversationId,
				stepUpToken: args.stepUpToken,
				resumePrefix: existingContent,
			});
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			console.error("[runResume] turn failed:", err);
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: args.assistantMessageId as unknown as string,
				content: existingContent ? `${existingContent}\n\n❌ ${raw}` : `❌ ${raw}`,
				thinkingState: "error",
			});
			return;
		}

		// 9. Platform quota.
		if (modelResult.usageMode === "platform") {
			await ctx
				.runMutation(
					_ref("orgs/mutations:incrementAiMessageCount"),
					_anyArgs({ orgId: args.orgId as string }),
				)
				.catch(() => {});
		}
	},
});
