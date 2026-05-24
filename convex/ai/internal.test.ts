/**
 * convex/ai/internal.test.ts
 *
 * Pure-function tests for the per-entity aiContext rule-based
 * summarisers. The mutation handler itself isn't covered (that needs
 * the convex-test harness) but the deterministic helpers are — and
 * they're the ones the system-prompt sees on every turn, so they're
 * the high-leverage thing to pin.
 */

import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import { __test } from "./internal";

const { relativeTime, clip, summariseLeadOrContact, summariseDeal, summariseCompany } = __test;

const NOW = 1_716_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
	it("formats sub-minute as just now", () => {
		expect(relativeTime(NOW - 1000, NOW)).toBe("just now");
	});
	it("formats minutes", () => {
		expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
	});
	it("formats hours singular vs plural", () => {
		expect(relativeTime(NOW - HOUR, NOW)).toBe("1 hour ago");
		expect(relativeTime(NOW - 5 * HOUR, NOW)).toBe("5 hours ago");
	});
	it("formats days, weeks, months", () => {
		expect(relativeTime(NOW - 3 * DAY, NOW)).toBe("3 days ago");
		expect(relativeTime(NOW - 14 * DAY, NOW)).toBe("2 weeks ago");
		expect(relativeTime(NOW - 90 * DAY, NOW)).toBe("3 months ago");
	});
	it("future timestamps round-trip", () => {
		expect(relativeTime(NOW + 5_000, NOW)).toBe("in the future");
	});
});

describe("clip", () => {
	it("returns short input verbatim", () => {
		expect(clip("hello", 10)).toBe("hello");
	});
	it("clips with ellipsis at boundary", () => {
		expect(clip("a".repeat(20), 10)).toBe(`${"a".repeat(9)}…`);
	});
	it("trims whitespace", () => {
		expect(clip("   hi   ", 10)).toBe("hi");
	});
});

// ─── Lead / Contact ───────────────────────────────────────────────────

const baseLead = {
	_id: "lead-1" as Doc<"leads">["_id"],
	displayName: "Sarah Khan",
	personCode: "P-001",
	status: "qualified",
	source: "web",
} as unknown as Doc<"leads">;

describe("summariseLeadOrContact", () => {
	it("renders the canonical summary line for a lead with deals + notes", () => {
		const { summary, keyFacts } = summariseLeadOrContact({
			scope: "Lead",
			entity: baseLead,
			ownerName: "Alex Patel",
			noteCount: 3,
			latestNotePreview: "Called Sarah, she's interested.",
			lastActivity: { action: "stage_changed", createdAt: NOW - 2 * HOUR },
			deals: {
				open: [
					{
						_id: "d1",
						currentStageId: "qualified",
					} as unknown as Doc<"deals">,
				],
				won: [],
				lost: [],
				total: 1,
			},
			now: NOW,
		});
		expect(summary).toContain("Lead — Sarah Khan");
		expect(summary).toContain("Owner: Alex Patel");
		expect(summary).toContain("1 open deal");
		expect(summary).toContain("3 notes");
		expect(summary).toContain("2 hours ago");
		expect(keyFacts).toContain("Status: qualified");
		expect(keyFacts).toContain("Owner: Alex Patel");
		expect(keyFacts).toContain("personCode: P-001");
		expect(keyFacts).toContain("Open deals: 1");
	});

	it("omits status segment for contacts (no status field)", () => {
		const baseContact = {
			_id: "c-1" as Doc<"contacts">["_id"],
			displayName: "Jamie Lee",
			personCode: "P-099",
		} as unknown as Doc<"contacts">;
		const { summary } = summariseLeadOrContact({
			scope: "Contact",
			entity: baseContact,
			ownerName: null,
			noteCount: 0,
			latestNotePreview: null,
			lastActivity: null,
			deals: { open: [], won: [], lost: [], total: 0 },
			now: NOW,
		});
		expect(summary).toBe("Contact — Jamie Lee.");
	});

	it("renders unnamed when displayName is empty", () => {
		const blank = { ...baseLead, displayName: "" } as unknown as Doc<"leads">;
		const { summary } = summariseLeadOrContact({
			scope: "Lead",
			entity: blank,
			ownerName: null,
			noteCount: 0,
			latestNotePreview: null,
			lastActivity: null,
			deals: { open: [], won: [], lost: [], total: 0 },
			now: NOW,
		});
		expect(summary).toContain("(unnamed)");
	});
});

// ─── Deal ─────────────────────────────────────────────────────────────

const baseDeal = {
	_id: "deal-1" as Doc<"deals">["_id"],
	dealCode: "D-001",
	title: "Acme renewal",
	currentStageId: "negotiation",
	stageEnteredAt: NOW - DAY,
	value: 50_000,
	currency: "USD",
	expectedCloseDate: NOW + 7 * DAY,
} as unknown as Doc<"deals">;

describe("summariseDeal", () => {
	it("renders open deal summary + keyFacts", () => {
		const { summary, keyFacts } = summariseDeal({
			deal: baseDeal,
			ownerName: "Alex Patel",
			companyName: "Acme Inc.",
			personName: "Sarah Khan",
			noteCount: 2,
			latestNotePreview: "Discussed pricing concerns.",
			lastActivity: { action: "note_added", createdAt: NOW - HOUR },
			now: NOW,
		});
		expect(summary).toContain("Deal — Acme renewal");
		expect(summary).toContain("Stage: negotiation");
		expect(summary).toContain("Status: Open");
		expect(summary).toContain("Value: 50000 USD");
		expect(keyFacts).toContain("dealCode: D-001");
		expect(keyFacts).toContain("Status: Open");
	});
	it("flags Won when wonAt is set", () => {
		const wonDeal = { ...baseDeal, wonAt: NOW - 1000 } as unknown as Doc<"deals">;
		const { summary, keyFacts } = summariseDeal({
			deal: wonDeal,
			ownerName: null,
			companyName: null,
			personName: null,
			noteCount: 0,
			latestNotePreview: null,
			lastActivity: null,
			now: NOW,
		});
		expect(summary).toContain("Status: Won");
		expect(keyFacts).toContain("Status: Won");
	});
});

// ─── Company ──────────────────────────────────────────────────────────

const baseCompany = {
	_id: "co-1" as Doc<"companies">["_id"],
	companyCode: "CO-001",
	name: "Acme Inc.",
	industry: "Software",
	website: "https://acme.example",
	size: "50-100",
} as unknown as Doc<"companies">;

describe("summariseCompany", () => {
	it("renders summary + keyFacts", () => {
		const { summary, keyFacts } = summariseCompany({
			company: baseCompany,
			noteCount: 5,
			latestNotePreview: "Renewal pending.",
			lastActivity: { action: "deal_created", createdAt: NOW - 3 * DAY },
			now: NOW,
		});
		expect(summary).toContain("Company — Acme Inc.");
		expect(summary).toContain("Industry: Software");
		expect(summary).toContain("5 notes");
		expect(summary).toContain("3 days ago");
		expect(keyFacts).toContain("companyCode: CO-001");
		expect(keyFacts).toContain("Industry: Software");
	});
});
