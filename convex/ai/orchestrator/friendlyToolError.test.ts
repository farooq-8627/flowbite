/**
 * convex/ai/orchestrator/friendlyToolError.test.ts
 *
 * Stage 3-A H2 — distinguish SUBAGENT_SCOPE from PERMISSION_DENIED.
 *
 * Both surface as `FORBIDDEN` from the tool gateway, but the user
 * remediation is completely different:
 *   - SUBAGENT_SCOPE: rephrase the request, no admin action needed.
 *   - PERMISSION_DENIED: ask an admin to grant a role.
 *
 * Translating SUBAGENT_SCOPE to "permission" sends users on a wild-
 * goose chase. The Stage 3-A H2 fix detects the well-known
 * "unavailable tool" / "not in available tools" / "not a valid
 * function" phrases and maps them to a separate code with its own
 * recovery hint.
 */

import { describe, expect, it } from "vitest";
import { friendlyToolError } from "./friendlyToolError";

describe("friendlyToolError — Stage 3-A H2 SUBAGENT_SCOPE detection", () => {
	it("FORBIDDEN code + 'unavailable tool' message → SUBAGENT_SCOPE (not permission)", () => {
		const r = friendlyToolError(
			{
				ok: false,
				code: "FORBIDDEN",
				error: "Model tried to call unavailable tool 'create_followup'. Available tools: expand_tools, list_entity_fields, set_context_var.",
			},
			"create_followup",
		);
		expect(r.code).toBe("SUBAGENT_SCOPE");
		expect(r.summary).toContain("create_followup");
		expect(r.summary).toContain("wrong specialist mode");
		// Must NOT show the admin-roles manual steps.
		expect(r.manualSteps).toBeUndefined();
		// Must surface a recovery chip.
		expect(r.recoveryActions?.[0]?.label).toContain("clearer verb");
	});

	it("FORBIDDEN code + 'don't have permission' message → PERMISSION_DENIED (unchanged)", () => {
		const r = friendlyToolError(
			{
				ok: false,
				code: "FORBIDDEN",
				error: "You don't have permission to perform this action (requires: reminders.create).",
			},
			"create_followup",
		);
		expect(r.code).toBe("FORBIDDEN");
		expect(r.summary).toBe("You don't have permission for this action.");
		expect(r.manualSteps).toBeDefined();
		expect(r.manualSteps?.[0]).toContain("Settings → Members & Roles");
	});

	it("AI_TOOL_UNAUTHORIZED + 'unavailable tool' message → SUBAGENT_SCOPE", () => {
		const r = friendlyToolError(
			{
				ok: false,
				code: "AI_TOOL_UNAUTHORIZED",
				error: "Model tried to call unavailable tool 'send_message'.",
			},
			"send_message",
		);
		expect(r.code).toBe("SUBAGENT_SCOPE");
	});

	it("Raw error text without a code, 'not in available tools' phrasing → SUBAGENT_SCOPE", () => {
		// Some providers return the failure as an `Error` with no Convex
		// code attached. We must still detect the phrase.
		const r = friendlyToolError(
			new Error("Tool 'add_note' not in available tools (qa)."),
			"add_note",
		);
		expect(r.code).toBe("SUBAGENT_SCOPE");
		expect(r.summary).toContain("add_note");
	});

	it("Raw error 'Tool foo is not registered in tools' → SUBAGENT_SCOPE (AI SDK shape)", () => {
		const r = friendlyToolError(
			{ ok: false, error: "Tool 'create_lead' is not registered in tools." },
			"create_lead",
		);
		expect(r.code).toBe("SUBAGENT_SCOPE");
	});

	it("Raw 'permission denied' (no code) → FORBIDDEN, not SUBAGENT_SCOPE", () => {
		// Defensive: when the message clearly says permission-only and
		// does NOT mention unavailable-tool, we keep the existing
		// PERMISSION_DENIED path.
		const r = friendlyToolError(
			{ ok: false, error: "Permission denied (requires: reminders.create)." },
			"create_followup",
		);
		expect(r.code).toBe("FORBIDDEN");
		expect(r.manualSteps).toBeDefined();
	});

	it("Generic FORBIDDEN with no specific phrase → unchanged PERMISSION_DENIED", () => {
		const r = friendlyToolError(
			{ ok: false, code: "FORBIDDEN", error: "Permission denied." },
			"create_lead",
		);
		expect(r.code).toBe("FORBIDDEN");
		expect(r.summary).toBe("You don't have permission for this action.");
	});
});
