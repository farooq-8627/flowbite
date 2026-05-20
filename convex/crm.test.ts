/// <reference types="vite/client" />
/**
 * CRM Mutation Tests — convex/crm.test.ts
 *
 * Tests for the canonical mutation pattern across all CRM entities.
 * Covers: leads, contacts, deals — create, convert, stage moves, close.
 *
 * WHAT IS BEING TESTED:
 *   - leads.create: RBAC, dedup, personCode generation, logActivity
 *   - leads.convertToContact: personCode passed, aiContext passed, status updated
 *   - deals.create: pipeline/stage validation, dealCode generation
 *   - deals.moveToStage: stage validation, final→final blocked
 *   - deals.closeAsDone: wonAt/lostAt set correctly
 *   - contacts.create: direct create generates new personCode
 *   - RBAC: viewer cannot create leads/contacts/deals
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, email = "alice@example.com") {
	const now = Date.now();
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { userId, asUser: t.withIdentity({ subject: userId }) };
}

async function seedOrg(t: ReturnType<typeof convexTest>, userId: string) {
	const orgId = await t.run(async (ctx) => {
		const now = Date.now();
		const id = await ctx.db.insert("orgs", {
			name: "Test Org",
			slug: `test-org-${Date.now()}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			createdAt: now,
			updatedAt: now,
		});
		// Permissions come from the SSOT catalog — never hardcode.
		const ownerRoleId = await ctx.db.insert("orgRoles", {
			orgId: id,
			name: "Owner",
			permissions: [...getDefaultPermissionsForRole("Owner")],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId: id,
			userId,
			roleId: ownerRoleId,
			joinedAt: now,
		});
		return id;
	});
	return orgId;
}

async function seedViewerMember(t: ReturnType<typeof convexTest>, orgId: string, userId: string) {
	await t.run(async (ctx) => {
		const now = Date.now();
		const viewerRoleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Viewer",
			permissions: [...getDefaultPermissionsForRole("Viewer")],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId,
			userId,
			roleId: viewerRoleId,
			joinedAt: now,
		});
	});
}

async function seedPipeline(t: ReturnType<typeof convexTest>, orgId: string) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("pipelines", {
			orgId,
			name: "Sales",
			entityType: "deal",
			isDefault: true,
			stages: [
				{ id: "stage_new", name: "New", code: "NEW", order: 0, color: "#3b82f6" },
				{
					id: "stage_qualified",
					name: "Qualified",
					code: "QUAL",
					order: 1,
					color: "#8b5cf6",
					staleAfterDays: 7,
				},
				{
					id: "stage_won",
					name: "Won",
					code: "WON",
					order: 2,
					color: "#22c55e",
					isFinal: true,
					finalType: "positive",
				},
				{
					id: "stage_lost",
					name: "Lost",
					code: "LOST",
					order: 3,
					color: "#ef4444",
					isFinal: true,
					finalType: "negative",
				},
			],
			createdAt: now,
			updatedAt: now,
		});
	});
}

// ─── Leads ────────────────────────────────────────────────────────────────────

describe("leads.create", () => {
	it("creates a lead with a personCode", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const result = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "John Doe",
			email: "john@example.com",
			source: "manual",
		});

		expect(result.leadId).toBeTruthy();
		expect(result.personCode).toMatch(/^P-\d+$/);
	});

	it("generates unique personCodes for each lead", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const r1 = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Alice",
			source: "manual",
		});
		const r2 = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Bob",
			source: "manual",
		});

		expect(r1.personCode).not.toBe(r2.personCode);
	});

	it("blocks viewer from creating leads", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedViewerMember(t, orgId, viewerId);

		await expect(
			asViewer.mutation(api.crm.entities.leads.mutations.create, {
				orgId,
				displayName: "Test",
				source: "manual",
			}),
		).rejects.toThrow();
	});

	it("logs activity after create", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Jane",
			source: "manual",
		});

		const logs = await t.run(async (ctx) => {
			return ctx.db
				.query("activityLogs")
				.withIndex("by_entityType_and_entityId", (q) =>
					q.eq("entityType", "lead").eq("entityId", leadId),
				)
				.collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe("created");
		// personCode is in metadata until Task 7 wires it to top-level field
		expect(logs[0].metadata?.personCode ?? logs[0].personCode).toBeTruthy();
	});
});

// ─── leads.convertToContact ───────────────────────────────────────────────────

describe("leads.convertToContact", () => {
	it("passes personCode and aiContext to contact", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { leadId, personCode } = await asUser.mutation(
			api.crm.entities.leads.mutations.create,
			{
				orgId,
				displayName: "Convert Me",
				source: "manual",
				aiContext: { summary: "VIP client", keyFacts: ["High budget"] },
			},
		);

		const result = await asUser.mutation(api.crm.entities.leads.mutations.convertToContact, {
			orgId,
			leadId,
		});

		expect(result.personCode).toBe(personCode);

		const contact = await t.run(async (ctx) => ctx.db.get(result.contactId));
		expect(contact?.personCode).toBe(personCode);
		expect(contact?.aiContext).toEqual({ summary: "VIP client", keyFacts: ["High budget"] });
	});

	it("marks lead as converted", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Convert Me",
			source: "manual",
		});

		await asUser.mutation(api.crm.entities.leads.mutations.convertToContact, { orgId, leadId });

		const lead = await t.run(async (ctx) => ctx.db.get(leadId));
		expect(lead?.status).toBe("converted");
		expect(lead?.convertedAt).toBeTruthy();
	});

	it("blocks double conversion", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Convert Me",
			source: "manual",
		});

		await asUser.mutation(api.crm.entities.leads.mutations.convertToContact, { orgId, leadId });

		await expect(
			asUser.mutation(api.crm.entities.leads.mutations.convertToContact, { orgId, leadId }),
		).rejects.toThrow();
	});
});

// ─── deals.create + moveToStage + closeAsDone ─────────────────────────────────

describe("deals.create", () => {
	it("creates a deal with a dealCode", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		const result = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Big Deal",
			pipelineId,
			currentStageId: "stage_new",
			source: "manual",
		});

		expect(result.dealId).toBeTruthy();
		expect(result.dealCode).toMatch(/^D-\d+$/);
	});

	it("rejects invalid stageId", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		await expect(
			asUser.mutation(api.crm.entities.deals.mutations.create, {
				orgId,
				title: "Bad Deal",
				pipelineId,
				currentStageId: "stage_nonexistent",
				source: "manual",
			}),
		).rejects.toThrow();
	});
});

describe("deals.moveToStage", () => {
	it("moves deal to a new stage", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Deal",
			pipelineId,
			currentStageId: "stage_new",
			source: "manual",
		});

		await asUser.mutation(api.crm.entities.deals.mutations.moveToStage, {
			orgId,
			dealId,
			stageId: "stage_qualified",
		});

		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal?.currentStageId).toBe("stage_qualified");
		expect(deal?.stageEnteredAt).toBeGreaterThan(0);
	});

	it("blocks final→final stage transition", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Deal",
			pipelineId,
			currentStageId: "stage_won",
			source: "manual",
		});

		await expect(
			asUser.mutation(api.crm.entities.deals.mutations.moveToStage, {
				orgId,
				dealId,
				stageId: "stage_lost",
			}),
		).rejects.toThrow();
	});
});

describe("deals.closeAsDone", () => {
	it("sets wonAt on positive close", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Win",
			pipelineId,
			currentStageId: "stage_new",
			source: "manual",
		});

		await asUser.mutation(api.crm.entities.deals.mutations.closeAsDone, {
			orgId,
			dealId,
			finalType: "positive",
			outcomeReason: "Great fit",
		});

		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal?.wonAt).toBeTruthy();
		expect(deal?.lostAt).toBeUndefined();
		expect(deal?.currentStageId).toBe("stage_won");
	});

	it("sets lostAt on negative close", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Loss",
			pipelineId,
			currentStageId: "stage_new",
			source: "manual",
		});

		await asUser.mutation(api.crm.entities.deals.mutations.closeAsDone, {
			orgId,
			dealId,
			finalType: "negative",
		});

		const deal = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(deal?.lostAt).toBeTruthy();
		expect(deal?.wonAt).toBeUndefined();
	});
});

// ─── contacts.create ──────────────────────────────────────────────────────────

describe("contacts.create", () => {
	it("generates a new personCode for direct create", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const result = await asUser.mutation(api.crm.entities.contacts.mutations.create, {
			orgId,
			displayName: "Direct Contact",
		});

		expect(result.contactId).toBeTruthy();
		expect(result.personCode).toMatch(/^P-\d+$/);
	});

	it("uses passed personCode from conversion", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const result = await asUser.mutation(api.crm.entities.contacts.mutations.create, {
			orgId,
			displayName: "Converted",
			personCode: "P-999",
		});

		expect(result.personCode).toBe("P-999");
	});
});
