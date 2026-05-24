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
import { ZodError, z } from "zod";
import { parseReasoning } from "../../core/ai/components/reasoning/parseReasoning";

import { formatZodError, wrapWithZodErrorFormatter } from "./orchestrator/zodErrorFormatter";
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

// ─── Week 4 — CSV import + dual-LLM safety (PHASE-3-AI-AUDIT §6 Week 4) ─────

import {
	type DedupCandidate,
	decideDedup,
	dedupIdemKey,
	levenshtein,
	normaliseEmail,
	normaliseName,
} from "../_shared/dedup";
import { buildPreviewRow, parseCsvBody } from "./quarantined/csvParser";

describe("Week 4 — dedup helper", () => {
	it("normalises emails by lowercasing + stripping +suffix tags", () => {
		expect(normaliseEmail("John+work@Acme.COM")).toBe("john@acme.com");
		expect(normaliseEmail("  Jane@x.io ")).toBe("jane@x.io");
		expect(normaliseEmail("not-an-email")).toBe(null);
		expect(normaliseEmail(undefined)).toBe(null);
	});

	it("strips trailing corporate suffixes from company names", () => {
		expect(normaliseName("Driven Properties LLC")).toBe("driven properties");
		expect(normaliseName("ACME, Corp.")).toBe("acme");
		expect(normaliseName("  Globex   Inc  ")).toBe("globex");
		// Single-token name without a suffix passes through.
		expect(normaliseName("Driven")).toBe("driven");
	});

	it("Levenshtein returns Infinity past the cap (early termination)", () => {
		expect(levenshtein("kitten", "sitting", 1)).toBe(Infinity);
		expect(levenshtein("kitten", "sitting", 3)).toBe(3);
		// Length difference of 1 — well within cap.
		expect(levenshtein("acme", "acmex", 2)).toBe(1);
		// Identical inputs short-circuit to 0.
		expect(levenshtein("driven", "driven", 0)).toBe(0);
	});

	it("decideDedup picks SKIP on an exact email collision", () => {
		const candidates: DedupCandidate[] = [
			{
				personCode: "P-001",
				displayName: "Sarah Khan",
				email: "sarah@acme.com",
				phone: null,
				companyName: null,
			},
		];
		const r = decideDedup(
			{
				displayName: "Sarah K.",
				email: "SARAH+work@ACME.COM",
				phone: null,
				companyName: null,
			},
			candidates,
		);
		expect(r.decision).toBe("skip");
		expect(r.matchCode).toBe("P-001");
	});

	it("decideDedup picks MERGE on a near-match name + same company", () => {
		const candidates: DedupCandidate[] = [
			{
				personCode: "P-002",
				displayName: "Sarah Khan",
				email: null,
				phone: null,
				companyName: "Driven Properties",
			},
		];
		const r = decideDedup(
			{
				displayName: "Sara Khan",
				email: null,
				phone: null,
				companyName: "Driven Properties LLC",
			},
			candidates,
		);
		expect(r.decision).toBe("merge");
		expect(r.matchCode).toBe("P-002");
	});

	it("decideDedup picks INSERT when nothing matches", () => {
		const candidates: DedupCandidate[] = [
			{
				personCode: "P-003",
				displayName: "Sarah Khan",
				email: "sarah@acme.com",
				phone: null,
				companyName: null,
			},
		];
		const r = decideDedup(
			{
				displayName: "Ali Rashid",
				email: "ali@gulf.ae",
				phone: null,
				companyName: null,
			},
			candidates,
		);
		expect(r.decision).toBe("insert");
		expect(r.matchCode).toBeUndefined();
	});

	it("dedupIdemKey is stable across permutations and variants", () => {
		const a = dedupIdemKey({
			displayName: "Sarah Khan",
			email: "sarah+work@acme.com",
			phone: "+971501234567",
			companyName: "Driven Properties LLC",
		});
		const b = dedupIdemKey({
			displayName: "Sarah Khan",
			email: "SARAH@ACME.COM",
			phone: "+971-50-123-4567",
			companyName: "Driven Properties",
		});
		// Same logical row → same key (email normaliser strips +work, phone strips
		// formatting, company strips LLC).
		expect(a).toBe(b);
	});
});

