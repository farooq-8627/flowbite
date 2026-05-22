/**
 * Tests for scheduling helpers — reminder-status, reminder-buckets,
 * calendar-grid, calendar-buckets, event-source-colors.
 *
 * Run: pnpm vitest run core/scheduling/
 */

import { addDays, set, subDays, subHours } from "date-fns";
import { describe, expect, it } from "vitest";
import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { bucketByDay, eventsForDay } from "./calendar/lib/calendar-buckets";
import {
	formatViewTitle,
	getDayHours,
	getMonthGrid,
	getRangeForView,
	getWeekDays,
	shiftAnchor,
	ymdKey,
} from "./calendar/lib/calendar-grid";
import { EVENT_SOURCE_META, EVENT_SOURCE_ORDER } from "./calendar/lib/event-source-colors";
import { bucketByDue, openCount, totalCount } from "./reminders/lib/reminder-buckets";
import { getReminderState } from "./reminders/lib/reminder-status";

// ─── reminder-status ─────────────────────────────────────────────────────────

describe("getReminderState", () => {
	const now = new Date("2026-05-18T10:00:00").getTime();

	it("returns 'completed' for completed reminders regardless of dueAt", () => {
		expect(getReminderState({ dueAt: now - 100000, status: "completed" }, now)).toBe(
			"completed",
		);
		expect(getReminderState({ dueAt: now + 100000, status: "completed" }, now)).toBe(
			"completed",
		);
	});

	it("returns 'overdue' for pending reminders past due", () => {
		expect(
			getReminderState({ dueAt: subHours(now, 2).getTime(), status: "pending" }, now),
		).toBe("overdue");
	});

	it("returns 'today' for pending reminders due later today", () => {
		const laterToday = set(new Date(now), { hours: 17, minutes: 0 }).getTime();
		expect(getReminderState({ dueAt: laterToday, status: "pending" }, now)).toBe("today");
	});

	it("returns 'upcoming' for pending reminders due tomorrow+", () => {
		const tomorrow = addDays(new Date(now), 1).getTime();
		expect(getReminderState({ dueAt: tomorrow, status: "pending" }, now)).toBe("upcoming");
	});
});

// ─── reminder-buckets ────────────────────────────────────────────────────────

describe("bucketByDue", () => {
	const now = new Date("2026-05-18T10:00:00").getTime();
	const reminders = [
		{ dueAt: subDays(new Date(now), 2).getTime(), status: "pending" },
		{ dueAt: subHours(now, 1).getTime(), status: "pending" },
		{ dueAt: set(new Date(now), { hours: 15 }).getTime(), status: "pending" },
		{ dueAt: addDays(new Date(now), 3).getTime(), status: "pending" },
		{ dueAt: subDays(new Date(now), 5).getTime(), status: "completed", completedAt: now },
	];

	it("partitions into 4 buckets", () => {
		const b = bucketByDue(reminders, now);
		expect(b.overdue.length).toBe(2);
		expect(b.today.length).toBe(1);
		expect(b.upcoming.length).toBe(1);
		expect(b.completed.length).toBe(1);
	});

	it("totalCount sums all buckets", () => {
		expect(totalCount(bucketByDue(reminders, now))).toBe(5);
	});

	it("openCount excludes completed", () => {
		expect(openCount(bucketByDue(reminders, now))).toBe(4);
	});

	it("sorts overdue by oldest first", () => {
		const b = bucketByDue(reminders, now);
		expect(b.overdue[0]!.dueAt).toBeLessThan(b.overdue[1]!.dueAt);
	});
});

// ─── calendar-grid ───────────────────────────────────────────────────────────

describe("calendar-grid helpers", () => {
	const anchor = new Date("2026-05-18");

	it("getMonthGrid returns 35 or 42 days", () => {
		const grid = getMonthGrid(anchor, 0);
		expect(grid.length === 35 || grid.length === 42).toBe(true);
	});

	it("getWeekDays returns exactly 7 days", () => {
		expect(getWeekDays(anchor, 0)).toHaveLength(7);
	});

	it("getDayHours returns 24 hours", () => {
		expect(getDayHours(anchor)).toHaveLength(24);
	});

	it("getRangeForView month covers the grid extent", () => {
		const { rangeStart, rangeEnd } = getRangeForView("month", anchor, 0);
		expect(rangeEnd).toBeGreaterThan(rangeStart);
		expect(rangeEnd - rangeStart).toBeGreaterThan(27 * 24 * 60 * 60 * 1000); // at least 28 days
	});

	it("shiftAnchor moves forward/back", () => {
		const next = shiftAnchor("month", anchor, "next");
		expect(next.getMonth()).toBe(anchor.getMonth() + 1);
		const prev = shiftAnchor("month", anchor, "prev");
		expect(prev.getMonth()).toBe(anchor.getMonth() - 1);
	});

	it("ymdKey produces yyyy-MM-dd", () => {
		expect(ymdKey(new Date("2026-05-18T15:30:00"))).toBe("2026-05-18");
	});

	it("formatViewTitle month shows month + year", () => {
		expect(formatViewTitle("month", anchor)).toBe("May 2026");
	});
});

// ─── calendar-buckets ────────────────────────────────────────────────────────

describe("bucketByDay", () => {
	const events: CalendarEventDTO[] = [
		{
			id: "1",
			source: "reminder",
			title: "A",
			startsAt: new Date("2026-05-18T09:00").getTime(),
			color: "#f97316",
		},
		{
			id: "2",
			source: "reminder",
			title: "B",
			startsAt: new Date("2026-05-18T14:00").getTime(),
			color: "#f97316",
		},
		{
			id: "3",
			source: "deal",
			title: "C",
			startsAt: new Date("2026-05-19T10:00").getTime(),
			color: "#3b82f6",
		},
	];

	it("groups events by day", () => {
		const map = bucketByDay(events);
		expect(map.get("2026-05-18")?.length).toBe(2);
		expect(map.get("2026-05-19")?.length).toBe(1);
	});

	it("sorts within each day by startsAt ascending", () => {
		const map = bucketByDay(events);
		const day = map.get("2026-05-18")!;
		expect(day[0]!.startsAt).toBeLessThan(day[1]!.startsAt);
	});

	it("eventsForDay returns events for a specific date", () => {
		const result = eventsForDay(events, new Date("2026-05-18"));
		expect(result).toHaveLength(2);
	});
});

// ─── event-source-colors ─────────────────────────────────────────────────────

describe("event-source-colors", () => {
	it("has 3 sources in the correct order", () => {
		expect(EVENT_SOURCE_ORDER).toEqual(["reminder", "activity", "deal"]);
	});

	it("each source has a hex color", () => {
		for (const source of EVENT_SOURCE_ORDER) {
			expect(EVENT_SOURCE_META[source].color).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it("colors match server constants", () => {
		expect(EVENT_SOURCE_META.reminder.color).toBe("#f97316");
		expect(EVENT_SOURCE_META.activity.color).toBe("#6366f1");
		expect(EVENT_SOURCE_META.deal.color).toBe("#3b82f6");
	});
});
