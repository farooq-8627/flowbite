/**
 * convex/_shared/widgetRegistry.ts
 *
 * Single source of truth for the dashboard widget catalogue.
 *
 * Phase 4 Part 2 (T8) — moved from `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`
 * so the AI agent can introspect + write the layout without the React
 * dependency. The frontend file still owns the icons, the
 * `get(stats)` formatters, and the link factories — those live next
 * to the React render path.
 *
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3 Step 1) — extended
 * the catalogue from 12 KPI-only keys to 25 keys covering every
 * dashboard surface (KPI tiles + section cards + placeholders) the
 * industry templates legitimately reference. Closes the "reminders
 * widget not showing" bug whose root cause was the `generic` template
 * writing the unregistered `reminders.list` section key. After this
 * change `validateDashboardLayout` accepts every template's keys, the
 * `update_dashboard_layout` AI tool can write them, and unknown keys
 * are still rejected loudly. The companion migration
 * `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` rewrites
 * the legacy `calendar.miniWidget` alias to canonical `calendar.mini`
 * across every existing org row.
 *
 * Why pure data here: Convex modules can't import React. The frontend
 * registry imports `WIDGETS` from this file and decorates each entry
 * with the rendering metadata it needs. The widget keys themselves —
 * the contract between `org.settings.dashboardMetrics` and the
 * registry — live here so backend tools (`list_widgets`,
 * `update_dashboard_layout`) and frontend renderer never drift.
 *
 * To add a new widget:
 *   1. Add the key + meta below.
 *   2. (For KPI-size widgets) add the matching `WidgetSpec` (icon,
 *      get, href) in the frontend `WidgetRegistry.tsx` so the dashboard
 *      can render it as a tile. Section / full-size widgets render as
 *      cards gated on `isEnabled(key)` in `DashboardHomeView.tsx` and
 *      do not need a frontend tile spec.
 *   3. (Optional) update industry templates' `dashboardMetrics`
 *      arrays to opt the new widget into the default layout.
 */

/**
 * Every widget key the platform recognises. Order is irrelevant —
 * dashboards render in the order declared by
 * `org.settings.dashboardMetrics`.
 */
