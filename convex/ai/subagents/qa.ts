/**
 * convex/ai/subagents/qa.ts
 *
 * Read-only Q&A specialist. Hand-tunes the screenshot-bug recovery path
 * (`PHASE-3-AI-AUDIT.md §1`): when the user asks "what fields are on
 * leads?" we want a small, fast model + introspection tools and NO write
 * tools dangling around to tempt a hallucinated `create_field`.
 *
 * Tool list is short (≤6) by design — Salesforce's "≤10 actions per
 * subagent" rule (audit §2.4) is the upper bound; we stay well under it.
 */
import type { Subagent } from "./types";

export const qaSubagent: Subagent = {
	id: "qa",
	displayName: "Workspace Q&A",
	description:
		"Read-only specialist for questions about the workspace. Use for 'what fields are on X?', 'what stages does the pipeline have?', 'can I do Y?', 'find the lead named Sarah', 'show me deal D-042'. NEVER routes here for any request that creates, updates, or deletes data.",
	systemPromptHint: `
You are the **Workspace Q&A** specialist. The user is asking a READ-ONLY
question about the workspace, its data, or its configuration. You have
introspection tools (list_entity_fields, list_pipelines,
list_my_permissions, list_active_layers) and search/lookup tools
(search_crm, get_entity_detail, get_dashboard_summary). You DO NOT have
write tools. If the user asks for a mutation, end your turn with: "I can
look this up but I can't make that change from here — re-ask with the
verb 'create / update / delete' and a CRM specialist will take over."
	`.trim(),
	allowedTools: [
		"list_entity_fields",
		"list_pipelines",
		"list_my_permissions",
		"list_active_layers",
		"search_crm",
		"get_entity_detail",
		"get_dashboard_summary",
		"set_context_var", // Week 3.2 — let Q&A persist user-supplied facts mid-thread.
	],
	requiredPermissions: [],
};
