/**
 * convex/ai/toolRegistry.ts
 *
 * Central tool registry. Each tools/*.ts file registers its tools here.
 * getToolsForRequest() returns the filtered set for a given request.
 *
 * Token budget:
 *   - Always-on layer (12 tools): ~3,500 prompt tokens
 *   - One extra layer (~5 tools):  ~1,500 prompt tokens
 *   - Full all-layers:            ~24,000 prompt tokens
 *   Granular loading saves ~80% on prompt overhead with no functional loss.
 */
import { tool } from "ai";
import { z } from "zod";
import type { ModelTier } from "./models";
import { wrapWithZodErrorFormatter } from "./orchestrator/zodErrorFormatter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LayerId =
	| "always"
	| "pipelines"
	| "fields"
	| "tags"
	| "views"
	| "categories"
	| "members"
	| "settings"
	| "bulk"
	| "templates"
	| "data"
	| "messaging"
	| "files"
	| "timeline"
	| "notifications"
	| "analytics"
	| "creative";

/**
 * Per-tool runbook strings. The system-prompt builder injects a runbook
 * block for every ACTIVE tool — saves prompt tokens vs. one giant
 * doctrine block (~600 tokens for 12 always-on tools vs. ~2,000 tokens
 * for a global doctrine that's mostly irrelevant to any given request).
 *
 * Each field is ONE sentence; the model reads them as imperative
 * guidance. Add concise advice — verbose runbooks defeat the purpose.
 *
 * Field meanings:
 *   onSuccess         — what to do after `ok: true` (confirm? summarise? next step?)
 *   onValidationError — Zod / schema-validation failure (typically: ask, don't retry)
 *   onEmpty           — search/lookup returned no rows
 *   onPermissionDenied — RBAC failed (we already short-circuit, but the model can apologise)
 *   onPartialSuccess  — bulk operation where N/M rows succeeded
 *   suggestNext       — natural follow-up tool (e.g. create_lead → create_task)
 */
export type ToolRunbook = {
	onSuccess?: string;
	onValidationError?: string;
	onEmpty?: string;
	onPermissionDenied?: string;
	onPartialSuccess?: string;
	suggestNext?: string;
};