export const WIDGET_KEYS = [
	// ── KPI tiles (rendered by MetricStrip) ─────────────────────────────
	"leads.open",
	"contacts.active",
	"companies.active",
	"deals.open",
	"deals.won",
	"deals.pipelineValue",
	// 2026-05-30 — `deals.winRate` joins the canonical KPI quartet
	// (Pipeline value · Win rate · Due today · Open leads) the
	// dashboard now leads with under the revenue hero. Computed
	// client-side from `dealsWon / (dealsWon + dealsLost)` — no new
	// stat counter needed because both inputs are already on
	// `getDashboardStats`'s payload.
	"deals.winRate",
	"tasks.dueToday",
	"tasks.overdue",
	"tasks.doneThisWeek",
	"tasks.streak",
	// KPI placeholders (templates use them; UI ships in Phase 4+).
	"tasks.thisWeek",
	"tasks.recentlyCompleted",
	"deals.lost",
	"deals.invoiced.unpaid",
	// ── Section cards (rendered conditionally below the KPI strip) ──────
	"tasks.list", // TasksCard gate
	"messages.recent", // MessagesPreviewWidget gate
	"activity.recent", // TimelineActivityWidget gate
	"calendar.weekAhead", // WeekAheadWidget gate (full width)
	"calendar.mini", // MiniCalendarWidget gate
	"today.focus", // folded into the KPI strip (resolveWidgets) — card retired 2026-05-29
	// Section placeholders (templates use them; widgets to be built later).
	"deals.pipeline",
	"deals.staleByStage",
	"deals.renewingIn30Days",
	// Stage 7 (SPRINT-PLAN.md) → Stage 2 of DASHBOARD-V2-PLAN.md (2026-05-29).
	// `pipeline.velocity` was retired in favour of the broader
	// `pipeline.salesPanel` (Summary + Velocity + Forecast tabs).
	"pipeline.salesPanel",
	// Stage 4 of DASHBOARD-V2-PLAN.md (2026-05-29) — per-industry analytical
	// widgets. Each one is a self-contained <full>-size section card backed
	// by a deterministic deals rollup (pure DB read, no LLM).
	"invoices.aging", // freelancer / agency — buckets unpaid invoices by age in stage
	"properties.funnel", // real-estate — stage-by-stage funnel of the default deal pipeline
	"deals.arrCohort", // b2b-saas — won deals bucketed by month + summed value
	// ── Full-width AI surfaces ──────────────────────────────────────────
	"ai.morningBriefing",
	"ai.quickComposer",
	"ai.pulseRibbon",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

export type WidgetCategory = "crm" | "scheduling" | "productivity" | "ai";

/**
 * Layout-size discriminator.
 *   - `kpi`  — small numeric tile rendered by `MetricStrip`.
 *   - `half` — half-width card rendered conditionally below the strip.
 *   - `full` — full-width card rendered conditionally below the strip.
 *
 * Frontend `resolveWidgets` filters to size === "kpi" only — section
 * widgets are not iterated as tiles, they gate dedicated cards via
 * `isEnabled(key)` in `DashboardHomeView`.
 */
export type WidgetSize = "kpi" | "half" | "full";

export type WidgetMeta = {
	/** Human-readable label rendered on the tile. */
	label: string;
	/** One-line description for tooltips + AI introspection. */
	description: string;
	/** Grouping for settings UI + AI suggestions. */
	category: WidgetCategory;
	/** Size hint — KPI tiles vs half-width vs full-width cards. */
	size: WidgetSize;
	/**
	 * Marker for incomplete widgets that render a placeholder tile or
	 * have no UI surface yet. Excluded from default layouts; AI may
	 * reference them via `list_widgets` but should not propose adding
	 * them until the matching widget is built.
	 */
	placeholder?: boolean;
};

/**
 * Canonical metadata for every supported widget. Frontend imports
 * from here and adds icons / formatters / hrefs on top.
 */
export const WIDGETS: Record<WidgetKey, WidgetMeta> = {
	// ── KPI tiles ───────────────────────────────────────────────────────
	"leads.open": {
		label: "Open leads",
		description: "Count of leads that haven't been won, lost, or converted.",
		category: "crm",
		size: "kpi",
	},
	"contacts.active": {
		label: "Contacts",
		description: "Total contacts in the workspace.",
		category: "crm",
		size: "kpi",
	},
	"companies.active": {
		label: "Companies",
		description: "Total companies in the workspace.",
		category: "crm",
		size: "kpi",
	},
	"deals.open": {
		label: "Open deals",
		description: "Deals that haven't reached a final stage (won / lost).",
		category: "crm",
		size: "kpi",
	},
	"deals.won": {
		label: "Deals won",
		description: "Deals closed-won across the workspace history.",
		category: "crm",
		size: "kpi",
	},
	"deals.pipelineValue": {
		label: "Pipeline value",
		description: "Sum of expected revenue across every open deal in the workspace's currency.",
		category: "crm",
		size: "kpi",
	},
	"deals.winRate": {
		label: "Win rate",
		description:
			"Percentage of closed deals that were won — `dealsWon / (dealsWon + dealsLost)`. 0% when no deals have closed yet.",
		category: "crm",
		size: "kpi",
	},
	"tasks.dueToday": {
		label: "Tasks due today",
		description:
			"Pending tasks scheduled for today (todo / call / email / meeting / followup).",
		category: "productivity",
		size: "kpi",
	},
	"tasks.overdue": {
		label: "Overdue",
		description: "Tasks past their due date.",
		category: "productivity",
		size: "kpi",
	},
	"tasks.doneThisWeek": {
		label: "Done this week",
		description: "Reminders / tasks completed in the trailing 7 days.",
		category: "productivity",
		size: "kpi",
	},
	"tasks.streak": {
		label: "Streak",
		description: "Daily-activity streak counter (placeholder until Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"tasks.thisWeek": {
		label: "Due this week",
		description: "Tasks due in the trailing 7 days (placeholder — UI in Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"tasks.recentlyCompleted": {
		label: "Recently completed",
		description: "Most recently completed tasks (placeholder — UI in Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"deals.lost": {
		label: "Deals lost",
		description: "Deals closed-lost across the workspace history (placeholder).",
		category: "crm",
		size: "kpi",
		placeholder: true,
	},
	"deals.invoiced.unpaid": {
		label: "Awaiting payment",
		description:
			"Invoiced deals not yet paid — used by freelancer / agency templates (placeholder).",
		category: "crm",
		size: "kpi",
		placeholder: true,
	},

	// ── Section cards (gated below the KPI strip) ───────────────────────
	"tasks.list": {
		label: "Tasks",
		description:
			"Full-width live tasks table — same shape as the /tasks page, paginated to 10 rows with inline complete + row-click edit. Stage 3 of DASHBOARD-V2-PLAN.md (2026-05-29) replaced the legacy 8-row TasksCard with this LiveTasksWidget.",
		category: "scheduling",
		size: "full",
	},
	"messages.recent": {
		label: "Recent messages",
		description: "Card listing the most recent conversation messages across the workspace.",
		category: "crm",
		size: "half",
	},
	"activity.recent": {
		label: "Recent activity",
		description:
			"Orbitly recent-sales-shape card — avatar + actor name + description + timestamp for the last ~10 org-wide events. Stage 3 of DASHBOARD-V2-PLAN.md (2026-05-29) replaced the legacy TimelineActivityWidget with this RecentActivityWidget.",
		category: "crm",
		size: "half",
	},
	"calendar.weekAhead": {
		label: "Week ahead",
		description: "Full-width 7-day strip of upcoming reminders + calendar events.",
		category: "scheduling",
		size: "full",
	},
	"calendar.mini": {
		label: "Calendar (mini)",
		description: "Small month-grid date picker that deep-links into the full calendar.",
		category: "scheduling",
		size: "half",
	},
	"today.focus": {
		label: "Today's focus",
		description:
			"Card summarising today's commitments — reminders due, leads to qualify, deals to advance.",
		category: "productivity",
		size: "half",
	},
	"deals.pipeline": {
		label: "Pipeline visualisation",
		description:
			"Stage-by-stage pipeline overview (placeholder — gated until the dedicated card ships).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	"deals.staleByStage": {
		label: "Stale deals by stage",
		description: "Stage-by-stage breakdown of deals past their stale threshold (placeholder).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	"deals.renewingIn30Days": {
		label: "Renewing in 30 days",
		description:
			"Won deals whose lease / subscription expires within 30 days — used by real-estate / Saudi templates (placeholder).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	// Stage 7 (SPRINT-PLAN.md) — Pipeline-velocity card.
	// Stage 2 of /DASHBOARD-V2-PLAN.md (2026-05-29) — superseded by
	// `pipeline.salesPanel` which packages the velocity table as one of
	// three tabs (Summary / Velocity / Forecast). Existing org rows
	// migrate via `_migrations/2026_05_29_renamePipelineVelocityToSalesPanel.ts`;
	// templates flipped to the new key in the same edit. Old key kept
	// in WIDGETS metadata is removed to avoid stale references —
	// `validateDashboardLayout` rejects unknown keys, so the migration
	// is the single transition point.
	"pipeline.salesPanel": {
		label: "Sales pipeline",
		description:
			"Tabbed full-width panel: Summary (open value + weighted forecast + win-rate dial), Velocity (per-stage funnel), Forecast (HubSpot-style Commit/Best Case/Pipeline + Won/Lost/Forecast tiles + coverage-ratio dial + 12-week sparkline). Pure DB rollup, no LLM.",
		category: "crm",
		size: "full",
	},

	// ── Per-industry analytical widgets (Stage 4 of DASHBOARD-V2-PLAN.md) ──
	"invoices.aging": {
		label: "Invoice aging",
		description:
			"Buckets unpaid invoiced deals by age in stage (0-7d, 8-14d, 15-30d, 30d+). Freelancer / agency templates surface this so overdue payments stay visible. Pure DB rollup, no LLM.",
		category: "crm",
		size: "full",
	},
	"properties.funnel": {
		label: "Property funnel",
		description:
			"Stage-by-stage funnel of the default deal pipeline — counts + dropoff. Used by real-estate templates to surface where listings stall (Inquiry → Viewing → Offer → Contract → Won).",
		category: "crm",
		size: "full",
	},
	"deals.arrCohort": {
		label: "Won-deal cohorts",
		description:
			"6-month cohort chart of won deals — bars per close month showing cumulative revenue. B2B SaaS templates use this to surface ARR / ACV trends. Pure DB rollup.",
		category: "crm",
		size: "full",
	},

	// ── Full-width AI surfaces ──────────────────────────────────────────
	"ai.morningBriefing": {
		label: "AI morning briefing",
		description:
			"Full-width AI summary of overnight activity, top priorities, and stale records.",
		category: "ai",
		size: "full",
	},
	// Stage 5 — AI dashboard surface (SPRINT-PLAN.md Stage 5).
	"ai.quickComposer": {
		label: "AI quick composer",
		description:
			"Pinned mini chat composer on the dashboard. Drops the typed prompt into the AI chat panel with a single click — no need to open the side sheet first.",
		category: "ai",
		size: "full",
	},
	"ai.pulseRibbon": {
		label: "AI pulse",
		description:
			"Top 3 highest-value AI suggestions, dismissible per-user. Renders above the metric strip when there is at least one suggestion.",
		category: "ai",
		size: "full",
	},
};

/**
 * Sensible default layout — used when an org has no
 * `org.settings.dashboardMetrics` set. Mirrors the order in
 * `resolveWidgets` on the frontend.
 *
 * 2026-05-30 — locked to the canonical KPI quartet (Pipeline value,
 * Win rate, Due today, Open leads) per the dashboard refinement spec.
 * The `<RevenueEstimateHero>` above the strip already represents Open
 * Deals / Deals Won / Deals Lost as one bold consolidated number, so
 * the strip stops doubling those tiles and focuses on the four KPIs
 * the owner actually scans first thing every morning.
 */
export const DEFAULT_DASHBOARD_LAYOUT: WidgetKey[] = [
	"deals.pipelineValue",
	"deals.winRate",
	"tasks.dueToday",
	"leads.open",
];

/** True if `key` is a recognised widget key. */
export function isWidgetKey(key: string): key is WidgetKey {
	return (WIDGET_KEYS as readonly string[]).includes(key);
}

/**
 * Validate a candidate dashboardMetrics array. Returns the cleaned
 * list (unknown keys dropped, duplicates removed, placeholders kept
 * because templates may legitimately reference them) plus a list of
 * keys that were rejected so the caller can surface them.
 */
/**
 * Validate a candidate dashboardMetrics array. Returns the cleaned
 * list (unknown keys dropped, duplicates removed, placeholders kept
 * because templates may legitimately reference them) plus a list of
 * keys that were rejected so the caller can surface them.
 *
 * No alias / legacy-rename logic — every write goes through this
 * function and unknown keys are rejected loudly. Stage 1's legacy
 * `calendar.miniWidget` alias was a one-shot data migration; the
 * alias map is now scoped INSIDE
 * `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` and
 * not exposed at runtime. (Stage 3-A session 2 — pure-code directive.)
 */
export function validateDashboardLayout(input: string[]): {
	keys: WidgetKey[];
	rejected: string[];
} {
	const seen = new Set<string>();
	const keys: WidgetKey[] = [];
	const rejected: string[] = [];
	for (const k of input) {
		if (seen.has(k)) continue;
		seen.add(k);
		if (isWidgetKey(k)) keys.push(k);
		else rejected.push(k);
	}
	return { keys, rejected };
}

/**
 * Stage 4 of DASHBOARD-V2-PLAN.md (2026-05-29).
 *
 * Runtime-validated dashboard-layout shape — mirrors the
 * `DashboardLayoutSeed` template type in
 * `convex/crm/fields/templates/types.ts`. Kept in this SSOT so:
 *
 *   - the schema validator (`convex/schema/identity.ts`) and the
 *     template seed validator (`convex/_platform/industries/validators.ts`)
 *     read from one shape definition;
 *   - the dashboard renderer (`DashboardHomeView.tsx`) and the
 *     introspect tool (`ai/tools/introspect.ts`) can re-use the
 *     validator without import cycles.
 *
 * Why string instead of WidgetKey on the in-flight type — when the
 * caller is the schema decoder, the keys come back as plain strings
 * before validation. Validator narrows to `WidgetKey` on the way out
 * via `isWidgetKey`; rejected entries are reported in the `rejected`
 * array on the result.
 */
export type DashboardLayoutShape = {
	hero?: WidgetKey;
	metrics?: WidgetKey[];
	panels: Array<{
		id: string;
		span: 1 | 2 | 3;
		widget: WidgetKey;
	}>;
	forecast?: {
		coverageBands?: { healthy: number; warning: number };
	};
};

export type DashboardLayoutValidation =
	| { valid: true; layout: DashboardLayoutShape; rejected: string[] }
	| { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * Shape-check + key-resolve a candidate dashboard layout. Drops
 * unknown widget keys (reported via `rejected`) and rejects layouts
 * with structural errors (missing `panels`, span out of [1,3], etc.).
 *
 * The check is intentionally light — the heavy cross-reference logic
 * lives in `convex/_platform/industries/validators.ts` so the editor
 * UI surfaces inline errors, but every render path goes through this
 * helper too as a defence-in-depth gate.
 */
export function validateDashboardLayoutShape(input: unknown): DashboardLayoutValidation {
	const errors: Array<{ path: string; message: string }> = [];
	const rejected: string[] = [];

	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		errors.push({ path: "dashboardLayout", message: "Layout must be an object." });
		return { valid: false, errors };
	}

	const raw = input as Record<string, unknown>;

	let hero: WidgetKey | undefined;
	if (raw.hero !== undefined) {
		if (typeof raw.hero !== "string") {
			errors.push({ path: "dashboardLayout.hero", message: "hero must be a string." });
		} else if (isWidgetKey(raw.hero)) {
			hero = raw.hero;
		} else {
			rejected.push(raw.hero);
		}
	}

	let metrics: WidgetKey[] | undefined;
	if (raw.metrics !== undefined) {
		if (!Array.isArray(raw.metrics)) {
			errors.push({
				path: "dashboardLayout.metrics",
				message: "metrics must be an array of widget keys.",
			});
		} else {
			metrics = [];
			raw.metrics.forEach((k, i) => {
				if (typeof k !== "string") {
					errors.push({
						path: `dashboardLayout.metrics[${i}]`,
						message: "metric keys must be strings.",
					});
					return;
				}
				if (isWidgetKey(k)) metrics?.push(k);
				else rejected.push(k);
			});
		}
	}

	if (!Array.isArray(raw.panels)) {
		errors.push({
			path: "dashboardLayout.panels",
			message: "panels is required and must be an array.",
		});
		return { valid: false, errors };
	}

	const panels: DashboardLayoutShape["panels"] = [];
	const seenIds = new Set<string>();
	raw.panels.forEach((p, i) => {
		if (p === null || typeof p !== "object") {
			errors.push({
				path: `dashboardLayout.panels[${i}]`,
				message: "panel must be an object.",
			});
			return;
		}
		const panel = p as Record<string, unknown>;
		const id = typeof panel.id === "string" ? panel.id : "";
		const span = panel.span;
		const widget = typeof panel.widget === "string" ? panel.widget : "";

		if (!id) {
			errors.push({
				path: `dashboardLayout.panels[${i}].id`,
				message: "panel id is required.",
			});
			return;
		}
		if (seenIds.has(id)) {
			errors.push({
				path: `dashboardLayout.panels[${i}].id`,
				message: `panel id "${id}" is duplicated.`,
			});
			return;
		}
		seenIds.add(id);

		if (span !== 1 && span !== 2 && span !== 3) {
			errors.push({
				path: `dashboardLayout.panels[${i}].span`,
				message: "panel span must be 1, 2, or 3.",
			});
			return;
		}
		if (!widget) {
			errors.push({
				path: `dashboardLayout.panels[${i}].widget`,
				message: "panel widget is required.",
			});
			return;
		}
		if (!isWidgetKey(widget)) {
			rejected.push(widget);
			return;
		}
		panels.push({ id, span, widget });
	});

	let forecast: DashboardLayoutShape["forecast"];
	if (raw.forecast !== undefined) {
		if (raw.forecast === null || typeof raw.forecast !== "object") {
			errors.push({
				path: "dashboardLayout.forecast",
				message: "forecast must be an object when set.",
			});
		} else {
			const f = raw.forecast as Record<string, unknown>;
			if (f.coverageBands !== undefined) {
				if (f.coverageBands === null || typeof f.coverageBands !== "object") {
					errors.push({
						path: "dashboardLayout.forecast.coverageBands",
						message: "coverageBands must be an object.",
					});
				} else {
					const cb = f.coverageBands as Record<string, unknown>;
					const healthy = cb.healthy;
					const warning = cb.warning;
					if (typeof healthy !== "number" || typeof warning !== "number") {
						errors.push({
							path: "dashboardLayout.forecast.coverageBands",
							message:
								"coverageBands.healthy + coverageBands.warning must be numbers.",
						});
					} else if (healthy <= warning) {
						errors.push({
							path: "dashboardLayout.forecast.coverageBands",
							message:
								"coverageBands.healthy must be greater than coverageBands.warning.",
						});
					} else {
						forecast = { coverageBands: { healthy, warning } };
					}
				}
			} else {
				forecast = {};
			}
		}
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	const layout: DashboardLayoutShape = {
		panels,
		...(hero !== undefined && { hero }),
		...(metrics !== undefined && { metrics }),
		...(forecast !== undefined && { forecast }),
	};
	return { valid: true, layout, rejected };
}
