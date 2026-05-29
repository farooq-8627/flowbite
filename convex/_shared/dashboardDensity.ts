/**
 * convex/_shared/dashboardDensity.ts
 *
 * Stage 7 of `/DASHBOARD-V2-PLAN.md` (2026-05-30) — single source of
 * truth for the per-user "how many recent rows" preference that
 * powers the dashboard's Recent activity + Recent messages widgets.
 *
 * The same number drives both widgets (they're tuned in lockstep so
 * the dashboard's two recent-rows panels stay visually parallel) and
 * is also forwarded to the server query
 * `getDashboardStats({ recentActivityLimit })`, which independently
 * clamps to `[1, 50]`.
 *
 * Bounds chosen so:
 *   - 3 rows = single-screen quiet view, the Recent activity card
 *     stays under the fold without scroll on a laptop.
 *   - 15 rows = power-user-with-a-tall-monitor maximum. Beyond 15 the
 *     widget loses its "preview" character and starts to compete with
 *     the full timeline / messages page, which is the right home for
 *     that volume.
 *   - 6 = historic constant (`DASHBOARD_RECENT_ACTIVITY_LIMIT`) the
 *     dashboard shipped with before the user-facing setting landed.
 *     Existing users keep their current density until they touch the
 *     slider in Settings → Appearance → Dashboard density.
 *
 * Imported by:
 *   - `convex/users/mutations.ts::updatePreferences` — server-side clamp on write.
 *   - `core/shell/shell/views/dashboard/DashboardHomeView.tsx` — client-side
 *      clamp on read + the slider's min/max.
 *   - `core/platform/settings/components/groups/AppearanceGroup.tsx` —
 *      the Settings → Appearance → Dashboard density form row.
 */

export const DASHBOARD_ACTIVITY_ROW_LIMIT_MIN = 3;
export const DASHBOARD_ACTIVITY_ROW_LIMIT_MAX = 15;
export const DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT = 6;

/**
 * Read a stored value (possibly undefined / out of range) and return a
 * safe row-count to use. Out-of-band numbers are clamped; missing or
 * non-numeric values fall through to the historic default. Mirrors the
 * server-side clamp in `users/mutations.ts::updatePreferences`.
 */
export function resolveActivityRowLimit(input: number | undefined | null): number {
	if (typeof input !== "number" || !Number.isFinite(input)) {
		return DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT;
	}
	const floored = Math.floor(input);
	if (floored < DASHBOARD_ACTIVITY_ROW_LIMIT_MIN) return DASHBOARD_ACTIVITY_ROW_LIMIT_MIN;
	if (floored > DASHBOARD_ACTIVITY_ROW_LIMIT_MAX) return DASHBOARD_ACTIVITY_ROW_LIMIT_MAX;
	return floored;
}
