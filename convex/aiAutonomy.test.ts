/// <reference types="vite/client" />
/**
 * S8 — org.settings.aiAutonomy contract tests.
 *
 * Pins the four guarantees of the new autonomy surface:
 *
 *   1. Default seed: when no slot is set, the migration writes
 *      `autoActFromConversations:true` + `destructiveRequires2FA:true` +
 *      `whatsappAgentEnabled:false`.
 *   2. `orgs.mutations.update` deep-merges aiAutonomy patches without
 *      clobbering siblings (defaultCurrency etc.).
 *   3. `perRoleAutonomyCap` round-trips a role → cap map.
 *   4. The migration strips `users.preferences.aiApprovals` from existing
 *      rows and is idempotent on a clean DB.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedOrgWithOwner(t: ReturnType<typeof convexTest>) {
	const now = Date.now();
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			tokenIdentifier: "password|alice@example.com",
			email: "alice@example.com",
			name: "Alice",
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const asUser = t.withIdentity({ subject: userId });
	const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "AcmeOrg" });
	return { userId, asUser, orgId };
}

describe("S8 — org.settings.aiAutonomy", () => {
	it("guard 1 — update mutation accepts aiAutonomy patch + deep-merges siblings", async () => {
		const t = convexTest(schema, modules);
		const { asUser, orgId } = await seedOrgWithOwner(t);

		// Seed an unrelated setting first so we can prove deep-merge.
		await asUser.mutation(api.orgs.mutations.update, {
			orgId,
			settings: { defaultCurrency: "USD" },
		});

		await asUser.mutation(api.orgs.mutations.update, {
			orgId,
			settings: { aiAutonomy: { autoActFromConversations: false } },
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.settings?.defaultCurrency).toBe("USD");
		expect(org!.settings?.aiAutonomy?.autoActFromConversations).toBe(false);
	});

	it("guard 2 — patches deep-merge inside aiAutonomy", async () => {
		const t = convexTest(schema, modules);
		const { asUser, orgId } = await seedOrgWithOwner(t);

		await asUser.mutation(api.orgs.mutations.update, {
			orgId,
			settings: {
				aiAutonomy: {
					autoActFromConversations: true,
					whatsappAgentEnabled: false,
				},
			},
		});
		// Patch only one field — the other must survive.
		await asUser.mutation(api.orgs.mutations.update, {
			orgId,
			settings: { aiAutonomy: { whatsappAgentEnabled: true } },
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.settings?.aiAutonomy?.autoActFromConversations).toBe(true);
		expect(org!.settings?.aiAutonomy?.whatsappAgentEnabled).toBe(true);
	});

	it("guard 3 — perRoleAutonomyCap round-trips", async () => {
		const t = convexTest(schema, modules);
		const { asUser, orgId } = await seedOrgWithOwner(t);

		await asUser.mutation(api.orgs.mutations.update, {
			orgId,
			settings: {
				aiAutonomy: {
					perRoleAutonomyCap: { Admin: "reversible", Member: "read" },
				},
			},
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.settings?.aiAutonomy?.perRoleAutonomyCap).toEqual({
			Admin: "reversible",
			Member: "read",
		});
	});

	it("guard 4 — migration seeds defaults on orgs without aiAutonomy + strips users.preferences.aiApprovals + idempotent", async () => {
		const t = convexTest(schema, modules);
		const { userId, orgId } = await seedOrgWithOwner(t);

		// Pre-state: simulate a legacy user row carrying aiApprovals.
		await t.run(async (ctx) => {
			const user = await ctx.db.get(userId);
			if (!user) throw new Error("seed");
			await ctx.db.patch(userId, {
				preferences: {
					...(user.preferences ?? {}),
					aiApprovals: { create_record: true, files: false },
				},
			});
		});

		// First run — applies.
		const result = await t.mutation(
			internal._migrations["2026_06_04_approvalsToAutonomy"].run,
			{},
		);
		expect(result.users.patched).toBe(1);
		expect(result.orgs.patched).toBe(1);

		// User row no longer carries aiApprovals.
		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.preferences?.aiApprovals).toBeUndefined();

		// Org row got default autonomy seed.
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.settings?.aiAutonomy?.autoActFromConversations).toBe(true);
		expect(org!.settings?.aiAutonomy?.destructiveRequires2FA).toBe(true);
		expect(org!.settings?.aiAutonomy?.whatsappAgentEnabled).toBe(false);

		// Second run — idempotent (no rows touched).
		const second = await t.mutation(
			internal._migrations["2026_06_04_approvalsToAutonomy"].run,
			{},
		);
		expect(second.users.patched).toBe(0);
		expect(second.orgs.patched).toBe(0);
	});

	it("guard 5 — dryRun:true reports what would change without writing", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedOrgWithOwner(t);

		await t.run(async (ctx) => {
			const user = await ctx.db.get(userId);
			if (!user) throw new Error("seed");
			await ctx.db.patch(userId, {
				preferences: { ...(user.preferences ?? {}), aiApprovals: { files: true } },
			});
		});

		const dry = await t.mutation(internal._migrations["2026_06_04_approvalsToAutonomy"].run, {
			dryRun: true,
		});
		expect(dry.dryRun).toBe(true);
		expect(dry.users.patched).toBe(1);

		// Row still has the field — dry-run must not write.
		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.preferences?.aiApprovals?.files).toBe(true);
	});
});