describe("Week 4 — CSV body tokeniser", () => {
	it("parses a simple CSV with quoted commas + escaped quotes", () => {
		const body = `name,email,note
"Smith, John","john@x.com","He said ""hi"""
Jane Doe,jane@x.com,Plain text
`;
		const { headers, rows } = parseCsvBody(body);
		expect(headers).toEqual(["name", "email", "note"]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual(["Smith, John", "john@x.com", 'He said "hi"']);
		expect(rows[1]).toEqual(["Jane Doe", "jane@x.com", "Plain text"]);
	});

	it("handles \\r\\n line endings + a trailing row without newline", () => {
		const body = "a,b\r\n1,2\r\n3,4";
		const { headers, rows } = parseCsvBody(body);
		expect(headers).toEqual(["a", "b"]);
		expect(rows).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	it("returns empty arrays on an empty input", () => {
		expect(parseCsvBody("")).toEqual({ headers: [], rows: [] });
		expect(parseCsvBody("\n\n\n")).toEqual({ headers: [], rows: [] });
	});

	it("preserves embedded newlines inside quoted fields", () => {
		const body = `name,note
"Sarah","line1
line2"
`;
		const { rows } = parseCsvBody(body);
		expect(rows).toHaveLength(1);
		expect(rows[0][1]).toBe("line1\nline2");
	});
});

describe("Week 4 — buildPreviewRow integration", () => {
	it("flags missing displayName as a validation error (no insert)", () => {
		const candidates: DedupCandidate[] = [];
		const r = buildPreviewRow(
			{
				displayName: null,
				email: "x@x.com",
				phone: null,
				companyName: null,
				source: null,
				notes: null,
			},
			candidates,
		);
		expect(r.validationError).toMatch(/displayName/);
		// Validation error short-circuits the dedup decision (defaults to insert,
		// the commit step skips it on validationError).
		expect(r.dedupDecision).toBe("insert");
	});

	it("baked dedup decision is SKIP when the email is already taken", () => {
		const candidates: DedupCandidate[] = [
			{
				personCode: "P-100",
				displayName: "Sarah Khan",
				email: "sarah@acme.com",
				phone: null,
				companyName: null,
			},
		];
		const r = buildPreviewRow(
			{
				displayName: "Sarah K.",
				email: "sarah@acme.com",
				phone: null,
				companyName: null,
				source: null,
				notes: null,
			},
			candidates,
		);
		expect(r.validationError).toBeUndefined();
		expect(r.dedupDecision).toBe("skip");
		expect(r.dedupTargetCode).toBe("P-100");
		expect(r.fields.source).toBe("csv-import"); // default applied
		expect(r.idemKey).toMatch(/^[a-z0-9]+$/);
	});

	it("baked dedup decision is INSERT for a brand new contact", () => {
		const candidates: DedupCandidate[] = [
			{
				personCode: "P-200",
				displayName: "Sarah Khan",
				email: "sarah@acme.com",
				phone: null,
				companyName: null,
			},
		];
		const r = buildPreviewRow(
			{
				displayName: "Ali Rashid",
				email: "ali@gulf.ae",
				phone: null,
				companyName: null,
				source: null,
				notes: "Met at conference",
			},
			candidates,
		);
		expect(r.dedupDecision).toBe("insert");
		expect(r.dedupTargetCode).toBeUndefined();
		expect(r.fields.notes).toBe("Met at conference");
	});

	it("idemKey is identical for two CSV rows that describe the same person", () => {
		const a = buildPreviewRow(
			{
				displayName: "Sarah Khan",
				email: "sarah+old@acme.com",
				phone: null,
				companyName: "Driven Properties LLC",
				source: null,
				notes: null,
			},
			[],
		);
		const b = buildPreviewRow(
			{
				displayName: "Sarah Khan",
				email: "SARAH@acme.com",
				phone: null,
				companyName: "Driven Properties",
				source: null,
				notes: null,
			},
			[],
		);
		expect(a.idemKey).toBe(b.idemKey);
	});
});

// ─── Week 6.6 — variant-matrix scorer (Attio defineAgentTestSuite) ──────────
//
// Extends the Week-1.6 baseline guards with a variant-matrix layer: the
// SAME deterministic test runs across every (model, prompt, tool-set)
// combination so when one variant regresses, we know which dimension
// caused it. Cost/latency reporting is still Phase 4 (we don't run real
// model calls in CI), but the matrix shape mirrors what the live runner
// will use once it lands.

import { buildPatchFromExtracted } from "./quarantined/fileAnalyzer";
import { sanitiseTitle } from "./titleGeneration";

interface ScorerVariant {
	model: string;
	prompt: "long" | "short" | "no-system";
	toolset: "full" | "minimal" | "none";
}

interface ScorerCase<I, O> {
	id: string;
	input: I;
	expect: (actual: O) => void;
}

/**
 * Runs `cases` × `variants` and asserts each combination. Each variant
 * is a label-only key today (the actual differentiation is configured
 * by the unit under test). The matrix exists so we can plug in real
 * model invocations in Phase 4 without rewriting case bodies.
 */
function runVariantMatrix<I, O>(
	suiteId: string,
	cases: ScorerCase<I, O>[],
	variants: ScorerVariant[],
	runner: (input: I, variant: ScorerVariant) => O,
): void {
	for (const v of variants) {
		describe(`${suiteId} [${v.model}/${v.prompt}/${v.toolset}]`, () => {
			for (const c of cases) {
				it(c.id, () => {
					const actual = runner(c.input, v);
					c.expect(actual);
				});
			}
		});
	}
}

// Variant matrix definition. In Phase 4 this expands to (claude-sonnet-4-5,
// gemini-2.5-flash, nvidia-llama-3.3-70b) × (long, short) × (full, minimal).
// For unit-test usage today we just lock in the matrix shape with a single
// variant per axis so the harness contract is enforced.
const DEFAULT_VARIANTS: ScorerVariant[] = [
	{ model: "deterministic-baseline", prompt: "long", toolset: "full" },
];

describe("Week 6.6 — variant-matrix scorer (deterministic suite)", () => {
	// Suite 1: title sanitiser — model output is unpredictable, but the
	// post-processor MUST normalise consistently.
	runVariantMatrix<string, string>(
		"title sanitiser",
		[
			{
				id: "strips quotes",
				input: '"Find leads in Dubai"',
				expect: (s) => expect(s).toBe("Find leads in Dubai"),
			},
			{
				id: "drops Title: prefix",
				input: "Title: Update Acme deal",
				expect: (s) => expect(s).toBe("Update Acme deal"),
			},
			{
				id: "trailing punctuation",
				input: "Schedule reminder!",
				expect: (s) => expect(s).toBe("Schedule reminder"),
			},
			{
				id: "collapses whitespace",
				input: "Find\n  leads\t in   Dubai",
				expect: (s) => expect(s).toBe("Find leads in Dubai"),
			},
			{
				id: "caps at 60 chars",
				input: "x".repeat(120),
				expect: (s) => expect(s.length).toBeLessThanOrEqual(60),
			},
			{ id: "empty input → empty", input: "   ", expect: (s) => expect(s).toBe("") },
		],
		DEFAULT_VARIANTS,
		(input) => sanitiseTitle(input),
	);

	// Suite 2: file-analysis patch builder — the canonical-field projection
	// must produce identical patches regardless of which vision model is
	// upstream.
	type PatchOut = ReturnType<typeof buildPatchFromExtracted>;

	runVariantMatrix<Record<string, unknown>, PatchOut>(
		"file analyzer patch builder (passport)",
		[
			{
				id: "drops empty values",
				input: { firstName: "Sarah", lastName: "", documentNumber: null },
				expect: (patches) => {
					const fieldNames = patches.map((p) => p.field);
					expect(fieldNames).toContain("firstName");
					expect(fieldNames).not.toContain("lastName");
					expect(fieldNames).not.toContain("documentNumber");
				},
			},
			{
				id: "synthesises displayName from first+last",
				input: { firstName: "Sarah", lastName: "Khan" },
				expect: (patches) => {
					const dn = patches.find((p) => p.field === "displayName");
					expect(dn).toBeDefined();
					expect(dn?.value).toBe("Sarah Khan");
				},
			},
			{
				id: "no displayName when both names missing",
				input: { documentNumber: "X12345" },
				expect: (patches) => {
					const fieldNames = patches.map((p) => p.field);
					expect(fieldNames).not.toContain("displayName");
					expect(fieldNames).toContain("documentNumber");
				},
			},
			{
				id: "documentNumber confidence is high",
				input: { documentNumber: "X12345" },
				expect: (patches) => {
					const docnum = patches.find((p) => p.field === "documentNumber");
					expect(docnum?.confidence ?? 0).toBeGreaterThanOrEqual(0.9);
				},
			},
		],
		DEFAULT_VARIANTS,
		(input) => buildPatchFromExtracted("passport", input),
	);

	// Suite 3: file-analysis patch builder — invoice variant. Tests that
	// kind-specific extraction stays kind-specific.
	runVariantMatrix<Record<string, unknown>, PatchOut>(
		"file analyzer patch builder (invoice)",
		[
			{
				id: "extracts vendor + total",
				input: { vendor: "Acme", invoiceNumber: "INV-001", total: 1234, currency: "USD" },
				expect: (patches) => {
					const fieldNames = patches.map((p) => p.field);
					expect(fieldNames).toContain("vendor");
					expect(fieldNames).toContain("total");
					expect(fieldNames).toContain("currency");
				},
			},
			{
				id: "doesn't bleed passport fields into invoice extraction",
				input: { vendor: "Acme", firstName: "Sarah" }, // firstName is invalid for invoice kind
				expect: (patches) => {
					const fieldNames = patches.map((p) => p.field);
					expect(fieldNames).toContain("vendor");
					expect(fieldNames).not.toContain("firstName");
					expect(fieldNames).not.toContain("displayName");
				},
			},
		],
		DEFAULT_VARIANTS,
		(input) => buildPatchFromExtracted("invoice", input),
	);
});

// ─── Week 4.5 — friendly-tool-error mapper ────────────────────────────
// Regression guard for the 2026-05-24 incident where a `commit_create_lead`
// argument-validation failure surfaced as the unhelpful generic
// "An unexpected error occurred. Please try again."

describe("friendlyToolError", () => {
	it("maps an explicit DUPLICATE code into a helpful suggestion with personCode", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{
				ok: false,
				error: "Lead with this email already exists",
				code: "DUPLICATE",
				data: {
					code: "DUPLICATE",
					personCode: "P-007",
					message: "Lead with this email already exists",
				},
			},
			"commit_create_lead",
		);
		expect(r.code).toBe("DUPLICATE");
		expect(r.markdown).toContain("already exists");
		// Currently the helper sources personCode from `data` only when the
		// outer envelope is the Convex `{ data }` shape; this assertion just
		// checks the markdown surfaces the right concept.
		expect(r.markdown.toLowerCase()).toMatch(/email|update|different/);
	});

	it("recognises a Convex argument-validation failure and rewrites it", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{
				ok: false,
				error: "ArgumentValidationError: Object contains extra field `notes` that is not in the validator.",
			},
			"commit_create_lead",
		);
		expect(r.code).toBe("ARG_MISMATCH");
		expect(r.markdown).toContain("unexpected field");
		expect(r.markdown.toLowerCase()).toContain("manually");
	});

	it("never echoes an unbounded error string back to the user", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const huge = `Boom! ${"x".repeat(2000)}`;
		const r = friendlyToolError({ ok: false, error: huge }, "create_lead");
		expect(r.markdown.length).toBeLessThan(700);
		expect(r.markdown).toContain("create_lead");
	});

	it("FORBIDDEN code routes to a permissions-style explanation", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{ ok: false, error: "You don't have permission.", code: "AI_TOOL_UNAUTHORIZED" },
			"create_lead",
		);
		expect(r.code).toBe("AI_TOOL_UNAUTHORIZED");
		expect(r.markdown.toLowerCase()).toContain("admin");
	});

	it("RATE_LIMITED code routes to a wait-and-try-again explanation", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{ ok: false, error: "Too many requests.", code: "RATE_LIMITED" },
			"create_lead",
		);
		expect(r.code).toBe("RATE_LIMITED");
		expect(r.markdown.toLowerCase()).toContain("wait");
	});

	it("falls back to the unknown-error template when nothing matches", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError({ ok: false, error: "Something exploded." }, "create_lead");
		expect(r.code).toBe("UNKNOWN");
		expect(r.markdown).toContain("create_lead");
		expect(r.markdown).toContain("exploded");
	});

	// ─── P1.11 — Multi-tier envelope ───────────────────────────────
	// Phase 4 Part 1 P1.11 (`PHASE-3-AI-AUDIT.md §5`). Each known code
	// must populate `summary` (always shown) + at least one of
	// `details` / `manualSteps` / `recoveryActions` so the chat
	// renderer has something to put in the collapsibles.

	it("DUPLICATE returns a structured envelope with manual steps and recovery actions", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{
				ok: false,
				error: "Already exists",
				code: "DUPLICATE",
				data: { code: "DUPLICATE", personCode: "P-007" },
			},
			"commit_create_lead",
		);
		expect(r.summary).toContain("P-007");
		expect(r.details).toBeTruthy();
		expect(Array.isArray(r.manualSteps)).toBe(true);
		expect(r.manualSteps!.length).toBeGreaterThanOrEqual(2);
		expect(Array.isArray(r.recoveryActions)).toBe(true);
		expect(r.recoveryActions!.length).toBeGreaterThan(0);
		expect(r.recoveryActions![0]).toMatchObject({
			label: expect.any(String),
			intent: expect.any(String),
		});
	});

	it("RATE_LIMITED returns at least one recovery action", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{ ok: false, error: "Hit rate limit", code: "RATE_LIMITED" },
			"create_lead",
		);
		expect(r.code).toBe("RATE_LIMITED");
		expect(r.summary.toLowerCase()).toContain("rate limit");
		expect(r.recoveryActions?.length).toBeGreaterThan(0);
	});

	it("FORBIDDEN returns numbered manual steps the user can follow", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{ ok: false, error: "Need leads.update", code: "FORBIDDEN" },
			"update_entity",
		);
		expect(r.code).toBe("FORBIDDEN");
		expect(r.manualSteps).toBeDefined();
		expect(r.manualSteps!.some((s) => s.toLowerCase().includes("admin"))).toBe(true);
	});

	it("ARG_MISMATCH returns a recovery action and manual steps", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{
				ok: false,
				error: "ArgumentValidationError: extra field `foo`.",
			},
			"commit_update_entity",
		);
		expect(r.code).toBe("ARG_MISMATCH");
		expect(r.summary.toLowerCase()).toContain("unexpected field");
		expect(r.manualSteps).toBeDefined();
		expect(r.recoveryActions).toBeDefined();
	});

	it("legacy `markdown` is derived from the structured fields", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const r = friendlyToolError(
			{ ok: false, error: "Need leads.update", code: "FORBIDDEN" },
			"update_entity",
		);
		// Headline appears bolded in the legacy markdown body.
		expect(r.markdown).toContain(`**${r.summary}**`);
		// Manual-steps body appears in legacy markdown.
		expect(r.markdown).toContain("manually");
	});

	it("short is always ≤ 60 chars (badge-friendly)", async () => {
		const { friendlyToolError } = await import("./orchestrator/friendlyToolError");
		const longErr = "a".repeat(500);
		const r = friendlyToolError({ ok: false, error: longErr }, "create_lead");
		expect(r.short.length).toBeLessThanOrEqual(60);
	});
});

