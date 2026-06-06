/**
 * convex/ai/registry/wrapper.test.ts — Stage S1 acceptance tests.
 *
 * Locks the Correctness Machine: every {@link Outcome} in the taxonomy (§B3)
 * has a passing test, and `runCapability` NEVER throws. Plus direct unit tests
 * for the three pure gate predicates (§1.6 / §B5 risk policy).
 *
 * The wrapper is pure (resolver + run are injected/mocked), so these need no
 * convex-test harness — `ctx.ctx` is never touched by the wrapper itself.
 */
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { field } from "./coerce";
import { canRun, channelAllows, needsStepUp } from "./gate";
import { ok, partial } from "./result";
import type { Capability, CapabilityCtx, Channel, Principal, RiskTier } from "./types";
import { type RefResolver, runCapability } from "./wrapper";

const TZ = "America/New_York";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCap(over: Partial<Capability> = {}): Capability {
	return {
		name: "test_cap",
		module: "test",
		group: "test",
		permission: null,
		risk: "safe",
		channels: ["chat", "whatsapp", "mcp", "rest"],
		spec: { whenToCall: "test only", goodExample: { name: "Sara" } },
		drive: { onSuccess: "done" },
		input: z.object({ name: z.string() }),
		run: async () => ok({ headline: "ran" }),
		...over,
	};
}

function makePrincipal(over: Partial<Principal> = {}): Principal {
	return {
		kind: "member",
		userId: "u1" as unknown as Id<"users">,
		orgId: "o1" as unknown as Id<"orgs">,
		permissions: [],
		channel: "chat",
		...over,
	};
}

function makeCtx(principal: Principal, stepUpToken?: string): CapabilityCtx {
	return { ctx: {} as unknown as ActionCtx, principal, stepUpToken };
}

// ─── One test per Outcome ─────────────────────────────────────────────────────