export type ToolDef = {
	name: string;
	description: string;
	layer: LayerId;
	/** Permission key the calling user must hold. null = no perm check (read-only public). */
	permission: string | null;
	/** If "premium", only expose to standard/premium-tier models. */
	requiredCapability?: "premium";
	/**
	 * Stage 7 — Constraint I (`/SPRINT-PLAN.md`). Per-tool LLM cost
	 * ceiling hint. The orchestrator's `quotaGate` reads this when
	 * deciding whether the org has budget left for the call. Tools that
	 * call subagents (`analyze_metric`, `analyzeDealClose`, future
	 * `draft_proposal`) declare `expensive`. Atomic reads stay `cheap`
	 * (or omit it). When undefined, treated as `normal`.
	 *
	 * The actual per-class budget is enforced inside the producing
	 * tool's execute — declaring it here keeps the registry honest
	 * (so `expand_tools` can warn the model when an expensive tool
	 * has been used recently).
	 */
	costClass?: "cheap" | "normal" | "expensive";
	/**
	 * Post-sprint addition (2026-05-26). Maps the tool to a user-facing
	 * approval category so `resolveNeedsApproval` can consult the user's
	 * `users.preferences.aiApprovals` map. When omitted, the tool falls
	 * back to its `confirmation` / `needsApproval` declaration unchanged
	 * (i.e. always asks if either is set, never asks otherwise).
	 *
	 * See `convex/_shared/aiApprovals.ts` for the canonical list,
	 * defaults, and the hard-locked set (bulk / settings / members ALWAYS
	 * ask regardless of user preferences).
	 */
	approvalCategory?: import("../_shared/aiApprovals").ApprovalCategory;
	/**
	 * Post-sprint addition (2026-05-26). When `true`, the approval gate
	 * ALWAYS fires regardless of `confirmation`, `needsApproval`,
	 * `approvalCategory`, or any user preference. Reserved for tools whose
	 * sole purpose IS surfacing a UI prompt to the user — currently
	 * `ask_user_input` and `ask_user_choice`. Auto-approving them would
	 * defeat the point.
	 */
	alwaysAsk?: boolean;
	/**
	 * If "twoStep", AI calls propose_* first, then commit_* on approval.
	 *
	 * @deprecated Week 3.3 — prefer `needsApproval`. Both fields are honoured
	 *             during the migration window so the existing tools work
	 *             unchanged. New tools should use `needsApproval` only.
	 */
	confirmation?: "none" | "twoStep";
	/**
	 * Week 3.3 — `PHASE-3-AI-AUDIT.md §6 Week 3` & §2.2 (AI SDK v6 native
	 * HITL). When set, the orchestrator pauses tool execution after the
	 * model emits a `tool-call` chunk and waits for the user to approve
	 * via `addToolApprovalResponse`. Static `true` means every call needs
	 * approval; the function form is consulted with the model's args so
	 * we can implement dynamic approval (e.g. "auto-approve under 50
	 * rows, ask above").
	 *
	 * NOTE: full-native AI SDK v6 `needsApproval` keeps the streamText
	 * loop alive until the user responds — incompatible with our
	 * DB-streamed resume model (`processChat.run` → DB patch → user
	 * approves → `processChat.resume` is a separate action). We honour
	 * the field shape so tool authors get the SDK's mental model, and
	 * the orchestrator translates it into our existing pause/resume
	 * flow. See `Future-Enhancements.md §B.8`.
	 */
	needsApproval?: boolean | ((args: Record<string, unknown>) => boolean);
	/**
	 * Per-tool guidance injected into the system prompt as a "Tool Runbooks"
	 * section. Only active tools' runbooks are emitted, so the cost scales
	 * with the layer set the user expanded — not with the total tool count.
	 */
	runbook?: ToolRunbook;
	/**
	 * P1.4 — structured tool description following Anthropic's "Writing
	 * effective tools for AI agents" (Sep 2025) guidance. When present,
	 * `description` is auto-built from this via {@link buildToolDescription}
	 * (single source of truth). Tools without `instruction` keep their
	 * free-form `description` unchanged (zero-cost migration).
	 *
	 * See `PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1` row P1.4.
	 */
	instruction?: ToolInstruction;
	/**
	 * Optional working example of valid args. Surfaced to the model when
	 * input validation fails so it can self-correct on the next step
	 * instead of retrying with the same args. See
	 * `convex/ai/orchestrator/zodErrorFormatter.ts`.
	 *
	 * Add this to any tool whose schema is non-trivial — the example is
	 * cheap (only emitted on errors) and dramatically improves recovery.
	 */
	example?: Record<string, unknown>;
	// biome-ignore lint: intentional any for tool execute return
	schema: z.ZodSchema<any>;
	// biome-ignore lint: intentional any for tool execute
	execute: (input: any) => Promise<unknown>;
};

// ─── ToolInstruction (P1.4) ─────────────────────────────────────────────
//
// Anthropic recommends structuring tool descriptions with explicit
// when/when-not/preflight/example slots — small models hallucinate
// dramatically less when descriptions follow a predictable shape.
//
// `instruction` lives ALONGSIDE `description`. When set, the registry
// rebuilds `description` via `buildToolDescription(instruction)` so the
// model still sees a flat description string (the AI SDK schema
// requires it) — but the structure is enforced + greppable + testable.
//
// Backwards compat: `instruction` is optional. Tools that haven't
// migrated keep their bespoke description.

export type ToolInstructionExample = {
	description: string;
	args: Record<string, unknown>;
	whyBad?: string;
};

export type ToolInstruction = {
	/** "Use when the user asks to add a new sales prospect." */
	whenToCall: string;
	/** "Don't use to convert a lead → contact (use convert_lead)." */
	whenNotToCall?: string;
	/** Read-only tools the model SHOULD call first. */
	preflight?: string[];
	/** What to ask the user via ask_user_input when unclear. */
	requiredClarifications?: string[];
	/** Synonyms the user might use ("prospect", "potential customer"). */
	synonyms?: string[];
	/** Multishot example of a valid call. */
	goodExample?: ToolInstructionExample;
	/** Multishot anti-pattern with rationale. */
	badExample?: ToolInstructionExample;
};

