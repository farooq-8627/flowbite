/**
 * convex/ai/systemPrompt.ts
 *
 * 3-layer system prompt builder.
 *   Layer 1 — PLATFORM CONTEXT (from platformContext table; same for everyone)
 *   Layer 2 — ORG CONTEXT (org name, industry, entity labels, pipelines, custom fields)
 *   Layer 3 — ROUTE/ENTITY CONTEXT (entity aiContext blob when user is on an entity page)
 *
 * Week 2.4 (`PHASE-3-AI-AUDIT.md §6 Week 2`): builder takes a `subagent`
 * argument. The subagent's `systemPromptHint` is appended verbatim and the
 * tool-runbooks block only emits runbooks for tools the subagent allows.
 *
 * Week 3.2 (`PHASE-3-AI-AUDIT.md §6 Week 3`): builder takes a `contextBag`
 * snapshot. The bag is rendered as a "## Facts already known" section so
 * the model never has to re-ask for facts the user already supplied.
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ModelTier } from "./models";
import { getSubagent, type SubagentId } from "./subagents";
import { formatRunbooksBlock, getActiveRunbooks } from "./toolRegistry";

export type RouteContext = {
	entityType: string;
	entityId: string;
	personCode?: string;
	dealCode?: string;
	name?: string;
	aiContextSummary?: string;
	aiContextKeyFacts?: string[];
};

export type SystemPromptResult = {
	system: string;
	allowedLayers: string[];
	subagentId: SubagentId;
};

/**
 * Build the full system prompt for a request.
 *
 * @param ctx - Convex QueryCtx (read-only; called from inside processChat internalAction via runQuery)
 * @param args.orgId - The org being served
 * @param args.userId - The calling user
 * @param args.permissions - Resolved permissions array from org member role
 * @param args.modelTier - Resolved model tier (small/standard/premium)
 * @param args.routeContext - Optional entity context from current page (free, no tokens)
 * @param args.autoContextLoad - User preference: whether to inject entity context
 * @param args.expandedLayers - Tool layers already expanded for this conversation
 * @param args.subagentId - The subagent the router selected for this turn (Week 2.4).
 *                          When omitted, falls back to `crm_action`.
 * @param args.contextBag - Per-conversation typed facts (Week 3.2). Injected as
 *                          "Facts already known" so the model doesn't re-ask.
 */
