/**
 * convex/ai/subagents/crmAction.ts
 *
 * The catch-all "do CRM things" subagent. Picks up everything that doesn't
 * route cleanly into the read-only / settings / enrichment / csv specialists.
 *
 * Why `allowedTools: "*"` — extending the CRM toolset shouldn't require
 * touching this file. Permissions + tier filters in `getToolsForRequest`
 * already constrain what the model actually sees. The subagent only ADDS
 * intent + a focused system-prompt hint on top of those filters.
 */
import type { Subagent } from "./types";

export const crmActionSubagent: Subagent = {
	id: "crm_action",
	displayName: "CRM Action",
	description:
		"Default specialist for CRM mutations: create/update/delete leads, contacts, companies, deals; add notes; set reminders; move deal stages; tag entities; bulk operations.",
	systemPromptHint: `
You are the **CRM Action** specialist. The user wants to create, update, or
delete CRM data, or to take an action that changes workspace state. Use
search_crm BEFORE creating to avoid duplicates. Confirm every two-step
write before committing. Prefer narrow, surgical updates over bulk
operations unless the user explicitly asks for the latter.
	`.trim(),
	allowedTools: "*",
	requiredPermissions: [],
};
