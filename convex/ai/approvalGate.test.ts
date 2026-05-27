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

import { afterEach, describe, expect, it } from "vitest";
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
			{ name: "_t_gate_files_default", cat: "files" },
		];
		for (const c of cases) {
			register(c.name, {
				confirmation: "twoStep",
				approvalCategory: c.cat as
					| "update_record"
					| "convert_record"
					| "send_message"
					| "manage_participants"
					| "schedule"
					| "files",
			});
			expect(
				resolveNeedsApproval(c.name, {}, resolveEffectiveAutoApprove({})),
				`${c.cat} should skip with defaults`,
			).toBe(false);
		}
	});

	it("guard 4 — default-OFF categories still ask with default preferences", () => {
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
});