export async function buildSystemPrompt(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		permissions: string[];
		modelTier: ModelTier;
		routeContext?: RouteContext | null;
		autoContextLoad?: boolean;
		expandedLayers?: string[];
		subagentId?: SubagentId;
		contextBag?: Record<string, unknown> | null;
	},
): Promise<SystemPromptResult> {
	const parts: string[] = [];
	const subagent = getSubagent(args.subagentId);

	// ── Layer 1: Platform context ───────────────────────────────────────────
	const platform = await ctx.db
		.query("platformContext")
		.withIndex("by_key", (q) => q.eq("key", "main"))
		.unique();

	if (platform) {
		parts.push(platform.content);
		if (platform.rules?.length) {
			parts.push(`\n## Platform Rules\n${platform.rules.map((r) => `- ${r}`).join("\n")}`);
		}
	}

	// ── Subagent hint (Week 2.4) ────────────────────────────────────────────
	// Injected immediately after platform context so it sets the role for
	// the rest of the prompt. Tool runbooks emitted later will be filtered
	// to the subagent's allowed tools.
	parts.push(
		`## Active Specialist: ${subagent.displayName}\n\n${subagent.systemPromptHint}`,
	);

	// ── Layer 2: Org context ────────────────────────────────────────────────
	const org = await ctx.db.get(args.orgId);
	if (!org) throw new Error("Org not found");

	const entityLabels = org.entityLabels ?? {};
	const lead = (entityLabels as Record<string, { singular?: string }>)?.lead?.singular ?? "Lead";
	const contact =
		(entityLabels as Record<string, { singular?: string }>)?.contact?.singular ?? "Contact";
	const deal = (entityLabels as Record<string, { singular?: string }>)?.deal?.singular ?? "Deal";
	const company =
		(entityLabels as Record<string, { singular?: string }>)?.company?.singular ?? "Company";

	parts.push(
		`
## Workspace Context

**Name:** ${org.name}
**Industry:** ${org.industry ?? "General"}
**Currency:** ${org.settings?.defaultCurrency ?? "USD"}
**Timezone:** ${org.settings?.timezone ?? "UTC"}

**Entity names:** ${lead} / ${contact} / ${deal} / ${company}
`.trim(),
	);

	// Active pipelines (names + stage names only — not deal data)
	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
		.take(10);

	if (pipelines.length > 0) {
		const pipelineLines = pipelines.map((p) => {
			const stages = ((p.stages as Array<{ name: string; code: string }>) ?? [])
				.map((s) => s.name)
				.join(" → ");
			return `- ${p.name}: ${stages}`;
		});
		parts.push(`\n**Pipelines:**\n${pipelineLines.join("\n")}`);
	}

	// Active field definitions (names + types only)
	const fields = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
		.take(50);

	if (fields.length > 0) {
		const fieldLines = fields.map(
			(f) =>
				`- ${f.label} (${f.entityType}, ${(f as unknown as { fieldType?: string }).fieldType ?? "text"})`,
		);
		parts.push(`\n**Custom fields:**\n${fieldLines.join("\n")}`);
	}

	// User's name
	const user = await ctx.db.get(args.userId);
	if (user?.name) {
		parts.push(`\n**You are assisting:** ${user.name}`);
	}

	// ── Permission summary ──────────────────────────────────────────────────
	const canCreate = args.permissions.some((p) => p.endsWith(".create"));
	const canDelete = args.permissions.some((p) => p.endsWith(".delete"));
	const isAdmin = args.permissions.includes("org.editSettings");

	parts.push(
		`
## Your Permissions

- Create records: ${canCreate ? "YES" : "NO"}
- Delete records: ${canDelete ? "YES" : "NO"}
- Edit workspace settings: ${isAdmin ? "YES" : "NO"}
- Full permission list: ${args.permissions.join(", ")}

You ONLY perform actions the user has permission to do. If a requested action requires a permission the user lacks, explain politely and do NOT call that tool.
`.trim(),
	);

	// ── Model capability disclaimer ─────────────────────────────────────────
	// DEFERRED: see Future-Enhancements.md §A.4 — while the per-tool premium
	//          gate (§A.2) is OFF for testing, the previous "you cannot use
	//          premium tools" notice would lie to the model. We keep the
	//          tier-aware advice block so the model still gets a hint that a
	//          smaller model should be extra careful with destructive tools,
	//          but we don't claim those tools are unavailable.
	if (args.modelTier === "small") {
		parts.push(
			`
## Model Capability Notice

You're running on a lightweight model. You DO have access to every tool the user's role allows, but please:
- Always show a preview before any write (every destructive tool is two-step).
- Prefer narrow filters on bulk operations — never close all deals or update all leads without an explicit user-supplied filter.
- For settings or label changes, double-confirm intent before calling \`update_org_settings\` or \`rename_entity_labels\`.
`.trim(),
		);
	}

	// ── Layer 3: Route/entity context ───────────────────────────────────────
	const injectContext = args.autoContextLoad !== false && args.routeContext;
	if (injectContext && args.routeContext) {
		const rc = args.routeContext;
		const contextParts = [
			`\n## Current Entity Context\n`,
			`The user is currently viewing: **${rc.name ?? rc.personCode ?? rc.entityId}** (${rc.entityType})`,
		];
		if (rc.personCode) contextParts.push(`Code: ${rc.personCode}`);
		if (rc.dealCode) contextParts.push(`Code: ${rc.dealCode}`);
		if (rc.aiContextSummary) {
			contextParts.push(`\n**AI Summary:** ${rc.aiContextSummary}`);
		}
		if (rc.aiContextKeyFacts?.length) {
			contextParts.push(
				`\n**Key facts:**\n${rc.aiContextKeyFacts.map((f) => `- ${f}`).join("\n")}`,
			);
		}
		contextParts.push(
			`\nUse this context for entity-specific questions. You do NOT need to call get_entity_detail for this entity — the context is already loaded.`,
		);
		parts.push(contextParts.join("\n"));
	}

	// ── Tool layer summary ──────────────────────────────────────────────────
	const expanded = args.expandedLayers ?? [];
	parts.push(
		`
## Available Tool Layers

Active layers: always-on${expanded.length ? `, ${expanded.join(", ")}` : ""}

To access advanced tools (pipelines, fields, tags, views, categories, members, settings, bulk, templates, data), call the expand_tools tool first with the layer name and the reason you need it.
`.trim(),
	);

	// ── Per-tool runbooks (Sprint 4) ────────────────────────────────────────
	// Inject ONE-line behavioural policies for every active tool. Cost
	// scales with the active set: ~30-80 tokens per tool with a runbook.
	// Tools without a `runbook` field are silently skipped, so this is
	// opt-in per tool.
	//
	// Week 2.4 — runbooks are filtered to the subagent's allow-list so a
	// `qa` turn doesn't waste tokens on `bulk_update` runbook text.
	const runbooks = getActiveRunbooks({
		permissions: args.permissions,
		modelTier: args.modelTier,
		expandedLayers: expanded,
	});
	const filteredRunbooks =
		subagent.allowedTools === "*"
			? runbooks
			: (() => {
					const allow = new Set([...subagent.allowedTools, "set_context_var"]);
					return runbooks.filter((r) => allow.has(r.name));
				})();
	const runbooksBlock = formatRunbooksBlock(filteredRunbooks);
	if (runbooksBlock) parts.push(runbooksBlock);

	// ── Facts already known (Week 3.2 — contextBag) ─────────────────────────
	// Salesforce L4 variables / `PHASE-3-AI-AUDIT.md §6 Week 3`. Injected
	// near the bottom so it's the freshest context the model reads
	// before the date stamp. Empty bag = nothing emitted (no header).
	const bag = args.contextBag ?? {};
	const bagEntries = Object.entries(bag).filter(([, v]) => v !== undefined && v !== null);
	if (bagEntries.length > 0) {
		const lines = bagEntries.map(([k, v]) => {
			const rendered =
				typeof v === "string"
					? v
					: typeof v === "number" || typeof v === "boolean"
						? String(v)
						: JSON.stringify(v);
			return `- ${k} = ${rendered}`;
		});
		parts.push(
			[
				"## Facts already known",
				"",
				"You persisted these in earlier turns via set_context_var. Treat them as ground truth — don't re-ask the user.",
				"",
				...lines,
			].join("\n"),
		);
	}

	// ── Today's date ────────────────────────────────────────────────────────
	parts.push(`\n**Current date/time:** ${new Date().toISOString()}`);

	return {
		system: parts.join("\n\n"),
		allowedLayers: expanded,
		subagentId: subagent.id,
	};
}

