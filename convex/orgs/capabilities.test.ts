/**
 * Contract tests for the org-admin capabilities (settings + members + roles).
 * Covers: schema parsing, RBAC denials, channel_blocked over WhatsApp,
 * needs_step_up without a token, happy path on chat with a token (via
 * an injected verifier).
 */
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { buildContractCasesForAll } from "../ai/registry/coverage";
import type { CapabilityCtx, Principal } from "../ai/registry/types";
import { runCapability } from "../ai/registry/wrapper";
import { ORG_ADMIN_CAPABILITIES } from "./capabilities";

describe("orgs/capabilities — contract test generator", () => {
	const cases = buildContractCasesForAll([...ORG_ADMIN_CAPABILITIES]);
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

const updateOrgSettings = ORG_ADMIN_CAPABILITIES.find((c) => c.name === "update_org_settings");
const removeMember = ORG_ADMIN_CAPABILITIES.find((c) => c.name === "remove_member");
const inviteMember = ORG_ADMIN_CAPABILITIES.find((c) => c.name === "invite_member");

describe("update_org_settings — risk gate", () => {
	if (!updateOrgSettings) throw new Error("expected update_org_settings");

	it("denied — principal lacks org.editSettings", async () => {
		const r = await runCapability(
			updateOrgSettings,
			{ settings: { defaultCurrency: "USD" } },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("channel_blocked — irreversible over whatsapp", async () => {
		const r = await runCapability(
			updateOrgSettings,
			{ settings: { defaultCurrency: "USD" } },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["org.editSettings"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up — irreversible without a step-up token", async () => {
		const r = await runCapability(
			updateOrgSettings,
			{ settings: { defaultCurrency: "USD" } },
			makeCtx(makePrincipal({ permissions: ["org.editSettings"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});

	it("happy path — token present + verifier accepts → cap.run reached (and fails on missing ctx)", async () => {
		// With a token the wrapper bypasses needs_step_up; the run() body
		// then attempts the runMutation which throws because ctx is fake.
		// The wrapper classifies that as `business_error` — what matters
		// here is that we got PAST step 6b.
		const r = await runCapability(
			updateOrgSettings,
			{ settings: { defaultCurrency: "USD" } },
			{
				...makeCtx(makePrincipal({ permissions: ["org.editSettings"] }), "stepup-token"),
				stepUpVerifier: async () => true,
			},
		);
		expect(["business_error", "ok"]).toContain(r.status);
	});

	it("verifier rejects token → needs_step_up", async () => {
		const r = await runCapability(
			updateOrgSettings,
			{ settings: { defaultCurrency: "USD" } },
			{
				...makeCtx(makePrincipal({ permissions: ["org.editSettings"] }), "stale-token"),
				stepUpVerifier: async () => false,
			},
		);
		expect(r.status).toBe("needs_step_up");
	});
});

describe("remove_member — irreversible everywhere except chat with 2FA", () => {
	if (!removeMember) throw new Error("expected remove_member");

	it("channel_blocked — irreversible over whatsapp", async () => {
		const r = await runCapability(
			removeMember,
			{ targetUserId: "user_x" },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["members.remove"] })),
		);
		expect(r.status).toBe("channel_blocked");
	});

	it("needs_step_up over chat without a token", async () => {
		const r = await runCapability(
			removeMember,
			{ targetUserId: "user_x" },
			makeCtx(makePrincipal({ permissions: ["members.remove"] })),
		);
		expect(r.status).toBe("needs_step_up");
	});

	it("denied without members.remove", async () => {
		const r = await runCapability(
			removeMember,
			{ targetUserId: "user_x" },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});
});

describe("invite_member — reversible (no 2FA fence)", () => {
	if (!inviteMember) throw new Error("expected invite_member");

	it("denied without members.invite", async () => {
		const r = await runCapability(
			inviteMember,
			{ email: "x@y.com", roleId: "role_id" },
			makeCtx(makePrincipal({ permissions: [] })),
		);
		expect(r.status).toBe("denied");
	});

	it("allowed over whatsapp (reversible)", async () => {
		// A reversible cap on whatsapp doesn't trip channel_blocked. The
		// wrapper proceeds to run() which fails because ctx is a stub —
		// classified as business_error. The point of this test is that we
		// reach step 7 (run), not stop at step 5 (channel).
		const r = await runCapability(
			inviteMember,
			{ email: "x@y.com", roleId: "role_id" },
			makeCtx(makePrincipal({ channel: "whatsapp", permissions: ["members.invite"] })),
		);
		expect(r.status).not.toBe("channel_blocked");
		expect(r.status).not.toBe("needs_step_up");
	});
});
