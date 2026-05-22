/**
 * Schema — AI domain (Phase 3B).
 *
 * Tables: aiConversations, aiMessages, orgAiKeys, aiBriefings.
 *
 * Phase 3B adds: BYOK key storage, morning briefings cache,
 * extended conversation + message fields (model, provider, confirmation state).
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgScoped, timestamps } from "../_shared/validators";

export const aiConversations = defineTable({
	...orgScoped,
	userId: v.id("users"),
	title: v.optional(v.string()),
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	personCode: v.optional(v.string()),
	status: v.string(), // "active" | "archived" | "deleted"
	// Phase 3B extensions
	defaultModel: v.optional(v.string()),   // e.g. "claude-sonnet-4-5" — sticky per thread
	defaultProvider: v.optional(v.string()), // "anthropic" | "openai" | ...
	lastMessageAt: v.optional(v.number()),   // updated on each new message for history sort
	routeContextPath: v.optional(v.string()), // "/profile/P-001" — recorded at create time
	routeEntityType: v.optional(v.string()),
	routeEntityId: v.optional(v.string()),
	pinnedEntityCode: v.optional(v.string()), // personCode/dealCode shown in context card
	...timestamps,
})
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_org_and_entity", ["orgId", "entityType", "entityId"])
	.index("by_org_and_user_and_lastMessage", ["orgId", "userId", "lastMessageAt"]);

export const aiMessages = defineTable({
	...orgScoped,
	conversationId: v.id("aiConversations"),
	role: v.union(
		v.literal("user"),
		v.literal("assistant"),
		v.literal("system"),
		v.literal("tool"),
	),
	content: v.string(),
	toolCalls: v.optional(v.any()),
	tokenCount: v.optional(v.number()),
	// Phase 3B extensions
	model: v.optional(v.string()),             // "claude-sonnet-4-5" — which model produced this
	provider: v.optional(v.string()),           // "anthropic"
	usageMode: v.optional(v.union(             // "platform" = our key, "byok" = user's key
		v.literal("platform"),
		v.literal("byok"),
	)),
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	expandedLayers: v.optional(v.array(v.string())), // e.g. ["pipelines","tags"]
	confirmationState: v.optional(v.union(     // two-step gate state
		v.literal("pending"),
		v.literal("approved"),
		v.literal("rejected"),
	)),
	confirmationPayload: v.optional(v.any()),  // preview JSON shown to user before commit
	createdAt: v.number(),
})
	.index("by_conversation", ["conversationId", "createdAt"])
	.index("by_org_and_conversation", ["orgId", "conversationId"]);

/**
 * BYOK (Bring Your Own Key) — one row per key per (org or user).
 * The encryptedKey field is NEVER returned to the client (stripped in queries).
 * Decryption happens only inside processChat (internalAction, "use node").
 */
export const orgAiKeys = defineTable({
	orgId: v.id("orgs"),
	scope: v.union(v.literal("org"), v.literal("user")),
	userId: v.optional(v.id("users")),   // required when scope === "user"
	provider: v.union(
		v.literal("anthropic"),
		v.literal("openai"),
		v.literal("google"),
		v.literal("xai"),
		v.literal("groq"),
		v.literal("mistral"),
		v.literal("openrouter"),
		v.literal("nvidia"),             // OpenAI-compat endpoint
		v.literal("moonshot"),           // Moonshot AI / Kimi (OpenAI-compat)
		v.literal("custom"),             // self-hosted / other
	),
	encryptedKey: v.string(),            // AES-GCM encrypted, base64. NEVER returned to client.
	keyHint: v.string(),                 // last 4 chars for UI display: "sk-...4f8a"
	baseUrl: v.optional(v.string()),     // for "custom", "nvidia", OpenRouter endpoint override
	defaultModel: v.optional(v.string()), // user's preferred model for this key
	isActive: v.boolean(),
	lastUsedAt: v.optional(v.number()),
	name: v.optional(v.string()),        // user-supplied nickname
	createdBy: v.id("users"),
	...timestamps,
})
	.index("by_org_and_scope", ["orgId", "scope", "userId"])
	.index("by_org_and_provider", ["orgId", "provider"]);

/**
 * AI Morning Briefing cache — generated daily by cron (or on-demand via manual trigger).
 * One row per user per day. Stale rows expire after 24h.
 */
export const aiBriefings = defineTable({
	orgId: v.id("orgs"),
	userId: v.id("users"),
	generatedAt: v.number(),
	expiresAt: v.number(),               // generatedAt + 24h
	summary: v.string(),                 // briefing markdown body
	highlights: v.optional(v.array(v.object({
		type: v.string(),                // "stale_deal" | "due_today" | "milestone" | "overdue"
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		entityCode: v.optional(v.string()),
		text: v.string(),
	}))),
	model: v.string(),                   // "anthropic:claude-haiku-3-5"
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	trigger: v.union(v.literal("cron"), v.literal("manual")),
	...timestamps,
})
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_org_and_user_and_generated", ["orgId", "userId", "generatedAt"])
	.index("by_expires", ["expiresAt"]);
