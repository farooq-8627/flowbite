/**
 * Stage S9 — Module + Vertical registry tests.
 *
 * Acceptance from `AI-TOOLING-BUILD-STAGES.md` §S9:
 *   1. A test org with pipelines disabled exposes no pipeline capabilities AND
 *      no pipeline context block.
 *   2. A real-estate VerticalProfile adds its driveAddendum + persona via
 *      config only — capability set is unchanged.
 *
 * Plus core invariants:
 *   - `core` module always enabled regardless of `hiddenSlots`.
 *   - Unregistered module keys default to enabled (forward-compat for new
 *     domains shipped before they get a ModuleDef).
 *   - Vertical addendum lives in the per-turn TAIL, not the cached prefix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCapability, REGISTRY } from "./define";
import {
	_resetModulesForTest,
	activeModules,
	defineModule,
	EMPTY_ORG_SNAPSHOT,
	filterCapabilitiesByModules,
	type OrgSnapshot,
	renderActiveModuleContext,
} from "./modules";
import { ok } from "./result";
import type { Capability } from "./types";
import {
	_resetVerticalsForTest,
	defineVertical,
	getVertical,
	renderVerticalAddendum,
} from "./vertical";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function fakeCap(name: string, module: string): Capability {
	return defineCapability({
		name,
		module,
		group: module,
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: `Use ${name}.`, goodExample: { x: 1 } },
		drive: { onSuccess: "ok" },
		input: z.object({ x: z.number() }),
		run: async () => ok({ headline: "ok" }),
	});
}

function reset(): void {
	REGISTRY.clear();
	_resetModulesForTest();
	_resetVerticalsForTest();
}

beforeEach(reset);
afterEach(reset);

// ─── Module gate ────────────────────────────────────────────────────────────

describe("modules — activeModules", () => {
	it("returns every registered module when nothing is hidden", () => {
		defineModule({ key: "core", isEnabled: () => true });
		defineModule({ key: "leads", isEnabled: (o) => !o.hiddenSlots.has("leads") });
		defineModule({ key: "pipelines", isEnabled: (o) => !o.hiddenSlots.has("pipelines") });

		const active = activeModules(EMPTY_ORG_SNAPSHOT);
		expect(active.has("core")).toBe(true);
		expect(active.has("leads")).toBe(true);
		expect(active.has("pipelines")).toBe(true);
	});

	it("hides modules whose key is in `hiddenSlots`", () => {
		defineModule({ key: "core", isEnabled: () => true });
		defineModule({ key: "pipelines", isEnabled: (o) => !o.hiddenSlots.has("pipelines") });

		const org: OrgSnapshot = { hiddenSlots: new Set(["pipelines"]) };
		const active = activeModules(org);
		expect(active.has("pipelines")).toBe(false);
		expect(active.has("core")).toBe(true);
	});

	it("`core` stays on even if explicitly hidden — it's foundational", () => {
		defineModule({ key: "core", isEnabled: () => true });
		const active = activeModules({ hiddenSlots: new Set(["core"]) });
		expect(active.has("core")).toBe(true);
	});
});

describe("modules — filterCapabilitiesByModules", () => {
	it("hides capabilities whose module is OFF", () => {
		defineModule({ key: "leads", isEnabled: () => true });
		defineModule({ key: "pipelines", isEnabled: (o) => !o.hiddenSlots.has("pipelines") });

		const lead = fakeCap("create_lead", "leads");
		const pipelineCreate = fakeCap("create_pipeline", "pipelines");
		const pipelineDelete = fakeCap("delete_pipeline", "pipelines");
		const all = [lead, pipelineCreate, pipelineDelete];

		const orgOff: OrgSnapshot = { hiddenSlots: new Set(["pipelines"]) };
		const active = activeModules(orgOff);
		const filtered = filterCapabilitiesByModules(all, active);
		expect(filtered.map((c) => c.name)).toEqual(["create_lead"]);
	});

	it("default-on for unregistered module keys (forward-compat)", () => {
		// No ModuleDef for "future_module" — capability still passes through.
		defineModule({ key: "core", isEnabled: () => true });
		const cap = fakeCap("future_op", "future_module");
		const active = activeModules(EMPTY_ORG_SNAPSHOT);
		const filtered = filterCapabilitiesByModules([cap], active);
		expect(filtered).toHaveLength(1);
	});

	it("end-to-end: pipelines disabled → zero pipeline caps in the visible set", () => {
		defineModule({ key: "leads", isEnabled: () => true });
		defineModule({ key: "deals", isEnabled: () => true });
		defineModule({ key: "pipelines", isEnabled: (o) => !o.hiddenSlots.has("pipelines") });

		const caps = [
			fakeCap("create_lead", "leads"),
			fakeCap("move_stage", "deals"),
			fakeCap("create_pipeline", "pipelines"),
			fakeCap("rename_pipeline", "pipelines"),
			fakeCap("delete_pipeline", "pipelines"),
		];
		const off: OrgSnapshot = { hiddenSlots: new Set(["pipelines"]) };
		const filtered = filterCapabilitiesByModules(caps, activeModules(off));
		expect(filtered.map((c) => c.module).filter((m) => m === "pipelines")).toEqual([]);
		expect(filtered.map((c) => c.name).sort()).toEqual(["create_lead", "move_stage"]);
	});
});

describe("modules — renderActiveModuleContext", () => {
	it("emits a context block per active module that has a contextProvider", () => {
		defineModule({
			key: "leads",
			isEnabled: () => true,
			contextProvider: () => "### Leads module\nLead intake.",
		});
		defineModule({
			key: "pipelines",
			isEnabled: (o) => !o.hiddenSlots.has("pipelines"),
			contextProvider: () => "### Pipelines module\nDeal stage progressions.",
		});

		const active = activeModules(EMPTY_ORG_SNAPSHOT);
		const out = renderActiveModuleContext(EMPTY_ORG_SNAPSHOT, active);
		expect(out).toContain("Leads module");
		expect(out).toContain("Pipelines module");
	});

	it("drops the context block when its module is OFF", () => {
		defineModule({
			key: "leads",
			isEnabled: () => true,
			contextProvider: () => "### Leads module\nLead intake.",
		});
		defineModule({
			key: "pipelines",
			isEnabled: (o) => !o.hiddenSlots.has("pipelines"),
			contextProvider: () => "### Pipelines module\nDeal stage progressions.",
		});

		const off: OrgSnapshot = { hiddenSlots: new Set(["pipelines"]) };
		const active = activeModules(off);
		const out = renderActiveModuleContext(off, active);
		expect(out).toContain("Leads module");
		expect(out).not.toContain("Pipelines module");
	});

	it("skips modules that have no contextProvider — no empty headings", () => {
		defineModule({
			key: "tags",
			isEnabled: () => true,
			// no contextProvider on purpose
		});
		const out = renderActiveModuleContext(
			EMPTY_ORG_SNAPSHOT,
			activeModules(EMPTY_ORG_SNAPSHOT),
		);
		expect(out).not.toContain("tags");
		expect(out).toBe("");
	});

	it("uses entityLabels from the snapshot when provided", () => {
		defineModule({
			key: "leads",
			isEnabled: () => true,
			contextProvider: (org) =>
				`### ${org.entityLabels?.lead?.plural ?? "Leads"} module\nIntake.`,
		});
		const org: OrgSnapshot = {
			hiddenSlots: new Set(),
			entityLabels: {
				lead: { singular: "Buyer", plural: "Buyers" },
			},
		};
		const out = renderActiveModuleContext(org, activeModules(org));
		expect(out).toContain("### Buyers module");
		expect(out).not.toContain("### Leads module");
	});
});

// ─── Vertical adapter ───────────────────────────────────────────────────────

describe("vertical — defineVertical + renderVerticalAddendum", () => {
	it("returns the addendum text for a registered vertical", () => {
		defineVertical({
			industryKey: "real-estate",
			driveAddendum: "## Real-estate persona\n\nLeads are property buyers.",
		});
		const out = renderVerticalAddendum("real-estate");
		expect(out).toContain("Real-estate persona");
	});

	it("returns empty string when no industry key is provided", () => {
		expect(renderVerticalAddendum(undefined)).toBe("");
	});

	it("returns empty string when the industry has no registered profile", () => {
		expect(renderVerticalAddendum("unknown-industry")).toBe("");
	});

	it("returns empty string when the profile registers without an addendum", () => {
		defineVertical({ industryKey: "minimal" });
		expect(renderVerticalAddendum("minimal")).toBe("");
	});

	it("rejects duplicate industryKey registrations (fail loud at import)", () => {
		defineVertical({ industryKey: "x", driveAddendum: "first" });
		expect(() => defineVertical({ industryKey: "x", driveAddendum: "second" })).toThrow(
			/Duplicate vertical key/,
		);
	});
});

describe("vertical — capability set is INVARIANT across verticals", () => {
	// The plan locks in: VerticalProfile is persona-only. Switching verticals
	// MUST NOT change which capabilities exist — no per-vertical fork.
	it("real-estate and freelancer expose the same capability list for the same module config", () => {
		defineModule({ key: "leads", isEnabled: () => true });
		defineModule({ key: "tasks", isEnabled: () => true });

		defineVertical({
			industryKey: "real-estate",
			driveAddendum: "## Real-estate persona\n\nProperties + tenants.",
		});
		defineVertical({
			industryKey: "freelancer",
			driveAddendum: "## Freelancer persona\n\nDirect tone.",
		});

		const caps = [
			fakeCap("create_lead", "leads"),
			fakeCap("update_entity", "leads"),
			fakeCap("create_task", "tasks"),
		];

		const org: OrgSnapshot = { hiddenSlots: new Set() };
		const active = activeModules(org);
		const filtered = filterCapabilitiesByModules(caps, active);
		const visibleNames = filtered.map((c) => c.name).sort();

		// Capability surface is identical regardless of which vertical's
		// addendum we'd pick — verticals don't fork the registry.
		expect(visibleNames).toEqual(["create_lead", "create_task", "update_entity"]);
		expect(getVertical("real-estate")?.driveAddendum).toContain("Properties");
		expect(getVertical("freelancer")?.driveAddendum).toContain("Direct tone");
	});
});

// ─── Built-in module + vertical registrations (sanity) ─────────────────────

describe("modules + vertical — built-in registrations load on import", () => {
	// `vi.resetModules()` evicts the cached file so the dynamic import below
	// re-runs the top-level `defineModule` / `defineVertical` calls. We MUST
	// import + assert against the FRESH module instance — the statically
	// imported `listModules` / `getVertical` at the top of this file point at
	// the (now reset) ORIGINAL instance and would see an empty registry.
	it("modules.ts registers every shipped module key", async () => {
		vi.resetModules();
		const fresh = await import("./modules");
		const keys = fresh
			.listModules()
			.map((m) => m.key)
			.sort();
		// The shipped module keys — kept in sync with the registrations in
		// modules.ts. Adding a module = updating this list.
		expect(keys).toEqual(
			[
				"analytics",
				"companies",
				"contacts",
				"core",
				"creative",
				"dashboard",
				"deals",
				"fields",
				"files",
				"interaction",
				"leads",
				"messaging",
				"noteCategories",
				"notes",
				"notifications",
				"pipelines",
				"proactive",
				"quarantined",
				"savedViews",
				"tags",
				"tasks",
				"timeline",
			].sort(),
		);
	});

	it("vertical.ts registers the built-in profiles", async () => {
		vi.resetModules();
		const fresh = await import("./vertical");
		expect(fresh.getVertical("real-estate")?.driveAddendum).toContain("Real-estate persona");
		expect(fresh.getVertical("recruitment")?.driveAddendum).toContain("Recruitment persona");
		expect(fresh.getVertical("freelancer")?.driveAddendum).toContain("Freelancer persona");
	});
});
