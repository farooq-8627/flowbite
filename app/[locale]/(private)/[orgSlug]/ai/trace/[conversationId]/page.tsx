import type { Id } from "@/convex/_generated/dataModel";
import { AIToolTraceView } from "@/core/ai/views/AIToolTraceView";

/**
 * Stage 7 (SPRINT-PLAN.md T-1) — full-screen AI tool trace.
 *
 * URL: `/{locale}/{orgSlug}/ai/trace/{conversationId}`. Renders the
 * chronological list of tool calls (name, status, duration, error
 * reason, cost) for a single conversation. RBAC enforced server-side
 * by `convex/ai/queries/toolTrace:getToolTraceForConversation`.
 */
export default async function AIToolTracePage({
	params,
}: {
	params: Promise<{ orgSlug: string; conversationId: string }>;
}) {
	const { conversationId } = await params;
	return <AIToolTraceView conversationId={conversationId as Id<"aiConversations">} />;
}