/**
 * Build the model-facing description string from a structured
 * {@link ToolInstruction}. Public so tool authors can preview the
 * generated string while migrating.
 *
 * Deterministic ordering: when, when-not, preflight, clarifications,
 * synonyms, good example, bad example. The same order every time so
 * caching layers see a stable string.
 */
export function buildToolDescription(instr: ToolInstruction): string {
	const lines: string[] = [];
	lines.push(instr.whenToCall.trim());
	if (instr.whenNotToCall) {
		lines.push(`\nDo NOT call when: ${instr.whenNotToCall.trim()}`);
	}
	if (instr.preflight && instr.preflight.length > 0) {
		lines.push(
			`\nPreflight (call FIRST in the same turn): ${instr.preflight.map((p) => `\`${p}\``).join(", ")}.`,
		);
	}
	if (instr.requiredClarifications && instr.requiredClarifications.length > 0) {
		lines.push(
			`\nIf the user hasn't supplied any of: ${instr.requiredClarifications
				.map((c) => `\`${c}\``)
				.join(", ")} — call \`ask_user_input\` first. Never guess these.`,
		);
	}
	if (instr.synonyms && instr.synonyms.length > 0) {
		lines.push(`\nSynonyms users may use: ${instr.synonyms.map((s) => `"${s}"`).join(", ")}.`);
	}
	if (instr.goodExample) {
		lines.push(
			`\nGood example: ${instr.goodExample.description}\n\`\`\`json\n${JSON.stringify(
				instr.goodExample.args,
				null,
				2,
			)}\n\`\`\``,
		);
	}
	if (instr.badExample) {
		lines.push(
			`\nBad example (do NOT do this): ${instr.badExample.description}\n\`\`\`json\n${JSON.stringify(
				instr.badExample.args,
				null,
				2,
			)}\n\`\`\`${instr.badExample.whyBad ? `\nWhy bad: ${instr.badExample.whyBad}` : ""}`,
		);
	}
	return lines.join("\n").trim();
}

// ─── Per-request context for meta-tools ──────────────────────────────────────
//
// `expand_tools.execute` needs to know the caller's permissions + modelTier so
// it can list ONLY the tools the model could actually call after expanding.
// Before Week 1 #1.2 the meta-tool listed every tool in the registry for the
// requested layer — even ones the user lacked permission for or that were
// premium-gated — so the model would attempt them on the next turn and the
// real filter in `getToolsForRequest` would silently strip them. Result:
// "tool not found" loops (see PHASE-3-AI-AUDIT.md §1, table row 2).
//
// We park the request-scope context in a module-level holder. Convex actions
// are single-threaded, so this is safe: each `processChat.run` invocation
// sets it before building tools and the SDK only calls execute() inside that
// same invocation. The holder is reset on every set so a stale context can't
// leak across turns.

let _activeRequestContext: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
} | null = null;

/**
 * Set the per-request context that `expand_tools.execute` consults. Called
 * from the orchestrator immediately before `getToolsForRequest()`.
 */
export function setActiveRequestContext(args: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
}): void {
	_activeRequestContext = args;
}

/** Clear the per-request context after the agent loop finishes. */
export function clearActiveRequestContext(): void {
	_activeRequestContext = null;
}

/**
 * Read the active request context. Returns `null` when no chat turn is
 * in progress. Used by `list_active_layers` to report which layers are
 * currently expanded without threading the orchestrator state through
 * tool args.
 */
export function getActiveRequestContext(): {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
} | null {
	return _activeRequestContext;
}

/**
 * Decide whether a given tool would be exposed under the supplied filters.
 * The single source of truth used by both `getToolsForRequest` and
 * `expand_tools.execute` so the meta-tool can never lie to the model.
 */