describe("runCapability — Outcome taxonomy", () => {
	it("ok — happy path runs and returns the run() envelope", async () => {
		const r = await runCapability(makeCap(), { name: "Sara" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("ok");
		expect(r.headline).toBe("ran");
	});

	it("needs_repair — a bad date fails the strict parse and yields a repair hint", async () => {
		const cap = makeCap({
			input: z.object({ dueAt: field.timestamp(TZ) }),
			spec: { whenToCall: "x", goodExample: { dueAt: "next Tuesday" } },
		});
		const r = await runCapability(
			cap,
			{ dueAt: "not a date at all" },
			makeCtx(makePrincipal()),
		);
		expect(r.status).toBe("needs_repair");
		expect(r.repair?.field).toBe("dueAt");
		expect(r.repair?.example).toEqual({ dueAt: "next Tuesday" });
	});

	it("not_found — the resolver fails to resolve a ref", async () => {
		const resolver: RefResolver = async () => ({
			status: "not_found",
			headline: "No lead P-999.",
		});
		const r = await runCapability(makeCap(), { name: "x" }, makeCtx(makePrincipal()), resolver);
		expect(r.status).toBe("not_found");
		expect(r.headline).toBe("No lead P-999.");
	});

	it("ambiguous — the resolver matches more than one record", async () => {
		const resolver: RefResolver = async () => ({
			status: "ambiguous",
			question: "Which Sara?",
			options: ["P-001", "P-002"],
		});
		const r = await runCapability(
			makeCap(),
			{ name: "Sara" },
			makeCtx(makePrincipal()),
			resolver,
		);
		expect(r.status).toBe("ambiguous");
		expect(r.suggestedNext).toHaveLength(2);
	});

	it("denied — principal lacks the required permission", async () => {
		const cap = makeCap({ permission: "leads.delete" });
		const r = await runCapability(
			cap,
			{ name: "x" },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
		expect(r.headline).toContain("leads.delete");
	});

	it("channel_blocked — capability not allowed on the principal's channel", async () => {
		const cap = makeCap({ channels: ["chat"] });
		const ctx = makeCtx(makePrincipal({ channel: "whatsapp" }));
		const r = await runCapability(cap, { name: "x" }, ctx);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up — irreversible capability without a 2FA token", async () => {
		const cap = makeCap({
			risk: "irreversible",
			permission: "data.bulkActions",
			channels: ["chat"],
		});
		const ctx = makeCtx(makePrincipal({ permissions: ["data.bulkActions"] }));
		const r = await runCapability(cap, { name: "x" }, ctx);
		expect(r.status).toBe("needs_step_up");
	});

	it("ok — the same irreversible capability runs once a step-up token is present", async () => {
		const cap = makeCap({
			risk: "irreversible",
			permission: "data.bulkActions",
			channels: ["chat"],
		});
		const ctx = makeCtx(makePrincipal({ permissions: ["data.bulkActions"] }), "stepup-token");
		const r = await runCapability(cap, { name: "x" }, ctx);
		expect(r.status).toBe("ok");
	});

	it("business_error — run() throws a ConvexError (string data)", async () => {
		const cap = makeCap({
			run: async () => {
				throw new ConvexError("Stage is closed");
			},
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("business_error");
		expect(r.headline).toBe("Stage is closed");
	});

	it("business_error — ConvexError with structured { message } data", async () => {
		const cap = makeCap({
			run: async () => {
				throw new ConvexError({ code: "DUPLICATE", message: "That lead already exists." });
			},
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("business_error");
		expect(r.headline).toBe("That lead already exists.");
	});

	it("needs_repair — run() throws a Convex argument-validator error", async () => {
		const cap = makeCap({
			run: async () => {
				throw new Error("ArgumentValidationError: Object contains extra field `foo`");
			},
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("needs_repair");
		expect(r.repair?.example).toEqual({ name: "Sara" });
	});

	it("infra_retry — run() throws a transient provider error", async () => {
		const cap = makeCap({
			run: async () => {
				throw new Error("503 Service Unavailable");
			},
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("infra_retry");
	});

	it("partial — run() returns a partial envelope with per-row errors", async () => {
		const cap = makeCap({
			run: async () =>
				partial({
					headline: "2 of 3 updated",
					errors: [{ item: "L-3", reason: "locked" }],
				}),
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("partial");
		expect(r.errors).toHaveLength(1);
	});
});

// ─── Contract invariants ───────────────────────────────────────────────────────

describe("runCapability — never throws", () => {
	it("classifies a non-Error throw as business_error", async () => {
		const cap = makeCap({
			run: async () => {
				throw "boom";
			},
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()));
		expect(r.status).toBe("business_error");
	});

	it("classifies a throw from the resolver", async () => {
		const resolver: RefResolver = async () => {
			throw new ConvexError("resolver blew up");
		};
		const r = await runCapability(makeCap(), { name: "x" }, makeCtx(makePrincipal()), resolver);
		expect(r.status).toBe("business_error");
		expect(r.headline).toBe("resolver blew up");
	});

	it("passes resolver-augmented args through to run()", async () => {
		const resolver: RefResolver = async (_cap, args) => ({
			status: "ok",
			args: { ...args, leadId: "lead_1" },
		});
		const cap = makeCap({
			run: async (_ctx, args) => ok({ headline: (args as { leadId: string }).leadId }),
		});
		const r = await runCapability(cap, { name: "x" }, makeCtx(makePrincipal()), resolver);
		expect(r.headline).toBe("lead_1");
	});
});

// ─── Gate unit tests (§1.6 / §B5) ──────────────────────────────────────────────

describe("gate.canRun", () => {
	it("allows when the capability has no permission", () => {
		expect(canRun(makePrincipal(), makeCap({ permission: null }))).toBe(true);
	});
	it("denies when the principal lacks the permission", () => {
		expect(
			canRun(makePrincipal({ permissions: [] }), makeCap({ permission: "leads.delete" })),
		).toBe(false);
	});
	it("allows when the principal holds the permission", () => {
		expect(
			canRun(
				makePrincipal({ permissions: ["leads.delete"] }),
				makeCap({ permission: "leads.delete" }),
			),
		).toBe(true);
	});
});

describe("gate.channelAllows", () => {
	const channels: Channel[] = ["chat", "mcp", "rest"];
	it("allows a channel in the declared list", () => {
		expect(channelAllows("chat", makeCap({ channels }))).toBe(true);
	});
	it("blocks a channel not in the declared list", () => {
		expect(channelAllows("whatsapp", makeCap({ channels }))).toBe(false);
	});
	it("hard-blocks irreversible over WhatsApp even if declared", () => {
		const cap = makeCap({ risk: "irreversible" as RiskTier, channels: ["chat", "whatsapp"] });
		expect(channelAllows("whatsapp", cap)).toBe(false);
		expect(channelAllows("chat", cap)).toBe(true);
	});
});

describe("gate.needsStepUp", () => {
	it("requires step-up for irreversible without a token", () => {
		expect(needsStepUp(makeCap({ risk: "irreversible" }), makeCtx(makePrincipal()))).toBe(true);
	});
	it("clears once a step-up token is present", () => {
		expect(
			needsStepUp(makeCap({ risk: "irreversible" }), makeCtx(makePrincipal(), "token")),
		).toBe(false);
	});
	it("never required for safe / reversible", () => {
		expect(needsStepUp(makeCap({ risk: "safe" }), makeCtx(makePrincipal()))).toBe(false);
		expect(needsStepUp(makeCap({ risk: "reversible" }), makeCtx(makePrincipal()))).toBe(false);
	});
});

// ─── B.38 — round-trip: ctx.trigger overrides audit source ────────────────────

describe("runCapability — B.38 audit source override", () => {
	it("ctx.trigger:'autonomous' lands as source:'autonomous' on the audit row", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		const ctx: CapabilityCtx = {
			ctx: fakeCtx,
			principal: makePrincipal({ channel: "whatsapp" }),
			trigger: "autonomous",
		};
		await runCapability(makeCap(), { name: "Sara" }, ctx);

		// One audit-write call. metadata.source must be 'autonomous',
		// NOT 'whatsapp' — that's the whole point of B.38.
		expect(runMutation).toHaveBeenCalledTimes(1);
		const auditPayload = runMutation.mock.calls[0][1] as {
			metadata?: Record<string, string | number | boolean>;
		};
		expect(auditPayload.metadata?.source).toBe("autonomous");
		expect(auditPayload.metadata?.channel).toBe("whatsapp");
	});

	it("default ctx (no trigger) falls back to principal.channel", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		const ctx: CapabilityCtx = {
			ctx: fakeCtx,
			principal: makePrincipal({ channel: "chat" }),
			// trigger intentionally omitted — older callers
		};
		await runCapability(makeCap(), { name: "Sara" }, ctx);
		const auditPayload = runMutation.mock.calls[0][1] as {
			metadata?: Record<string, string | number | boolean>;
		};
		expect(auditPayload.metadata?.source).toBe("chat");
	});

	it("ctx.trigger:'autonomous_reply' lands as source:'autonomous_reply' (Mode C / S15)", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		const ctx: CapabilityCtx = {
			ctx: fakeCtx,
			principal: makePrincipal({ channel: "whatsapp" }),
			trigger: "autonomous_reply",
		};
		await runCapability(makeCap(), { name: "Sara" }, ctx);
		const auditPayload = runMutation.mock.calls[0][1] as {
			metadata?: Record<string, string | number | boolean>;
		};
		expect(auditPayload.metadata?.source).toBe("autonomous_reply");
	});
});
