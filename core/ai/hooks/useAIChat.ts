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

export function useAIChat(args: {
	conversationId: Id<"aiConversations"> | null;
	routeContext: RouteEntityContext | null;
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
	const createConversation = useMutation(anyApi.ai.conversations.create);
	const renameConversation = useMutation(anyApi.ai.conversations.rename);
	const archiveConversation = useMutation(anyApi.ai.conversations.archive);

	const isStreaming = useMemo(() => {
		const last = (messages as Array<{ role: string; content: string }> | undefined)?.at(-1);
		return last?.role === "assistant" && last.content === "";
	}, [messages]);

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
		pendingConfirmation,
		send,
		confirmConfirmation,
		createConversation,
		renameConversation,
		archiveConversation,
		orgId,
	};
}
