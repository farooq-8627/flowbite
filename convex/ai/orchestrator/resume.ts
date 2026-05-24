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

		const rawToolArgs = args.editedPayload ?? pending.confirmationPayload.args ?? {};

		// Look up the commit tool in the registry and execute it
		const { getToolsForRequest, getRegisteredTool } = await import("../toolRegistry");
		const { friendlyToolError } = await import("./friendlyToolError");
		// Architecture fix (2026-05-24) — match `run.ts` which exposes every
		// layer the user has permission for at turn start. `commit_*` tools
		// live in the same layer as their `propose_*` siblings, so we MUST
		// expand all of them here or the resume can't find the commit tool.
		const allLayers = [
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
		const allTools = getToolsForRequest({
			permissions: memberInfo.permissions,
			modelTier: "premium",
			expandedLayers: allLayers,
		});

		const commitTool = allTools[commitToolName] as
			| { execute?: (args: unknown) => Promise<unknown> }
			| undefined;
		if (!commitTool?.execute) {
			console.error(`[resume] Commit tool not found: ${commitToolName}`);
			// Surface a friendly error to the user instead of a silent failure.
			const failMsgId = (await ctx.runMutation(
				_ref("ai/messages:appendAssistantPlaceholder"),
				{ orgId: args.orgId as string, conversationId: args.conversationId as string },
			)) as string;
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: failMsgId,
				content: `❌ Couldn't apply your approval — the commit handler \`${commitToolName}\` isn't registered.`,
				thinkingState: "error",
			});
			return;
		}

		// Defensive — the persisted payload should be the original model
		// args, but we've seen field shapes get clipped on a partial write.
		// Bail with a friendly message instead of letting a TypeError
		// crash the whole resume action.
		if (!rawToolArgs || typeof rawToolArgs !== "object") {
			console.error(`[resume] ${commitToolName}: missing args payload`);
			const failMsgId = (await ctx.runMutation(
				_ref("ai/messages:appendAssistantPlaceholder"),
				{ orgId: args.orgId as string, conversationId: args.conversationId as string },
			)) as string;
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: failMsgId,
				content: `❌ Couldn't apply your approval — the original arguments aren't available. Please ask again.`,
				thinkingState: "error",
			});
			return;
		}

		// Bug fix 2026-05-24 — `resume` calls `commitTool.execute()` directly,
		// bypassing the AI SDK's input validator. Without an explicit zod
		// strip here, propose-only fields (e.g. `create_lead.notes`) are
		// forwarded to the commit's underlying mutation, which throws an
		// `ArgumentValidationError` because its validator doesn't declare
		// the field. The user then sees the dreaded "An unexpected error
		// occurred. Please try again." Re-parsing through the commit's
		// own zod schema strips extras and applies defaults.
		//
		// Hardening 2026-05-24 (round 2): if the zod parse fails because
		// REQUIRED fields are missing (e.g. update_org_settings persisted
		// without `patch`), forwarding the raw args used to crash the
		// commit's execute() with cryptic "Cannot convert undefined or
		// null to object". Now we return a friendly error and stop.
		const commitDef = getRegisteredTool(commitToolName);
		let toolArgs: unknown = rawToolArgs;
		if (commitDef?.schema) {
			const parsed = commitDef.schema.safeParse(rawToolArgs);
			if (parsed.success) {
				toolArgs = parsed.data;
			} else {
				console.warn(`[resume] ${commitToolName}: zod parse failed`, parsed.error.issues);
				const issueSummary = parsed.error.issues
					.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
					.join("; ");
				const friendly = friendlyToolError(
					{
						ok: false,
						error: `Approved payload for ${commitToolName} is malformed. ${issueSummary}`,
						code: "MALFORMED_PAYLOAD",
					},
					commitToolName,
				);
				await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
					messageId: args.confirmedMessageId,
					output: {
						ok: false,
						error: friendly.short,
						code: friendly.code,
						friendlyMarkdown: friendly.markdown,
						friendlyError: {
							code: friendly.code,
							short: friendly.short,
							summary: friendly.summary,
							details: friendly.details,
							manualSteps: friendly.manualSteps,
							recoveryActions: friendly.recoveryActions,
						},
						rawError: issueSummary,
					},
					status: "failed",
				});
				const failMsgId = (await ctx.runMutation(
					_ref("ai/messages:appendAssistantPlaceholder"),
					{ orgId: args.orgId as string, conversationId: args.conversationId as string },
				)) as string;
				await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
					messageId: failMsgId,
					content: `❌ ${friendly.markdown}`,
					thinkingState: "error",
				});
				return;
			}
		}

		const result = await commitTool.execute(toolArgs).catch((err: unknown) => ({
			ok: false,
			error: err instanceof Error ? err.message : "Commit failed.",
		}));

		const isError = typeof result === "object" && result && "ok" in result && !result.ok;

		// Patch the original propose tool record's status — without this
		// the timeline row stays as a loading spinner forever (because
		// no `tool-result` chunk ever fires in the resume path).
		if (isError) {
			// Phase 4 Part 1 P1.11 — also surface the multi-tier envelope
			// to the chat renderer so the timeline row can show the
			// summary always-visible plus collapsibles for details +
			// manual steps + recovery chips.
			const friendly = friendlyToolError(result, commitToolName);
			await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
				messageId: args.confirmedMessageId,
				output: {
					ok: false,
					error: friendly.short,
					code: friendly.code,
					friendlyMarkdown: friendly.markdown,
					friendlyError: {
						code: friendly.code,
						short: friendly.short,
						summary: friendly.summary,
						details: friendly.details,
						manualSteps: friendly.manualSteps,
						recoveryActions: friendly.recoveryActions,
					},
					rawError: (result as { error?: string }).error ?? "Commit failed.",
				},
				status: "failed",
			});
		} else {
			await ctx.runMutation(_ref("ai/messages:patchToolCallRecord"), {
				messageId: args.confirmedMessageId,
				output: result,
				status: "completed",
			});
		}

		// Build the body that gets appended to the assistant turn. On
		// success we keep the existing pithy "✅ Done." (the live entity
		// card already renders below the message). On failure we use the
		// friendly mapper so the user sees something actionable instead
		// of a generic "An unexpected error occurred."
		let resultBody: string;
		if (isError) {
			const friendly = friendlyToolError(result, commitToolName);
			resultBody = `❌ ${friendly.markdown}`;
		} else if (
			typeof result === "object" &&
			result &&
			"display" in result &&
			typeof (result as { display: unknown }).display === "string"
		) {
			resultBody = String((result as { display: string }).display);
		} else {
			resultBody = "✅ Done.";
		}

		// Day 1 T1.3 (`PHASE-3-AI-AUDIT.md §6.5 E.T1.3`) — single-turn HITL.
		// Reuse the assistant message that originally hosted the approval
		// card instead of inserting a new placeholder. Visually keeps
		// "one ask = one bubble"; resume becomes a body patch, not a new
		// turn. The list returned by listForConversationInternal is
		// chronological (asc), so the last assistant row is the one we
		// want.
		const allMessages = (await ctx.runQuery(
			_ref("ai/messages:listForConversationInternal"),
			_anyArgs({
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			}),
		)) as Array<{ _id: string; role: string; content?: string; thinkingState?: string }>;
		const targetAssistant = [...allMessages].reverse().find((m) => m.role === "assistant");

		if (targetAssistant) {
			// Append to the existing assistant body. Use a short separator
			// so the user can visually distinguish the original turn from
			// the commit confirmation.
			const previousContent = targetAssistant.content ?? "";
			const merged =
				previousContent.trim().length > 0
					? `${previousContent}\n\n${resultBody}`
					: resultBody;
			await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
				messageId: targetAssistant._id,
				content: merged,
				thinkingState: isError ? "error" : "done",
			});
			return;
		}

		// Defensive fallback — no assistant message exists somehow. Insert
		// a fresh one so the user still sees the result.
		const assistantMsgId = (await ctx.runMutation(
			_ref("ai/messages:appendAssistantPlaceholder"),
			{
				orgId: args.orgId as string,
				conversationId: args.conversationId as string,
			},
		)) as string;
		await ctx.runMutation(_ref("ai/messages:patchAssistantBody"), {
			messageId: assistantMsgId,
			content: resultBody,
			model: "system",
			provider: "system",
			usageMode: "platform",
			thinkingState: isError ? "error" : "done",
		});
	},
});
