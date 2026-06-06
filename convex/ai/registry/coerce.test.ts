/**
 * convex/ai/registry/coerce.test.ts — Stage S0 acceptance tests.
 *
 * Locks the central coercion boundary: coerceTimestamp accepts ISO-with-offset,
 * epoch ms, numeric strings, and natural language ("next Tuesday" lands on a
 * Tuesday in the target tz); coerceStringArray accepts array / CSV / JSON-string
 * / single value. These are the failures (notably the `dueAt` bug) the v2 layer
 * is designed to kill.
 */
import { describe, expect, it } from "vitest";
import { coerceInt, coerceStringArray, coerceTimestamp, field, stripEmpty } from "./coerce";

const TZ = "America/New_York";

/** Weekday name of an epoch instant, as seen in `tz`. */
function weekdayInTz(epoch: number, tz: string): string {
	return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(epoch);
}

/** Clock hour of an epoch instant, as seen in `tz`. */
function hourInTz(epoch: number, tz: string): number {
	return Number(
		new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hour: "2-digit",
			hourCycle: "h23",
		}).format(epoch),
	);
}

describe("coerceTimestamp", () => {
	it("passes through an epoch-ms number unchanged", () => {
		const e = 1717577000000; // 2024-06-05, 13-digit ms
		expect(coerceTimestamp(e, TZ)).toBe(e);
	});

	it("parses a numeric string as epoch ms", () => {
		const e = 1717577000000;
		expect(coerceTimestamp(String(e), TZ)).toBe(e);
	});

	it("parses an ISO 8601 string with explicit Z offset (absolute instant)", () => {
		expect(coerceTimestamp("2024-06-05T09:00:00.000Z", TZ)).toBe(
			Date.parse("2024-06-05T09:00:00.000Z"),
		);
	});

	it("interprets a bare ISO datetime as wall-clock in the org tz", () => {
		// 09:00 wall-clock in New York === 13:00Z in June (EDT, UTC-4).
		const ts = coerceTimestamp("2024-06-05T09:00:00", TZ);
		expect(ts).toBe(Date.parse("2024-06-05T13:00:00.000Z"));
	});

	it("parses 'next Tuesday' and lands on a Tuesday in the target tz", () => {
		const ts = coerceTimestamp("next Tuesday", TZ);
		expect(typeof ts).toBe("number");
		expect(weekdayInTz(ts as number, TZ)).toBe("Tuesday");
		expect((ts as number) > Date.now()).toBe(true);
	});

	it("parses 'tomorrow 9am' at 09:00 in the org tz", () => {
		const ts = coerceTimestamp("tomorrow 9am", TZ);
		expect(typeof ts).toBe("number");
		expect(hourInTz(ts as number, TZ)).toBe(9);
	});

	it("parses 'in 3 days' relative to now", () => {
		const ts = coerceTimestamp("in 3 days", TZ);
		expect(typeof ts).toBe("number");
		expect((ts as number) > Date.now()).toBe(true);
	});

	it("returns undefined for empty / unparseable input", () => {
		expect(coerceTimestamp("", TZ)).toBeUndefined();
		expect(coerceTimestamp(null, TZ)).toBeUndefined();
		expect(coerceTimestamp("not a date at all", TZ)).toBeUndefined();
	});
});

describe("coerceStringArray", () => {
	it("accepts a real array unchanged", () => {
		expect(coerceStringArray(["a"])).toEqual(["a"]);
	});

	it("splits a comma-joined string", () => {
		expect(coerceStringArray("a,b")).toEqual(["a", "b"]);
	});

	it("parses a JSON-encoded array string", () => {
		expect(coerceStringArray('["a","b"]')).toEqual(["a", "b"]);
	});

	it("wraps a lone value as a single-element array", () => {
		expect(coerceStringArray("a")).toEqual(["a"]);
	});

	it("returns an empty array for empty / null input", () => {
		expect(coerceStringArray("")).toEqual([]);
		expect(coerceStringArray(null)).toEqual([]);
	});
});

describe("coerceInt / stripEmpty", () => {
	it("coerces numeric strings and booleans", () => {
		expect(coerceInt("42")).toBe(42);
		expect(coerceInt(42)).toBe(42);
		expect(coerceInt(true)).toBe(1);
		expect(coerceInt("nope")).toBeUndefined();
	});

	it("strips empty-ish values to undefined and trims strings", () => {
		expect(stripEmpty("  ")).toBeUndefined();
		expect(stripEmpty(null)).toBeUndefined();
		expect(stripEmpty("  hi  ")).toBe("hi");
	});
});

describe("field helpers bake coercion into the schema", () => {
	it("field.timestamp coerces natural language via the schema", () => {
		const schema = field.timestamp(TZ);
		const parsed = schema.parse("next Tuesday");
		expect(weekdayInTz(parsed as number, TZ)).toBe("Tuesday");
	});

	it("field.codeArray coerces a CSV string via the schema", () => {
		expect(field.codeArray().parse("P-001,P-002")).toEqual(["P-001", "P-002"]);
	});

	it("field.int coerces a numeric string and field.str trims", () => {
		expect(field.int().parse("10")).toBe(10);
		expect(field.str().parse("  hi  ")).toBe("hi");
	});

	it("field.timestampLazy passes the raw value through (string + number)", () => {
		// Late-bound timestamp — schema accepts both shapes; the capability's
		// run() is responsible for calling coerceTimestamp(value, liveOrgTz).
		// The schema MUST NOT preprocess the string into a number, because
		// doing so would lock in the wrong (schema-time) timezone — that's
		// the whole reason this variant exists.
		const lazy = field.timestampLazy();
		expect(lazy.parse("next Tuesday")).toBe("next Tuesday");
		expect(lazy.parse(1717577000000)).toBe(1717577000000);
		// Empty strings are rejected — preserves the "explicit value" contract.
		expect(lazy.safeParse("").success).toBe(false);
	});
});
