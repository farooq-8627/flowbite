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
	| "data";

export type ToolDef = {
	name: string;
	description: string;
	layer: LayerId;
	/** Permission key the calling user must hold. null = no perm check (read-only public). */
	permission: string | null;
	/** If "premium", only expose to standard/premium-tier models. */
	requiredCapability?: "premium";
	/** If "twoStep", AI calls propose_* first, then commit_* on approval. */
	confirmation?: "none" | "twoStep";
	// biome-ignore lint: intentional any for tool execute return
	schema: z.ZodSchema<any>;
	// biome-ignore lint: intentional any for tool execute
	execute: (input: any) => Promise<unknown>;
};

const REGISTRY = new Map<string, ToolDef>();

/** Register a tool definition. Called from each tool module at import time. */
export function registerTool(def: ToolDef): void {
	REGISTRY.set(def.name, def);
}

// ─── expand_tools meta-tool ────────────────────────────────────────────────────

const LAYER_DESCRIPTIONS: Record<LayerId, string> = {
	always: "Core CRM tools (always active).",
	pipelines: "Pipeline and stage management (move stages, add/archive stages, create pipelines).",
	fields: "Custom field management (create, update, archive field definitions).",
	tags: "Tag management (create, attach, detach, delete tags).",
	views: "Saved view management (create, pin, delete saved views).",
	categories: "Note category management (create, rename, archive, reorder).",
	members: "Member and invitation management (invite, change role, remove members).",
	settings:
		"Workspace settings (rename entities, set currency/timezone, visibility, reminder defaults).",
	bulk: "Bulk operations (update/tag/assign/close many records at once). REQUIRES CONFIRMATION.",
	templates: "Workspace template operations (list, apply, clear sample data).",
	data: "Trash and restore (view deleted records, restore, permanently delete).",
};

// Registered at bottom of this file so it's always included
const expandToolsDef: ToolDef = {
	name: "expand_tools",
	layer: "always",
	permission: "ai.expandTools",
	confirmation: "none",
	description: `
Load a layer of advanced tools when the user's request needs them.
Available layers: pipelines, fields, tags, views, categories, members, settings, bulk, templates, data.
Call this BEFORE attempting an action that isn't in the always-on layer.
This tool does NOT execute any DB operations — it only unlocks new capabilities.
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
		]),
		reason: z
			.string()
			.describe("One sentence: why this layer is needed for the current request."),
	}),
	execute: async ({ layer }: { layer: LayerId }) => {
		// The actual layer expansion is handled by processChat, which re-calls
		// getToolsForRequest() with the updated expandedLayers list.
		// This execute just signals intent.
		const toolsInLayer = Array.from(REGISTRY.values())
			.filter((t) => t.layer === layer)
			.map((t) => ({ name: t.name, description: t.description.slice(0, 100) }));
		return {
			activated: layer,
			description: LAYER_DESCRIPTIONS[layer],
			tools: toolsInLayer,
			hint: `Now use these tools to fulfil the user's request. You have the ${layer} layer active.`,
		};
	},
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the ai-sdk `tools` object for a specific request.
 * Filters by: layer membership, permission, model capability.
 */
export function getToolsForRequest(args: {
	permissions: string[];
	modelTier: ModelTier;
	expandedLayers: string[];
}): Record<string, unknown> {
	const { permissions, modelTier, expandedLayers } = args;
	const expandedSet = new Set(expandedLayers);
	const result: Record<string, unknown> = {};

	// Always include the meta-tool
	if (permissions.includes("ai.expandTools")) {
		result[expandToolsDef.name] = tool({
			description: expandToolsDef.description,
			parameters: expandToolsDef.schema,
			execute: expandToolsDef.execute,
		});
	}

	for (const [name, def] of REGISTRY) {
		if (name === "expand_tools") continue; // already handled above

		// Layer filter: include if always-on or in expanded set
		if (def.layer !== "always" && !expandedSet.has(def.layer)) continue;

		// Permission filter
		if (def.permission && !permissions.includes(def.permission)) continue;

		// Capability filter: premium tools require standard+ model
		if (def.requiredCapability === "premium" && modelTier === "small") continue;

		result[name] = tool({
			description: def.description,
			parameters: def.schema,
			execute: def.execute,
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

// Self-register the expand_tools meta-tool
REGISTRY.set("expand_tools", expandToolsDef);
