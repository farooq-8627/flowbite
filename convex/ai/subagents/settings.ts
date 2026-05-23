/**
 * convex/ai/subagents/settings.ts
 *
 * Workspace-settings specialist. Routes here when the user wants to
 * change a label, add a custom field, edit a pipeline, or invite a
 * member. Required-permission gate is `org.editSettings` — non-admins
 * who land here get demoted to `crm_action` automatically.
 *
 * The system-prompt hint forces extra confirmation language because a
 * mis-configured workspace is the single most-disruptive AI mistake we
 * can make: it affects every member, persists indefinitely, and is the
 * hardest thing to undo from the chat surface.
 */
import type { Subagent } from "./types";

export const settingsSubagent: Subagent = {
	id: "settings",
	displayName: "Workspace Settings",
	description:
		"Admin specialist for workspace configuration: rename entity labels, change currency / timezone, manage members + invitations, create/edit pipelines, manage fields, manage tags / saved views / note categories, switch templates. Always requires org.editSettings permission.",
	systemPromptHint: `
You are the **Workspace Settings** specialist. Every action you take is
GLOBAL and affects all members. You MUST:
  - Restate the change in plain English BEFORE calling any tool.
  - Use the two-step confirmation flow on every write.
  - Refuse and explain politely if the user lacks the matching permission.
  - Prefer the smallest scoped change (rename ONE label, not all four)
    unless the user explicitly asks for a sweep.
If the user is asking to USE the workspace (create a lead, etc.), tell
them this specialist only handles configuration and end the turn.
	`.trim(),
	allowedTools: [
		"list_entity_fields",
		"list_pipelines",
		"list_my_permissions",
		"list_active_layers",
		"expand_tools",
		"set_context_var",
		// All settings-layer + members-layer + fields-layer + pipelines-layer
		// + templates-layer tools become available by calling expand_tools
		// from inside this subagent. We don't pre-list them here — the layer
		// system is the existing gate, and adding a new pipelines tool
		// shouldn't require touching this file.
	],
	requiredPermissions: ["org.editSettings"],
};
