/**
 * Contract tests for the bulk + destructive capabilities (S10).
 * Covers: schema parsing, RBAC denials, channel_blocked over WhatsApp,
 * needs_step_up without a token, happy path with a step-up verifier
 * that accepts the token.
 */
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import type { CapabilityCtx, Principal } from "../../../ai/registry/types";
import { runCapability } from "../../../ai/registry/wrapper";
import { BULK_CAPABILITIES } from "./capabilities";

describe("bulk capabilities — contract test generator", () => {
	const cases = buildContractCasesForAll([...BULK_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

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

const bulkDelete = BULK_CAPABILITIES.find((c) => c.name === "bulk_delete_entities");
const bulkUpdate = BULK_CAPABILITIES.find((c) => c.name === "bulk_update_entities");
const bulkClose = BULK_CAPABILITIES.find((c) => c.name === "bulk_close_deals");
const hardDelete = BULK_CAPABILITIES.find((c) => c.name === "hard_delete_entity");
const importCsv = BULK_CAPABILITIES.find((c) => c.name === "import_csv");

describe("bulk_delete_entities — gate matrix", () => {
	if (!bulkDelete) throw new Error("expected bulk_delete_entities");

	it("denied without data.bulkActions", async () => {
		const r = await runCapability(
			bulkDelete,
			{ entityType: "lead", entityIds: ["P-001"] },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked over whatsapp (irreversible)", async () => {
		const r = await runCapability(
			bulkDelete,
			{ entityType: "lead", entityIds: ["P-001"] },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["data.bulkActions"] })),
		);
		expect(r.status).toBe("channel_blocked");
		expect(r.headline).toMatch(/web app/i);
	});

	it("needs_step_up on chat without a token", async () => {
		const r = await runCapability(
			bulkDelete,
			{ entityType: "lead", entityIds: ["P-001"] },
			makeCtx(makePrincipal({ permissions: ["data.bulkActions"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});

	it("with a verified token → step 7 (run reached)", async () => {
		const r = await runCapability(
			bulkDelete,
			{ entityType: "lead", entityIds: ["P-001"] },
			{
				...makeCtx(
					makePrincipal({ permissions: ["data.bulkActions", "leads.delete"] }),
					"valid-token",
				),
				stepUpVerifier: async () => true,
			},
		);
		// `run()` reached but ctx.runMutation throws; the wrapper classifies
		// per-row errors and returns either `partial`, `business_error`, or
		// `ok`. The point is we got past 6b — not channel_blocked, not
		// needs_step_up, not denied.
		expect(["ok", "partial", "business_error"]).toContain(r.status);
	});
});

describe("bulk_update_entities — gate matrix", () => {
	if (!bulkUpdate) throw new Error("expected bulk_update_entities");

	it("denied without data.bulkActions", async () => {
		const r = await runCapability(
			bulkUpdate,
			{ entityType: "lead", entityIds: ["P-001"], patch: { status: "qualified" } },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked over whatsapp", async () => {
		const r = await runCapability(
			bulkUpdate,
			{ entityType: "lead", entityIds: ["P-001"], patch: { status: "qualified" } },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["data.bulkActions"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up without a token", async () => {
		const r = await runCapability(
			bulkUpdate,
			{ entityType: "lead", entityIds: ["P-001"], patch: { status: "qualified" } },
			makeCtx(makePrincipal({ permissions: ["data.bulkActions"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});
});

describe("bulk_close_deals — gate matrix", () => {
	if (!bulkClose) throw new Error("expected bulk_close_deals");

	it("denied without deals.close", async () => {
		const r = await runCapability(
			bulkClose,
			{ dealIds: ["D-001"], outcome: "won" },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked over whatsapp", async () => {
		const r = await runCapability(
			bulkClose,
			{ dealIds: ["D-001"], outcome: "won" },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["deals.close"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up without a token", async () => {
		const r = await runCapability(
			bulkClose,
			{ dealIds: ["D-001"], outcome: "won" },
			makeCtx(makePrincipal({ permissions: ["deals.close"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});
});

describe("hard_delete_entity — gate matrix", () => {
	if (!hardDelete) throw new Error("expected hard_delete_entity");

	it("denied without data.hardDelete", async () => {
		const r = await runCapability(
			hardDelete,
			{ entityType: "lead", entityId: "lead_123" },
			makeCtx(makePrincipal({ permissions: ["data.bulkActions"] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked over whatsapp", async () => {
		const r = await runCapability(
			hardDelete,
			{ entityType: "lead", entityId: "lead_123" },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["data.hardDelete"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up without a token", async () => {
		const r = await runCapability(
			hardDelete,
			{ entityType: "lead", entityId: "lead_123" },
			makeCtx(makePrincipal({ permissions: ["data.hardDelete"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});
});

describe("import_csv — gate matrix", () => {
	if (!importCsv) throw new Error("expected import_csv");

	it("denied without data.import", async () => {
		const r = await runCapability(
			importCsv,
			{ csvImportId: "csv_123" },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked over whatsapp", async () => {
		const r = await runCapability(
			importCsv,
			{ csvImportId: "csv_123" },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["data.import"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up without a token", async () => {
		const r = await runCapability(
			importCsv,
			{ csvImportId: "csv_123" },
			makeCtx(makePrincipal({ permissions: ["data.import"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});
});

// ─── Bug A / Bug B regression pins (locked 2026-06-07) ───────────────────────
//
// Two production bugs reported on 2026-06-07:
//
//   • Bug A — `bulk_create_entities` rejected the WHOLE batch when the
//     AI emitted a column-backed-but-not-create-accepted key like
//     `status:"new"`, OR a placeholder `assignedTo:"member-1"`. Fix:
//     per-entity create-args allowlist + Convex-ID shape check inside
//     `bulkCreateEntities.run`, drops bad keys to warnings instead of
//     failing the row.
//
//   • Bug B — model looped after a successful create because the OK
//     headline contained "(N rows had unrecognised keys — see warnings)".
//     Fix: clean OK headline + explicit "STOP after ok" line in the
//     bulk group playbook.
//
// Direct unit testing of the run() path needs a fully seeded
// convex-test world (org/user/member/permissions/fieldDefinitions);
// these light-weight pins protect the surface-level contracts so a
// future refactor can't silently revive the regressions.

const bulkCreate = BULK_CAPABILITIES.find((c) => c.name === "bulk_create_entities");

describe("bulk_create_entities — Bug A/B regression pins", () => {
	if (!bulkCreate) throw new Error("expected bulk_create_entities");

	it("(Bug A) input schema accepts a row with placeholder `status` + `assignedTo`", () => {
		// The schema must NOT reject these keys at the zod layer — the
		// run() loop is what filters them with a friendly warning. If
		// zod were tightened to reject them up front, the user would
		// get a `needs_repair` envelope on the very first call which
		// is worse UX than "row created without those fields".
		const parsed = bulkCreate.input.safeParse({
			entityType: "lead",
			rows: [
				{
					displayName: "Alice",
					email: "alice@example.com",
					source: "web",
					status: "new", // Bug A: column-backed, NOT create-accepted
					assignedTo: "member-1", // Bug A: placeholder, not a Convex _id
				},
			],
		});
		expect(parsed.success).toBe(true);
	});

	it("(Bug B) capability spec exposes the bulk group with the STOP playbook line", async () => {
		// Import the registry the same way the host does so we read
		// the playbook the model actually receives. The string MUST
		// contain "STOP rule" + a directive about not retrying after
		// an `ok`. A copy edit that drops these keywords will trip
		// this assertion — by design.
		const { getGroup } = await import("../../../ai/registry/groups");
		const bulkGroup = getGroup("bulk");
		expect(bulkGroup).toBeDefined();
		expect(bulkGroup?.playbook).toContain("STOP rule");
		expect(bulkGroup?.playbook).toMatch(/do not retry|never call/i);
		expect(bulkGroup?.playbook).toContain("`ok`");
	});

	it("(Bug B) drive.onSuccess hint does not nudge the model toward retry", () => {
		// The capability-level drive hint must reinforce stop-after-ok
		// (no "try again" / "retry" wording). Belt-and-braces with the
		// group playbook above.
		const onSuccess = bulkCreate.drive?.onSuccess ?? "";
		expect(onSuccess).not.toMatch(/retry|try again/i);
	});
});
