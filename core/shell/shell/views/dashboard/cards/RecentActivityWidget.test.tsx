/**
 * RecentActivityWidget — pure-helper unit tests.
 *
 * Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29).
 *
 * The widget's render path needs convex/react context (`useOrgMembers` +
 * `useEntityLabels`); the page-level e2e suite covers the rendered card.
 * This unit pins the four pure functions the widget exports
 * (`activityKey`, `resolveActor`, `resolveHref`, `describeActivity`) so
 * an actor-mapping or deep-link regression surfaces as a failing assert
 * instead of a silent UI bug.
 */

import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../types";
import {
	activityKey,
	activityReactKey,
	describeActivity,
	resolveActor,
	resolveHref,
} from "./RecentActivityWidget";

const baseLabels = {
	deal: { single: "Deal", plural: "Deals", slug: "deals" },
	company: { single: "Company", plural: "Companies", slug: "companies" },
	lead: { single: "Lead", plural: "Leads", slug: "leads" },
	contact: { single: "Contact", plural: "Contacts", slug: "contacts" },
} as unknown as Parameters<typeof resolveHref>[2];

const userMap = new Map<string, { name: string; email?: string; avatarUrl?: string }>([
	["u_olivia", { name: "Olivia Martin", email: "olivia@example.com" }],
	["u_will", { name: "Will Kim", avatarUrl: "https://example.test/will.png" }],
]);

function makeItem(partial: Partial<ActivityItem>): ActivityItem {
	return {
		_id: "log_default",
		action: "created",
		createdAt: 1_700_000_000_000,
		actorType: "user",
		userId: "u_olivia",
		entityType: "lead",
		entityId: "P-001",
		...partial,
	};
}

describe("activityKey", () => {
	it("composes a stable key from createdAt + action + entityType + entityId", () => {
		const item = makeItem({});
		expect(activityKey(item)).toBe("1700000000000-created-lead-P-001");
	});

	it("differs when only entityId differs", () => {
		const a = makeItem({ entityId: "P-001" });
		const b = makeItem({ entityId: "P-002" });
		expect(activityKey(a)).not.toBe(activityKey(b));
	});

	it("collides when two rows share createdAt + action + entityType + entityId", () => {
		// This is the precise scenario that produced the React duplicate-key
		// warning on 2026-05-29 — multi-field bulk save emits two
		// `field_updated` rows in the same ms on the same lead. The
		// composite key cannot disambiguate them; only `_id` can. This
		// test documents that limitation so future maintainers don't
		// "fix" the composite key into the React key.
		const a = makeItem({ _id: "log_a" });
		const b = makeItem({ _id: "log_b" });
		expect(activityKey(a)).toBe(activityKey(b));
	});
});

describe("activityReactKey", () => {
	it("prefers the Convex row id when present", () => {
		expect(activityReactKey(makeItem({ _id: "log_xyz" }))).toBe("log_xyz");
	});

	it("disambiguates rows that share the composite tuple", () => {
		const a = makeItem({ _id: "log_a" });
		const b = makeItem({ _id: "log_b" });
		expect(activityReactKey(a)).not.toBe(activityReactKey(b));
	});

	it("falls back to the composite key when _id is missing", () => {
		// Cast through unknown — `_id` is required on `ActivityItem`,
		// but synthetic test fixtures and future callers may not have
		// one, so the helper handles `undefined` defensively.
		const stripped = { ...makeItem({}), _id: undefined } as unknown as ActivityItem;
		expect(activityReactKey(stripped)).toBe("1700000000000-created-lead-P-001");
	});
});

describe("resolveActor", () => {
	it("returns the AI placeholder for actorType='ai' regardless of userId mapping", () => {
		const item = makeItem({ actorType: "ai", userId: "u_olivia" });
		expect(resolveActor(item, userMap)).toEqual({ name: "AI", initials: "AI" });
	});

	it("returns the System placeholder for actorType='system'", () => {
		expect(resolveActor(makeItem({ actorType: "system" }), userMap)).toEqual({
			name: "System",
			initials: "SY",
		});
	});

	it("returns the Integration placeholder for actorType='integration'", () => {
		expect(resolveActor(makeItem({ actorType: "integration" }), userMap)).toEqual({
			name: "Integration",
			initials: "IN",
		});
	});

	it("computes 2-letter initials for a known user", () => {
		const out = resolveActor(makeItem({ userId: "u_olivia" }), userMap);
		expect(out.name).toBe("Olivia Martin");
		expect(out.initials).toBe("OM");
		expect(out.avatarUrl).toBeUndefined();
	});

	it("includes avatarUrl when the member has one", () => {
		const out = resolveActor(makeItem({ userId: "u_will" }), userMap);
		expect(out).toEqual({
			name: "Will Kim",
			initials: "WK",
			avatarUrl: "https://example.test/will.png",
		});
	});

	it("returns the Member placeholder when the userId is unknown", () => {
		const out = resolveActor(makeItem({ userId: "u_ghost" }), userMap);
		expect(out).toEqual({ name: "Member", initials: "·" });
	});
});

describe("resolveHref", () => {
	it("prefers personCode → /profile/<code>", () => {
		const item = makeItem({ personCode: "P-007", entityType: "deal", entityId: "D-001" });
		expect(resolveHref(item, "acme", baseLabels)).toBe("/acme/profile/P-007");
	});

	it("routes lead/contact/person to /profile/<entityId>", () => {
		expect(
			resolveHref(makeItem({ entityType: "lead", entityId: "L-1" }), "acme", baseLabels),
		).toBe("/acme/profile/L-1");
		expect(
			resolveHref(makeItem({ entityType: "contact", entityId: "P-1" }), "acme", baseLabels),
		).toBe("/acme/profile/P-1");
		expect(
			resolveHref(makeItem({ entityType: "person", entityId: "P-2" }), "acme", baseLabels),
		).toBe("/acme/profile/P-2");
	});

	it("routes deal via the deal label slug", () => {
		const href = resolveHref(
			makeItem({ entityType: "deal", entityId: "D-42" }),
			"acme",
			baseLabels,
		);
		expect(href).toBe("/acme/deals/D-42");
	});

	it("routes company via the company label slug", () => {
		const href = resolveHref(
			makeItem({ entityType: "company", entityId: "CO-1" }),
			"acme",
			baseLabels,
		);
		expect(href).toBe("/acme/companies/CO-1");
	});

	it("routes task to the org tasks page (no per-task detail surface)", () => {
		const href = resolveHref(
			makeItem({ entityType: "task", entityId: "T-1" }),
			"acme",
			baseLabels,
		);
		expect(href).toBe("/acme/tasks");
	});

	it("returns null for unsupported entity types", () => {
		expect(
			resolveHref(makeItem({ entityType: "workflow", entityId: "W-1" }), "acme", baseLabels),
		).toBeNull();
	});
});

describe("describeActivity", () => {
	it("returns the description verbatim when present", () => {
		expect(describeActivity(makeItem({ description: "Moved deal D-001 to Won" }))).toBe(
			"Moved deal D-001 to Won",
		);
	});

	it("falls back to a prettified action + entityType when description is missing", () => {
		expect(
			describeActivity(makeItem({ description: undefined, action: "stage_changed" })),
		).toBe("Stage changed lead");
	});

	it("treats whitespace-only description as missing", () => {
		expect(describeActivity(makeItem({ description: "   ", action: "created" }))).toBe(
			"Created lead",
		);
	});
});
