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
	/**
	 * B.44 — provider grounding metadata captured post-stream.
	 *
	 * Currently carries `{ citations: Citation[] }` for messages whose
	 * model used native (Anthropic / OpenAI Responses / Google grounding)
	 * OR Firecrawl-backed `web_search`. Renderers (`AssistantTurn.tsx`)
	 * surface a "Sources" rail when this field is populated. We use
	 * `v.optional(v.any())` because the per-provider payload differs
	 * (Anthropic returns `tool_result.citation`, OpenAI `web_search_call.results`,
	 * Google `groundingMetadata.groundingChunks`) and the host normalises
	 * them to a common `{ url, title?, snippet? }` shape before persisting.
	 *
	 * Sources used (when implementing B.44):
	 *   - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
	 *   - https://platform.openai.com/docs/guides/tools-web-search
	 *   - https://ai.google.dev/gemini-api/docs/grounding
	 *   - https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
	 *
	 * Older messages (pre-B.44) lack this field; readers MUST treat
	 * `undefined` as "no citations" and skip the Sources rail entirely.
	 * Adding the field is non-breaking — the Convex schema validator
	 * accepts every existing `aiMessages` row unchanged because the slot
	 * is optional.
	 */
	metadata: v.optional(v.any()),
	createdAt: v.number(),
})
	.index("by_conversation", ["conversationId", "createdAt"])
	.index("by_org_and_conversation", ["orgId", "conversationId"])
	// 2026-05-27 P0.1.1 — added so the AI quota gate can count assistant
	// turns per org per calendar month efficiently. Used by
	// `convex/ai/telemetry.ts::sumMessagesThisMonth`.
	.index("by_org_role_created", ["orgId", "role", "createdAt"]);

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
 * Week 4 — `PHASE-3-AI-AUDIT.md §6 Week 4` & §7 Dual-LLM safety.
 *
 * Per-user CSV-import session state. Created when the user (or the AI on
 * the user's behalf) hands a CSV to the quarantined parser
 * (`convex/ai/quarantined/csvParser.ts`). The privileged commit step in
 * `crm/entities/leads/mutations.ts:bulkInsertFromCsvImpl` reads only the
 * `previewRows` field — never the raw uploaded file — so a prompt
 * injection inside row 47 of the CSV cannot reach the tool-calling
 * layer (Simon Willison's Dual-LLM pattern, OWASP-endorsed).
 *
 * Lifecycle:
 *   parsing  → parser action is running (quarantined LLM extracting fields)
 *   ready    → parse complete, awaiting user approval
 *   committing → privileged action is bulk-inserting (transient state)
 *   completed → bulk insert finished, summary stored in `result`
 *   failed   → parser/validator threw; `errors` populated, no rows committed
 *   cancelled → user dismissed the preview before approving
 *
 * Idempotency: each row gets a stable per-import-row dedup key
 * (`row.idemKey`) so retrying the same import is safe.
 *
 * Index choices:
 *   `by_org_and_user_and_status` — list a user's pending imports for the
 *      "Resume CSV import" UI; surfaces `parsing` and `ready` rows.
 *   `by_file` — find the import row from a `files._id` (used when the
 *      user re-attaches a file we've already parsed).
 */
export const csvImports = defineTable({
	...orgScoped,
	userId: v.id("users"),
	fileId: v.id("files"),
	status: v.union(
		v.literal("parsing"),
		v.literal("ready"),
		v.literal("committing"),
		v.literal("completed"),
		v.literal("failed"),
		v.literal("cancelled"),
	),
	/** Target entity. Phase 1 ships `lead` only; contact/company/deal land in Phase 5. */
	targetEntity: v.union(
		v.literal("lead"),
		v.literal("contact"),
		v.literal("company"),
		v.literal("deal"),
	),
	/** Total rows the parser saw in the file (post-header). */
	rowCount: v.number(),
	/** AI-suggested column-name → canonical-field map. User can edit before commit. */
	mapping: v.record(v.string(), v.string()),
	/**
	 * Preview rows — the FULL parsed dataset (capped at 5,000 by the parser
	 * action). Each row already has the dedup decision baked in so the user
	 * can override per-row before approval. `display: true` rows are
	 * included in commit; `display: false` rows are skipped.
	 *
	 * `idemKey` is stable across retries (sha256 of normalised email+name+phone).
	 */
	previewRows: v.array(
		v.object({
			idemKey: v.string(),
			fields: v.record(v.string(), v.union(v.string(), v.null())),
			dedupDecision: v.union(v.literal("insert"), v.literal("merge"), v.literal("skip")),
			dedupTargetCode: v.optional(v.string()), // personCode of the existing match (when merging/skipping)
			validationError: v.optional(v.string()), // Zod failure on the row, e.g. "missing email"
		}),
	),
	/** Headers the parser saw (preserved so the UI can render an editable mapping). */
	sourceHeaders: v.optional(v.array(v.string())),
	/** Parse-time errors (file-level, not row-level). Populated only on `failed`. */
	errors: v.optional(v.array(v.string())),
	/** Result summary populated on `completed`. */
	result: v.optional(
		v.object({
			inserted: v.number(),
			merged: v.number(),
			skipped: v.number(),
			failedRows: v.array(
				v.object({
					idemKey: v.string(),
					error: v.string(),
				}),
			),
		}),
	),
	/** Quarantined model used for the parse — for telemetry / cost reporting. */
	parserModel: v.optional(v.string()),
	/** Approximate token cost of the parse (input + output). */
	parserTokens: v.optional(v.number()),
	...timestamps,
})
	.index("by_org_and_user_and_status", ["orgId", "userId", "status"])
	.index("by_org_and_status", ["orgId", "status"])
	.index("by_file", ["fileId"]);

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

/**
 * Week 5.1 — Enrichment runs (`PHASE-3-AI-AUDIT.md §6 Week 5`, §2.6 Clay
 * waterfall pattern).
 *
 * Each enrichment job is one row. The agent calls `enrich_record` to start
 * a run; the quarantined enrichment-provider action walks the configured
 * waterfall (web_search → linkedin_lookup → email_finder → domain_whois)
 * stopping early when a step returns a high-confidence match. The user
 * approves the patch in a propose() preview; commit_enrich_record applies
 * the diff via `update_entity`.
 *
 * Lifecycle: running → ready → committing → completed / failed / cancelled.
 *
 * Same dual-LLM defence as csvImports — the providers run in their own
 * action with NO write tools and only emit Zod-validated structured output.
 */
export const enrichmentRuns = defineTable({
	...orgScoped,
	userId: v.id("users"),
	/** Which CRM record to enrich. */
	targetEntity: v.union(
		v.literal("lead"),
		v.literal("contact"),
		v.literal("company"),
		v.literal("deal"),
	),
	targetEntityId: v.string(), // entity._id (lead/contact/etc.) — string so we don't bind to a single table
	targetCode: v.optional(v.string()), // personCode/dealCode for display
	status: v.union(
		v.literal("running"),
		v.literal("ready"),
		v.literal("committing"),
		v.literal("completed"),
		v.literal("failed"),
		v.literal("cancelled"),
	),
	/** Snapshot of the existing record's fields, taken when the run started. Used to compute the diff. */
	beforeFields: v.record(v.string(), v.union(v.string(), v.null())),
	/** Per-provider trace (for telemetry + the audit trail). */
	providerTrace: v.array(
		v.object({
			provider: v.string(), // "web_search" | "linkedin_lookup" | "email_finder" | "domain_whois"
			ok: v.boolean(),
			model: v.optional(v.string()), // quarantined model used for parsing the provider response
			tokens: v.optional(v.number()),
			latencyMs: v.optional(v.number()),
			error: v.optional(v.string()),
			summary: v.optional(v.string()), // short human-readable line shown in the audit trail
		}),
	),
	/**
	 * Suggested patch (per-field). User can edit per-row before approval.
	 * Each entry: { field, value, source, confidence }.
	 */
	proposedPatch: v.array(
		v.object({
			field: v.string(),
			value: v.union(v.string(), v.null()),
			source: v.string(), // human-readable URL or provider id
			confidence: v.number(), // 0..1
		}),
	),
	/** Final committed patch (only set on `completed`). */
	committedPatch: v.optional(
		v.array(
			v.object({
				field: v.string(),
				value: v.union(v.string(), v.null()),
			}),
		),
	),
	errors: v.optional(v.array(v.string())),
	...timestamps,
})
	.index("by_org_and_user_and_status", ["orgId", "userId", "status"])
	.index("by_org_and_target", ["orgId", "targetEntity", "targetEntityId"]);

/**
 * Week 5.2 — File analysis (`PHASE-3-AI-AUDIT.md §6 Week 5`).
 *
 * Mirror of csvImports for vision-extracted data: passport scans, listing
 * photos (RE-specific), invoice PDFs. The privileged commit path applies
 * the structured output to the target CRM record after user approval.
 */
export const fileAnalyses = defineTable({
	...orgScoped,
	userId: v.id("users"),
	fileId: v.id("files"),
	kind: v.union(
		v.literal("passport"),
		v.literal("listing_photo"),
		v.literal("invoice"),
		v.literal("generic"),
	),
	status: v.union(
		v.literal("analyzing"),
		v.literal("ready"),
		v.literal("committing"),
		v.literal("completed"),
		v.literal("failed"),
		v.literal("cancelled"),
	),
	/** Optional target — if user kicked off the analysis FROM a record's detail page. */
	targetEntity: v.optional(
		v.union(v.literal("lead"), v.literal("contact"), v.literal("company"), v.literal("deal")),
	),
	targetEntityId: v.optional(v.string()),
	targetCode: v.optional(v.string()),
	/** Structured output from the vision parser. Shape varies by kind. */
	extracted: v.optional(v.record(v.string(), v.any())),
	/** Per-field diff if a target was supplied. */
	proposedPatch: v.optional(
		v.array(
			v.object({
				field: v.string(),
				value: v.union(v.string(), v.null()),
				confidence: v.number(),
			}),
		),
	),
	errors: v.optional(v.array(v.string())),
	parserModel: v.optional(v.string()),
	parserTokens: v.optional(v.number()),
	...timestamps,
})
	.index("by_org_and_user_and_status", ["orgId", "userId", "status"])
	.index("by_file", ["fileId"]);

/**
 * Week 6.2 — AI tool execution events (telemetry).
 *
 * One row per tool execution. Aggregated by the telemetry dashboard for
 * cost / latency / per-tool error rate. Retention: 30 days (TTL via
 * `by_expires` cron).
 */
export const aiToolEvents = defineTable({
	...orgScoped,
	userId: v.id("users"),
	/**
	 * Conversation the tool call ran inside. Optional from Stage 8 onwards
	 * — autonomous triggers (`automation:onStageMove`, `automation:onContactCreate`)
	 * fire from non-chat code paths, where there is no conversation. The
	 * trace UI's `getToolTraceForConversation` already filters on a
	 * supplied `conversationId`, so unset rows are simply absent from
	 * conversation-scoped traces and surface on the org-wide AI changelog
	 * surface instead.
	 */
	conversationId: v.optional(v.id("aiConversations")),
	toolName: v.string(),
	layer: v.optional(v.string()),
	model: v.optional(v.string()),
	provider: v.optional(v.string()),
	startedAt: v.number(),
	durationMs: v.number(),
	ok: v.boolean(),
	errorCode: v.optional(v.string()),
	errorMessage: v.optional(v.string()),
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	/**
	 * S12 — cache-read tokens (Anthropic ephemeral / OpenAI auto-cache).
	 * Optional + additive: pre-S12 rows + non-host writers (standing
	 * orders, autonomous-turn markers) leave it undefined. Tracked
	 * separately from `inputTokens` so the token report can compute
	 * cache-hit ratio (cached / (input + cached)).
	 */
	cachedInputTokens: v.optional(v.number()),
	costUsd: v.optional(v.number()),
	/**
	 * Stage 8 (`/SPRINT-PLAN.md`) — Autonomous layer audit trail.
	 *
	 * Free-form provenance string. Conventions:
	 *   - "user:<userId>"           — default; chat-driven tool calls (may be omitted)
	 *   - "standingOrder:<id>"      — fired by the standing-orders runner
	 *   - "automation:<key>"        — auto-action triggered by a workspace event
	 *                                 (e.g. "automation:onStageMove",
	 *                                 "automation:onContactCreate")
	 *
	 * Threaded into `recordToolEvent` so the trace UI + AI changelog can
	 * show a clear "the AI did this because…" attribution. Optional so
	 * legacy rows (pre-Stage-8) validate without backfill.
	 */
	triggeredBy: v.optional(v.string()),
	expiresAt: v.number(),
})
	.index("by_org_and_started", ["orgId", "startedAt"])
	.index("by_org_and_tool_and_started", ["orgId", "toolName", "startedAt"])
	.index("by_expires", ["expiresAt"]);

/**
 * Stage 8 (`/SPRINT-PLAN.md`) — `aiStandingOrders` table.
 *
 * Cron-driven prompts that the AI runs autonomously on a schedule.
 * Owners (gated on `ai.automation.manage`) define one row per recurring
 * job: a natural-language `prompt`, a closed-union `schedule`, and an
 * `allowedTools[]` whitelist. The runner action loads the row, builds a
 * tool subset that's the INTERSECTION of (caller permissions, requested
 * whitelist), runs `streamText` once, and persists the model's textual
 * summary on the row.
 *
 * Schedule format — closed union, NO free-form cron string (would need a
 * parser dependency we explicitly don't ship):
 *   - `{kind:"interval", intervalMinutes}` — every N minutes (≥ 5)
 *   - `{kind:"daily",    utcHour, utcMinute}` — every day at HH:MM UTC
 *   - `{kind:"weekly",   dayOfWeek, utcHour, utcMinute}` — every <day> at HH:MM UTC
 *
 * The cron evaluator (`convex/ai/standingOrders/evaluator.ts`) runs once
 * per minute and computes `shouldFireNow(schedule, now, lastRunAt?)` —
 * deterministic + side-effect-free + tested. When it returns `true` the
 * evaluator schedules `runner.run` and bumps `lastRunAt`.
 *
 * `enabled = false` short-circuits the evaluator entirely.
 *
 * Indexes:
 *   - by_org           — admin UI list view per workspace.
 *   - by_org_and_user  — "my standing orders" personal list.
 *   - by_enabled       — cron evaluator scan; only flips through enabled rows.
 */
export const aiStandingOrders = defineTable({
	...orgScoped,
	/** The user who owns this standing order. Trusted-arg for the runner. */
	userId: v.id("users"),
	/** Display label rendered in Settings → AI → Automation. Required, ≤ 80 chars. */
	name: v.string(),
	/**
	 * Natural-language instruction passed to the model on every run.
	 * Example: "Find all leads with no activity in 14 days, create a
	 * follow-up reminder for each, and reply with a 3-sentence summary."
	 * Required, ≤ 2000 chars (validated at the writer).
	 */
	prompt: v.string(),
	/**
	 * Whitelist of registered AI tool names the runner may call. Empty
	 * means read-only — the runner builds an intersection with the user's
	 * permissioned tool set and refuses to call anything outside the
	 * whitelist. Required, ≤ 30 entries.
	 */
	allowedTools: v.array(v.string()),
	schedule: v.union(
		v.object({
			kind: v.literal("interval"),
			intervalMinutes: v.number(),
		}),
		v.object({
			kind: v.literal("daily"),
			utcHour: v.number(),
			utcMinute: v.number(),
		}),
		v.object({
			kind: v.literal("weekly"),
			/** 0 = Sunday … 6 = Saturday (matches `Date.getUTCDay()`). */
			dayOfWeek: v.number(),
			utcHour: v.number(),
			utcMinute: v.number(),
		}),
	),
	/** Last successful evaluation tick for this row. */
	lastRunAt: v.optional(v.number()),
	/** Brief textual summary the model produced on the last run. ≤ 2000 chars. */
	lastRunSummary: v.optional(v.string()),
	/** "ok" | "skipped" | "error". `skipped` when no tool calls + no text. */
	lastRunStatus: v.optional(v.string()),
	/** Quick-toggle without deletion. Default `true` at the writer. */
	enabled: v.boolean(),
	/**
	 * Stage 3-A.B.23 — `firstFireAt` is the precomputed next-fire
	 * timestamp for an enabled row. The cron evaluator reads
	 * `withIndex("by_enabled_and_first_fire", q => q.eq("enabled",
	 * true).lte("firstFireAt", now))`, so when there are zero rows due
	 * the read is a true no-op (no full-table scan). The writer
	 * (`mutations:createImpl` / `updateImpl` / `recordRunResult`)
	 * recomputes via `schedule:computeFirstFireAt` whenever the
	 * schedule or `lastRunAt` changes. Disabled rows leave
	 * `firstFireAt` set but never fire because the index also keys on
	 * `enabled = true`. Optional in the validator so the migration
	 * `2026_05_28_addStandingOrderFirstFireAt` can backfill existing
	 * rows in a single pass — after the migration runs every enabled
	 * row has `firstFireAt` set.
	 */
	firstFireAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_org", ["orgId"])
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_enabled", ["enabled"])
	.index("by_enabled_and_first_fire", ["enabled", "firstFireAt"]);

/**
 * Stage 6 (SPRINT-PLAN.md) — `aiNextActions` table.
 *
 * Materialised, ranked list of "what should this user do next?" rows.
 *
 * Reactive rebuild model (2026-05-27):
 *   The table is rebuilt **on-demand** when source data changes. Every
 *   relevant lead/deal/task mutation calls
 *   `convex/ai/queries/nextActionsTrigger:scheduleNextActionsRebuild`,
 *   which schedules the per-user `rebuildForUser` mutation with a 5 s
 *   token-bucket dedup so bursts coalesce. First-paint freshness comes
 *   from `convex.ai.queries.nextActions:lazyWarmForUser`, fired once per
 *   session by `AIPulseRibbon` when the ranked store is empty for the
 *   caller.
 *
 *   The original 30-minute cron (`internal.ai.actions.rankNextActions.
 *   rebuildAllOrgs`) was removed because the reactive path keeps the
 *   ranked store within ~250 ms of source-of-truth and the cron was
 *   adding stale-window latency the user could feel. The action is kept
 *   in the codebase as an on-demand internal entrypoint (e.g. for ops
 *   sweeps after a schema change) but is no longer scheduled.
 *
 * The ranker is **purely heuristic** (no LLM call). It scores three
 * record kinds per user:
 *   - reminders (overdue / due-soon / due-this-week)
 *   - leads (stale > 7d / stale > 14d, status not Won/Lost/Converted)
 *   - deals (stuck >14d / stuck >21d in stage; high-value deals get a +20 boost)
 * Each row carries a 0-100 score, a confidence label
 * (`high | medium | low` — closes capability-audit gap T-4), a
 * machine-readable `reasonCode`, a human-readable `reasonText`
 * (≤200 chars), and a `suggestedIntent` (≤300 chars) the chat composer
 * will prefill when the user clicks "Act on it".
 *
 * Per-user cap: 100 rows. The rebuild deletes the user's existing rows
 * first then inserts the freshly-ranked top 100 — older signal can never
 * hold a slot the new rebuild wants. `expiresAt` is `lastRebuiltAt + 90d`
 * so the daily TTL purge cron can sweep rows for inactive users.
 *
 * UX surfaces:
 *   - `AIPulseRibbon` reads top-3 from this table; falls back to the
 *     heuristic `ai/suggestions:list` when the ranked store is empty
 *     (org's first cron tick hasn't fired yet, or rebuild quota was
 *     exhausted).
 *   - `AINextActionsView` at `/{orgSlug}/ai/next-actions` is the
 *     full-screen ranked list with confidence filter + Act / Dismiss /
 *     Snooze 7d controls.
 *   - AI tool `list_next_actions` in the always-on layer lets the model
 *     surface them in chat ("which records should I focus on?").
 *
 * Indexes:
 *   - `by_org_and_user` `[orgId, userId]` — primary read path; the user's
 *     ribbon + view subscribes to this.
 *   - `by_org_and_user_and_score` `[orgId, userId, score]` — descending
 *     read for the top-N on the ribbon (the query uses `order("desc")`).
 *   - `by_expires` `[expiresAt]` — TTL sweeper.
 */
export const aiNextActions = defineTable({
	...orgScoped,
	userId: v.id("users"),
	/** Which CRM record kind this action targets. */
	recordKind: v.union(
		v.literal("lead"),
		v.literal("contact"),
		v.literal("deal"),
		v.literal("reminder"),
		v.literal("company"),
	),
	/**
	 * Stable code for the target record:
	 *   - leads/contacts: `personCode` (e.g. P-001)
	 *   - deals: `dealCode` (e.g. D-001)
	 *   - companies: `companyCode` (e.g. C-001)
	 *   - reminders: `followUpCode` (e.g. FU-001)
	 *
	 * We persist the code (not the Convex Id) so that snoozed rows
	 * survive entity edits + the chat-composer suggestedIntent text
	 * stays meaningful when surfaced ("Follow up with P-001").
	 */
	recordCode: v.string(),
	/** Heuristic score 0..100. Higher = more urgent. */
	score: v.number(),
	confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	/** Machine-readable reason for telemetry + tests. */
	reasonCode: v.union(
		v.literal("reminder_overdue"),
		v.literal("reminder_due_soon"),
		v.literal("reminder_due_this_week"),
		v.literal("lead_stale_7d"),
		v.literal("lead_stale_14d"),
		v.literal("deal_stuck_14d"),
		v.literal("deal_stuck_21d"),
		v.literal("deal_stuck_high_value"),
	),
	/** Human-readable reason rendered in the ribbon + view (≤200 chars). */
	reasonText: v.string(),
	/** Pre-filled chat composer text on "Act on it" (≤300 chars). */
	suggestedIntent: v.string(),
	/** Optional due timestamp for reminder-kind rows. */
	dueAt: v.optional(v.number()),
	/**
	 * Snooze 7d sets this to `now + 7d`. Read path filters out rows
	 * where `snoozedUntil > now`. Cleared when the row is rebuilt.
	 */
	snoozedUntil: v.optional(v.number()),
	/** TTL — the by_expires sweeper reaps rows whose user has gone quiet. */
	expiresAt: v.number(),
	createdAt: v.number(),
})
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_org_and_user_and_score", ["orgId", "userId", "score"])
	.index("by_expires", ["expiresAt"]);

/**
 * Phase 4 Part 1 P1.12 — `aiPersonaContext`.
 *
 * Per-org and per-user durable AI memory. The agent updates this table
 * via two `update_*_context_facts` AI tools whenever a turn surfaces a
 * fact worth remembering across conversations. The system-prompt
 * builder reads both rows (orgId+null = org-level, orgId+userId =
 * per-user) every turn and injects them as
 *
 *   ## Long-term context for this organisation
 *   ## Long-term context for you (Alex Patel)
 *
 * blocks immediately after the workspace schema block.
 *
 * Hard caps (enforced at the writer in
 * `convex/ai/personaContext.ts`):
 *   summary  ≤ 600 chars
 *   keyFacts ≤ 30 entries
 *   byteCount ≤ 4 KB (re-computed on every write)
 * Over caps → throws `BUDGET_EXCEEDED` so the model stops trying to
 * append. A future Phase-5 nice-to-have is auto-pruning the oldest 5
 * keyFacts into a sentence appended to summary; for now we just refuse.
 *
 * Index choice:
 *   `by_org_and_user` — `[orgId, userId]`. The two reads per turn are
 *   `(orgId, undefined)` for the org row and `(orgId, userId)` for the
 *   user row. Convex treats `undefined` as a value in an index, so
 *   `withIndex("by_org_and_user", q => q.eq("orgId", orgId).eq("userId", undefined))`
 *   is the canonical way to fetch the org-level row.
 */
export const aiPersonaContext = defineTable({
	orgId: v.id("orgs"),
	/** undefined = org-level row. set = per-user-within-this-org row. */
	userId: v.optional(v.id("users")),
	/**
	 * Owner-edited static identity blob — answers "what is this organisation?"
	 * (or "what is this user's role?"). Distinct from `summary` + `keyFacts`,
	 * which are AI-managed dynamic memory. Settings UI writes here; AI tools
	 * never modify this field. Soft cap 10 000 chars (validated at the writer).
	 * Replaces the deprecated `orgs.aiContext` column (migrated 2026-05-24).
	 */
	identity: v.optional(v.string()),
	/** Free-form ≤ 600-char summary the model writes. */
	summary: v.string(),
	/** Bullet facts (e.g. ["Default deal size: $5K", "Calls leads 'opportunities'"]). */
	keyFacts: v.array(v.string()),
	/** Structured prefs the model can read (per-user only — undefined for org row). */
	preferences: v.optional(v.record(v.string(), v.any())),
	lastUpdatedAt: v.number(),
	/** Re-computed byte count of (identity + summary + keyFacts + preferences) JSON. */
	byteCount: v.number(),
	...timestamps,
}).index("by_org_and_user", ["orgId", "userId"]);

/**
 * Stage 7 (SPRINT-PLAN.md) — `aiInsights` table.
 *
 * Persisted, structured AI narrative output. Three kinds:
 *
 *   - `metric_analysis`     — `analyze_metric` tool result. Why a KPI
 *     moved + the top contributors. `metric` + `range` populated.
 *   - `deal_retrospective`  — written by the cron-scheduled
 *     `analyzeDealClose` action when a deal closes. `recordRef`
 *     populated with `{ entityType: "deal", entityId, code }`.
 *   - `cohort_summary`      — narrative explanation paired with an
 *     `aiCohortReports` row. Currently unused (Stage 7 keeps cohort
 *     tooling deterministic), reserved for Stage 8 / 9.
 *
 * `body` is the zod-validated structured output (see
 * `convex/ai/queries/insights.ts:InsightBody`). The orchestrator NEVER
 * writes raw markdown into `body` — every write goes through a Zod
 * parse so a model that emits invalid JSON cannot poison the table.
 *
 * Cost class on the producing tool decides whether the insight is
 * memoised (cohort: 1/day, metric: 1/min, deal_retrospective: 1/deal).
 *
 * Indexes:
 *   - by_org_and_kind_and_generated   — list latest insights per kind
 *     for the AI Insights ribbon / Settings → AI changelog.
 *   - by_org_and_recordRef_code       — sparse; deal-retrospective
 *     fast lookup by deal code.
 *   - by_expires                      — TTL sweeper (90 days).
 */
export const aiInsights = defineTable({
	...orgScoped,
	/** Optional — present when a user kicked off the analysis manually. */
	userId: v.optional(v.id("users")),
	kind: v.union(
		v.literal("metric_analysis"),
		v.literal("deal_retrospective"),
		v.literal("cohort_summary"),
	),
	/** For metric_analysis: which KPI ("deals.pipelineValue", "leads.open", …). */
	metric: v.optional(v.string()),
	/** For metric_analysis / cohort: rolling window key. */
	range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"))),
	/** For deal_retrospective + (future) per-record cohort rows. */
	recordRef: v.optional(
		v.object({
			entityType: v.string(), // "deal" | "lead" | …
			entityId: v.string(),
			code: v.optional(v.string()),
		}),
	),
	/** Zod-validated structured output. See queries/insights.ts:InsightBody. */
	body: v.object({
		summary: v.string(),
		findings: v.array(v.string()),
		actionItems: v.array(
			v.object({
				label: v.string(),
				intent: v.optional(v.string()),
			}),
		),
		confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	}),
	modelUsed: v.string(),
	inputTokens: v.optional(v.number()),
	outputTokens: v.optional(v.number()),
	generatedAt: v.number(),
	expiresAt: v.number(),
})
	.index("by_org_and_kind_and_generated", ["orgId", "kind", "generatedAt"])
	.index("by_org_and_recordRef_code", ["orgId", "recordRef.code"])
	.index("by_expires", ["expiresAt"]);

/**
 * Stage 7 (SPRINT-PLAN.md) — `aiCohortReports` table.
 *
 * Persisted, deterministic cohort rollups. The `rebuildCohorts` cron
 * action computes leadSource / industry / owner rollups nightly and
 * upserts ONE row per (orgId, kind, periodEnd). The `cohort_analysis`
 * AI tool returns the latest row by kind — no LLM cost on read.
 *
 * Why a separate table from aiInsights:
 *   - aiCohortReports is purely deterministic (no LLM call).
 *   - The schema is tabular (one row per cohort key), not narrative.
 *   - Refresh cadence is daily, not on-demand.
 *
 * Indexes:
 *   - by_org_and_kind_and_generated   — list-by-kind newest-first.
 *   - by_expires                      — 30-day TTL sweep.
 */
export const aiCohortReports = defineTable({
	...orgScoped,
	kind: v.union(v.literal("leadSource"), v.literal("industry"), v.literal("owner")),
	periodStart: v.number(),
	periodEnd: v.number(),
	rows: v.array(
		v.object({
			key: v.string(),
			label: v.optional(v.string()),
			count: v.number(),
			convertedCount: v.number(),
			conversionRate: v.number(),
			avgDealValue: v.number(),
			totalValue: v.number(),
		}),
	),
	generatedAt: v.number(),
	expiresAt: v.number(),
})
	.index("by_org_and_kind_and_generated", ["orgId", "kind", "generatedAt"])
	.index("by_expires", ["expiresAt"]);

/**
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — `ephemeralDashboardCells` table.
 *
 * Per-user, TTL-bounded "cells" that AI's `render_widget` tool pins
 * above the regular dashboard. Each row represents ONE AI-rendered
 * widget for ONE user — never shared across users (per architectural
 * rule: AI never writes the canonical layout).
 *
 * Lifecycle:
 *   1. AI tool `render_widget` proposes a cell → propose card → user
 *      approves → `commit_render_widget` writes a row here.
 *   2. The dashboard's `<AIPinnedRow>` component reads
 *      `listForUser({orgId})` and renders each cell above the layout.
 *   3. After 24 h the cell expires; the daily TTL cron
 *      (`purgeExpiredEphemeralCells`) sweeps rows where
 *      `expiresAt <= now`.
 *   4. The user can dismiss a cell at any time via `dismiss({cellId})`
 *      which hard-deletes it.
 *   5. The user can promote a cell to their permanent layout via the
 *      "Pin to my dashboard" button — this writes to
 *      `users.preferences.dashboardLayoutOverride.layout` (the user's
 *      OWN per-user override, not the org default) and dismisses the
 *      ephemeral row in the same edit.
 *
 * `widgetKey` references the SSOT `WIDGET_KEYS` from
 * `convex/_shared/widgetRegistry.ts`. Same validation as
 * `org.settings.dashboardLayout.panels[].widget` — unknown keys are
 * rejected at the writer.
 *
 * `dataSnapshot` is an optional pre-computed result blob. The renderer
 * shows the snapshot until a fresh subscription resolves; small enough
 * to keep on the row (~1 KB cap; the writer rejects oversized blobs).
 *
 * `args` is the tool-call payload that produced the cell — re-rendered
 * if the user clicks "Refresh data on this cell". Validated by the
 * tool's zod schema before write; stored as `v.any()` because the
 * shape varies per widget kind.
 *
 * Indexes:
 *   - `by_user_and_org` `[userId, orgId]` — primary read path; the
 *     `<AIPinnedRow>` subscribes to this on dashboard mount.
 *   - `by_org` `[orgId]` — admin debug / org-wide audit.
 *   - `by_expires` `[expiresAt]` — daily TTL sweeper.
 */
export const ephemeralDashboardCells = defineTable({
	...orgScoped,
	userId: v.id("users"),
	/**
	 * Stable cell id (deterministic). Generated by the writer as
	 * `${userId}:${widgetKey}:${createdAt}`. The dismiss + promote paths
	 * read this to identify the row to delete; the cell-id also keys
	 * deduplication ("AI rendered this exact widget yesterday → bump
	 * createdAt + extend TTL instead of inserting a duplicate").
	 */
	cellId: v.string(),
	/**
	 * Widget kind — one of the registered `WidgetKey`s in
	 * `convex/_shared/widgetRegistry.ts`. Validator at the writer
	 * rejects unknown keys.
	 */
	widgetKey: v.string(),
	/**
	 * Title rendered on the cell shell. Optional — falls back to
	 * `WIDGETS[widgetKey].label`. Cap 80 chars at the writer.
	 */
	title: v.optional(v.string()),
	/**
	 * Tool-call payload that produced the cell. Re-used on "Refresh data".
	 * Shape is per-widget; validated by `render_widget`'s zod schema.
	 */
	args: v.any(),
	/**
	 * Pre-computed result blob. Optional. Cap ~4 KB at the writer
	 * (we don't want runaway row sizes). Cleared on Refresh.
	 */
	dataSnapshot: v.optional(v.any()),
	/**
	 * Provenance — which AI conversation rendered the cell. Optional
	 * because Stage 8 standing-orders may render cells without a chat
	 * conversation.
	 */
	createdByConversationId: v.optional(v.id("aiConversations")),
	createdAt: v.number(),
	/** TTL — 24 h after creation by default; `purgeExpiredEphemeralCells` sweeps. */
	expiresAt: v.number(),
})
	.index("by_user_and_org", ["userId", "orgId"])
	.index("by_org", ["orgId"])
	.index("by_expires", ["expiresAt"]);

/**
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — `dashboardAnnotations` table.
 *
 * Per-org annotations rendered as small chips on dashboard widgets and
 * in the AI Pulse ribbon. Two writers:
 *   - AI tool `annotate_widget` (chat-driven, propose/commit).
 *   - Cron `detectAnomalies` (daily 06:00 UTC, no human in the loop).
 *
 * Each annotation is org-scoped (visible to every member with widget
 * read access) but per-user-dismissable via `dismissedByUserIds[]`.
 * The renderer filters out annotations the current user has dismissed.
 *
 * `widgetKey` is optional — not every annotation targets a specific
 * widget (the cron's "your pipeline value dropped 22%" surfaces in AI
 * Pulse, not on a widget).
 *
 * `severity` drives the chip colour:
 *   - `info`     — neutral observation (slate)
 *   - `warning`  — needs attention (amber)
 *   - `critical` — needs immediate action (red)
 *
 * `source` is the provenance string for the trace UI:
 *   - `"ai_tool:<toolName>"` — chat-driven write
 *   - `"cron:detectAnomalies"` — daily anomaly cron
 *
 * `dealId` is optional — set when the annotation is anchored to a
 * specific deal (e.g. "this deal is stalled in stage X"). Drives the
 * "Investigate" click → opens the deal detail.
 *
 * Indexes:
 *   - `by_org` `[orgId]` — primary read path; the AI Pulse subscribes
 *     here.
 *   - `by_org_and_widget` `[orgId, widgetKey]` — widget-scoped chip
 *     lookup. `widgetKey` is `v.string()` not optional in the index
 *     (Convex requires concrete index keys); we set the chip-less
 *     annotations' `widgetKey` to the empty string so they never
 *     collide with a real key.
 *   - `by_org_and_severity_and_created` `[orgId, severity, createdAt]`
 *     — newest-first for "show critical anomalies first".
 *   - `by_expires` `[expiresAt]` — optional TTL sweep when the cron
 *     stamps an expiry.
 */
export const dashboardAnnotations = defineTable({
	...orgScoped,
	source: v.string(),
	severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
	/**
	 * The widget the annotation chip should render on. Empty string =
	 * unanchored (renders only in AI Pulse). Validator at the writer
	 * rejects non-empty values that aren't registered widget keys.
	 */
	widgetKey: v.string(),
	/** Optional deal anchor — clicked → opens the deal detail. */
	dealId: v.optional(v.id("deals")),
	/** 1-line headline rendered as the chip body. Cap 200 chars. */
	note: v.string(),
	/** Optional bullet observations rendered when the chip is expanded. ≤ 5 entries. */
	facts: v.optional(v.array(v.string())),
	/** Optional pre-filled chat composer text on "Investigate" click. ≤ 300 chars. */
	suggestedIntent: v.optional(v.string()),
	/**
	 * AI provenance — which conversation triggered the write. Set only
	 * when `source` starts with `"ai_tool:"`. Cron writes leave this
	 * undefined.
	 */
	createdByConversationId: v.optional(v.id("aiConversations")),
	createdByUserId: v.optional(v.id("users")),
	/** Per-user dismiss bag. Renderer filters by `currentUserId` membership. */
	dismissedByUserIds: v.array(v.id("users")),
	createdAt: v.number(),
	/** Optional TTL — cron writes set 7-day expiry; tool writes leave undefined. */
	expiresAt: v.optional(v.number()),
})
	.index("by_org", ["orgId"])
	.index("by_org_and_widget", ["orgId", "widgetKey"])
	.index("by_org_and_severity_and_created", ["orgId", "severity", "createdAt"])
	.index("by_expires", ["expiresAt"]);

/**
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — `dealScores` table.
 *
 * Per-org per-deal predictive scores (0-100). The `rebuildDealScores`
 * cron rebuilds the entire org's score table daily; the `score_deal`
 * AI tool can refresh a single row on-demand. The hybrid model:
 *
 *   1. **Deterministic heuristic** (cheap, ships day 1):
 *      score = weighted sum of:
 *        - recency (last activity / message / note)
 *        - stage age (stale-stage penalty)
 *        - value (pipeline-relative magnitude)
 *        - owner velocity (last 30d won-rate of the deal owner)
 *        - activity count (notes + messages + tasks last 14d)
 *      Each weight is a constant in `convex/ai/insights/dealScores.ts`;
 *      no LLM cost.
 *
 *   2. **LLM "explain this score"** (on-demand, gated):
 *      User clicks the score dot → `explainDealScore` LLM action runs
 *      generateObject and stamps `explanation` on the row. Costs 1
 *      LLM call per click. Permission gate `ai.briefingRefresh`.
 *
 * Indexes:
 *   - `by_org_and_deal` `[orgId, dealId]` — point lookup for the
 *     row-level dot in the Deals widget; the `score_deal` tool reads
 *     this on every call (uses upsert: read → write).
 *   - `by_org_and_score` `[orgId, score]` — descending read for "top
 *     deals at risk". Also drives the dashboard's "5 deals to focus
 *     on" widget.
 *   - `by_expires` `[expiresAt]` — daily TTL sweep (rows for soft-
 *     deleted deals are reaped here too).
 */
export const dealScores = defineTable({
	...orgScoped,
	dealId: v.id("deals"),
	/** 0..100. Higher = healthier. */
	score: v.number(),
	confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	/**
	 * Component breakdown — useful for the per-deal "Why?" popover even
	 * when the LLM explanation is missing. All values 0..100 (per-axis
	 * normalised), not raw counts.
	 */
	components: v.object({
		recency: v.number(),
		stageAge: v.number(),
		value: v.number(),
		ownerVelocity: v.number(),
		activityCount: v.number(),
	}),
	/** Optional LLM-generated narrative. Stamped by `explainDealScore`. */
	explanation: v.optional(
		v.object({
			text: v.string(),
			generatedAt: v.number(),
			byUserId: v.optional(v.id("users")),
			modelUsed: v.optional(v.string()),
		}),
	),
	computedAt: v.number(),
	/** TTL — `lastRebuiltAt + 14d` so soft-deleted deals reap eventually. */
	expiresAt: v.number(),
})
	.index("by_org_and_deal", ["orgId", "dealId"])
	.index("by_org_and_score", ["orgId", "score"])
	.index("by_expires", ["expiresAt"]);

/**
 * S10 — short-lived 2FA step-up tokens for irreversible AI capabilities.
 *
 * Issued by `convex/aiStepUp.ts:confirmStepUp` after the user clicks
 * "Confirm" twice in the chat UI. Verified + consumed inside
 * `convex/ai/registry/wrapper.ts` (via the injected `stepUpVerifier`)
 * before an irreversible capability runs.
 *
 * Single-use, 5-minute TTL, scoped to (orgId, userId, capability,
 * argsHash) so a forged token cannot be replayed against a different
 * tool call. The whole point of the table is to make the gate
 * verifiable + auditable — the wrapper alone can't trust a string.
 *
 * Index `by_token` is a point lookup the wrapper calls per call;
 * `by_org_and_user_and_expires` powers a future cleanup cron.
 */
export const aiStepUpTokens = defineTable({
	...orgScoped,
	userId: v.id("users"),
	conversationId: v.optional(v.id("aiConversations")),
	/** Capability name the token authorises (e.g. `bulk_delete_entities`). */
	capability: v.string(),
	/** SHA-256 hex of canonicalised args JSON. Pins the token to one call. */
	argsHash: v.string(),
	/** Random 32-byte hex string. The chat client passes this back to verify. */
	token: v.string(),
	issuedAt: v.number(),
	expiresAt: v.number(),
	/** Set when the token has been consumed by the wrapper (single-use). */
	consumedAt: v.optional(v.number()),
})
	.index("by_token", ["token"])
	.index("by_org_and_user_and_expires", ["orgId", "userId", "expiresAt"]);

/**
 * S16 — API tokens for the MCP + REST projectors.
 *
 * One row per externally-issued personal access token. Each token executes
 * under the issuing member's RBAC: the auth flow is "Bearer <plaintext> →
 * SHA-256 → look up by `hash` → return the row → resolve `(orgId,userId)`
 * to a `Principal` via `requireOrgMemberByIds` (read at call time so
 * permission changes propagate immediately)".
 *
 * The plaintext is shown ONCE at creation and never persisted. We store:
 *   - `hash`   — SHA-256 hex of the plaintext. The lookup key.
 *   - `prefix` — first 12 chars of the plaintext (e.g. `ot_acme_AbCd`).
 *                Shown in the management UI so a user can identify which
 *                row corresponds to a token they pasted somewhere.
 *
 * Token format: `ot_<orgSlug6>_<random32hex>` (so an admin can spot which
 * org a leaked token belongs to without decrypting). The `_` separator and
 * lowercase characters keep it copy-paste safe in shells + URLs.
 *
 * `scopes` is a capability-name allow-list. `["*"]` opts in to every
 * capability the issuing member already has permission for. Narrower
 * scopes (e.g. `["search_crm","read_conversation"]`) lock the token down
 * to a read-only surface even if the member's role is broader.
 *
 * Indexes:
 *   - `by_hash`  — point lookup on every authenticated request.
 *   - `by_org`   — list every token in an org for the management UI.
 *   - `by_user`  — list a member's own tokens.
 */
export const aiApiTokens = defineTable({
	...orgScoped,
	/** The member whose RBAC every call under this token executes against. */
	userId: v.id("users"),
	/** Human-readable label shown in the management UI. Required, ≤ 60 chars. */
	name: v.string(),
	/**
	 * First 12 chars of the plaintext (e.g. `ot_acme_AbCd`). Used for
	 * UI display only — never sufficient to authenticate. The full
	 * plaintext is shown ONCE at creation and never re-issued.
	 */
	prefix: v.string(),
	/** SHA-256 hex of the plaintext. The lookup key on every request. */
	hash: v.string(),
	/**
	 * Capability-name allow-list. `["*"]` = every cap the member has
	 * permission for; otherwise the token is restricted to the names
	 * listed (still subject to the member's RBAC + the registry's
	 * channel/risk gates).
	 */
	scopes: v.array(v.string()),
	/** Optional expiry in epoch ms. `undefined` = never expires. */
	expiresAt: v.optional(v.number()),
	/** Set when the token is revoked (revocation overrides everything). */
	revokedAt: v.optional(v.number()),
	/** Last successful call (best-effort; updated outside the tx hot path). */
	lastUsedAt: v.optional(v.number()),
	...timestamps,
})
	.index("by_hash", ["hash"])
	.index("by_org", ["orgId"])
	.index("by_user", ["orgId", "userId"]);
