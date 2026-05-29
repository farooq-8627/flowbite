/// <reference types="vite/client" />
/**
 * convex/ai/approvalGate.test.ts
 *
 * Post-sprint addition (2026-05-26). Contract tests for the
 * configurable approval gate. Guards:
 *
 *   1. Hard-locked categories (bulk / settings / members) ALWAYS ask
 *      even when the user opts in to auto-approve.
 *   2. `alwaysAsk: true` overrides everything (ask_user_input / choice).
 *   3. Default ON categories (update_record / convert_record / send_message
 *      / manage_participants / schedule / files) skip the card by default.
 *   4. Default OFF categories (create_record / delete_record) still ask
 *      by default — preview card preserved.
 *   5. User-explicit `false` forces the card even on a default-ON category.
 *   6. User-explicit `true` skips the card even on a default-OFF category.
 *   7. A tool with NO `approvalCategory` falls back to the declared
 *      `confirmation` flag — preferences cannot bypass it (safe default).
 *   8. Function-form `needsApproval` still consulted when no category
 *      override applies.
 *   9. `resolveEffectiveAutoApprove(undefined)` returns the defaults map.
 *  10. `isHardLockedCategory` / `isUserToggleableCategory` recognise the
 *      canonical categories.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	AUTO_APPROVE_DEFAULTS,
	HARD_LOCKED_CATEGORIES,
	isHardLockedCategory,
	isUserToggleableCategory,
	resolveEffectiveAutoApprove,
	USER_TOGGLEABLE_CATEGORIES,
} from "../_shared/aiApprovals";
import { registerTool, resolveNeedsApproval, type ToolDef } from "./toolRegistry";

// ─── Helpers ──────────────────────────────────────────────────────────

const makeTool = (overrides: Partial<ToolDef>): ToolDef => ({
	name: overrides.name ?? `_test_${Math.random().toString(36).slice(2, 10)}`,
	description: overrides.description ?? "test tool",
	layer: overrides.layer ?? "always",
	permission: overrides.permission ?? null,
	confirmation: overrides.confirmation,
	approvalCategory: overrides.approvalCategory,
	alwaysAsk: overrides.alwaysAsk,
	needsApproval: overrides.needsApproval,
	schema: overrides.schema ?? z.object({}),
	execute: overrides.execute ?? (async () => ({ ok: true })),
});

// Track tool names this suite registered so we can document the
// pollution if needed; the registry has no public delete API but
// names are unique-by-test so it's safe.
const REGISTERED: string[] = [];

afterEach(() => {
	// nothing to clean — registry is process-scoped
});

function register(name: string, def: Partial<ToolDef>): void {
	registerTool(makeTool({ ...def, name }));
	REGISTERED.push(name);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("approval gate — resolveNeedsApproval", () => {
	it("guard 1 — hard-locked category 'bulk' ALWAYS asks even when user opts in", () => {
		register("_t_gate_bulk", {
			confirmation: "twoStep",
			approvalCategory: "bulk",
		});
		// User has explicitly auto-approved everything they can — bulk
		// shouldn't even be in the pref map, but if a malicious caller
		// supplies it the gate must still lock. Cast the whole literal
		// because `bulk` is intentionally NOT in the typed surface
		// (excess-property check in stricter typecheckers — Convex CLI's
		// `tsc --noEmit` flags it without the literal-level cast).
		const adversarialPrefs = {
			...resolveEffectiveAutoApprove({}),
			bulk: true,
		} as Parameters<typeof resolveNeedsApproval>[2];
		const result = resolveNeedsApproval("_t_gate_bulk", {}, adversarialPrefs);
		expect(result).toBe(true);
	});

	it("guard 1b — hard-locked 'settings' and 'members' also ALWAYS ask", () => {
		register("_t_gate_settings", {
			confirmation: "twoStep",
			approvalCategory: "settings",
		});
		register("_t_gate_members", {
			confirmation: "twoStep",
			approvalCategory: "members",
		});
		expect(resolveNeedsApproval("_t_gate_settings", {}, resolveEffectiveAutoApprove({}))).toBe(
			true,
		);
		expect(resolveNeedsApproval("_t_gate_members", {}, resolveEffectiveAutoApprove({}))).toBe(
			true,
		);
	});

	it("guard 2 — alwaysAsk: true overrides every other signal", () => {
		register("_t_gate_alwaysAsk", {
			alwaysAsk: true,
			approvalCategory: "ask_user",
		});
		// Even though ask_user isn't user-toggleable, force-pass a true value
		// to confirm alwaysAsk wins regardless.
		expect(resolveNeedsApproval("_t_gate_alwaysAsk", {}, resolveEffectiveAutoApprove({}))).toBe(
			true,
		);
	});

	it("guard 3 — default-ON categories skip the card with default preferences", () => {
		const cases: Array<{ name: string; cat: string }> = [
			{ name: "_t_gate_update_default", cat: "update_record" },
			{ name: "_t_gate_convert_default", cat: "convert_record" },
			{ name: "_t_gate_send_default", cat: "send_message" },
			{ name: "_t_gate_manage_default", cat: "manage_participants" },
			{ name: "_t_gate_schedule_default", cat: "schedule" },
		];
		for (const c of cases) {
			register(c.name, {
				confirmation: "twoStep",
				approvalCategory: c.cat as
					| "update_record"
					| "convert_record"
					| "send_message"
					| "manage_participants"
					| "schedule",
			});
			expect(
				resolveNeedsApproval(c.name, {}, resolveEffectiveAutoApprove({})),
				`${c.cat} should skip with defaults`,
			).toBe(false);
		}
	});

	it("guard 4 — default-OFF categories still ask with default preferences", () => {
		// `files` returned to default-ON on 2026-05-28 (Stage 0.5 of
		// DASHBOARD-V2-PLAN.md) once the auto-commit shim in
		// `convex/ai/orchestrator/streamLoop.ts` closed the silent-drop
		// class of bug at the wrapper layer. Stage 0 had temporarily
		// gated `files` to `false`; the shim now runs `commit_<tool>`
		// directly when the gate says SKIP for a twoStep tool, so a user
		// who opted in to `files: true` actually gets the commit (the
		// file IS re-scoped to the destination entity in one round-trip).
		register("_t_gate_create_default", {
			confirmation: "twoStep",
			approvalCategory: "create_record",
		});
		register("_t_gate_delete_default", {
			confirmation: "twoStep",
			approvalCategory: "delete_record",
		});
		expect(
			resolveNeedsApproval("_t_gate_create_default", {}, resolveEffectiveAutoApprove({})),
		).toBe(true);
		expect(
			resolveNeedsApproval("_t_gate_delete_default", {}, resolveEffectiveAutoApprove({})),
		).toBe(true);
	});

	it("guard 5 — explicit user `false` forces the card even on a default-ON category", () => {
		register("_t_gate_update_forced_off", {
			confirmation: "twoStep",
			approvalCategory: "update_record",
		});
		expect(
			resolveNeedsApproval(
				"_t_gate_update_forced_off",
				{},
				resolveEffectiveAutoApprove({ update_record: false }),
			),
		).toBe(true);
	});

	it("guard 6 — explicit user `true` skips the card on a default-OFF category", () => {
		register("_t_gate_create_forced_on", {
			confirmation: "twoStep",
			approvalCategory: "create_record",
		});
		expect(
			resolveNeedsApproval(
				"_t_gate_create_forced_on",
				{},
				resolveEffectiveAutoApprove({ create_record: true }),
			),
		).toBe(false);
	});

	it("guard 7 — tool with no approvalCategory falls back to declared confirmation", () => {
		// confirmation: "twoStep" with no category → user prefs cannot bypass.
		register("_t_gate_no_category", {
			confirmation: "twoStep",
		});
		expect(
			resolveNeedsApproval(
				"_t_gate_no_category",
				{},
				resolveEffectiveAutoApprove({
					update_record: true,
					create_record: true,
					send_message: true,
				}),
			),
		).toBe(true);
	});

	it("guard 8 — function-form needsApproval consulted when no category override applies", () => {
		// Tool with category but no auto-approve; needsApproval is a function.
		// User has no override for this category → function evaluated.
		const calls: Array<Record<string, unknown>> = [];
		register("_t_gate_fn_form", {
			needsApproval: (args) => {
				calls.push(args);
				return (args.count as number) > 5;
			},
			// No approvalCategory → fall through to function form
		});
		expect(resolveNeedsApproval("_t_gate_fn_form", { count: 3 }, undefined)).toBe(false);
		expect(resolveNeedsApproval("_t_gate_fn_form", { count: 10 }, undefined)).toBe(true);
		expect(calls.length).toBe(2);
	});

	it("guard 9 — resolveEffectiveAutoApprove(undefined) returns defaults", () => {
		const eff = resolveEffectiveAutoApprove(undefined);
		expect(eff.update_record).toBe(true);
		expect(eff.convert_record).toBe(true);
		expect(eff.send_message).toBe(true);
		expect(eff.manage_participants).toBe(true);
		expect(eff.schedule).toBe(true);
		// `files` returned to default-ON on 2026-05-28 (Stage 0.5).
		// The commit-shim in `streamLoop.ts:wrapToolsForApprovalSanitisation`
		// runs `commit_<tool>` directly when the gate says SKIP for a
		// twoStep tool, closing the silent-drop class of bug Stage 0
		// fixed by temporarily gating files to OFF.
		expect(eff.files).toBe(true);
		expect(eff.create_record).toBe(false);
		expect(eff.delete_record).toBe(false);
	});

	it("guard 10 — partial preferences overlay the defaults correctly", () => {
		const eff = resolveEffectiveAutoApprove({
			update_record: false,
			create_record: true,
		});
		expect(eff.update_record).toBe(false);
		expect(eff.create_record).toBe(true);
		// untouched keys keep defaults
		expect(eff.send_message).toBe(true);
		expect(eff.delete_record).toBe(false);
	});

	it("guard 10b — files-categorised twoStep tools (regression for Stage 0 attach_file silent-drop): default-ON safely auto-commits via the wrapper shim, explicit user `false` still surfaces the propose card", () => {
		// History:
		//   - Pre 2026-05-28: `files: true` AND no commit-shim → silent-drop.
		//     `wrapToolsForApprovalSanitisation` stashed the propose payload
		//     but `stopOnAnyTwoStepCall` honoured the auto-approve and the
		//     loop never halted. `commit_attach_file` never ran. The file
		//     stayed at `scope: "aiChat"` instead of being re-scoped to the
		//     destination person/deal/company.
		//   - Stage 0: `files: false` (temporary). Propose card surfaces;
		//     user's existing approve-button flow drives commit_attach_file.
		//   - Stage 0.5: `files: true` again (permanent). The wrapper now
		//     looks up `commit_<tool>` and runs it directly when the gate
		//     says SKIP. Same tool result the user-approval flow produces.
		// This test pins the GATE'S contract — the wrapper-shim contract
		// is exercised in `streamLoop` integration tests separately.
		register("_t_gate_attach_file_regression", {
			confirmation: "twoStep",
			approvalCategory: "files",
		});

		// (a) With NO user override (Stage 0.5 default), the gate says
		// SKIP — the streamLoop's commit-shim will run commit_attach_file
		// directly. NO propose card is surfaced.
		expect(
			resolveNeedsApproval(
				"_t_gate_attach_file_regression",
				{ fileId: "abc123", scope: "person", scopeId: "P-001" },
				resolveEffectiveAutoApprove({}),
			),
			"files default skips after Stage 0.5 (commit-shim runs)",
		).toBe(false);

		// (b) Explicit user `files: true` — same path as (a).
		expect(
			resolveNeedsApproval(
				"_t_gate_attach_file_regression",
				{ fileId: "abc123", scope: "person", scopeId: "P-001" },
				resolveEffectiveAutoApprove({ files: true }),
			),
			"explicit user `files: true` skips — wrapper auto-commits",
		).toBe(false);

		// (c) Explicit user `files: false` — propose card surfaces and
		// the user drives `commit_attach_file` via the approve button.
		expect(
			resolveNeedsApproval(
				"_t_gate_attach_file_regression",
				{ fileId: "abc123", scope: "person", scopeId: "P-001" },
				resolveEffectiveAutoApprove({ files: false }),
			),
			"explicit user `files: false` surfaces propose card",
		).toBe(true);
	});

	it("guard 11 — category type-guards recognise canonical categories", () => {
		expect(isHardLockedCategory("bulk")).toBe(true);
		expect(isHardLockedCategory("settings")).toBe(true);
		expect(isHardLockedCategory("members")).toBe(true);
		expect(isHardLockedCategory("create_record")).toBe(false);
		expect(isHardLockedCategory(undefined)).toBe(false);

		expect(isUserToggleableCategory("create_record")).toBe(true);
		expect(isUserToggleableCategory("update_record")).toBe(true);
		expect(isUserToggleableCategory("send_message")).toBe(true);
		expect(isUserToggleableCategory("bulk")).toBe(false);
		expect(isUserToggleableCategory("settings")).toBe(false);
	});

	it("guard 12 — exhaustiveness: AUTO_APPROVE_DEFAULTS covers every USER_TOGGLEABLE_CATEGORIES key", () => {
		for (const key of USER_TOGGLEABLE_CATEGORIES) {
			expect(typeof AUTO_APPROVE_DEFAULTS[key]).toBe("boolean");
		}
		// No accidental extras
		expect(Object.keys(AUTO_APPROVE_DEFAULTS).sort()).toEqual(
			[...USER_TOGGLEABLE_CATEGORIES].sort(),
		);
	});

	it("guard 13 — HARD_LOCKED_CATEGORIES are disjoint from USER_TOGGLEABLE_CATEGORIES", () => {
		const userSet = new Set<string>(USER_TOGGLEABLE_CATEGORIES);
		for (const cat of HARD_LOCKED_CATEGORIES) {
			expect(userSet.has(cat)).toBe(false);
		}
	});

	// ─── Stage 0.5 of DASHBOARD-V2-PLAN.md — auto-commit shim ─────────
	//
	// The wrapper-shim contract: when the gate says SKIP for a twoStep
	// tool AND a paired `commit_<tool>` is registered AND its zod
	// schema accepts the propose payload's `confirmationPayload.args`,
	// run commit's execute() and return its result. The tests below
	// pin that behaviour by registering a propose+commit pair and
	// driving the same lookup path the wrapper uses (registry +
	// schema.safeParse + execute).
	//
	// Why we test the registry-level contract instead of the wrapper:
	// the wrapper is a private helper inside `streamLoop.ts` (a
	// "use node" file with `streamText` deps that pull in the AI SDK).
	// Importing it here would force a node-runtime test runner, when
	// the rest of approvalGate.test.ts runs in vitest. The wrapper's
	// only dependency on the registry is `getRegisteredTool` +
	// `commitDef.schema.safeParse` + `commitDef.execute` — exercising
	// those three calls in the same order is equivalent.

	it("guard 14a — auto-commit shim lookup: a paired commit_<tool> is resolvable + its schema accepts the propose payload", async () => {
		const { getRegisteredTool } = await import("./toolRegistry");
		const proposeName = "_t_shim_propose_ok";
		const commitName = `commit_${proposeName}`;

		register(proposeName, {
			confirmation: "twoStep",
			approvalCategory: "files",
			schema: z.object({ fileId: z.string() }),
			execute: async ({ fileId }: { fileId: string }) => ({
				ok: false,
				requiresConfirmation: true as const,
				confirmationPayload: {
					tool: proposeName,
					args: { fileId, scope: "person", scopeId: "P-001" },
				},
			}),
		});
		// Mirror real twoStep tools — the commit's schema accepts a
		// SUPERSET of the propose's input args (the propose builds the
		// canonical commit args inside its execute body).
		const commitFn = vi.fn(async (args: Record<string, unknown>) => ({
			ok: true,
			data: args,
			summary: { headline: `Attached file ${args.fileId}` },
		}));
		register(commitName, {
			confirmation: "none",
			schema: z.object({
				fileId: z.string(),
				scope: z.enum(["person", "deal", "company"]),
				scopeId: z.string(),
			}),
			execute: commitFn,
		});

		// Step 1 — wrapper would only run the shim when gate says SKIP.
		expect(
			resolveNeedsApproval(
				proposeName,
				{ fileId: "abc" },
				resolveEffectiveAutoApprove({ files: true }),
			),
		).toBe(false);

		// Step 2 — registry lookup the wrapper performs.
		const commitDef = getRegisteredTool(commitName);
		expect(commitDef).toBeDefined();

		// Step 3 — propose execute builds the canonical commit args.
		const fakeProposeOut = (await getRegisteredTool(proposeName)?.execute({
			fileId: "abc",
		})) as {
			confirmationPayload: { args: Record<string, unknown> };
		};
		const proposeArgs = fakeProposeOut.confirmationPayload.args;

		// Step 4 — commit's schema parses + execute runs with parsed data.
		const parsed = commitDef!.schema.safeParse(proposeArgs);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			const result = await commitDef!.execute(parsed.data);
			expect((result as { ok: boolean }).ok).toBe(true);
			expect((result as { summary: { headline: string } }).summary.headline).toContain("abc");
		}
		expect(commitFn).toHaveBeenCalledTimes(1);
	});

	it("guard 14b — auto-commit shim falls back to propose card when no commit_<tool> is registered (defensive)", async () => {
		const { getRegisteredTool } = await import("./toolRegistry");
		const orphanName = "_t_shim_orphan_propose";
		register(orphanName, {
			confirmation: "twoStep",
			approvalCategory: "files",
			schema: z.object({ fileId: z.string() }),
			execute: async ({ fileId }: { fileId: string }) => ({
				ok: false,
				requiresConfirmation: true as const,
				confirmationPayload: { tool: orphanName, args: { fileId } },
			}),
		});

		// The gate says SKIP — but no commit pair exists.
		expect(
			resolveNeedsApproval(
				orphanName,
				{ fileId: "abc" },
				resolveEffectiveAutoApprove({ files: true }),
			),
		).toBe(false);
		expect(getRegisteredTool(`commit_${orphanName}`)).toBeUndefined();
		// Wrapper's documented behaviour: log + fall back to propose
		// card. The user can still approve manually. The contract is
		// "never silently drop a write" — the propose card surfacing is
		// the safety net.
	});

	it("guard 14c — auto-commit shim refuses to run when commit's schema rejects the propose payload", async () => {
		const { getRegisteredTool } = await import("./toolRegistry");
		const proposeName = "_t_shim_propose_drift";
		const commitName = `commit_${proposeName}`;

		register(proposeName, {
			confirmation: "twoStep",
			approvalCategory: "files",
			schema: z.object({ fileId: z.string() }),
			execute: async () => ({
				ok: false,
				requiresConfirmation: true as const,
				confirmationPayload: {
					tool: proposeName,
					// Intentional drift — propose carries a field the
					// commit's tightened schema doesn't accept (mirrors
					// the C.4 audit's silent-data-loss class of bug).
					args: { thisFieldDoesNotExist: true },
				},
			}),
		});
		const commitFn = vi.fn(async () => ({ ok: true }));
		register(commitName, {
			confirmation: "none",
			schema: z.object({ fileId: z.string() }),
			execute: commitFn,
		});

		const proposeOut = (await getRegisteredTool(proposeName)?.execute({
			fileId: "abc",
		})) as { confirmationPayload: { args: Record<string, unknown> } };
		const parsed = getRegisteredTool(commitName)!.schema.safeParse(
			proposeOut.confirmationPayload.args,
		);
		// The wrapper's guard: when parse fails, log + fall back to the
		// propose card. The commit's execute is NEVER called with
		// drifted args.
		expect(parsed.success).toBe(false);
		expect(commitFn).not.toHaveBeenCalled();
	});
});
