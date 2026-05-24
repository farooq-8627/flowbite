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
	conversationId: v.id("aiConversations"),
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
	costUsd: v.optional(v.number()),
	expiresAt: v.number(),
})
	.index("by_org_and_started", ["orgId", "startedAt"])
	.index("by_org_and_tool_and_started", ["orgId", "toolName", "startedAt"])
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
