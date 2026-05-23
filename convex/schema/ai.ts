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
	defaultModel: v.optional(v.string()), // e.g. "claude-sonnet-4-5" — sticky per thread
	defaultProvider: v.optional(v.string()), // "anthropic" | "openai" | ...
	lastMessageAt: v.optional(v.number()), // updated on each new message for history sort
	routeContextPath: v.optional(v.string()), // "/profile/P-001" — recorded at create time
	routeEntityType: v.optional(v.string()),
	routeEntityId: v.optional(v.string()),
	pinnedEntityCode: v.optional(v.string()), // personCode/dealCode shown in context card
	/**
	 * Week 3.1 — typed conversational state ("Salesforce L4 variables",
	 * `PHASE-3-AI-AUDIT.md §6 Week 3`). The agent writes facts the user
	 * supplied during the thread (e.g. `email = "sarah@x.com"`) via the
	 * synthetic `set_context_var` tool; the system-prompt builder injects
	 * the bag as a "Facts already known" section so the model doesn't
	 * re-ask. Optional + `record(string, any)` so any key/value shape
	 * fits without a schema rev for new tools.
	 *
	 * Capped at ~4KB by the writer (`set_context_var` tool). Keys are
	 * snake_case identifiers; values are JSON-serialisable primitives or
	 * small objects (no Convex IDs — those belong in real tables).
	 */
	contextBag: v.optional(v.record(v.string(), v.any())),
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
	model: v.optional(v.string()), // "claude-sonnet-4-5" — which model produced this
	provider: v.optional(v.string()), // "anthropic"
	usageMode: v.optional(
		v.union(
			// "platform" = our key, "byok" = user's key
			v.literal("platform"),
			v.literal("byok"),
		),
	),
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	expandedLayers: v.optional(v.array(v.string())), // e.g. ["pipelines","tags"]
	confirmationState: v.optional(
		v.union(
			// two-step gate state
			v.literal("pending"),
			v.literal("approved"),
			v.literal("rejected"),
		),
	),
	confirmationPayload: v.optional(v.any()), // preview JSON shown to user before commit
	// Claude/OpenAI-style live status surfaced in the UI:
	//   "thinking"     — model is reasoning before any output
	//   "calling_tool" — a tool is currently executing (activeTool holds the name)
	//   "streaming"    — model is emitting visible tokens (content is being built up)
	//   "done"         — final state, content is complete
	//   "error"        — final state, content holds the error message
	// Older messages (pre-Phase 3B Claude-thinking-UI) lack this field; the UI
	// treats `undefined` as "done" so old threads keep rendering.
	thinkingState: v.optional(
		v.union(
			v.literal("thinking"),
			v.literal("calling_tool"),
			v.literal("streaming"),
			v.literal("done"),
			v.literal("error"),
		),
	),
	// Free-form reasoning / chain-of-thought / status updates from the model
	// or our orchestration code — shown when the user expands the
	// "Thinking…" dropdown. Append-only; we don't persist intermediate
	// re-writes. Capped to ~10 KB at the writer.
	reasoning: v.optional(v.string()),
	// Display name of the tool currently running, if any.
	activeTool: v.optional(v.string()),
	// Set to true when the user cancels the stream mid-flight (Stop button or
	// Cmd+C). The orchestrator polls this flag between chunks and exits early.
	// `cancelledBy` records the user who pressed cancel for audit.
	aborted: v.optional(v.boolean()),
	cancelledBy: v.optional(v.id("users")),
	/**
	 * Sprint 5 — 2-3 short follow-up prompts the model proposes after a turn
	 * settles. Rendered as clickable chips above the composer; click → fires
	 * `sendMessage(suggestion)`. Persisted with the message so chips survive
	 * conversation reload. `undefined` on legacy messages → renders no chips.
	 */
	suggestions: v.optional(v.array(v.string())),
	/**
	 * Week 2.3 — which subagent handled this message (`PHASE-3-AI-AUDIT.md §6
	 * Week 2`). Recorded for telemetry: lets us audit whether the router
	 * picks the right specialist + measure cost / latency per subagent.
	 *
	 * Set on `assistant` rows by the orchestrator AFTER the router runs;
	 * left undefined on `user`, `system`, and `tool` rows. Older messages
	 * (pre-Week-2) are silently undefined — the UI ignores the field.
	 *
	 * Allowed values are the subagent ids declared in
	 * `convex/ai/subagents/index.ts` (`SUBAGENT_IDS`). We don't validate
	 * here so we can add a new subagent without a schema migration —
	 * the router's classifier already coerces unknown ids to the
	 * fallback subagent.
	 */
	subagent: v.optional(v.string()),
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
	userId: v.optional(v.id("users")), // required when scope === "user"
	provider: v.union(
		v.literal("anthropic"),
		v.literal("openai"),
		v.literal("google"),
		v.literal("xai"),
		v.literal("groq"),
		v.literal("mistral"),
		v.literal("openrouter"),
		v.literal("nvidia"), // OpenAI-compat endpoint
		v.literal("moonshot"), // Moonshot AI / Kimi (OpenAI-compat)
		v.literal("custom"), // self-hosted / other
	),
	encryptedKey: v.string(), // AES-GCM encrypted, base64. NEVER returned to client.
	keyHint: v.string(), // last 4 chars for UI display: "sk-...4f8a"
	baseUrl: v.optional(v.string()), // for "custom", "nvidia", OpenRouter endpoint override
	defaultModel: v.optional(v.string()), // user's preferred model for this key
	isActive: v.boolean(),
	lastUsedAt: v.optional(v.number()),
	name: v.optional(v.string()), // user-supplied nickname
	createdBy: v.id("users"),
	...timestamps,
})
	.index("by_org_and_scope", ["orgId", "scope", "userId"])
	.index("by_org_and_provider", ["orgId", "provider"]);

