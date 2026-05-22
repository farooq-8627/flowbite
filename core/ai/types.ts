/**
 * core/ai/types.ts
 *
 * Shared frontend types for the AI chat module.
 */
import type { Doc } from "@/convex/_generated/dataModel";

export type AIConversation = Doc<"aiConversations">;
export type AIMessage = Doc<"aiMessages">;

/** Tool call display model — extracted from aiMessages.toolCalls */
export type ToolCallDisplay = {
	id: string;
	name: string;
	input: unknown;
	output?: unknown;
	status: "started" | "completed" | "failed";
};

/** Confirmation state for two-step tool gate */
export type ConfirmationState = "pending" | "approved" | "rejected";

/** Route context: the entity the user is currently viewing */
export type RouteEntityContext = {
	entityType: "lead" | "contact" | "deal" | "company";
	entityId: string;
	personCode?: string;
	dealCode?: string;
	name?: string;
	aiContextSummary?: string;
	aiContextKeyFacts?: string[];
};
