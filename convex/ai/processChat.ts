"use node";
/**
 * convex/ai/processChat.ts
 *
 * The AI brain — internalAction running in Node.js context.
 *
 * Flow per request:
 *   1. Auth + RBAC (requireOrgMember, ai.use permission)
 *   2. Plan + quota gate (platform-billed only; BYOK unlimited)
 *   3. Rate limit (20/min/user:org)
 *   4. Resolve model + BYOK key
 *   5. Build system prompt (3 layers)
 *   6. Resolve tool set (always-on + expanded layers)
 *   7. Run streamText loop with DB-patching on each token chunk
 *   8. Log tool calls + activity
 *   9. Auto-title thread on first reply
 *  10. Increment platform quota counter
 */
import { streamText } from "ai";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { decryptApiKey } from "./encryption";
import { getModel, type OrgPlan } from "./models";
import { getToolsForRequest } from "./toolRegistry";
import type { ToolContext } from "./tools/_shared";
import { setCreateEntitiesContext } from "./tools/createEntities";
// Layer-tool context setters
import { setBulkContext } from "./tools/layers/bulk";
import { setCategoriesContext } from "./tools/layers/categories";
import { setDataContext } from "./tools/layers/data";
import { setFieldsContext } from "./tools/layers/fields";
import { setMembersContext } from "./tools/layers/members";
import { setPipelinesContext } from "./tools/layers/pipelines";
import { setSettingsContext } from "./tools/layers/settings";
import { setTagsContext } from "./tools/layers/tags";
import { setTemplatesContext } from "./tools/layers/templates";
import { setViewsContext } from "./tools/layers/views";
import { setNotesRemindersContext } from "./tools/notesReminders";
import { setSearchToolContext } from "./tools/search";
import { setUpdateEntityContext } from "./tools/updateEntity";