/**
 * AI Morning Briefing cache — generated daily by cron (or on-demand via manual trigger).
 *
 * Two scopes (Sprint 5 — added 2026-05-23):
 *   - "daily-user"  → one row per (user, day). Cached 24h. Cron at 06:00 user-local OR
 *                     on-demand from the dashboard. Used by `DailyBriefingCard`.
 *   - "weekly-org"  → one row per (org, week). Cached 7 days. Cron at Sunday 23:00 UTC.
 *                     Used by `WeeklyInsightCard` — visible to all org members.
 *
 * `scope` and `payload` are OPTIONAL because pre-Sprint-5 rows don't have them; the
 * `2026_05_23_addBriefingScopeAndPayload` migration backfills `scope: "daily-user"`
 * + a derived `payload` for every legacy row.
 */
export const aiBriefings = defineTable({
	orgId: v.id("orgs"),
	userId: v.optional(v.id("users")), // optional → null for weekly-org briefings
	scope: v.optional(v.union(v.literal("daily-user"), v.literal("weekly-org"))),
	generatedAt: v.number(),
	expiresAt: v.number(), // generatedAt + 24h (daily) or +7d (weekly)
	validUntil: v.optional(v.number()), // alias of expiresAt — kept for new code; will replace after migration sweep
	summary: v.string(), // briefing markdown body — pre-Sprint-5 surface
	highlights: v.optional(
		v.array(
			v.object({
				type: v.string(), // "stale_deal" | "due_today" | "milestone" | "overdue"
				entityType: v.optional(v.string()),
				entityId: v.optional(v.string()),
				entityCode: v.optional(v.string()),
				text: v.string(),
			}),
		),
	),
	/**
	 * Sprint 5 structured payload. Drives DailyBriefingCard / WeeklyInsightCard.
	 * Optional during the migration window — once every row has been backfilled
	 * by the 2026-05-23 migration, the field is reliably populated.
	 */
	payload: v.optional(
		v.object({
			summary: v.string(), // 1-2 sentence headline
			highlights: v.array(v.string()), // 3-5 bullets, plain prose
			actionItems: v.array(
				v.object({
					label: v.string(),
					url: v.optional(v.string()),
					toolCall: v.optional(v.string()), // e.g. "search_crm?stale=true"
				}),
			),
			trend: v.optional(v.union(v.literal("up"), v.literal("down"), v.literal("flat"))),
		}),
	),
	model: v.string(), // "anthropic:claude-haiku-3-5"
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	trigger: v.union(v.literal("cron"), v.literal("manual")),
	...timestamps,
})
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_org_and_user_and_generated", ["orgId", "userId", "generatedAt"])
	.index("by_org_and_scope", ["orgId", "scope"])
	.index("by_expires", ["expiresAt"]);
