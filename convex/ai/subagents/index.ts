/**
 * convex/ai/subagents/index.ts
 *
 * Subagent registry (`PHASE-3-AI-AUDIT.md §6 Week 2.1`).
 *
 * - `SUBAGENTS` is the canonical map. New subagents land here.
 * - `getSubagent(id)` resolves an id with a fallback so the router can
 *   never return an invalid value.
 * - `selectToolsForSubagent(allTools, subagent)` filters a tool dictionary
 *   produced by `getToolsForRequest()` down to only the subagent's
 *   allow-list. `"*"` (wildcard) returns the original dictionary unchanged.
 * - `ALWAYS_INCLUDED_TOOLS` lists the tools every subagent gets regardless
 *   of its `allowedTools`: meta-tools the orchestrator depends on (the
 *   `expand_tools` meta tool stays callable even from `qa` so the model
 *   can ask for the right specialist via routing on the next turn).
 */

import { crmActionSubagent } from "./crmAction";
import { csvImportSubagent } from "./csvImport";
import { enrichmentSubagent } from "./enrichment";
import { qaSubagent } from "./qa";
import { settingsSubagent } from "./settings";
import type { Subagent, SubagentId } from "./types";

export const SUBAGENTS: Readonly<Record<SubagentId, Subagent>> = {
	crm_action: crmActionSubagent,
	qa: qaSubagent,
	enrichment: enrichmentSubagent,
	csv_import: csvImportSubagent,
	settings: settingsSubagent,
} as const;

export const SUBAGENT_IDS: readonly SubagentId[] = Object.keys(SUBAGENTS) as SubagentId[];

/** Default subagent when the router has low confidence or returns garbage. */
export const FALLBACK_SUBAGENT_ID: SubagentId = "crm_action";

/**
 * Tools every subagent gets regardless of its allow-list. Keep this set
 * MINIMAL — every entry adds prompt overhead to subagents that don't
 * need it. The introspection tools (`list_*`) are NOT included here;
 * subagents add them explicitly when they need them.
 *
 * `set_context_var` (Week 3.2) is included so any subagent can persist
 * facts the user provides during the thread.
 */
export const ALWAYS_INCLUDED_TOOLS = ["set_context_var"] as const;

export function getSubagent(id: string | null | undefined): Subagent {
	if (!id) return SUBAGENTS[FALLBACK_SUBAGENT_ID];
	return SUBAGENTS[id as SubagentId] ?? SUBAGENTS[FALLBACK_SUBAGENT_ID];
}

/**
 * Resolve a subagent id, demoting to the fallback when the user lacks
 * one of its `requiredPermissions`. Returns the actually-used subagent
 * + a flag indicating whether a demotion happened (for telemetry).
 */
export function resolveSubagentForUser(args: {
	requested: SubagentId;
	permissions: string[];
}): { subagent: Subagent; demoted: boolean } {
	const sub = getSubagent(args.requested);
	const missing = sub.requiredPermissions.filter((p) => !args.permissions.includes(p));
	if (missing.length > 0) {
		return { subagent: SUBAGENTS[FALLBACK_SUBAGENT_ID], demoted: true };
	}
	return { subagent: sub, demoted: false };
}

/**
 * Filter a tool dictionary (the output of
 * `toolRegistry.getToolsForRequest`) down to ONLY the tools the subagent
 * declares. Wildcard `"*"` returns the original dictionary unchanged.
 *
 * Tools listed in `ALWAYS_INCLUDED_TOOLS` survive the filter so the
 * orchestrator's meta-tools (e.g. `set_context_var`) work in every
 * subagent. If a tool name in the subagent's allow-list is not present
 * in the input dictionary (because the role/tier filter already
 * stripped it), it is silently dropped — that matches the existing
 * "missing tool = silent omit" semantics of `getToolsForRequest`.
 */
export function selectToolsForSubagent(
	allTools: Record<string, unknown>,
	subagent: Subagent,
): Record<string, unknown> {
	if (subagent.allowedTools === "*") return allTools;
	const allow = new Set<string>([
		...subagent.allowedTools,
		...ALWAYS_INCLUDED_TOOLS,
	]);
	const result: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(allTools)) {
		if (allow.has(name)) result[name] = def;
	}
	return result;
}

export type { Subagent, SubagentId } from "./types";