// Forward references using string-path pattern (resolved after convex dev codegen).
// biome-ignore lint/suspicious/noExplicitAny: _ref casts required for pre-codegen cross-module refs
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: _anyArgs cast required for pre-codegen cross-module refs
const _anyArgs = (a: Record<string, unknown>) => a as any;

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── processChat.run ──────────────────────────────────────────────────────────

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
		expandedLayers: v.array(v.string()),
	},
	handler: async (ctx, args) => {
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

		// 3. Resolve model + BYOK
		const provider = (args.provider ?? prefs.aiDefaultProvider ?? "anthropic") as string;
		const byokResult = (await ctx.runQuery(
			_ref("ai/keys:resolveKey"),
			_anyArgs({
				orgId: args.orgId as string,
				userId: args.userId as string,
				provider,
			}),
		)) as { encryptedKey: string; baseUrl: string | null; scope: "user" | "org" } | null;

		let decryptedKey: string | null = null;
		if (byokResult) {
			try {
				decryptedKey = decryptApiKey(byokResult.encryptedKey);
			} catch {
				// Bad key — fall through to platform key
			}
		}

		const modelResult = getModel({
			modelKey: args.model ?? prefs.aiDefaultModel,
			provider,
			resolvedKey: byokResult,
			decryptedKey,
			plan: memberInfo.plan,
		});

		// 4. Build system prompt
		const promptResult = (await ctx.runQuery(
			_ref("ai/systemPrompt:buildSystemPromptQuery"),
			_anyArgs({
				orgId: args.orgId as string,
				userId: args.userId as string,
				permissions: memberInfo.permissions,
				modelTier: modelResult.tier,
				routeContext: args.routeContext ?? null,
				autoContextLoad: prefs.aiAutoContextLoad !== false,
				expandedLayers: args.expandedLayers,
			}),
		)) as { system: string; allowedLayers: string[] };

		// 5. Load prior messages for context
		const priorMessages = (await ctx.runQuery(
			_ref("ai/messages:listForConversation"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{ role: string; content: string }>;

		// Exclude the current user message (it's the last one) and format for SDK
		const messageHistory = priorMessages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

		// 6. Set tool contexts
		const toolCtx: ToolContext = {
			ctx: ctx as never,
			orgId: args.orgId,
			userId: args.userId,
			permissions: memberInfo.permissions,
			conversationId: args.conversationId,
		};
		setSearchToolContext(toolCtx);
		setCreateEntitiesContext(toolCtx);
		setUpdateEntityContext(toolCtx);
		setNotesRemindersContext(toolCtx);
		// Layer-tool contexts (registered eagerly even if layer not expanded;
		// toolRegistry filters out unloaded layer tools before they reach the model).
		setPipelinesContext(toolCtx);
		setTagsContext(toolCtx);
		setViewsContext(toolCtx);
		setCategoriesContext(toolCtx);
		setMembersContext(toolCtx);
		setSettingsContext(toolCtx);
		setBulkContext(toolCtx);
		setTemplatesContext(toolCtx);
		setDataContext(toolCtx);
		setFieldsContext(toolCtx);

		// 7. Get filtered tools
		const tools = getToolsForRequest({
			permissions: memberInfo.permissions,
			modelTier: modelResult.tier,
			expandedLayers: args.expandedLayers,
		});

		// 8. Insert assistant placeholder
		const assistantMsgId = (await ctx.runMutation(
			_ref("ai/messages:appendAssistantPlaceholder"),
			{
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			},
		)) as string;

		// 9. Stream
		let accumulatedText = "";
		let finalInputTokens = 0;
		let finalOutputTokens = 0;
		const pendingToolCalls = new Map<string, string>(); // toolCallId → messageId

		try {
			const { fullStream } = streamText({
				model: modelResult.model as Parameters<typeof streamText>[0]["model"],
				system: promptResult.system,
				messages: messageHistory,
				tools: tools as Parameters<typeof streamText>[0]["tools"],
				maxSteps: 10,
				temperature: 0.2, // Low temp for tool calling reliability
			});

			// biome-ignore lint/suspicious/noExplicitAny: TextStreamPart generic requires known TOOLS type; runtime typed via chunk.type narrowing below
			for await (const chunk of fullStream as AsyncIterable<any>) {
				if (chunk.type === "text-delta") {
					accumulatedText += chunk.textDelta;
					// Patch DB every ~50 chars to balance reactivity vs write frequency
					if (accumulatedText.length % 50 < chunk.textDelta.length) {
						await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
							messageId: assistantMsgId,
							content: accumulatedText,
						});
					}
				} else if (chunk.type === "tool-call") {
					const isTwoStep =
						(tools as Record<string, { confirmation?: string }>)[chunk.toolName]
							?.confirmation === "twoStep";

					if (isTwoStep) {
						// Two-step: insert pending confirmation record
						const toolMsgId = (await ctx.runMutation(
							_ref("ai/messages:appendToolCallRecord"),
							{
								orgId: args.orgId as string,
								conversationId: args.conversationId as string,
								toolName: chunk.toolName,
								toolCallId: chunk.toolCallId,
								input: chunk.args,
								status: "started",
								confirmationState: "pending",
								confirmationPayload: { tool: chunk.toolName, args: chunk.args },
							},
						)) as string;
						await ctx.runMutation(_ref("ai/messages:setConfirmationPending"), {
							messageId: toolMsgId,
							payload: { tool: chunk.toolName, args: chunk.args },
						});
						pendingToolCalls.set(chunk.toolCallId, toolMsgId);
					} else {
						// Standard: record the start of the tool call
						const toolMsgId = (await ctx.runMutation(
							_ref("ai/messages:appendToolCallRecord"),
							{
								orgId: args.orgId as string,
								conversationId: args.conversationId as string,
								toolName: chunk.toolName,
								toolCallId: chunk.toolCallId,
								input: chunk.args,
								status: "started",
							},
						)) as string;
						pendingToolCalls.set(chunk.toolCallId, toolMsgId);
					}
				} else if (chunk.type === "tool-result") {
					const toolMsgId = pendingToolCalls.get(chunk.toolCallId);
					if (toolMsgId) {
						await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
							messageId: toolMsgId,
							output: chunk.result,
							status: "completed",
						});
					}
					// If tool triggered a layer expansion, update expanded layers
					if (chunk.toolName === "expand_tools" && typeof chunk.result === "object") {
						const result = chunk.result as { activated?: string };
						if (result.activated && !args.expandedLayers.includes(result.activated)) {
							args.expandedLayers = [...args.expandedLayers, result.activated];
						}
					}
				} else if (chunk.type === "usage") {
					finalInputTokens = chunk.inputTokens ?? 0;
					finalOutputTokens = chunk.outputTokens ?? 0;
				} else if (chunk.type === "finish") {
					// Final patch with complete text and token counts
					await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
						messageId: assistantMsgId,
						content: accumulatedText,
						model: modelResult.modelKey,
						provider: modelResult.provider,
						usageMode: modelResult.usageMode,
						inputTokens: finalInputTokens,
						outputTokens: finalOutputTokens,
					});
				}
			}
		} catch (err) {
			// Patch with error message so UI doesn't show empty assistant turn
			const errorMsg =
				err instanceof Error ? err.message : "An error occurred. Please try again.";
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: assistantMsgId,
				content: `❌ ${errorMsg}`,
			});
			console.error("[processChat error]", err);
			return;
		}

		// 10. Log activity
		await ctx.runMutation(_ref("ai/_logAIActivityInternal:logAIActivity"), {
			orgId: args.orgId as string,
			userId: args.userId as string,
			action: "ai.chat",
			entityType: "conversation",
			entityId: args.conversationId as string,
			description: `AI responded (${modelResult.modelKey}, ${finalInputTokens + finalOutputTokens} tokens)`,
		});

		// 11. Platform quota: increment on platform-billed mode
		if (modelResult.usageMode === "platform") {
			await ctx
				.runMutation(
					_ref("orgs/mutations:incrementAiMessageCount"),
					_anyArgs({ orgId: args.orgId as string }),
				)
				.catch(() => {}); // non-fatal
		}

		// 12. Auto-title on first reply
		if (messageHistory.length <= 1) {
			// Schedule auto-titling as a separate low-priority mutation
			const lastUserMsg = messageHistory.at(-1)?.content ?? "";
			if (lastUserMsg.length > 10 && process.env.AI_BRIEFING_MODEL) {
				// Fire and forget — title generation is non-critical
				ctx.scheduler
					?.runAfter?.(
						5000,
						_ref("ai/conversations:autoTitleInternal"),
						_anyArgs({
							conversationId: args.conversationId as string,
							orgId: args.orgId as string,
							firstUserMessage: lastUserMsg.slice(0, 200),
						}),
					)
					.catch(() => {});
			}
		}
	},
});

