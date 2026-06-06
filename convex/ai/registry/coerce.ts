/**
 * Coercion boundary. LLMs emit dates as epoch / ISO / English ("next Tue"),
 * arrays as CSV / JSON-string / single value. Normalise here once; the
 * `field.*` helpers bake `z.preprocess` into every capability schema so
 * authors cannot forget.
 *
 * Gotcha: tz-aware parsing is self-contained on `Intl.DateTimeFormat` + UTC-
 * civil arithmetic — date-fns v4 has no IANA-zone support without
 * `@date-fns/tz` (uninstalled).
 */
import { z } from "zod";

// ─── Primitive coercers (pure value -> value) ───────────────────────────────

/** True when v is null/undefined or a whitespace-only string. */
function isEmptyish(v: unknown): boolean {
	return v == null || (typeof v === "string" && v.trim().length === 0);
}

/** null / "" / whitespace -> undefined; otherwise pass through (strings trimmed). */
export function stripEmpty(v: unknown): unknown {
	if (isEmptyish(v)) return undefined;
	return typeof v === "string" ? v.trim() : v;
}

/** number | numeric string | boolean -> number; anything unparseable -> undefined. */
export function coerceInt(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "string") {
		const t = value.trim();
		if (t === "") return undefined;
		const n = Number(t);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

/** array | CSV | JSON-array-string | single value -> string[]. */
export function coerceStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((x) => String(x));
	if (typeof value === "string") {
		const t = value.trim();
		if (t === "") return [];
		if (t.startsWith("[")) {
			try {
				const parsed = JSON.parse(t);
				if (Array.isArray(parsed)) return parsed.map((x) => String(x));
			} catch {
				// Malformed JSON array — fall through to the comma/whitespace split.
			}
		}
		const parts = t
			.split(/[,\n\r\t]+/)
			.map((x) => x.trim())
			.filter((x) => x.length > 0);
		return parts.length > 0 ? parts : [t];
	}
	if (value == null) return [];
	return [String(value)];
}

// ─── Timezone-aware timestamp coercion ──────────────────────────────────────

type Civil = {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	second: number;
	ms: number;
};

const WEEKDAYS: Record<string, number> = {
	sunday: 0,
	sun: 0,
	monday: 1,
	mon: 1,
	tuesday: 2,
	tues: 2,
	tue: 2,
	wednesday: 3,
	wed: 3,
	thursday: 4,
	thurs: 4,
	thur: 4,
	thu: 4,
	friday: 5,
	fri: 5,
	saturday: 6,
	sat: 6,
};

/** Read the wall-clock components of `instant` as seen in `timeZone`. */
function partsInZone(timeZone: string, instant: number): Civil {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = dtf.formatToParts(new Date(instant));
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: get("hour"),
		minute: get("minute"),
		second: get("second"),
		ms: 0,
	};
}

/** Offset (localWall - utc) in ms for `timeZone` at `instant`. */
function tzOffsetMs(timeZone: string, instant: number): number {
	const c = partsInZone(timeZone, instant);
	const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
	return asUtc - instant;
}

/** Interpret a wall-clock time *in `timeZone`* as an absolute epoch-ms instant. */
function civilToEpoch(c: Civil, timeZone: string): number {
	const guess = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second, c.ms);
	// Offset depends on the instant; one refinement pass resolves DST edges.
	const o1 = tzOffsetMs(timeZone, guess);
	const o2 = tzOffsetMs(timeZone, guess - o1);
	return guess - o2;
}

/** Weekday (0=Sun..6=Sat) of a civil date, computed tz-independently. */
function civilDow(c: Civil): number {
	return new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
}

/** Add `days` to a civil date (carries month/year correctly). */
function addCivilDays(c: Civil, days: number): Civil {
	const d = new Date(Date.UTC(c.year, c.month - 1, c.day));
	d.setUTCDate(d.getUTCDate() + days);
	return {
		...c,
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
	};
}