function isToolExposed(
	def: ToolDef,
	args: { permissions: string[]; modelTier: ModelTier; expandedLayers: string[] },
): boolean {
	const { permissions, modelTier, expandedLayers } = args;
	if (def.layer !== "always" && !expandedLayers.includes(def.layer)) return false;
	if (def.permission && !permissions.includes(def.permission)) return false;
	// DEFERRED: see Future-Enhancements.md §A.2 — premium gate is off for
	//          testing. Re-enable in Phase 6 / Week 6 by uncommenting the
	//          next line, then keep the same filter in getToolsForRequest +
	//          getActiveRunbooks. All three sites must stay in sync.
	// if (def.requiredCapability === "premium" && modelTier === "small") return false;
	void modelTier;
	return true;
}

const REGISTRY = new Map<string, ToolDef>();

/** Register a tool definition. Called from each tool module at import time. */
export function registerTool(def: ToolDef): void {
	// P1.4 — when `instruction` is provided, the model-facing
	// `description` is auto-built from the structured shape. The
	// caller's free-form `description` is kept as a fallback only when
	// `instruction` is absent.
	const finalDef: ToolDef =
		def.instruction !== undefined
			? { ...def, description: buildToolDescription(def.instruction) }
			: def;
	REGISTRY.set(def.name, finalDef);
}

/**
 * Read-through accessor for the original {@link ToolDef}. Required by
 * `orchestrator/resume.ts` so the commit step can re-parse the propose
 * payload through the commit tool's zod schema BEFORE invoking
 * `execute()` — without this, propose-only fields (e.g.
 * `create_lead.notes`) leak into the underlying mutation validator and
 * surface to the user as the dreaded "An unexpected error occurred"
 * generic. See `Future-Enhancements.md §C / 2026-05-24` for the
 * incident write-up.
 */
export function getRegisteredTool(name: string): ToolDef | undefined {
	return REGISTRY.get(name);
}

/**
 * Names of every tool currently in the registry. Used by
 * `twoStepSchemaAudit` to walk the propose/commit pairs at startup.
 */
export function getRegisteredToolNames(): string[] {
	return Array.from(REGISTRY.keys());
}

// ─── C.4 — propose/commit schema audit ───────────────────────────────────────
//
// 2026-05-24 incident reminder: the original `commit_create_lead` had a
// `notes` field on its propose schema but the underlying mutation
// validator didn't accept it. The model dutifully populated `notes` for
// every "and add a note that says X" prompt, the commit step silently
// stripped it (resume.ts is correct to do so — re-parsing through the
// commit's zod schema is the structural fix), and the user's note
// content disappeared without a UI signal.
//
// This audit catches the same shape proactively: for every propose tool
// (`twoStep` confirmation OR `needsApproval` declared, non-`commit_*`
// name), look up the matching `commit_*` and compare the top-level zod
// `.shape` fields. Any propose-only field gets a warn-level log line.
//
// Caveats:
//   - Some propose-only fields are intentional UI display props (e.g.
//     `archive_note_category` carries `name` for the propose card; the
//     mutation needs only `categoryId`). The agent author triages
//     each warning — the audit doesn't fail the build.
//   - Only top-level fields of `z.object({...})` schemas are inspected.
//     Tools using non-object root schemas are skipped with a debug note.

let _proposeCommitAuditDone = false;

interface SchemaAuditFinding {
	pair: string;
	proposeOnly: string[];
	commitOnly: string[];
	note?: string;
}

/**
 * Walk the registry once per process, diff every propose/commit pair's
 * top-level zod schema, and surface findings via `console.warn`. Return
 * the findings list so tests can introspect.
 */
