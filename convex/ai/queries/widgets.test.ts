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
 * Stage 3-A session 2 (2026-05-27): the runtime helpers
 * `normalizeDashboardLayout` + `LEGACY_KEY_RENAMES` were removed per
 * the user's "no runtime backfill, pure code only" directive. The
 * legacy alias is now scoped INSIDE the migration file
 * `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts`. This
 * test guards against regression by enumerating every template's
 * `dashboardMetrics` array and asserting zero rejected keys after
 * `validateDashboardLayout`.
 *
 * Lives under `convex/ai/queries/` per the SPRINT-PLAN.md Stage 1 task
 * spec (the same directory the AI usage telemetry queries live in).
 */

import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES } from "../../_platform/industries/builtIns";
import { validateDashboardLayout, WIDGET_KEYS, WIDGETS } from "../../_shared/widgetRegistry";

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

	for (const [templateId, template] of Object.entries(BUILT_IN_TEMPLATES)) {
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

		it(`template '${templateId}' validates idempotently`, () => {
			const first = validateDashboardLayout([...metrics]);
			const second = validateDashboardLayout([...first.keys]);
			expect(second.keys).toEqual(first.keys);
			expect(second.rejected).toEqual([]);
		});
	}

	it("validateDashboardLayout rejects unknown keys + legacy aliases (no runtime fallback)", () => {
		// Per AGENTS.md non-negotiable + the user's pure-code directive:
		// the runtime path does not silently coerce legacy aliases. The
		// `calendar.miniWidget` alias is rewritten ONLY by the migration
		// `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts`.
		const result = validateDashboardLayout([
			"leads.open",
			"calendar.miniWidget",
			"today.focus",
		]);
		expect(result.keys).toEqual(["leads.open", "today.focus"]);
		expect(result.rejected).toEqual(["calendar.miniWidget"]);
	});

	it("validateDashboardLayout drops unknown keys and surfaces them via rejected", () => {
		const result = validateDashboardLayout([
			"leads.open",
			"definitely.not.a.widget",
			"deals.open",
		]);
		expect(result.keys).toEqual(["leads.open", "deals.open"]);
		expect(result.rejected).toEqual(["definitely.not.a.widget"]);
	});

	// Stage 5 (SPRINT-PLAN.md) — every template must opt the new AI
	// surface keys in by default so a fresh org sees the Pulse + Quick
	// Composer immediately. This guard fails loudly if a template forgets
	// either key.
	for (const [templateId, template] of Object.entries(BUILT_IN_TEMPLATES)) {
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
