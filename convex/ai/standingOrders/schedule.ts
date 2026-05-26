/**
 * convex/ai/standingOrders/schedule.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Pure helpers for
 * deciding whether a standing-order row should fire on the current
 * minute tick.
 *
 * Why a closed schedule union (instead of cron strings):
 *   - We don't want to ship a cron-string parser dependency. The
 *     surface area users care about is "every N minutes", "daily at
 *     HH:MM UTC", and "weekly on <day> at HH:MM UTC" — exactly what
 *     the closed union models.
 *   - Pure functions = trivially testable. `shouldFireNow` is exported
 *     for the test suite at `convex/stage8.test.ts`.
 *   - Adding a new schedule kind = adding a literal arm + a case here;
 *     no parser regex to keep in sync.
 *
 * The cron evaluator (`evaluator.ts`) ticks once per minute. For each
 * enabled standing order it calls `shouldFireNow(schedule, now,
 * lastRunAt)` and only schedules `runner.run` when that returns true.
 *
 * Determinism:
 *   - All boundary checks use UTC. We never read `process.env.TZ`.
 *   - Daily / weekly fire when the current minute matches AND the
 *     last run was on a previous day (so a 60-tick window doesn't
 *     fire 60 times).
 *   - Interval fires when `now - lastRunAt >= intervalMinutes * 60_000`,
 *     or when `lastRunAt` is undefined (first run).
 */

export type Schedule =
	| { kind: "interval"; intervalMinutes: number }
	| { kind: "daily"; utcHour: number; utcMinute: number }
	| { kind: "weekly"; dayOfWeek: number; utcHour: number; utcMinute: number };

/** Lower bound on interval — guards against accidental every-minute storms. */
export const MIN_INTERVAL_MINUTES = 5;
/** Cron evaluator tolerance for daily/weekly schedules (matches the 1-minute cron tick). */
export const FIRE_TOLERANCE_MINUTES = 1;

/**
 * Determine whether a standing order should fire on the current cron
 * tick. Pure / deterministic — given the same inputs always returns
 * the same boolean. Exported for tests.
 *
 * @param schedule  — the row's `schedule` value (closed union).
 * @param now       — `Date.now()` at the cron tick.
 * @param lastRunAt — undefined for first-run, otherwise the row's last
 *                    successful evaluation time.
 */
export function shouldFireNow(
	schedule: Schedule,
	now: number,
	lastRunAt: number | undefined,
): boolean {
	if (schedule.kind === "interval") {
		const intervalMs = Math.max(MIN_INTERVAL_MINUTES, schedule.intervalMinutes) * 60_000;
		if (lastRunAt === undefined) return true;
		return now - lastRunAt >= intervalMs;
	}

	const nowDate = new Date(now);
	const nowMinuteEpoch = Math.floor(now / 60_000);
	const isSameMinuteAs = (other: number | undefined) =>
		other !== undefined && Math.floor(other / 60_000) === nowMinuteEpoch;

	const matchesHourMinute = (utcHour: number, utcMinute: number): boolean => {
		const h = nowDate.getUTCHours();
		const m = nowDate.getUTCMinutes();
		// Allow a 1-minute slack so a tick that lands at 09:01 still fires
		// the 09:00 schedule if the cron was a minute late.
		if (h !== utcHour) return false;
		return Math.abs(m - utcMinute) <= FIRE_TOLERANCE_MINUTES;
	};

	if (schedule.kind === "daily") {
		if (!matchesHourMinute(schedule.utcHour, schedule.utcMinute)) return false;
		// Don't double-fire inside the same minute window.
		if (isSameMinuteAs(lastRunAt)) return false;
		// Don't fire twice in the same UTC day.
		if (lastRunAt !== undefined) {
			const last = new Date(lastRunAt);
			if (
				last.getUTCFullYear() === nowDate.getUTCFullYear() &&
				last.getUTCMonth() === nowDate.getUTCMonth() &&
				last.getUTCDate() === nowDate.getUTCDate()
			) {
				return false;
			}
		}
		return true;
	}

	// weekly
	if (nowDate.getUTCDay() !== schedule.dayOfWeek) return false;
	if (!matchesHourMinute(schedule.utcHour, schedule.utcMinute)) return false;
	if (isSameMinuteAs(lastRunAt)) return false;
	if (lastRunAt !== undefined) {
		// Same UTC day → already fired this week.
		const last = new Date(lastRunAt);
		if (
			last.getUTCFullYear() === nowDate.getUTCFullYear() &&
			last.getUTCMonth() === nowDate.getUTCMonth() &&
			last.getUTCDate() === nowDate.getUTCDate()
		) {
			return false;
		}
	}
	return true;
}

/** Validate a schedule's bounds at write time. Throws on out-of-range. */
export function validateSchedule(schedule: Schedule): void {
	if (schedule.kind === "interval") {
		if (
			!Number.isFinite(schedule.intervalMinutes) ||
			schedule.intervalMinutes < MIN_INTERVAL_MINUTES
		) {
			throw new Error(
				`Schedule intervalMinutes must be >= ${MIN_INTERVAL_MINUTES} (got ${schedule.intervalMinutes}).`,
			);
		}
		if (schedule.intervalMinutes > 60 * 24 * 30) {
			throw new Error(`Schedule intervalMinutes too large — max ${60 * 24 * 30} (30 days).`);
		}
		return;
	}

	if (schedule.utcHour < 0 || schedule.utcHour > 23) {
		throw new Error(`Schedule utcHour must be 0-23 (got ${schedule.utcHour}).`);
	}
	if (schedule.utcMinute < 0 || schedule.utcMinute > 59) {
		throw new Error(`Schedule utcMinute must be 0-59 (got ${schedule.utcMinute}).`);
	}
	if (schedule.kind === "weekly") {
		if (schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
			throw new Error(`Schedule dayOfWeek must be 0-6 (got ${schedule.dayOfWeek}).`);
		}
	}
}

/**
 * Compact one-line label for the schedule. Used in the settings UI +
 * the lastRunSummary fallback.
 */
export function describeSchedule(schedule: Schedule): string {
	if (schedule.kind === "interval") {
		return `Every ${schedule.intervalMinutes} minute(s)`;
	}
	const hh = String(schedule.utcHour).padStart(2, "0");
	const mm = String(schedule.utcMinute).padStart(2, "0");
	if (schedule.kind === "daily") return `Daily at ${hh}:${mm} UTC`;
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return `Weekly on ${days[schedule.dayOfWeek] ?? "?"} at ${hh}:${mm} UTC`;
}