export function runProposeCommitSchemaAudit(force = false): SchemaAuditFinding[] {
	if (_proposeCommitAuditDone && !force) return [];
	_proposeCommitAuditDone = true;

	const findings: SchemaAuditFinding[] = [];

	for (const [name, def] of REGISTRY) {
		if (name.startsWith("commit_")) continue;
		const isTwoStep = def.confirmation === "twoStep" || def.needsApproval !== undefined;
		if (!isTwoStep) continue;

		const commitName = `commit_${name}`;
		const commitDef = REGISTRY.get(commitName);
		if (!commitDef) {
			// Not every twoStep tool has a discrete commit — some use the
			// AI-SDK-native `needsApproval` HITL path where the same tool
			// is invoked twice (once previewed, once approved). Skip.
			continue;
		}

		const proposeFields = extractTopLevelObjectFields(def.schema);
		const commitFields = extractTopLevelObjectFields(commitDef.schema);

		if (proposeFields === null || commitFields === null) {
			findings.push({
				pair: `${name} ↔ ${commitName}`,
				proposeOnly: [],
				commitOnly: [],
				note: "Skipped — at least one schema is not a z.object() root.",
			});
			continue;
		}

		const proposeOnly = proposeFields.filter((f) => !commitFields.includes(f));
		const commitOnly = commitFields.filter((f) => !proposeFields.includes(f));

		if (proposeOnly.length === 0 && commitOnly.length === 0) continue;

		findings.push({
			pair: `${name} ↔ ${commitName}`,
			proposeOnly,
			commitOnly,
		});
	}

	if (findings.length > 0) {
		const lines = findings.map((f) => {
			if (f.note) return `  • ${f.pair}: ${f.note}`;
			const parts: string[] = [];
			if (f.proposeOnly.length > 0) parts.push(`propose-only: ${f.proposeOnly.join(", ")}`);
			if (f.commitOnly.length > 0) parts.push(`commit-only: ${f.commitOnly.join(", ")}`);
			return `  • ${f.pair} — ${parts.join("; ")}`;
		});
		console.warn(
			[
				"[toolRegistry] propose/commit schema diff (C.4 audit):",
				...lines,
				"  Note: some propose-only fields are intentional UI display props (e.g. `name` for a propose card).",
				"  Review each row and confirm the missing field is not user-supplied data the commit step would silently drop.",
			].join("\n"),
		);
	}

	return findings;
}

/**
 * Top-level field names of a `z.object({...})` schema. Returns `null`
 * when the schema is not a `ZodObject` (lazy schema, root union, etc.).
 * The Zod 3+ shape accessor is `_def.shape()` (function) on older
 * minor versions and a getter on `.shape` on newer ones — try both.
 */
function extractTopLevelObjectFields(schema: unknown): string[] | null {
	if (!schema || typeof schema !== "object") return null;
	// Try `.shape` first — current zod releases expose it as a getter.
	const direct = (schema as { shape?: unknown }).shape;
	if (direct && typeof direct === "object") {
		return Object.keys(direct as Record<string, unknown>).sort();
	}
	// Fallback: legacy `_def.shape()` thunk.
	const def = (schema as { _def?: { shape?: unknown } })._def;
	if (def && typeof def === "object") {
		const shapeFn = (def as { shape?: unknown }).shape;
		if (typeof shapeFn === "function") {
			try {
				const shape = (shapeFn as () => Record<string, unknown>)();
				if (shape && typeof shape === "object") return Object.keys(shape).sort();
			} catch {
				return null;
			}
		}
		if (shapeFn && typeof shapeFn === "object") {
			return Object.keys(shapeFn as Record<string, unknown>).sort();
		}
	}
	return null;
}

// ─── expand_tools meta-tool ────────────────────────────────────────────────────

