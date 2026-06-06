/// <reference types="vite/client" />
/**
 * Record-scope (assignment-based row-level visibility) tests —
 * convex/recordScope.test.ts
 *
 * Two layers:
 *   1. Pure-helper unit tests for `convex/_shared/permissions/recordScope.ts`.
 *   2. Integration tests over the real entity queries proving that a member
 *      WITHOUT `records.viewAll` only sees rows assigned to them across
 *      list / board / detail / search, while a member WITH it sees the
 *      whole workspace (the historical default).
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import {
	canViewAllRecords,
	resolveAssigneeFilter,
	resolveRecordScope,
	rowInScope,
	scopeAssignee,
} from "./_shared/permissions/recordScope";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── 1. Pure helpers ─────────────────────────────────────────────────────────

const U1 = "user_1" as unknown as Id<"users">;
const U2 = "user_2" as unknown as Id<"users">;

describe("recordScope pure helpers", () => {
	it("canViewAllRecords reflects the permission key", () => {
		expect(canViewAllRecords(["records.viewAll"])).toBe(true);
		expect(canViewAllRecords(["leads.view"])).toBe(false);
		expect(canViewAllRecords([])).toBe(false);
	});

	it("resolveRecordScope returns all-access vs scoped", () => {
		expect(resolveRecordScope(["records.viewAll"], U1)).toEqual({ all: true });
		expect(resolveRecordScope([], U1)).toEqual({ all: false, userId: U1 });
	});

	it("rowInScope: all-access sees everything; scoped sees only own", () => {
		const all = resolveRecordScope(["records.viewAll"], U1);
		const scoped = resolveRecordScope([], U1);
		expect(rowInScope(all, { assignedTo: U2 })).toBe(true);
		expect(rowInScope(all, {})).toBe(true);
		expect(rowInScope(scoped, { assignedTo: U1 })).toBe(true);
		expect(rowInScope(scoped, { assignedTo: U2 })).toBe(false);
		// Unassigned rows are invisible to a scoped member by design.
		expect(rowInScope(scoped, {})).toBe(false);
	});

	it("scopeAssignee locks a scoped member to their userId", () => {
		expect(scopeAssignee(resolveRecordScope([], U1))).toBe(U1);
		expect(scopeAssignee(resolveRecordScope(["records.viewAll"], U1))).toBeUndefined();
	});

	it("resolveAssigneeFilter honours caller filter for all-access, forces self for scoped", () => {
		const all = resolveRecordScope(["records.viewAll"], U1);
		const scoped = resolveRecordScope([], U1);
		// All-access: caller filter passes through (incl. undefined).
		expect(resolveAssigneeFilter(all, U2)).toEqual({ empty: false, assignedTo: U2 });
		expect(resolveAssigneeFilter(all, undefined)).toEqual({
			empty: false,
			assignedTo: undefined,
		});
		// Scoped: forced to self; asking for self is fine.
		expect(resolveAssigneeFilter(scoped, undefined)).toEqual({ empty: false, assignedTo: U1 });
		expect(resolveAssigneeFilter(scoped, U1)).toEqual({ empty: false, assignedTo: U1 });
		// Scoped asking for someone else → nothing to show.
		expect(resolveAssigneeFilter(scoped, U2)).toEqual({ empty: true });
	});
});

// ─── 2. Integration over real queries ────────────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, email: string) {
	const now = Date.now();
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		}),
	);
	return { userId, asUser: t.withIdentity({ subject: userId }) };
}

/** Org + owner member (owner role includes records.viewAll from the SSOT). */
async function seedOrgWithOwner(t: ReturnType<typeof convexTest>, ownerId: Id<"users">) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const orgId = await ctx.db.insert("orgs", {
			name: "Scope Org",
			slug: `scope-org-${now}-${Math.random().toString(36).slice(2)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			createdAt: now,
			updatedAt: now,
		});
		const ownerRoleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Owner",
			permissions: [...getDefaultPermissionsForRole("Owner")],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ownerId,
			roleId: ownerRoleId,
			joinedAt: now,
		});
		return orgId;
	});
}

/**
 * Member whose custom role has the 4 view perms but NOT records.viewAll →
 * this is the row-level-scoped principal under test.
 */
async function seedScopedMember(
	t: ReturnType<typeof convexTest>,
	orgId: Id<"orgs">,
	userId: Id<"users">,
) {
	await t.run(async (ctx) => {
		const now = Date.now();
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Field Rep",
			permissions: ["leads.view", "contacts.view", "companies.view", "deals.view"],
			isSystem: false,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", { orgId, userId, roleId, joinedAt: now });
	});
}

async function seedFullMember(
	t: ReturnType<typeof convexTest>,
	orgId: Id<"orgs">,
	userId: Id<"users">,
) {
	await t.run(async (ctx) => {
		const now = Date.now();
		// Default Member role — now includes records.viewAll from the SSOT.
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Member",
			permissions: [...getDefaultPermissionsForRole("Member")],
			isSystem: true,
			isDefault: true,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", { orgId, userId, roleId, joinedAt: now });
	});
}

async function insertLead(
	t: ReturnType<typeof convexTest>,
	orgId: Id<"orgs">,
	personCode: string,
	displayName: string,
	assignedTo: Id<"users"> | undefined,
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("leads", {
			orgId,
			personCode,
			displayName,
			status: "new",
			source: "manual",
			assignedTo,
			createdAt: now,
			updatedAt: now,
		});
	});
}

describe("record scope — leads", () => {
	it("scoped member only sees leads assigned to them; full member sees all", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId } = await seedUser(t, "owner@example.com");
		const { userId: repId, asUser: asRep } = await seedUser(t, "rep@example.com");
		const orgId = await seedOrgWithOwner(t, ownerId);
		await seedScopedMember(t, orgId, repId);

		await insertLead(t, orgId, "P-001", "Acme North", repId); // rep's own
		await insertLead(t, orgId, "P-002", "Acme South", ownerId); // someone else's
		await insertLead(t, orgId, "P-003", "Acme East", undefined); // unassigned

		const repList = await asRep.query(api.crm.entities.leads.queries.list, { orgId });
		expect(repList.map((l) => l.personCode).sort()).toEqual(["P-001"]);

		// The owner (records.viewAll) sees all three.
		const ownerAsUser = t.withIdentity({ subject: ownerId });
		const ownerList = await ownerAsUser.query(api.crm.entities.leads.queries.list, { orgId });
		expect(ownerList.map((l) => l.personCode).sort()).toEqual(["P-001", "P-002", "P-003"]);
	});

	it("scoped member cannot open a lead assigned to someone else (getById → null)", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId } = await seedUser(t, "owner@example.com");
		const { userId: repId, asUser: asRep } = await seedUser(t, "rep@example.com");
		const orgId = await seedOrgWithOwner(t, ownerId);
		await seedScopedMember(t, orgId, repId);

		const mine = await insertLead(t, orgId, "P-001", "Mine", repId);
		const theirs = await insertLead(t, orgId, "P-002", "Theirs", ownerId);

		expect(
			await asRep.query(api.crm.entities.leads.queries.getById, { orgId, leadId: mine }),
		).not.toBeNull();
		expect(
			await asRep.query(api.crm.entities.leads.queries.getById, { orgId, leadId: theirs }),
		).toBeNull();
	});

	it("scoped member's search only matches their own assigned leads", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId } = await seedUser(t, "owner@example.com");
		const { userId: repId, asUser: asRep } = await seedUser(t, "rep@example.com");
		const orgId = await seedOrgWithOwner(t, ownerId);
		await seedScopedMember(t, orgId, repId);

		await insertLead(t, orgId, "P-001", "Acme North", repId);
		await insertLead(t, orgId, "P-002", "Acme South", ownerId);

		const repHits = await asRep.query(api.crm.entities.leads.queries.searchLeads, {
			orgId,
			query: "acme",
		});
		expect(repHits.map((l) => l.personCode)).toEqual(["P-001"]);

		const ownerAsUser = t.withIdentity({ subject: ownerId });
		const ownerHits = await ownerAsUser.query(api.crm.entities.leads.queries.searchLeads, {
			orgId,
			query: "acme",
		});
		expect(ownerHits.map((l) => l.personCode).sort()).toEqual(["P-001", "P-002"]);
	});

	it("full member (records.viewAll) sees every lead in list", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId } = await seedUser(t, "owner@example.com");
		const { userId: memberId, asUser: asMember } = await seedUser(t, "member@example.com");
		const orgId = await seedOrgWithOwner(t, ownerId);
		await seedFullMember(t, orgId, memberId);

		await insertLead(t, orgId, "P-001", "Mine", memberId);
		await insertLead(t, orgId, "P-002", "Owner's", ownerId);
		await insertLead(t, orgId, "P-003", "Floating", undefined);

		const list = await asMember.query(api.crm.entities.leads.queries.list, { orgId });
		expect(list.map((l) => l.personCode).sort()).toEqual(["P-001", "P-002", "P-003"]);
	});
});

describe("record scope — deals board", () => {
	it("scoped member only sees their own deals in the grouped board", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId } = await seedUser(t, "owner@example.com");
		const { userId: repId, asUser: asRep } = await seedUser(t, "rep@example.com");
		const orgId = await seedOrgWithOwner(t, ownerId);
		await seedScopedMember(t, orgId, repId);

		const pipelineId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("pipelines", {
				orgId,
				name: "Sales",
				entityType: "deal",
				isDefault: true,
				stages: [{ id: "stage_new", name: "New", code: "NEW", order: 0 }],
				createdAt: now,
				updatedAt: now,
			});
		});

		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("deals", {
				orgId,
				dealCode: "D-001",
				title: "Mine",
				pipelineId,
				currentStageId: "stage_new",
				stageEnteredAt: now,
				source: "manual",
				assignedTo: repId,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("deals", {
				orgId,
				dealCode: "D-002",
				title: "Theirs",
				pipelineId,
				currentStageId: "stage_new",
				stageEnteredAt: now,
				source: "manual",
				assignedTo: ownerId,
				createdAt: now,
				updatedAt: now,
			});
		});

		const repBoard = await asRep.query(api.crm.entities.deals.queries.listGroupedByStage, {
			orgId,
			pipelineId,
		});
		expect((repBoard.stage_new ?? []).map((d) => d.dealCode)).toEqual(["D-001"]);

		const ownerAsUser = t.withIdentity({ subject: ownerId });
		const ownerBoard = await ownerAsUser.query(
			api.crm.entities.deals.queries.listGroupedByStage,
			{
				orgId,
				pipelineId,
			},
		);
		expect((ownerBoard.stage_new ?? []).map((d) => d.dealCode).sort()).toEqual([
			"D-001",
			"D-002",
		]);
	});
});
