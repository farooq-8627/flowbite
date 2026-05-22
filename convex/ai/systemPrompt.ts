/**
 * convex/ai/systemPrompt.ts
 *
 * 3-layer system prompt builder.
 *   Layer 1 — PLATFORM CONTEXT (from platformContext table; same for everyone)
 *   Layer 2 — ORG CONTEXT (org name, industry, entity labels, pipelines, custom fields)
 *   Layer 3 — ROUTE/ENTITY CONTEXT (entity aiContext blob when user is on an entity page)
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ModelTier } from "./models";

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
	},
): Promise<SystemPromptResult> {
	const parts: string[] = [];

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
	if (args.modelTier === "small") {
		parts.push(
			`
## Model Capability Notice

You are running on a lightweight model. The following advanced capabilities are NOT available to you in this session:
- Bulk operations (bulk_update, bulk_tag, bulk_assign, bulk_close_deals)
- Pipeline restructuring (create_pipeline, add_stage, archive_pipeline)
- Settings changes (update_org_settings, rename_entity_labels, set_module_visibility)
- Always show a preview before any write. Do not attempt premium tools.
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

	// ── Today's date ────────────────────────────────────────────────────────
	parts.push(`\n**Current date/time:** ${new Date().toISOString()}`);

	return {
		system: parts.join("\n\n"),
		allowedLayers: expanded,
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
		autoContextLoad: v.optional(v.boolean()),
		expandedLayers: v.optional(v.array(v.string())),
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
		});
	},
});