const LAYER_DESCRIPTIONS: Record<LayerId, string> = {
	always: "Core CRM tools (always active).",
	pipelines:
		"Pipeline and stage management (move stages, add/edit/remove/reorder stages, set default, reopen-deal, lead-status moves, create pipelines).",
	fields: "Custom field management (create, update, archive field definitions).",
	tags: "Tag management (create, attach, detach, update, delete tags).",
	views: "Saved view management (create, pin, update, delete saved views).",
	categories: "Note category management (create, rename, archive, reorder).",
	members:
		"Member, invitation, and custom-role management (invite/resend, change role, remove members, create/update/delete custom roles).",
	settings:
		"Workspace settings (rename entities, set currency/timezone, visibility, reminder defaults).",
	bulk: "Bulk operations (update/tag/assign/close many records at once). REQUIRES CONFIRMATION.",
	templates: "Workspace template operations (list, apply, clear sample data).",
	data: "Trash and restore (view deleted records, restore, permanently delete).",
	messaging:
		"Messaging and conversations (send messages, read threads, mark as read, manage participants).",
	files: "File management (list files attached to records, update tags on a file, soft-delete a file).",
	timeline: "Org-wide activity feed (list_org_timeline for 'what happened today?' questions).",
	notifications:
		"Per-user notifications (list_notifications, mark_notification_read for the calling user).",
	analytics:
		"AI analytical tools (analyze_metric, cohort_analysis, member_performance, get_briefing, refresh_briefing). Quota-gated narratives + cohort rollups + per-member rollups + briefing on demand.",
	creative:
		"AI creative drafting tools (draft_message, draft_proposal, summarise_conversation, web_scrape). Drafts are NEVER auto-sent — the user reviews + dispatches via send_message themselves. Quota: 5/min/user + 50/day/user (web_scrape: 30/min/user).",
};

// Registered at bottom of this file so it's always included
const expandToolsDef: ToolDef = {
	name: "expand_tools",
	layer: "always",
	permission: "ai.expandTools",
	confirmation: "none",
	description: `
Load a layer of advanced tools when the user's request needs them.
Available layers: pipelines, fields, tags, views, categories, members, settings, bulk, templates, data, messaging, files, timeline, notifications, analytics, creative.
Call this BEFORE attempting an action that isn't in the always-on layer.
This tool does NOT execute any DB operations — it only unlocks new capabilities.

Tip: read-only questions ("what fields are on leads?", "what are the
pipeline stages?", "can I do X?") almost never need a layer expansion —
use list_entity_fields, list_pipelines, or list_my_permissions first.
  `.trim(),
	schema: z.object({
		layer: z.enum([
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
			"messaging",
			"files",
			"timeline",
			"notifications",
			"analytics",
			"creative",
		]),
		reason: z
			.string()
			.describe("One sentence: why this layer is needed for the current request."),
	}),
	execute: async ({ layer }: { layer: LayerId }) => {
		// The actual layer expansion is handled by processChat, which re-calls
		// getToolsForRequest() with the updated expandedLayers list.
		// This execute just signals intent.
		//
		// Week 1 #1.2 — filter the listed tools by the same gates that
		// `getToolsForRequest` will apply on the next turn (permission +
		// premium capability) so the model gets an honest preview of what it
		// can call, NOT the full registry view. Pre-fix the meta-tool said
		// "you now have create_field" even when the model+permission combo
		// would still strip it on the next turn, which produced a "tool not
		// found" infinite loop on small models (audit §1, row 2).
		const reqCtx = _activeRequestContext;
		const filtered = Array.from(REGISTRY.values()).filter((t) => {
			if (t.layer !== layer) return false;
			// If we somehow run without a request context (shouldn't happen
			// in production — every processChat run sets it), fall back to
			// listing every tool in the layer. Better to over-list than to
			// hide tools.
			if (!reqCtx) return true;
			// Treat the layer as expanded for the purposes of this preview —
			// the orchestrator will mark it expanded after this execute()
			// returns.
			const previewExpanded = reqCtx.expandedLayers.includes(layer)
				? reqCtx.expandedLayers
				: [...reqCtx.expandedLayers, layer];
			return isToolExposed(t, {
				permissions: reqCtx.permissions,
				modelTier: reqCtx.modelTier,
				expandedLayers: previewExpanded,
			});
		});
		const toolsInLayer = filtered.map((t) => ({
			name: t.name,
			description: t.description.slice(0, 100),
		}));
		const totalInLayer = Array.from(REGISTRY.values()).filter((t) => t.layer === layer).length;
		const hidden = totalInLayer - toolsInLayer.length;
		return {
			activated: layer,
			description: LAYER_DESCRIPTIONS[layer],
			tools: toolsInLayer,
			hint:
				hidden > 0
					? `Now use these tools to fulfil the user's request. ${hidden} tool(s) in this layer aren't available to your role/model — don't try to call them.`
					: `Now use these tools to fulfil the user's request. You have the ${layer} layer active.`,
		};
	},
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the ai-sdk `tools` object for a specific request.
 * Filters by: layer membership, permission, model capability.
 *
 * Side effect: stamps the request context onto the module-level holder so
 * `expand_tools.execute` can apply the same filters when listing tools.
 * Callers MUST call `clearActiveRequestContext()` after the agent loop.
 */
export function getToolsForRequest(args: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
}): Record<string, unknown> {
	// C.4 — run the propose/commit schema audit once per process. Cheap
	// (walks REGISTRY in O(n)), warn-only, never throws. Catches the
	// silent-data-loss class of bugs where a propose schema collects
	// fields the commit schema never reads. See `runProposeCommitSchemaAudit`.
	runProposeCommitSchemaAudit();

	const { permissions, modelTier, expandedLayers } = args;
	const result: Record<string, unknown> = {};

	// Stamp the request context so expand_tools can read it.
	setActiveRequestContext({ permissions, modelTier, expandedLayers });

	// Always include the meta-tool
	if (permissions.includes("ai.expandTools")) {
		result[expandToolsDef.name] = tool({
			description: expandToolsDef.description,
			inputSchema: expandToolsDef.schema,
			execute: wrapWithZodErrorFormatter(
				expandToolsDef.name,
				expandToolsDef.execute,
				expandToolsDef.example,
			),
		});
	}

	for (const [name, def] of REGISTRY) {
		if (name === "expand_tools") continue; // already handled above

		if (!isToolExposed(def, { permissions, modelTier, expandedLayers })) continue;

		result[name] = tool({
			description: def.description,
			inputSchema: def.schema,
			execute: wrapWithZodErrorFormatter(name, def.execute, def.example),
		});
	}

	return result;
}

