/**
 * convex/ai/registry/router.test.ts — Stage S2
 *
 * The router is deterministic. Its job is to seed step 0's active tool set
 * cheaply and correctly; mistakes are recoverable via `discover_capabilities`.
 * Tests cover the high-frequency cases the legacy heuristic-router (the
 * subagent classifier) historically got wrong:
 *   • "follow up next Tuesday" → tasks (NOT settings, even with "next" + "stage" elsewhere)
 *   • "P-007" → leads/contacts (code-shape preload)
 *   • page-context preload still fires when message text is empty
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "./result";
import { adaptiveRouter } from "./router";
import type { Capability } from "./types";

function cap(name: string, group: string): Capability {
	return {
		name,
		module: group,
		group,
		permission: null,
		risk: "safe",
		channels: ["chat", "whatsapp", "mcp", "rest"],
		spec: { whenToCall: "test", goodExample: {} },
		drive: { onSuccess: "ok" },
		input: z.object({}),
		run: async () => ok({ headline: "ok" }),
	};
}

const REGISTRY = [
	cap("create_lead", "leads"),
	cap("get_contact", "contacts"),
	cap("create_deal", "deals"),
	cap("get_company", "companies"),
	cap("create_task", "tasks"),
	cap("add_note", "notes"),
	cap("list_inbox", "messaging"),
	cap("settings_create_pipeline", "pipelines"),
	cap("members_invite", "members"),
	cap("bulk_delete", "bulk"),
];

describe("adaptiveRouter — keyword preload", () => {
	it("routes a personcode to leads + contacts", () => {
		const r = adaptiveRouter("show me P-007", undefined, REGISTRY);
		expect(r.groups).toContain("leads");
		expect(r.groups).toContain("contacts");
		expect(r.source).toBe("keyword");
	});

	it('routes "follow up with P-007 next Tuesday" to tasks (NOT settings)', () => {
		// This is the legacy bug from the heuristic router — "next" + "stage"
		// could pin to settings. The new router's keyword table avoids it
		// because the "tasks" rule fires on `follow up` directly.
		const r = adaptiveRouter("follow up with P-007 next Tuesday", undefined, REGISTRY);
		expect(r.groups).toContain("tasks");
		expect(r.groups).toContain("leads");
		expect(r.groups).not.toContain("pipelines");
	});

	it("routes settings verb-noun bigrams to the config groups", () => {
		const r = adaptiveRouter("create a new pipeline called Renewals", undefined, REGISTRY);
		expect(r.groups).toContain("pipelines");
	});

	it('does NOT trigger settings on a bare "stage" mention', () => {
		const r = adaptiveRouter("move D-007 to next stage", undefined, REGISTRY);
		expect(r.groups).toContain("deals");
		expect(r.groups).not.toContain("pipelines");
	});

	it("routes bulk verbs to the bulk group", () => {
		const r = adaptiveRouter("bulk delete all stale leads", undefined, REGISTRY);
		expect(r.groups).toContain("bulk");
	});

	it("returns an empty group set + source=default when no rule matches", () => {
		const r = adaptiveRouter("what's the weather like", undefined, REGISTRY);
		expect(r.groups).toEqual([]);
		expect(r.source).toBe("default");
	});

	it("filters away groups that aren't in the registry (typo tolerance)", () => {
		const tinyRegistry = [cap("create_lead", "leads")];
		const r = adaptiveRouter("schedule a follow-up", undefined, tinyRegistry);
		// The "tasks" rule matched, but tasks isn't registered → filtered out.
		expect(r.groups).toEqual([]);
		expect(r.source).toBe("default");
	});
});

describe("adaptiveRouter — page-context preload", () => {
	it("routes by entityType=lead even when message is empty", () => {
		const r = adaptiveRouter("", { entityType: "lead", entityCode: "P-007" }, REGISTRY);
		expect(r.groups).toContain("leads");
		expect(r.groups).toContain("contacts");
		expect(r.source).toBe("page-context");
	});

	it("routes by entityType=deal", () => {
		const r = adaptiveRouter("", { entityType: "deal", entityCode: "D-007" }, REGISTRY);
		expect(r.groups).toContain("deals");
	});

	it("page-context wins as the source even when keywords match too", () => {
		const r = adaptiveRouter(
			"add a follow-up",
			{ entityType: "lead", entityCode: "P-007" },
			REGISTRY,
		);
		// Both routes contribute; source stays page-context.
		expect(r.source).toBe("page-context");
		expect(r.groups).toContain("leads");
		expect(r.groups).toContain("tasks");
	});
});
