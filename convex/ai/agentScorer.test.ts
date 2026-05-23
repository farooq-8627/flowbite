/// <reference types="vite/client" />
/**
 * convex/ai/agentScorer.test.ts
 *
 * Week 1 #1.6 — agent-level scorer harness (PHASE-3-AI-AUDIT.md §6).
 *
 * Five baseline tests that directly cover the audit's "screenshot bug"
 * (`PHASE-3-AI-AUDIT.md §1`). Each test is a regression guard: if the
 * orchestrator's tool-filter / Zod formatter / introspection wiring
 * regresses, one of these fails BEFORE we re-introduce the user-visible
 * "Empty message" or "tool not found" loop.
 *
 * Scope intentionally narrow: these are deterministic unit tests
 * exercising the orchestrator's invariants. They do NOT call a real
 * LLM. The full variant-matrix scorer (cost / latency / per-model
 * pass-fail) is Week 6 work — see PHASE-3-AI-AUDIT.md §6 Week 6 + the
 * Attio defineAgentTestSuite reference in §2.3.
 *
 * What each test guards:
 *   1. expand_tools.execute filters by permission (audit §1 row 2 fix).
 *   2. Zod-error formatter produces a model-readable hint with example
 *      (audit §1 row 4 fix).
 *   3. parseReasoning groups tool-call lines into structured cards
 *      (UX spec 1.5a — keeps the new ReasoningPanel honest).
 *   4. Active-request context can be set and read (introspection tools
 *      depend on this — audit §1 row 4 fix).
 *   5. Premium-tier capability filter is wired into isToolExposed and
 *      ALL three call sites (getToolsForRequest, expand_tools.execute,
 *      getActiveRunbooks). This is the future restoration test for
 *      Future-Enhancements.md §A.2.
 */

import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

// Module under test imports. The toolRegistry runs side-effects on
// import (registers tools), but in a Vitest run we just want its public
// surface. The introspect / search / etc. files are loaded via the
// orchestrator at runtime — for these unit tests we self-register
// minimal fakes via getToolsForRequest's filter logic.
import {
	clearActiveRequestContext,
	getActiveRequestContext,
	getActiveRunbooks,
	getAvailableToolNames,
	getToolsForRequest,
	registerTool,
	setActiveRequestContext,
	type ToolDef,
} from "./toolRegistry";

import { formatZodError, wrapWithZodErrorFormatter } from "./orchestrator/zodErrorFormatter";
import { parseReasoning } from "../../core/ai/components/reasoning/parseReasoning";

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a fake ToolDef with sensible defaults. Tests override only what
 * they care about.
 */