/**
 * Get a list of tool names that would be available (for system prompt text).
 */
export function getAvailableToolNames(args: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
}): string[] {
	return Object.keys(getToolsForRequest(args));
}

/**
 * Return the runbook entries for every tool active in the request, in
 * registry-iteration order. The system-prompt builder formats this into
 * the `## Tool Runbooks` section so the model reads guidance for the
 * exact tools currently exposed to it — no more, no less.
 *
 * Tools without a `runbook` are skipped (so adding the field is opt-in
 * per tool). The `expand_tools` meta-tool is also skipped — its
 * behaviour is described in its description field, not via runbook.
 */
export function getActiveRunbooks(args: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
}): Array<{ name: string; runbook: ToolRunbook }> {
	const out: Array<{ name: string; runbook: ToolRunbook }> = [];

	for (const [name, def] of REGISTRY) {
		if (name === "expand_tools") continue;
		if (!isToolExposed(def, args)) continue;
		if (!def.runbook) continue;
		// Skip runbooks that are entirely empty (all fields undefined)
		const r = def.runbook;
		if (
			!r.onSuccess &&
			!r.onValidationError &&
			!r.onEmpty &&
			!r.onPermissionDenied &&
			!r.onPartialSuccess &&
			!r.suggestNext
		) {
			continue;
		}
		out.push({ name, runbook: def.runbook });
	}
	return out;
}

/**
 * Format the active runbooks into a markdown block that the system
 * prompt builder appends to the prompt. Returns an empty string when
 * no active tool has a runbook (so we don't ship an empty header).
 */
export function formatRunbooksBlock(
	entries: Array<{ name: string; runbook: ToolRunbook }>,
): string {
	if (entries.length === 0) return "";
	const lines: string[] = ["## Tool Runbooks", ""];
	lines.push(
		"For each tool, follow these one-line policies. They override generic defaults:",
		"",
	);
	for (const { name, runbook } of entries) {
		lines.push(`**${name}**`);
		if (runbook.onSuccess) lines.push(`  - On success: ${runbook.onSuccess}`);
		if (runbook.onValidationError)
			lines.push(`  - On validation error: ${runbook.onValidationError}`);
		if (runbook.onEmpty) lines.push(`  - On empty result: ${runbook.onEmpty}`);
		if (runbook.onPermissionDenied)
			lines.push(`  - On permission denied: ${runbook.onPermissionDenied}`);
		if (runbook.onPartialSuccess)
			lines.push(`  - On partial success: ${runbook.onPartialSuccess}`);
		if (runbook.suggestNext) lines.push(`  - Suggest next: \`${runbook.suggestNext}\``);
		lines.push("");
	}
	return lines.join("\n").trim();
}