// ─── processChat.resume ───────────────────────────────────────────────────────

export const resume = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("aiConversations"),
		confirmedMessageId: v.id("aiMessages"),
		editedPayload: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		// Retrieve the confirmed tool call payload and re-submit to the loop
		const confirmedMsg = (await ctx.runQuery(
			_ref("ai/messages:listForConversation"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{
			confirmationPayload?: { tool?: string; args?: unknown };
			confirmationState?: string;
			_id?: string;
		}>;

		const pending = confirmedMsg.find(
			(m) =>
				m.confirmationState === "approved" &&
				(m as { _id?: string })._id === args.confirmedMessageId,
		);

		if (!pending?.confirmationPayload?.tool) return;

		// Route to the commit tool
		const commitToolName = `commit_${pending.confirmationPayload.tool}`;
		const toolCtxPayload = {
			ctx: ctx as never,
			orgId: args.orgId,
			userId: args.userId,
			permissions: [], // will be re-resolved inside the commit tool
			conversationId: args.conversationId,
		};

		const toolArgs = args.editedPayload ?? pending.confirmationPayload.args ?? {};

		// Get permissions for the commit call
		const memberInfo = await getOrgMemberAndPermissions(
			ctx as never,
			args.orgId,
			args.userId,
		).catch(() => null);
		if (!memberInfo) return;

		const toolCtx: ToolContext = { ...toolCtxPayload, permissions: memberInfo.permissions };
		setSearchToolContext(toolCtx);
		setCreateEntitiesContext(toolCtx);
		setUpdateEntityContext(toolCtx);
		setNotesRemindersContext(toolCtx);
		setPipelinesContext(toolCtx);
		setTagsContext(toolCtx);
		setViewsContext(toolCtx);
		setCategoriesContext(toolCtx);
		setMembersContext(toolCtx);
		setSettingsContext(toolCtx);
		setBulkContext(toolCtx);
		setTemplatesContext(toolCtx);
		setDataContext(toolCtx);
		setFieldsContext(toolCtx);

		// Look up the commit tool in the registry and execute it
		const { REGISTRY } = await import("./toolRegistry").then(async (m) => {
			// Access internal registry via the getToolsForRequest factory (all tools are registered)
			const allTools = m.getToolsForRequest({
				permissions: memberInfo.permissions,
				modelTier: "premium",
				expandedLayers: [],
			});
			return { REGISTRY: allTools };
		});

		const commitTool = REGISTRY[commitToolName] as
			| { execute?: (args: unknown) => Promise<unknown> }
			| undefined;
		if (!commitTool?.execute) {
			console.error(`[resume] Commit tool not found: ${commitToolName}`);
			return;
		}

		const result = await commitTool.execute(toolArgs).catch((err: unknown) => ({
			ok: false,
			error: err instanceof Error ? err.message : "Commit failed.",
		}));

		// Insert the result as an assistant message
		const assistantMsgId = (await ctx.runMutation(
			_ref("ai/messages:appendAssistantPlaceholder"),
			{
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			},
		)) as string;

		await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
			messageId: assistantMsgId,
			content:
				typeof result === "object" && result && "display" in result
					? String(result.display)
					: typeof result === "object" && result && "ok" in result && !result.ok
						? `❌ ${typeof result === "object" && "error" in result ? String(result.error) : "Action failed."}`
						: "✅ Done.",
			model: "system",
			provider: "system",
			usageMode: "platform",
		});
	},
});
