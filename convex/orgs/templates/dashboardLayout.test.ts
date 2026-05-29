/// <reference types="vite/client" />
/**
 * convex/orgs/templates/dashboardLayout.test.ts
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — guards every
 * built-in template's optional `dashboardLayout` against the
 * `validateDashboardLayoutShape` contract, the registered widget-key
 * set, AND the "at least one panel widget that's not in the metric
 * strip" rule the plan §4 ships with.
 *
 * Pure-data tests (no Convex provider) — they enumerate
 * `BUILT_IN_TEMPLATES` and assert validator parity. They run in the
 * same vitest pass as `convex/ai/queries/widgets.test.ts` (which
 * already guards `dashboardMetrics`).
 *
 * Also exercises `validateDashboardLayoutShape` directly with crafted
 * good/bad inputs so refactors of the validator can't silently weaken
 * it.
 */

import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES } from "../../_platform/industries/builtIns";
import {
	type DashboardLayoutShape,
	validateDashboardLayoutShape,
	WIDGET_KEYS,
	WIDGETS,
	type WidgetKey,
} from "../../_shared/widgetRegistry";

describe("dashboardLayout — template validity", () => {
	const templatesWithLayout = Object.entries(BUILT_IN_TEMPLATES).filter(
		([, t]) => t.dashboardLayout !== undefined,
	);

	it("at least one template opts into a dashboardLayout (Stage 4 invariant)", () => {
		expect(templatesWithLayout.length).toBeGreaterThan(0);
	});

	for (const [id, template] of templatesWithLayout) {
		const layout = template.dashboardLayout!;

		it(`template '${id}' layout passes validateDashboardLayoutShape`, () => {
			const result = validateDashboardLayoutShape(layout);
			expect(
				result.valid,
				`template '${id}' rejected: ${result.valid ? "" : JSON.stringify(result.errors)}`,
			).toBe(true);
			if (result.valid) {
				expect(result.rejected).toEqual([]);
			}
		});

		it(`template '${id}' panels reference only registered widget keys`, () => {
			for (const panel of layout.panels) {
				expect(
					WIDGET_KEYS,
					`template '${id}' panel '${panel.id}' uses unregistered widget '${panel.widget}'`,
				).toContain(panel.widget as WidgetKey);
			}
		});

		it(`template '${id}' hero (when set) references a registered widget key`, () => {
			if (layout.hero === undefined) return;
			expect(
				WIDGET_KEYS,
				`template '${id}' hero references unregistered widget '${layout.hero}'`,
			).toContain(layout.hero as WidgetKey);
		});

		it(`template '${id}' has at least one panel widget that's NOT in the metric strip`, () => {
			// The metric strip only renders KPI-size widgets — section
			// (`half` / `full`) widgets are intended for the panel grid.
			// Every Stage 4 layout MUST surface at least one non-KPI
			// widget; otherwise the layout is just a duplicated metric
			// strip and gives the user nothing the default flow doesn't.
			const nonStripPanel = layout.panels.find((p) => {
				const meta = WIDGETS[p.widget as WidgetKey];
				if (!meta) return false;
				return meta.size !== "kpi";
			});
			expect(
				nonStripPanel,
				`template '${id}' has only KPI-size panel widgets — defeating the purpose of dashboardLayout`,
			).toBeDefined();
		});

		it(`template '${id}' panel ids are unique`, () => {
			const seen = new Set<string>();
			for (const p of layout.panels) {
				expect(seen.has(p.id), `template '${id}' has duplicate panel id '${p.id}'`).toBe(
					false,
				);
				seen.add(p.id);
			}
		});

		it(`template '${id}' panel spans are 1, 2, or 3`, () => {
			for (const p of layout.panels) {
				expect([1, 2, 3]).toContain(p.span);
			}
		});

		it(`template '${id}' coverageBands (when set) honour healthy > warning`, () => {
			const cb = layout.forecast?.coverageBands;
			if (cb === undefined) return;
			expect(cb.healthy).toBeGreaterThan(cb.warning);
		});
	}
});

describe("validateDashboardLayoutShape — direct crafted inputs", () => {
	it("accepts a minimal layout", () => {
		const layout: DashboardLayoutShape = {
			panels: [
				{ id: "p1", span: 1, widget: "tasks.list" },
				{ id: "p2", span: 2, widget: "messages.recent" },
			],
		};
		const result = validateDashboardLayoutShape(layout);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.layout.panels).toHaveLength(2);
			expect(result.rejected).toEqual([]);
		}
	});

	it("rejects when panels is missing", () => {
		const result = validateDashboardLayoutShape({ hero: "tasks.list" });
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors[0]?.path).toBe("dashboardLayout.panels");
		}
	});

	it("rejects when input is not an object", () => {
		expect(validateDashboardLayoutShape(null).valid).toBe(false);
		expect(validateDashboardLayoutShape(undefined).valid).toBe(false);
		expect(validateDashboardLayoutShape("nope").valid).toBe(false);
		expect(validateDashboardLayoutShape([]).valid).toBe(false);
	});

	it("rejects an out-of-range span", () => {
		const result = validateDashboardLayoutShape({
			panels: [{ id: "p1", span: 4, widget: "tasks.list" }],
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors[0]?.path).toContain("span");
		}
	});

	it("rejects duplicate panel ids", () => {
		const result = validateDashboardLayoutShape({
			panels: [
				{ id: "dup", span: 1, widget: "tasks.list" },
				{ id: "dup", span: 1, widget: "messages.recent" },
			],
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.some((e) => e.message.includes("duplicated"))).toBe(true);
		}
	});

	it("flags unknown widget keys via the rejected list (not as a hard error)", () => {
		const result = validateDashboardLayoutShape({
			panels: [
				{ id: "p1", span: 1, widget: "tasks.list" },
				{ id: "p2", span: 1, widget: "definitely.not.a.widget" },
			],
		});
		// The known-good panel still validates; the unknown widget is
		// reported via the rejected list. The `panels` output array drops it.
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.rejected).toEqual(["definitely.not.a.widget"]);
			expect(result.layout.panels).toHaveLength(1);
		}
	});

	it("rejects coverageBands where healthy <= warning", () => {
		const result = validateDashboardLayoutShape({
			panels: [{ id: "p1", span: 1, widget: "tasks.list" }],
			forecast: { coverageBands: { healthy: 1, warning: 2 } },
		});
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors[0]?.path).toContain("coverageBands");
		}
	});

	it("accepts coverageBands where healthy > warning", () => {
		const result = validateDashboardLayoutShape({
			panels: [{ id: "p1", span: 1, widget: "tasks.list" }],
			forecast: { coverageBands: { healthy: 3, warning: 2 } },
		});
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.layout.forecast?.coverageBands).toEqual({ healthy: 3, warning: 2 });
		}
	});

	it("metrics array drops unknown keys + reports them via rejected", () => {
		const result = validateDashboardLayoutShape({
			panels: [{ id: "p1", span: 1, widget: "tasks.list" }],
			metrics: ["leads.open", "fake.key"],
		});
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.layout.metrics).toEqual(["leads.open"]);
			expect(result.rejected).toContain("fake.key");
		}
	});
});