// Self-register the expand_tools meta-tool
REGISTRY.set("expand_tools", expandToolsDef);

/**
 * Week 3.3 — resolve whether a given tool call requires user approval
 * before executing. Combines:
 *   - The new `needsApproval: boolean | (args)=>boolean` field.
 *   - The legacy `confirmation: "twoStep"` field (backward compat
 *     during the migration window).
 *   - **Post-sprint (2026-05-26)** — per-user `aiApprovals` preferences
 *     keyed by `approvalCategory`. Hard-locked categories
 *     (`bulk` / `settings` / `members`) cannot be bypassed by user
 *     preferences. Tools with `alwaysAsk: true` always require approval
 *     regardless of category or preferences.
 *
 * Used by `streamLoop.ts` to decide whether to insert a pending
 * confirmation row (twoStep flow) or run `execute` immediately.
 *
 * Always returns a boolean, never throws — a misbehaving function-form
 * `needsApproval` is treated as "approve to be safe" rather than
 * silently letting a write through.
 *
 * @param userAutoApprove Optional pre-resolved auto-approve map (from
 *   `resolveEffectiveAutoApprove(prefs.aiApprovals)` in `run.ts`). When
 *   undefined, the gate ignores preferences and falls back to the
 *   tool's declared confirmation — same as before this feature shipped.
 */
export function resolveNeedsApproval(
	toolName: string,
	args: Record<string, unknown>,
	userAutoApprove?: Partial<
		Record<import("../_shared/aiApprovals").UserToggleableCategory, boolean>
	>,
): boolean {
	const def = REGISTRY.get(toolName);
	if (!def) return false; // unknown tool — let the SDK reject it

	// ── HARD RULES (cannot be overridden by preferences) ──
	// 1. ask_user_input / ask_user_choice MUST always ask.
	if (def.alwaysAsk === true) return true;
	// 2. Hard-locked categories always ask.
	if (def.approvalCategory) {
		// Lazy import dance: this file is imported by frontend code via
		// `_generated/api`, so we cannot pull from `../_shared/aiApprovals`
		// at module scope without breaking the build. Inline the literal
		// set here — `aiApprovals.ts` is the SSOT but this is the cheapest
		// possible hot-path check on every tool call.
		if (
			def.approvalCategory === "bulk" ||
			def.approvalCategory === "settings" ||
			def.approvalCategory === "members"
		) {
			return true;
		}
	}

	// ── Tool didn't request approval at all → run atomically ──
	const declaredApproval =
		def.confirmation === "twoStep" ||
		def.needsApproval === true ||
		typeof def.needsApproval === "function";
	if (!declaredApproval) return false;

	// ── User preference override (only for user-toggleable categories) ──
	if (userAutoApprove && def.approvalCategory && def.approvalCategory !== "ask_user") {
		const cat = def.approvalCategory as import("../_shared/aiApprovals").UserToggleableCategory;
		const userValue = userAutoApprove[cat];
		if (userValue === true) return false; // user opted IN to auto-approve
		if (userValue === false) return true; // user explicitly forced ask
		// undefined → fall through to declared logic (uses default elsewhere)
	}

	// ── Function-form needsApproval (dynamic — e.g. "auto-approve under 50 rows") ──
	const na = def.needsApproval;
	if (typeof na === "function") {
		try {
			return na(args ?? {}) === true;
		} catch (err) {
			console.warn(
				`[toolRegistry] needsApproval(${toolName}) threw — defaulting to true:`,
				err,
			);
			return true;
		}
	}

	// ── Static declaration says ask ──
	return true;
}