/**
 * Build a minimal system prompt for the AI Morning Briefing generator.
 * Short + cheap — used with Haiku model.
 */
export async function buildBriefingPrompt(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
): Promise<string> {
	const org = await ctx.db.get(args.orgId);
	const user = await ctx.db.get(args.userId);
	return `You are a concise business briefing assistant for ${org?.name ?? "this workspace"}.
Generate a short morning briefing for ${user?.name ?? "the user"} based on the data provided.
Use plain, professional language. Be specific about names and numbers. 2–4 sentences max per section.
Today is ${new Date().toISOString().slice(0, 10)}.`;
}

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Internal query wrapper for buildSystemPrompt.
 * Called by processChat via ctx.runQuery to access DB inside the Node.js action.
 */
export const buildSystemPromptQuery = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		permissions: v.array(v.string()),
		modelTier: v.union(v.literal("small"), v.literal("standard"), v.literal("premium")),
		routeContext: v.optional(
			v.union(
				v.null(),
				v.object({
					entityType: v.string(),
					entityId: v.string(),
					personCode: v.optional(v.string()),
					dealCode: v.optional(v.string()),
					name: v.optional(v.string()),
					aiContextSummary: v.optional(v.string()),
					aiContextKeyFacts: v.optional(v.array(v.string())),
				}),
			),
		),
		autoContextLoad: v.optional(v.boolean()),
		expandedLayers: v.optional(v.array(v.string())),
		// Week 2.4 — subagent classification result from router.ts.
		subagentId: v.optional(v.string()),
		// Week 3.2 — typed conversational state. Free-shape so any
		// (snake_case key, JSON-serialisable value) pair fits.
		contextBag: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		return buildSystemPrompt(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			permissions: args.permissions,
			modelTier: args.modelTier,
			routeContext: args.routeContext ?? null,
			autoContextLoad: args.autoContextLoad ?? true,
			expandedLayers: args.expandedLayers ?? [],
			subagentId: args.subagentId as SubagentId | undefined,
			contextBag: (args.contextBag ?? null) as Record<string, unknown> | null,
		});
	},
});