/** Pull an explicit clock time out of a phrase ("9am", "9:30pm", "15:00", "noon"). */
function parseTimeOfDay(s: string): { hour: number; minute: number } | undefined {
	if (/\bnoon\b/.test(s)) return { hour: 12, minute: 0 };
	if (/\bmidnight\b/.test(s)) return { hour: 0, minute: 0 };
	const ampm = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
	if (ampm) {
		let hour = Number(ampm[1]) % 12;
		if (ampm[3] === "pm") hour += 12;
		return { hour, minute: ampm[2] ? Number(ampm[2]) : 0 };
	}
	const h24 = s.match(/\b(\d{1,2}):(\d{2})\b/);
	if (h24) {
		const hour = Number(h24[1]);
		const minute = Number(h24[2]);
		if (hour < 24 && minute < 60) return { hour, minute };
	}
	return undefined;
}

/** Parse natural-language dates relative to `now`, in `timeZone`. */
function parseNatural(input: string, timeZone: string, now: number): number | undefined {
	const s = input.toLowerCase();

	// "in N days/weeks/hours/minutes"
	const rel = s.match(/^in\s+(\d+)\s*(minutes?|mins?|hours?|days?|weeks?)\b/);
	if (rel) {
		const n = Number(rel[1]);
		const unit = rel[2];
		if (unit.startsWith("hour")) return now + n * 3_600_000;
		if (unit.startsWith("min")) return now + n * 60_000;
		const base = partsInZone(timeZone, now);
		const moved = addCivilDays(base, unit.startsWith("week") ? n * 7 : n);
		const t = parseTimeOfDay(s) ?? { hour: base.hour, minute: base.minute };
		return civilToEpoch(
			{ ...moved, hour: t.hour, minute: t.minute, second: 0, ms: 0 },
			timeZone,
		);
	}

	const base = partsInZone(timeZone, now);
	// Date-only phrases default to 9:00 AM (matches the app's "snap to 9am" rule).
	const time = parseTimeOfDay(s) ?? { hour: 9, minute: 0 };
	const at = (c: Civil) =>
		civilToEpoch({ ...c, hour: time.hour, minute: time.minute, second: 0, ms: 0 }, timeZone);

	if (/\btoday\b/.test(s)) return at(base);
	if (/\btomorrow\b/.test(s)) return at(addCivilDays(base, 1));
	if (/\byesterday\b/.test(s)) return at(addCivilDays(base, -1));
	if (/\bnext\s+week\b/.test(s)) return at(addCivilDays(base, 7));

	const wd = s.match(
		/\b(?:(next|this|coming|on)\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/,
	);
	if (wd) {
		const target = WEEKDAYS[wd[2]];
		let delta = (target - civilDow(base) + 7) % 7;
		// "next <weekday>" is never today — push to the following week.
		if (wd[1] === "next" && delta === 0) delta = 7;
		return at(addCivilDays(base, delta));
	}

	return undefined;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const ISO_NO_OFFSET =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/;

/** ISO 8601 -> epoch ms. Explicit-offset strings are absolute; bare ones are wall-clock in `timeZone`. */
function parseIso(s: string, timeZone: string): number | undefined {
	if (ISO_WITH_OFFSET.test(s)) {
		const t = Date.parse(s);
		return Number.isNaN(t) ? undefined : t;
	}
	const m = s.match(ISO_NO_OFFSET);
	if (m) {
		return civilToEpoch(
			{
				year: +m[1],
				month: +m[2],
				day: +m[3],
				hour: m[4] ? +m[4] : 0,
				minute: m[5] ? +m[5] : 0,
				second: m[6] ? +m[6] : 0,
				ms: m[7] ? +m[7].padEnd(3, "0") : 0,
			},
			timeZone,
		);
	}
	return undefined;
}

/**
 * epoch ms (number | numeric string) | ISO 8601 | natural language -> epoch ms
 * in `timeZone`. Returns `undefined` when the value is empty or unparseable
 * (the strict schema then surfaces a `repair`). This is the `dueAt` fix.
 */
export function coerceTimestamp(value: unknown, timeZone = "UTC"): number | undefined {
	if (value == null) return undefined;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;

	const s = value.trim();
	if (s === "") return undefined;
	if (/^-?\d+$/.test(s)) {
		const n = Number(s);
		return Number.isFinite(n) ? n : undefined;
	}

	return parseIso(s, timeZone) ?? parseNatural(s, timeZone, Date.now());
}

// ─── `field` helper — coercion baked into the schema ─────────────────────────
//
// Capability authors use these so they CANNOT forget coercion. Each returns a
// zod schema; chain `.optional()` / `.describe()` / `.min()` as needed. The
// schemas carry a non-enumerable `__fieldKind` tag so coverage.ts can recognise
// the kind without behaviour-probing (zod preprocessors are too permissive to
// classify reliably from samples).

const FIELD_KIND = Symbol.for("ai/registry/field-kind");
export type FieldKind = "timestamp" | "codeArray" | "int" | "string";

function tag<T extends z.ZodType>(schema: T, kind: FieldKind): T {
	Object.defineProperty(schema, FIELD_KIND, {
		value: kind,
		enumerable: false,
		writable: false,
	});
	return schema;
}

/** Read the field-kind tag attached by `field.*`. Returns undefined for raw zod schemas. */
export function getFieldKind(schema: z.ZodType): FieldKind | undefined {
	return (schema as unknown as { [k: symbol]: FieldKind | undefined })[FIELD_KIND];
}

export const field = {
	/**
	 * Eager date field — schema-time timezone, preprocesses to epoch ms.
	 *
	 * The {@link coerceTimestamp} preprocess closes over `timeZone` at
	 * schema-build time, so natural-language phrases like "next Tuesday"
	 * resolve relative to THAT timezone (not the principal's live org
	 * timezone). Use this when the timezone is known at module load
	 * (e.g. UTC for a global system tool); for per-org dates prefer
	 * {@link timestampLazy} so `run()` can bind the live org timezone.
	 */
	timestamp: (timeZone: string) =>
		tag(
			z.preprocess((v) => coerceTimestamp(v, timeZone), z.number()),
			"timestamp",
		),
	/**
	 * Late-bound date field — accepts `string | number` raw and DEFERS the
	 * timezone-aware coercion to `run()`. The model can pass an epoch
	 * number, an ISO string with explicit offset, or a natural-language
	 * phrase ("next Tuesday", "tomorrow 9am"); `run()` reads the live org
	 * timezone (NOT a schema-time constant) and feeds the value through
	 * {@link coerceTimestamp}.
	 *
	 * Why this exists: scheduling capabilities (tasks, reminders, calendar
	 * events) need the org's timezone, which is per-tenant and only known
	 * at request time. {@link timestamp} pins the timezone at schema-build
	 * time and so cannot represent "tomorrow at 9am in the org's local
	 * time" without compiling a fresh schema per org. The lazy variant
	 * sidesteps that by passing the raw value through; the contract-test
	 * generator (`coverage.ts`) still recognises the field as a timestamp
	 * via the field-kind tag and exercises ISO + epoch + natural-language
	 * inputs the same way it does for the eager variant.
	 *
	 * Recommended `run()` usage:
	 *
	 *     const orgTz = await readOrgTimezone(ctx, orgId);
	 *     const epoch = typeof args.dueAt === "number"
	 *         ? args.dueAt
	 *         : coerceTimestamp(args.dueAt, orgTz);
	 *     if (epoch === undefined) return repair("dueAt", ...);
	 */
	timestampLazy: () => tag(z.union([z.number(), z.string().min(1)]), "timestamp"),
	/** String-array field: accepts array | CSV | JSON-string | single value. */
	codeArray: () =>
		tag(
			z.preprocess((v) => coerceStringArray(v), z.array(z.string())),
			"codeArray",
		),
	/** Integer field: accepts number | numeric string | boolean. */
	int: () =>
		tag(
			z.preprocess((v) => coerceInt(v), z.number()),
			"int",
		),
	/** String field: trims; null / "" / whitespace become undefined. */
	str: () =>
		tag(
			z.preprocess((v) => stripEmpty(v), z.string()),
			"string",
		),
};
