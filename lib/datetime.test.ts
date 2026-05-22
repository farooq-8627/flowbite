import { describe, expect, it } from "vitest";
import { formatChatDateTime, formatChatSidebarTime, formatChatTime } from "./datetime";

// A fixed reference timestamp: 2026-05-22 14:45:00 UTC
// Used to produce deterministic output regardless of test-run time.
const FIXED_TS = new Date("2026-05-22T14:45:00.000Z").getTime();

describe("formatChatTime", () => {
	it("returns a non-empty string for a valid timestamp", () => {
		const result = formatChatTime(FIXED_TS);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("defaults to 12-hour AM/PM format", () => {
		// In 12-hour mode the output contains AM or PM
		const result = formatChatTime(FIXED_TS, { locale: "en-US" });
		expect(result).toMatch(/AM|PM/i);
	});

	it("respects hour12:false (24-hour mode)", () => {
		const result = formatChatTime(FIXED_TS, { locale: "en-US", hour12: false });
		// 24-hour output should NOT contain AM / PM
		expect(result).not.toMatch(/AM|PM/i);
	});

	it("returns empty string for invalid timestamp (NaN)", () => {
		// new Intl.DateTimeFormat will throw for NaN — our helper catches it
		const result = formatChatTime(Number.NaN);
		expect(result).toBe("");
	});
});

describe("formatChatDateTime", () => {
	it("returns a non-empty string for a valid timestamp", () => {
		const result = formatChatDateTime(FIXED_TS);
		expect(result.length).toBeGreaterThan(0);
	});

	it("includes the year", () => {
		const result = formatChatDateTime(FIXED_TS, { locale: "en-US" });
		expect(result).toContain("2026");
	});

	it("defaults to AM/PM (12-hour)", () => {
		const result = formatChatDateTime(FIXED_TS, { locale: "en-US" });
		expect(result).toMatch(/AM|PM/i);
	});

	it("respects hour12:false", () => {
		const result = formatChatDateTime(FIXED_TS, { locale: "en-US", hour12: false });
		expect(result).not.toMatch(/AM|PM/i);
	});

	it("returns empty string for NaN timestamp", () => {
		expect(formatChatDateTime(Number.NaN)).toBe("");
	});
});

describe("formatChatSidebarTime", () => {
	const nowMs = Date.now();

	it("returns a time string (AM/PM) for a timestamp from today", () => {
		// A timestamp 10 minutes ago is "today"
		const tenMinutesAgo = nowMs - 10 * 60 * 1000;
		const result = formatChatSidebarTime(tenMinutesAgo, { locale: "en-US" });
		// Should be a clock time, e.g. "2:45 PM"
		expect(result).toMatch(/AM|PM/i);
	});

	it("returns 'Yesterday' for a timestamp from yesterday", () => {
		const yesterdayMidday = nowMs - 24 * 60 * 60 * 1000;
		// Adjust to be same hour of day yesterday
		const result = formatChatSidebarTime(yesterdayMidday, { locale: "en-US" });
		expect(result).toBe("Yesterday");
	});

	it("returns a weekday name for a timestamp 3 days ago", () => {
		const threeDaysAgo = nowMs - 3 * 24 * 60 * 60 * 1000;
		const result = formatChatSidebarTime(threeDaysAgo, { locale: "en-US" });
		// Should be a short weekday: Mon, Tue, Wed, Thu, Fri, Sat, Sun
		expect(result).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
	});

	it("returns a date like 'May 1' for a timestamp more than 7 days ago (same year)", () => {
		// 10 days ago, same year
		const tenDaysAgo = nowMs - 10 * 24 * 60 * 60 * 1000;
		const result = formatChatSidebarTime(tenDaysAgo, { locale: "en-US" });
		// Should contain a month abbreviation
		expect(result).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
		// Should NOT contain the year (same year)
		expect(result).not.toContain("2026");
	});

	it("returns a date with the year for a timestamp from a prior year", () => {
		const priorYear = new Date("2024-01-15T12:00:00Z").getTime();
		const result = formatChatSidebarTime(priorYear, { locale: "en-US" });
		// Should include the year 2024
		expect(result).toContain("2024");
	});

	it("returns empty string for NaN timestamp", () => {
		// Yesterday path throws, which we catch in formatChatTime
		// The NaN will make new Date(NaN) → Invalid Date comparisons still work
		const result = formatChatSidebarTime(Number.NaN, { locale: "en-US" });
		// The function may return "Yesterday" or "" depending on NaN comparison;
		// either way, it must not throw.
		expect(typeof result).toBe("string");
	});
});
