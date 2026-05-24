/**
 * convex/ai/tools/personaContext.ts
 *
 * Phase 4 Part 1 P1.12 — durable AI memory tools (`PHASE-3-AI-AUDIT.md
 * §5`). Two tools the model uses to remember things across conversations:
 *
 *   - `update_org_context_facts`  — facts about the organisation as a
 *     whole. Visible to every member of the org. Requires `org.manage`
 *     so a viewer can't pollute the shared context.
 *
 *   - `update_user_context_facts` — facts about the calling user only.
 *     No permission gate beyond org membership. Always self-scoped —
 *     the model can never write to another user's persona.
 *
 * Both tools share the same `upsertPersonaForAI` internal mutation
 * (which enforces the hard caps). The system prompt reads both rows
 * every turn and surfaces them as `## Long-term context …` blocks.
 *
 * Token budget caps (enforced server-side, never relaxed):
 *   summary  ≤ 600 chars
 *   keyFacts ≤ 30 entries (each ≤ 240 chars)
 *   byteCount ≤ 4 KB total (JSON-encoded)
 *
 * When the cap is hit, `BUDGET_EXCEEDED` propagates back to the model
 * so it can decide what to remove before retrying.
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { runTool, type ToolContext, toolMutation } from "./_shared";

let _ctx: ToolContext | null = null;
export function setPersonaContextToolContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("personaContext tool ctx not initialized");
	return _ctx;
}

const factSchema = z
	.string()
	.trim()
	.min(1, "Fact must not be empty.")
	.max(240, "Fact must be ≤ 240 chars.");

const sharedSchema = z.object({
	addFacts: z
		.array(factSchema)
		.max(20, "addFacts max 20 per call.")
		.optional()
		.describe("New facts to remember. Each ≤ 240 chars."),
	removeFacts: z
		.array(z.string().trim().min(1).max(240))
		.max(20, "removeFacts max 20 per call.")
		.optional()
		.describe("Facts to forget. Case-insensitive trim match."),
	summary: z
		.string()
		.trim()
		.max(600, "summary max 600 chars.")
		.optional()
		.describe("Replaces the current free-form summary entirely. Skip to keep existing."),
});

const userSchema = sharedSchema.extend({
	preferences: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"Structured per-user prefs. Merged into the existing prefs object (per-key shallow merge).",
		),
});

// ─── update_user_context_facts ─────────────────────────────────────

registerTool({
	name: "update_user_context_facts",
	layer: "always",
	permission: null, // org membership is enough — every user can write their own
	confirmation: "none",
	description: `
Remember facts about the calling user across conversations. The system
prompt surfaces them next turn under "Long-term context for you", so
you don't have to re-ask. Use this when the user states a stable
preference / fact about themselves.

Examples of good facts:
  - "Calls leads 'opportunities'"
  - "Prefers concise replies"
  - "Schedules follow-ups for mornings (PT)"
  - "Default deal size: $5K-$15K"

Don't use for:
  - Transient context (current cursor, active filter) — those die with
    the conversation.
  - Org-wide policy / rules — use update_org_context_facts.
  - Anything sensitive (passwords, PII beyond name + role).

Caps (server-enforced — over-cap throws BUDGET_EXCEEDED):
  summary ≤ 600 chars · keyFacts ≤ 30 entries · total ≤ 4 KB.
  `.trim(),
	runbook: {
		onSuccess:
			"Acknowledge in one short sentence ('Got it, I'll remember that.'). The fact is now in your system prompt — don't dump the persona back to the user.",
		onValidationError:
			"Pick shorter facts (≤ 240 chars each, ≤ 20 per call). Don't ask the user about formatting.",
	},
	example: { addFacts: ["Prefers concise replies", "Schedules follow-ups for mornings (PT)"] },
	schema: userSchema,
	execute: async (input) => {
		return runTool(async () => {
			const { orgId, userId } = getCtx();
			const result = (await toolMutation(getCtx(), "ai/personaContext:upsertPersonaForAI", {
				orgId,
				userId,
				scope: "user" as const,
				addFacts: input.addFacts,
				removeFacts: input.removeFacts,
				summary: input.summary,
				preferences: input.preferences,
			})) as {
				scope: "user";
				summary: string;
				keyFacts: string[];
				byteCount: number;
				added: number;
				removed: number;
			};
			const added = input.addFacts?.length ?? 0;
			const removed = input.removeFacts?.length ?? 0;
			const parts: string[] = [];
			if (added > 0)
				parts.push(`Remembered ${added} fact${added === 1 ? "" : "s"} about you`);
			if (removed > 0) parts.push(`Forgot ${removed} fact${removed === 1 ? "" : "s"}`);
			if (input.summary !== undefined) parts.push("Updated your summary");
			if (input.preferences) parts.push("Updated your preferences");
			const text = parts.length > 0 ? `${parts.join(", ")}.` : "Persona unchanged.";
			return {
				ok: true as const,
				data: result,
				display: { kind: "text" as const, text },
			};
		});
	},
});

// ─── update_org_context_facts ──────────────────────────────────────

registerTool({
	name: "update_org_context_facts",
	layer: "always",
	permission: "org.manage",
	confirmation: "none",
	description: `
Remember facts about the ORGANISATION across conversations. The system
prompt surfaces them next turn under "Long-term context for this
organisation", visible to every member. Use this when the user states
a workspace-wide fact / policy / vocabulary that should outlive this
session.

Examples of good org-level facts:
  - "Calls leads 'opportunities' across the workspace"
  - "Default fiscal year starts April 1"
  - "Sales region uses metric units"
  - "Standard deal cycle: 8 days from Qualified to Won"

Permissions: requires org.manage. A regular member should use
update_user_context_facts for personal facts instead.

Caps (server-enforced — over-cap throws BUDGET_EXCEEDED):
  summary ≤ 600 chars · keyFacts ≤ 30 entries · total ≤ 4 KB.
  `.trim(),
	runbook: {
		onSuccess:
			"Acknowledge in one short sentence ('Got it, I've recorded that for the workspace.'). The fact is now in the org persona — don't dump it back to the user.",
		onValidationError:
			"Pick shorter facts (≤ 240 chars each, ≤ 20 per call). Don't ask the user about formatting.",
	},
	example: { addFacts: ["Calls leads 'opportunities' across the workspace"] },
	schema: sharedSchema,
	execute: async (input) => {
		return runTool(async () => {
			const { orgId, userId } = getCtx();
			const result = (await toolMutation(getCtx(), "ai/personaContext:upsertPersonaForAI", {
				orgId,
				userId,
				scope: "org" as const,
				addFacts: input.addFacts,
				removeFacts: input.removeFacts,
				summary: input.summary,
			})) as {
				scope: "org";
				summary: string;
				keyFacts: string[];
				byteCount: number;
				added: number;
				removed: number;
			};
			const added = input.addFacts?.length ?? 0;
			const removed = input.removeFacts?.length ?? 0;
			const parts: string[] = [];
			if (added > 0)
				parts.push(`Remembered ${added} workspace fact${added === 1 ? "" : "s"}`);
			if (removed > 0)
				parts.push(`Forgot ${removed} workspace fact${removed === 1 ? "" : "s"}`);
			if (input.summary !== undefined) parts.push("Updated the workspace summary");
			const text = parts.length > 0 ? `${parts.join(", ")}.` : "Workspace persona unchanged.";
			return {
				ok: true as const,
				data: result,
				display: { kind: "text" as const, text },
			};
		});
	},
});