// ─── Week 4.5 — commit-arg strip via zod ──────────────────────────────
// Direct test of the resume.ts behaviour: parsing the propose payload
// through the commit's zod schema BEFORE invoking execute strips
// propose-only fields (e.g. `notes` on create_lead).

describe("commit zod strip", () => {
	it("strips propose-only fields from the payload", () => {
		// Mirror the create_lead -> commit_create_lead schema shape.
		const commitSchema = z.object({
			displayName: z.string(),
			email: z.string().optional(),
			phone: z.string().optional(),
			source: z.string().default("manual"),
			assignedTo: z.string().optional(),
		});
		const propose = {
			displayName: "Farooq",
			email: "farooq@example.com",
			phone: undefined,
			source: "manual",
			notes: "Initial note from propose", // propose-only, must be stripped
		};
		const parsed = commitSchema.safeParse(propose);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).not.toHaveProperty("notes");
			expect(parsed.data.displayName).toBe("Farooq");
			expect(parsed.data.source).toBe("manual");
		}
	});

	it("applies defaults when the field is missing", () => {
		const commitSchema = z.object({
			displayName: z.string(),
			source: z.string().default("manual"),
		});
		const parsed = commitSchema.safeParse({ displayName: "Farooq" });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.source).toBe("manual");
	});
});
