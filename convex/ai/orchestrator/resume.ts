"use node";
/**
 * convex/ai/orchestrator/resume.ts
 *
 * `processChat.resume` — runs after the user approves a two-step
 * confirmation card (or picks a `ask_user_choice` option, or fills in
 * an `ask_user_input` form). Re-invokes the matching commit_* tool with
 * the approved payload OR re-runs the agent loop with a synthesised user
 * message for ask_user_choice / ask_user_input flows.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { OrgPlan } from "../modelRegistry";
import type { ToolContext } from "../tools/_shared";
import { bindAllToolContexts } from "./toolContextBinder";

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
} | null> {
	const result = (await ctx.runQuery("orgs/queries:getMemberWithPermissions", {
		orgId,
		userId,
	})) as {
		permissions: string[];
		plan: OrgPlan;
		settings: Record<string, unknown>;
		aiMessagesUsed: number;
	} | null;
	return result;
}

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
			_ref("ai/messages:listForConversationInternal"),
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

		// ─── Special branch: ask_user_choice ─────────────────────────────────
		// When the user picks an option, we synthesise a user message and
		// re-run the agent loop with the chosen value injected. There's no
		// `commit_ask_user_choice` tool — disambiguation is purely conversational.
		if (pending.confirmationPayload.tool === "ask_user_choice") {
			const editedArgs = (args.editedPayload ?? {}) as { value?: string };
			const originalArgs = (pending.confirmationPayload.args ?? {}) as {
				options?: Array<{ value: string; label: string; hint?: string }>;
			};
			const chosenValue = editedArgs.value;
			if (!chosenValue) {
				console.warn("[resume] ask_user_choice without a value");
				return;
			}
			const matched = (originalArgs.options ?? []).find((o) => o.value === chosenValue);
			const label = matched?.label ?? chosenValue;
			await ctx.runMutation(_ref("ai/messages:appendUserMessage"), {
				orgId: args.orgId,
				conversationId: args.conversationId,
				body: `User picked: ${label} (${chosenValue}). Continue with the original task.`,
			});
			await ctx.runAction(_ref("ai/processChat:run"), {
				orgId: args.orgId,
				userId: args.userId,
				conversationId: args.conversationId,
				userMessageId: args.confirmedMessageId,
				expandedLayers: [],
			});
			return;
		}

		// ─── Special branch: ask_user_input ──────────────────────────────────
		if (pending.confirmationPayload.tool === "ask_user_input") {
			const editedArgs = (args.editedPayload ?? {}) as {
				values?: Record<string, string | number>;
			};
			const values = editedArgs.values ?? {};
			const entries = Object.entries(values).filter(
				([, val]) => val !== undefined && val !== null && String(val).length > 0,
			);
			if (entries.length === 0) {
				console.warn("[resume] ask_user_input without any values");
				return;
			}
			const summary = entries.map(([k, val]) => `${k}=${String(val)}`).join(", ");
			await ctx.runMutation(_ref("ai/messages:appendUserMessage"), {
				orgId: args.orgId,
				conversationId: args.conversationId,
				body: `User provided: ${summary}. Continue with the original task using these values.`,
			});
			await ctx.runAction(_ref("ai/processChat:run"), {
				orgId: args.orgId,
				userId: args.userId,
				conversationId: args.conversationId,
				userMessageId: args.confirmedMessageId,
				expandedLayers: [],
			});
			return;
		}

		// ─── Standard commit_* path ──────────────────────────────────────────
		const commitToolName = `commit_${pending.confirmationPayload.tool}`;

		// Get permissions for the commit call
		const memberInfo = await getOrgMemberAndPermissions(
			ctx as never,
			args.orgId,
			args.userId,
		).catch(() => null);
		if (!memberInfo) return;

		const toolCtx: ToolContext = {
			ctx: ctx as never,
			orgId: args.orgId,
			userId: args.userId,
			permissions: memberInfo.permissions,
			conversationId: args.conversationId,
		};
		bindAllToolContexts(toolCtx);

		const toolArgs = args.editedPayload ?? pending.confirmationPayload.args ?? {};

		// Look up the commit tool in the registry and execute it
		const { getToolsForRequest } = await import("../toolRegistry");
		const allTools = getToolsForRequest({
			permissions: memberInfo.permissions,
			modelTier: "premium",
			expandedLayers: [],
		});

		const commitTool = allTools[commitToolName] as
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
					? typeof (result as { display: unknown }).display === "string"
						? String((result as { display: string }).display)
						: "✅ Done."
					: typeof result === "object" && result && "ok" in result && !result.ok
						? `❌ ${typeof result === "object" && "error" in result ? String(result.error) : "Action failed."}`
						: "✅ Done.",
			model: "system",
			provider: "system",
			usageMode: "platform",
			thinkingState:
				typeof result === "object" && result && "ok" in result && !result.ok
					? "error"
					: "done",
		});
	},
});