function fakeTool(overrides: Partial<ToolDef>): ToolDef {
	return {
		name: overrides.name ?? `_test_${Math.random().toString(36).slice(2, 8)}`,
		description: overrides.description ?? "test tool",
		layer: overrides.layer ?? "always",
		permission: overrides.permission ?? null,
		confirmation: overrides.confirmation ?? "none",
		schema: overrides.schema ?? z.object({}),
		execute: overrides.execute ?? (async () => ({ ok: true })),
		runbook: overrides.runbook,
		requiredCapability: overrides.requiredCapability,
		example: overrides.example,
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("agent scorer — regression guards (Week 1 #1.6)", () => {
	it("guard 1 — expand_tools.execute filters by permission so it doesn't lie to the model", async () => {
		// Register a tool that requires a specific permission in the
		// 'fields' layer. expand_tools.execute should NOT include it
		// when the user lacks the permission.
		const restrictedName = "_test_create_field_guard1";
		registerTool(
			fakeTool({
				name: restrictedName,
				layer: "fields",
				permission: "fieldDefinitions.manage",
			}),
		);

		setActiveRequestContext({
			permissions: ["leads.view"], // user lacks fieldDefinitions.manage
			modelTier: "small",
			expandedLayers: [],
		});

		// Get the expand_tools tool from the registry. We import it via
		// getToolsForRequest because that's the path processChat takes.
		const tools = getToolsForRequest({
			permissions: ["ai.expandTools", "leads.view"],
			modelTier: "small",
			expandedLayers: [],
		});
		expect(tools.expand_tools).toBeDefined();

		// Build call args by hand; the test exercises the execute body
		// directly without touching the AI SDK.
		const expandTool = tools.expand_tools as { execute: (input: unknown) => Promise<unknown> };
		// expand_tools' execute is wrapped by wrapWithZodErrorFormatter,
		// so call it with a real layer arg.
		const result = (await expandTool.execute({ layer: "fields", reason: "test" })) as {
			activated: string;
			tools: Array<{ name: string }>;
		};

		// The restricted tool MUST be filtered out.
		expect(result.activated).toBe("fields");
		const names = result.tools.map((t) => t.name);
		expect(names).not.toContain(restrictedName);

		clearActiveRequestContext();
	});

	it("guard 2 — Zod-error formatter returns a model-readable hint with paths and example", async () => {
		// Build a schema that requires `email` as a string and `count`
		// as a number ≥ 1.
		const schema = z.object({
			email: z.string().min(3),
			count: z.number().min(1),
		});

		let captured: ZodError | null = null;
		try {
			schema.parse({ email: "", count: 0 });
		} catch (e) {
			if (e instanceof ZodError) captured = e;
		}
		expect(captured).not.toBeNull();

		const formatted = formatZodError("ask_user_input", captured as ZodError, {
			email: "user@example.com",
			count: 1,
		});

		expect(formatted.ok).toBe(false);
		expect(formatted.code).toBe("TOOL_INPUT_VALIDATION");
		expect(formatted.issues.length).toBeGreaterThanOrEqual(2);
		// Path strings include 'email' and 'count'.
		const paths = formatted.issues.map((i) => i.path);
		expect(paths).toContain("email");
		expect(paths).toContain("count");
		// Hint contains the example so the model can self-correct.
		expect(formatted.hint).toContain("ask_user_input");
		expect(formatted.hint).toContain("user@example.com");
		// Hint tells the model NOT to retry with the same args.
		expect(formatted.hint.toLowerCase()).toContain("do not retry");
	});

	it("guard 2b — wrapWithZodErrorFormatter intercepts ZodError thrown inside execute", async () => {
		const schema = z.object({ value: z.string().min(1) });
		const original = async (input: unknown) => {
			schema.parse(input);
			return { ok: true as const };
		};
		const wrapped = wrapWithZodErrorFormatter("test_tool", original, { value: "hello" });

		const result = await wrapped({ value: "" });
		expect(result).toMatchObject({
			ok: false,
			code: "TOOL_INPUT_VALIDATION",
		});
	});

	it("guard 3 — parseReasoning groups tool-start + tool-success into a single completed card", () => {
		const reasoning = [
			"Looking at the workspace…",
			"→ Calling `search_crm`…",
			"✓ `search_crm` returned.",
			"Found two leads matching the query.",
		].join("\n");

		const steps = parseReasoning(reasoning, "streaming");

		// Expect: thinking → tool-call(success) → thinking. NOT four cards.
		expect(steps).toHaveLength(3);
		expect(steps[0]).toMatchObject({ kind: "thinking" });
		expect(steps[1]).toMatchObject({
			kind: "tool-call",
			toolName: "search_crm",
			status: "success",
		});
		expect(steps[2]).toMatchObject({ kind: "thinking" });
	});

	it("guard 3b — parseReasoning marks an in-flight tool when state === calling_tool", () => {
		const reasoning = "→ Calling `expand_tools`…";
		const steps = parseReasoning(reasoning, "calling_tool", "expand_tools");

		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({
			kind: "tool-call",
			toolName: "expand_tools",
			status: "in_progress",
		});
	});

	it("guard 4 — active request context round-trips for introspection tools", () => {
		expect(getActiveRequestContext()).toBeNull();

		setActiveRequestContext({
			permissions: ["leads.view", "ai.use"],
			modelTier: "premium",
			expandedLayers: ["pipelines", "fields"],
		});

		const ctx = getActiveRequestContext();
		expect(ctx).not.toBeNull();
		expect(ctx?.modelTier).toBe("premium");
		expect(ctx?.expandedLayers).toEqual(["pipelines", "fields"]);
		expect(ctx?.permissions).toContain("leads.view");

		clearActiveRequestContext();
		expect(getActiveRequestContext()).toBeNull();
	});

	it("guard 5 — getToolsForRequest, getAvailableToolNames, and getActiveRunbooks honour the permission filter consistently", () => {
		// Add a unique tool gated on a specific permission. All three
		// public helpers should agree on whether it's exposed.
		const guarded: ToolDef = fakeTool({
			name: "_guard5_create_pipeline",
			layer: "pipelines",
			permission: "pipelines.manage",
			runbook: { onSuccess: "tell user" },
		});
		registerTool(guarded);

		// Without the permission + with the layer expanded → should NOT
		// be exposed by either getToolsForRequest or getAvailableToolNames,
		// and its runbook should NOT appear in getActiveRunbooks.
		const args = {
			permissions: ["leads.view"],
			modelTier: "premium" as const,
			expandedLayers: ["pipelines"],
		};
		const tools = getToolsForRequest(args);
		const names = getAvailableToolNames(args);
		const runbooks = getActiveRunbooks(args);

		expect(tools[guarded.name]).toBeUndefined();
		expect(names).not.toContain(guarded.name);
		expect(runbooks.find((r) => r.name === guarded.name)).toBeUndefined();

		// Add the permission → all three should expose it.
		const args2 = { ...args, permissions: ["pipelines.manage"] };
		const tools2 = getToolsForRequest(args2);
		const names2 = getAvailableToolNames(args2);
		const runbooks2 = getActiveRunbooks(args2);

		expect(tools2[guarded.name]).toBeDefined();
		expect(names2).toContain(guarded.name);
		expect(runbooks2.find((r) => r.name === guarded.name)).toBeDefined();

		clearActiveRequestContext();
	});
});
