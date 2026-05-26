/// <reference types="vite/client" />
/**
 * Tests for the dashboard widget registry — asserts every industry
 * template's `dashboardMetrics` array is accepted by
 * `validateDashboardLayout` after Stage 1 of the dashboard fix wave
 * (DASHBOARD-AUDIT.md §3 + SPRINT-PLAN.md Stage 1).
 *
 * Pre-Stage-1 the registry recognised 12 KPI keys; templates wrote 9
 * extra section keys (reminders.list, messages.recent, today.focus,
 * etc.) that `validateDashboardLayout` rejected — the AI tool
 * `update_dashboard_layout` couldn't write them and `RemindersCard`
 * was permanently hidden for orgs whose template wrote `reminders.list`.
 *
 * This test guards against regression by enumerating every template's
 * `dashboardMetrics` array and asserting:
 *   1. zero rejected keys after `normalizeDashboardLayout`,
 *   2. zero rejected keys after `validateDashboardLayout`,
 *   3. `LEGACY_KEY_RENAMES` rewrites the `calendar.miniWidget` alias
 *      in any historical row data without rejection.
 *
 * Lives under `convex/ai/queries/` per the SPRINT-PLAN.md Stage 1 task
 * spec (the same directory the AI usage telemetry queries live in).
 */

import { describe, expect, it } from "vitest";
import {
	LEGACY_KEY_RENAMES,
	normalizeDashboardLayout,
	validateDashboardLayout,
	WIDGET_KEYS,
	WIDGETS,
} from "../../_shared/widgetRegistry";
import { INDUSTRY_TEMPLATES } from "../../crm/fields/templates/registry";

describe("widgetRegistry — template <-> registry contract", () => {
	it("WIDGET_KEYS has a matching WIDGETS metadata entry for every key", () => {
		for (const key of WIDGET_KEYS) {
			expect(WIDGETS[key], `WIDGETS metadata missing for key '${key}'`).toBeDefined();
			expect(WIDGETS[key].label).toBeTruthy();
			expect(WIDGETS[key].description).toBeTruthy();
			expect(["crm", "scheduling", "productivity", "ai"]).toContain(WIDGETS[key].category);
			expect(["kpi", "half", "full"]).toContain(WIDGETS[key].size);
		}
	});

	for (const [templateId, template] of Object.entries(INDUSTRY_TEMPLATES)) {
		const metrics = template.dashboardMetrics ?? [];

		it(`template '${templateId}' has at least one dashboardMetrics key`, () => {
			expect(metrics.length).toBeGreaterThan(0);
		});

		it(`template '${templateId}' uses only registered widget keys (canonical)`, () => {
			const result = validateDashboardLayout([...metrics]);
			expect(
				result.rejected,
				`template '${templateId}' has unregistered widget keys: ${result.rejected.join(", ")}`,
			).toEqual([]);
			// validateDashboardLayout's accepted set should equal the input
			// (deduped) — every key the template emits must be in WIDGET_KEYS.
			const dedupedInput = Array.from(new Set(metrics));
			expect(result.keys.length).toBe(dedupedInput.length);
		});

		it(`template '${templateId}' normalizes idempotently`, () => {
			const first = normalizeDashboardLayout(metrics);
			const second = normalizeDashboardLayout(first.keys);
			expect(second.keys).toEqual(first.keys);
			expect(second.rejected).toEqual([]);
			expect(second.renamed).toEqual([]);
		});
	}

	it("LEGACY_KEY_RENAMES rewrites every legacy alias to a registered canonical key", () => {
		for (const [legacy, canonical] of Object.entries(LEGACY_KEY_RENAMES)) {
			expect(
				WIDGET_KEYS,
				`legacy alias '${legacy}' targets unregistered canonical '${canonical}'`,
			).toContain(canonical);
		}
	});

	it("normalizeDashboardLayout rewrites historical calendar.miniWidget rows", () => {
		const result = normalizeDashboardLayout([
			"leads.open",
			"calendar.miniWidget",
			"today.focus",
		]);
		expect(result.keys).toEqual(["leads.open", "calendar.mini", "today.focus"]);
		expect(result.rejected).toEqual([]);
		expect(result.renamed).toEqual([{ from: "calendar.miniWidget", to: "calendar.mini" }]);
	});

	it("normalizeDashboardLayout drops unknown keys and surfaces them via rejected", () => {
		const result = normalizeDashboardLayout([
			"leads.open",
			"definitely.not.a.widget",
			"deals.open",
		]);
		expect(result.keys).toEqual(["leads.open", "deals.open"]);
		expect(result.rejected).toEqual(["definitely.not.a.widget"]);
	});

	it("normalizeDashboardLayout collapses duplicates after rename", () => {
		// If a row contains both the legacy alias AND its canonical target,
		// the canonical is kept once and the alias is treated as a duplicate.
		const result = normalizeDashboardLayout([
			"calendar.mini",
			"calendar.miniWidget",
			"calendar.mini",
		]);
		expect(result.keys).toEqual(["calendar.mini"]);
	});

	// Stage 5 (SPRINT-PLAN.md) — every template must opt the new AI
	// surface keys in by default so a fresh org sees the Pulse + Quick
	// Composer immediately. This guard fails loudly if a template forgets
	// either key.
	for (const [templateId, template] of Object.entries(INDUSTRY_TEMPLATES)) {
		const metrics = template.dashboardMetrics ?? [];
		it(`template '${templateId}' opts in ai.pulseRibbon + ai.quickComposer (Stage 5)`, () => {
			expect(metrics, `template '${templateId}' missing ai.pulseRibbon`).toContain(
				"ai.pulseRibbon",
			);
			expect(metrics, `template '${templateId}' missing ai.quickComposer`).toContain(
				"ai.quickComposer",
			);
		});
	}
});
