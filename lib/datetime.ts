/**
 * Time / datetime helpers for chat-like UIs (Messages, Notes, Activity).
 *
 * The convention across the chat surface (per user direction, 2026-05-17):
 *   - Bubbles + sidebar rows show EXACT clock time (e.g. "2:45 PM"), not
 *     relative ("about 1 hour ago"). Relative remains useful for tooltips
 *     and for non-chat surfaces (Recent Activity widget, etc.) — it's still
 *     re-exported from `date-fns` and not deleted anywhere.
 *
 * Time-format source of truth (current + future):
 *   - **Default = 12-hour with AM/PM** across the chat surface, regardless
 *     of locale. Some 24-hour locales (en-GB, ar-SA, fr, de…) would
 *     otherwise render "14:45"; per user direction (batch 6, 2026-05-17)
 *     the chat surface forces `hour12: true` for a uniform WhatsApp-style
 *     "2:45 PM" look. Callers can opt out by passing `hour12: false`.
 *   - Future hook: an org-wide `org.settings.timeFormat: "12h" | "24h"`
 *     override. The helpers below already accept an `opts.hour12` knob —
 *     a future caller can read the org setting and pass it. Doing this
 *     without an org setting in the schema today avoids a Convex migration.
 *
 * RTL note: `Intl.DateTimeFormat` is locale-aware so Arabic locales get
 * Arabic numerals automatically. No additional plumbing needed.
 */

export type ChatTimeOptions = {
	/**
	 * Force 12-hour vs 24-hour. Defaults to **true** (12-hour AM/PM) across
	 * the chat surface for a uniform WhatsApp-style look. Pass `false` to
	 * use 24-hour, or pass `undefined` (legacy) to defer to the locale.
	 */
	hour12?: boolean;
	/** Override the locale (defaults to the browser/runtime locale). */
	locale?: string;
};

/**
 * Resolve the `hour12` option. The chat surface defaults to **true**
 * (12-hour AM/PM) — per user direction (batch 6) — for a uniform look
 * regardless of the user's locale. Callers can pass `false` to force 24h
 * or pass `null` (cast as undefined) to defer to the locale.
 */
function resolveHour12(opts: ChatTimeOptions): boolean | undefined {
	return opts.hour12 ?? true;
}

/** Format a unix-ms timestamp as a clock time, e.g. "2:45 PM". */
export function formatChatTime(ts: number, opts: ChatTimeOptions = {}): string {
	try {
		return new Intl.DateTimeFormat(opts.locale, {
			hour: "numeric",
			minute: "2-digit",
			hour12: resolveHour12(opts),
		}).format(ts);
	} catch {
		return "";
	}
}

/** Full date + time (used for tooltips), e.g. "May 17, 2026, 2:45 PM". */
export function formatChatDateTime(ts: number, opts: ChatTimeOptions = {}): string {
	try {
		return new Intl.DateTimeFormat(opts.locale, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: resolveHour12(opts),
		}).format(ts);
	} catch {
		return "";
	}
}

/**
 * "WhatsApp-style" sidebar timestamp:
 *   - today  → "2:45 PM"
 *   - yesterday → "Yesterday"
 *   - within the past 7 days → weekday name ("Mon")
 *   - older → short date ("May 17" or "May 17, 2025" if not this year)
 *
 * Today's clock-time uses `formatChatTime` so it inherits the same
 * 12h-AM/PM default — see `resolveHour12`.
 */
export function formatChatSidebarTime(ts: number, opts: ChatTimeOptions = {}): string {
	const now = new Date();
	const target = new Date(ts);

	const sameDay = (a: Date, b: Date) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();

	if (sameDay(now, target)) return formatChatTime(ts, opts);

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (sameDay(yesterday, target)) return "Yesterday";

	const oneWeekAgo = new Date(now);
	oneWeekAgo.setDate(now.getDate() - 7);
	if (target > oneWeekAgo) {
		try {
			return new Intl.DateTimeFormat(opts.locale, { weekday: "short" }).format(ts);
		} catch {
			return "";
		}
	}

	try {
		return new Intl.DateTimeFormat(opts.locale, {
			month: "short",
			day: "numeric",
			year: target.getFullYear() === now.getFullYear() ? undefined : "numeric",
		}).format(ts);
	} catch {
		return "";
	}
}
