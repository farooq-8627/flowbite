"use client";
/**
 * core/ai/hooks/useAIChat.ts
 */
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import type { RouteEntityContext } from "../types";

/**
 * Phase 4 Part 1 P1.13 — broad page-mode context. Always present on
 * frontend-initiated turns; used by the backend system prompt's
 * `## Current page` block. See `useChatRouteContext`.
 */
export type ChatPageContext = {
	mode: "entity" | "list" | "dashboard" | "calendar" | "settings" | "reports" | "other";
	path: string;
	label?: string;
};

/**
 * Week 3.4 — AI SDK v6 cookbook helper
 * (`lastAssistantMessageIsCompleteWithApprovalResponses`). Mirrors the
 * SDK's frontend helper so component code reads identically to the
 * cookbook. Returns `true` when:
 *   - There is no assistant turn yet, OR
 *   - The last assistant turn has finished streaming AND
 *   - No tool message in that turn is still `confirmationState: "pending"`.
 *
 * The composer should only be enabled when this is true.
 */
function isLastAssistantTurnComplete(
	messages: Array<{
		role: string;
		thinkingState?: string;
		confirmationState?: string;
	}>,
): boolean {
	if (messages.length === 0) return true;
	const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
	if (!lastAssistant) return true;
	const ts = lastAssistant.thinkingState;
	if (ts !== "done" && ts !== "error") return false;
	const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
	const tail = lastUserIdx === -1 ? messages : messages.slice(lastUserIdx + 1);
	const stillPending = tail.some((m) => m.role === "tool" && m.confirmationState === "pending");
	return !stillPending;
}

export function useAIChat(args: {
	conversationId: Id<"aiConversations"> | null;
	routeContext: RouteEntityContext | null;
	pageContext: ChatPageContext | null;
	autoContextLoad: boolean;
}) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;

	const messages = useQuery(
		anyApi.ai.messages.listForConversation,
		orgId && args.conversationId ? { orgId, conversationId: args.conversationId } : "skip",
	);

	const conversations = useQuery(anyApi.ai.conversations.list, orgId ? { orgId } : "skip");

	const sendMessage = useMutation(anyApi.ai.messages.sendMessage);
	const confirmConfirmation = useMutation(anyApi.ai.messages.confirmConfirmation);
	// Week 3.4 — alias matching AI SDK v6 cookbook surface. Frontend code
	// should prefer this over `confirmConfirmation` going forward; the
	// legacy mutation stays for the existing ChatConfirmation component.
	const addToolApprovalResponse = useMutation(anyApi.ai.messages.addToolApprovalResponse);
	const createConversation = useMutation(anyApi.ai.conversations.create);
	const renameConversation = useMutation(anyApi.ai.conversations.rename);
	const archiveConversation = useMutation(anyApi.ai.conversations.archive);

	const isStreaming = useMemo(() => {
		const last = (messages as Array<{ role: string; thinkingState?: string }> | undefined)?.at(
			-1,
		);
		if (!last || last.role !== "assistant") return false;
		const ts = last.thinkingState;
		// Anything other than `done` / `error` means the request is still in
		// flight (a live thinkingState) OR the field is undefined on a freshly
		// inserted placeholder — in either case the composer should stay
		// disabled until the orchestrator settles the message.
		return ts !== "done" && ts !== "error";
	}, [messages]);

	// Week 3.4 — true when the last assistant turn is settled and no tool
	// approval is outstanding. The composer should disable input whenever
	// this is false.
	const isAwaitingApprovalOrStreaming = useMemo(
		() =>
			!isLastAssistantTurnComplete(
				(messages as Array<{
					role: string;
					thinkingState?: string;
					confirmationState?: string;
				}>) ?? [],
			),
		[messages],
	);

	const pendingConfirmation = useMemo(
		() =>
			(messages as Array<{ confirmationState?: string }> | undefined)?.find(
				(m) => m.confirmationState === "pending",
			) ?? null,
		[messages],
	);

	async function send(
		body: string,
		model?: string,
		provider?: string,
		expandedLayers?: string[],
	) {
		if (!orgId) return;
		const routeCtx = args.autoContextLoad && args.routeContext ? args.routeContext : undefined;
		return sendMessage({
			orgId,
			conversationId: args.conversationId ?? undefined,
			body,
			model,
			provider,
			routeContext: routeCtx
				? {
						entityType: routeCtx.entityType,
						entityId: routeCtx.entityId,
						personCode: routeCtx.personCode,
						dealCode: routeCtx.dealCode,
						name: routeCtx.name,
						aiContextSummary: routeCtx.aiContextSummary,
						aiContextKeyFacts: routeCtx.aiContextKeyFacts,
					}
				: undefined,
			pageContext: args.pageContext ?? undefined,
			expandedLayers: expandedLayers ?? [],
		});
	}

	return {
		messages: (messages ?? []) as Array<
			import("@/convex/_generated/dataModel").Doc<"aiMessages">
		>,
		conversations: (conversations ?? []) as Array<
			import("@/convex/_generated/dataModel").Doc<"aiConversations">
		>,
		isStreaming,
		isAwaitingApprovalOrStreaming,
		pendingConfirmation,
		send,
		confirmConfirmation,
		addToolApprovalResponse,
		createConversation,
		renameConversation,
		archiveConversation,
		orgId,
	};
}
