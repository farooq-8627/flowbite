/**
 * audit.ts unit tests — pure shape assertions on `redactArgs` plus a
 * smoke test that `writeAudit` is a no-op when there is no live ctx
 * (the test-harness path) and never throws on a faulty scheduler.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { redactArgs, writeAudit } from "./audit";
import { ok } from "./result";
import type { Capability, Principal } from "./types";

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

function makeCap(over: Partial<Capability> = {}): Capability {
	return {
		name: "test_cap",
		module: "test",
		group: "test",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "test", goodExample: { name: "Sara" } },
		drive: { onSuccess: "done" },
		input: z.object({ name: z.string() }),
		run: async () => ok({ headline: "ran" }),
		...over,
	};
}

describe("redactArgs", () => {
	it("returns empty shape for null/undefined/non-object args", () => {
		expect(redactArgs(undefined)).toEqual({ keys: [], values: {}, truncated: false });
		expect(redactArgs(null)).toEqual({ keys: [], values: {}, truncated: false });
		expect(redactArgs("just a string")).toEqual({
			keys: [],
			values: {},
			truncated: false,
		});
	});

	it("redacts every sensitive key (case-insensitive)", () => {
		const result = redactArgs({
			email: "x@y.com",
			password: "hunter2",
			API_KEY: "k_live_secret",
			Token: "abc",
			displayName: "Sara",
		});
		expect(result.values.email).toBe("x@y.com");
		expect(result.values.password).toBe("[redacted]");
		expect(result.values.API_KEY).toBe("[redacted]");
		expect(result.values.Token).toBe("[redacted]");
		expect(result.values.displayName).toBe("Sara");
	});

	it("truncates long string values", () => {
		const long = "a".repeat(500);
		const r = redactArgs({ note: long });
		expect(r.values.note.length).toBeLessThan(70);
		expect(r.values.note.endsWith("…")).toBe(true);
	});

	it("collapses arrays to a count and nested objects to a placeholder", () => {
		const r = redactArgs({
			tags: ["a", "b", "c"],
			meta: { foo: 1, nested: { deep: true } },
			count: 7,
			done: false,
		});
		expect(r.values.tags).toBe("[3 items]");
		expect(r.values.meta).toBe("{…}");
		expect(r.values.count).toBe("7");
		expect(r.values.done).toBe("false");
	});

	it("flags truncated when more than the cap of top-level keys", () => {
		const big: Record<string, string> = {};
		for (let i = 0; i < 25; i++) big[`field_${i}`] = `v_${i}`;
		const r = redactArgs(big);
		expect(r.truncated).toBe(true);
		// Every key is recorded — only the values map is capped.
		expect(r.keys.length).toBe(25);
		expect(Object.keys(r.values).length).toBeLessThanOrEqual(12);
	});
});

describe("writeAudit", () => {
	it("is a no-op when ctx is undefined (test harness path)", async () => {
		// Should resolve without throwing — purely a smoke test.
		await expect(
			writeAudit({
				capability: makeCap(),
				args: { name: "Sara" },
				result: ok({ headline: "ran" }),
				ctx: { ctx: undefined as unknown as ActionCtx, principal: makePrincipal() },
			}),
		).resolves.toBeUndefined();
	});

	it("skips outcomes that did not execute (denied / channel_blocked / needs_step_up)", async () => {
		const runMutation = vi.fn();
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		for (const status of [
			"denied",
			"channel_blocked",
			"needs_step_up",
			"needs_repair",
		] as const) {
			await writeAudit({
				capability: makeCap(),
				args: { name: "Sara" },
				result: { status, headline: "no execution" },
				ctx: { ctx: fakeCtx, principal: makePrincipal() },
			});
		}
		expect(runMutation).not.toHaveBeenCalled();
	});

	it("never throws even when the scheduler call rejects", async () => {
		const runMutation = vi.fn().mockRejectedValue(new Error("scheduler down"));
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		await expect(
			writeAudit({
				capability: makeCap(),
				args: { name: "Sara" },
				result: ok({ headline: "ran" }),
				ctx: { ctx: fakeCtx, principal: makePrincipal() },
			}),
		).resolves.toBeUndefined();
	});

	it("schedules the audit log for ok outcomes with redacted metadata", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		await writeAudit({
			capability: makeCap({
				name: "create_lead",
				risk: "reversible",
				module: "leads",
				group: "leads",
			}),
			args: { displayName: "Sara", password: "hunter2" },
			result: ok({ headline: "Created P-001" }),
			ctx: {
				ctx: fakeCtx,
				principal: makePrincipal({ channel: "whatsapp" }),
			},
		});
		expect(runMutation).toHaveBeenCalledTimes(1);
		const [, args] = runMutation.mock.calls[0];
		const typed = args as {
			action: string;
			entityType: string;
			entityId: string;
			toolName: string;
			description: string;
			metadata?: Record<string, string | number | boolean>;
		};
		expect(typed.action).toBe("ai.cap.create_lead");
		expect(typed.entityType).toBe("ai_capability");
		expect(typed.entityId).toBe("create_lead");
		expect(typed.toolName).toBe("create_lead");
		expect(typed.description).toContain("create_lead");
		expect(typed.metadata?.status).toBe("ok");
		expect(typed.metadata?.channel).toBe("whatsapp");
		expect(typed.metadata?.riskTier).toBe("reversible");
		expect(typed.metadata?.module).toBe("leads");
		// Sensitive arg redacted in the serialised summary.
		expect(typed.metadata?.argKeys).toBe("displayName,password");
		const summary = typed.metadata?.argSummary;
		expect(typeof summary).toBe("string");
		if (typeof summary === "string") {
			expect(summary).toContain("displayName=Sara");
			expect(summary).toContain("password=[redacted]");
			expect(summary).not.toContain("hunter2");
		}
	});

	// ─── B.38 — source override for autonomous turns ────────────────────

	it("defaults source to principal.channel when no override is supplied", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		await writeAudit({
			capability: makeCap({ name: "create_lead", module: "leads", group: "leads" }),
			args: { name: "Sara" },
			result: ok({ headline: "ok" }),
			ctx: {
				ctx: fakeCtx,
				principal: makePrincipal({ channel: "whatsapp" }),
			},
		});
		const [, args] = runMutation.mock.calls[0];
		const typed = args as {
			metadata?: Record<string, string | number | boolean>;
		};
		expect(typed.metadata?.source).toBe("whatsapp");
		expect(typed.metadata?.channel).toBe("whatsapp");
	});

	it("honours an explicit source override (autonomous distinguishable from whatsapp)", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		await writeAudit({
			capability: makeCap({ name: "create_lead", module: "leads", group: "leads" }),
			args: { name: "Sara" },
			result: ok({ headline: "ok" }),
			ctx: {
				ctx: fakeCtx,
				principal: makePrincipal({ channel: "whatsapp" }),
			},
			source: "autonomous",
		});
		const [, args] = runMutation.mock.calls[0];
		const typed = args as {
			metadata?: Record<string, string | number | boolean>;
		};
		// Channel still records the transport (whatsapp) — `source` is what
		// distinguishes "agent typed it on WhatsApp" vs "engine acted on
		// the customer's inbound."
		expect(typed.metadata?.channel).toBe("whatsapp");
		expect(typed.metadata?.source).toBe("autonomous");
	});

	it("honours autonomous_reply (Mode C / wa_profile S15) override", async () => {
		const runMutation = vi.fn().mockResolvedValue(undefined);
		const fakeCtx = { runMutation } as unknown as ActionCtx;
		await writeAudit({
			capability: makeCap({ name: "send_whatsapp", module: "messaging", group: "messaging" }),
			args: { recipientPersonCode: "P-007" },
			result: ok({ headline: "ok" }),
			ctx: {
				ctx: fakeCtx,
				principal: makePrincipal({ channel: "whatsapp" }),
			},
			source: "autonomous_reply",
		});
		const [, args] = runMutation.mock.calls[0];
		const typed = args as {
			metadata?: Record<string, string | number | boolean>;
		};
		expect(typed.metadata?.source).toBe("autonomous_reply");
	});
});
