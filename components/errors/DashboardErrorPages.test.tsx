/**
 * Component tests for the new wiring shipped in the pre-Phase-3A pass:
 *   1. DashboardUnauthorized — renders correctly with / without props
 *   2. DashboardMaintenance  — renders correctly
 *   3. dashboardMetrics isEnabled gating logic (pure function extracted for testing)
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardMaintenance } from "./DashboardMaintenance";
import { DashboardUnauthorized } from "./DashboardUnauthorized";

// ---------------------------------------------------------------------------
// DashboardUnauthorized
// ---------------------------------------------------------------------------

describe("DashboardUnauthorized", () => {
	it("renders the 'Access denied' heading", () => {
		render(<DashboardUnauthorized />);
		expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
	});

	it("renders the default fallback description when no props given", () => {
		render(<DashboardUnauthorized />);
		expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
	});

	it("renders a custom description when provided", () => {
		render(<DashboardUnauthorized description="Custom reason here." />);
		expect(screen.getByText(/custom reason here/i)).toBeInTheDocument();
	});

	it("appends contactName to the description when provided", () => {
		render(<DashboardUnauthorized contactName="Alice" />);
		expect(screen.getByText(/contact alice/i)).toBeInTheDocument();
	});

	it("renders a Go back button", () => {
		render(<DashboardUnauthorized />);
		expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
	});

	it("has the correct data-page attribute", () => {
		const { container } = render(<DashboardUnauthorized />);
		expect(container.querySelector('[data-page="unauthorized"]')).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// DashboardMaintenance
// ---------------------------------------------------------------------------

describe("DashboardMaintenance", () => {
	it("renders the 'We'll be right back' heading", () => {
		render(<DashboardMaintenance />);
		expect(screen.getByRole("heading", { name: /we'll be right back/i })).toBeInTheDocument();
	});

	it("renders the Reload button", () => {
		render(<DashboardMaintenance />);
		expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
	});

	it("has the correct data-page attribute", () => {
		const { container } = render(<DashboardMaintenance />);
		expect(container.querySelector('[data-page="maintenance"]')).toBeInTheDocument();
	});

	it("renders maintenance copy about updating", () => {
		render(<DashboardMaintenance />);
		expect(screen.getByText(/rolling out an update/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// dashboardMetrics gating logic (isEnabled)
// Mirrors the exact useMemo from DashboardHomeView so we can test it without
// mounting the full Convex-connected view.
// ---------------------------------------------------------------------------

function buildIsEnabled(dashboardMetrics: string[] | undefined) {
	const enabledMetrics = (() => {
		if (!dashboardMetrics || dashboardMetrics.length === 0) return null;
		return new Set(dashboardMetrics);
	})();
	return (key: string) => enabledMetrics === null || enabledMetrics.has(key);
}

describe("DashboardHomeView dashboardMetrics gating", () => {
	it("enables all widgets when dashboardMetrics is undefined (back-compat)", () => {
		const isEnabled = buildIsEnabled(undefined);
		expect(isEnabled("reminders.dueToday")).toBe(true);
		expect(isEnabled("deals.pipelineValue")).toBe(true);
		expect(isEnabled("calendar.weekAhead")).toBe(true);
	});

	it("enables all widgets when dashboardMetrics is an empty array", () => {
		const isEnabled = buildIsEnabled([]);
		expect(isEnabled("reminders.dueToday")).toBe(true);
		expect(isEnabled("calendar.mini")).toBe(true);
	});

	it("restricts to only listed keys when dashboardMetrics has values", () => {
		const isEnabled = buildIsEnabled(["reminders.dueToday", "deals.pipelineValue"]);
		expect(isEnabled("reminders.dueToday")).toBe(true);
		expect(isEnabled("deals.pipelineValue")).toBe(true);
		expect(isEnabled("calendar.weekAhead")).toBe(false);
		expect(isEnabled("messages.recent")).toBe(false);
	});

	it("handles a single key list", () => {
		const isEnabled = buildIsEnabled(["today.focus"]);
		expect(isEnabled("today.focus")).toBe(true);
		expect(isEnabled("reminders.dueToday")).toBe(false);
	});

	it("is case-sensitive on key names", () => {
		const isEnabled = buildIsEnabled(["reminders.dueToday"]);
		expect(isEnabled("Reminders.DueToday")).toBe(false);
	});
});
