"use client";

/**
 * AICockpitSection — Stage 1 of `DASHBOARD-V2-PLAN.md` (2026-05-28).
 *
 * Wraps the dashboard's AI cluster (DashboardAnnotationChips +
 * AIPulseRibbon + AIQuickComposerCard + DailyBriefingCard +
 * WeeklyInsightCard) under a single H2 header so the user reads the
 * cluster as one logical surface ("AI Cockpit — your workspace, on
 * autopilot"). (2026-06-06: the standalone org-scope AISuggestionsPanel
 * was folded into AIPulseRibbon — one merged, permission-scoped pulse
 * instead of two overlapping panels.) The cluster is collapsible per-user via
 * `users.preferences.dashboardSectionsCollapsed.proactive` (key
 * unchanged so existing per-user preferences carry over — only the
 * surface label changed).
 *
 * The section was previously called `ProactiveWorkspaceSection`. The
 * user's 2026-05-28 feedback: "Proactive workspace" was internally
 * accurate but invisibly so — the new name advertises the AI-native
 * positioning the dashboard is moving toward (matches the new
 * `<AIMark>` brand mark + the `Sparkles` icon that pairs with it).
 *
 * Stage 5 of the same plan adds AI-written widgets that mount inside
 * this section; the rename pre-empts that scope.
 *
 * Refresh button — single permanently-visible control on the header
 * right that triggers BOTH proactive surfaces in one click:
 *
 *   - `ai.queries.nextActions.lazyWarmForUser` rebuilds the user's
 *     ranked Top-3 / Top-100 in `aiNextActions` (the AI Pulse Ribbon
 *     reads from this materialised store).
 *   - `ai.briefingsPublic.refreshNow` schedules a fresh daily briefing
 *     for the calling user (DailyBriefingCard reads `aiBriefings` rows
 *     where `scope = "daily-user"`).
 *
 * Both backend mutations enforce their own rate limits (1/min and 5/min
 * respectively) so a frantic user can't blow up the queues.
 *
 * Why a wrapper (not inline in `DashboardHomeView`):
 *   - Single source of truth for the header treatment (so the same
 *     visual lands on the dashboard everywhere the AI cluster goes).
 *   - Keeps the collapse-state read + write isolated — the parent
 *     view doesn't need to know about the user-prefs row.
 *   - Centralises the `useMutation` calls for both the collapse toggle
 *     and the refresh button so optimistic updates can be added in one
 *     place later.
 *
 * RTL: uses `ms-/me-/ps-/pe-/start-/end-` only. The collapse state is
 * conveyed via `aria-expanded` and the body show/hide — there's no
 * chevron icon (removed 2026-05-29 per user request that the entire
 * header bar — minus the refresh button — be the toggle target). The
 * refresh button calls `event.stopPropagation()` on its onClick so a
 * click there doesn't bubble up and toggle the section.
 *
 * `rounded-[var(--radius)]` per AGENTS.md — no hardcoded radii.
 */

import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AIMark } from "@/core/ai/components/AIMark";
import { useCurrentOrg, useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface AICockpitSectionProps {
	children: ReactNode;
	className?: string;
}

const TITLE = "AI Cockpit";
const SUBTITLE = "Your workspace, on autopilot";

export function AICockpitSection({ children, className }: AICockpitSectionProps) {
	const me = useMe();
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id as Id<"orgs"> | undefined;
	const permissions = useOrgPermissions();
	const canRefreshBriefing = permissions.includes("ai.briefingRefresh");
	const canRefreshPulse = permissions.includes("leads.view");

	const setCollapsed = useMutation(api.users.mutations.setDashboardSectionCollapsed);
	// Note — the user-prefs key stays "proactive" so existing per-user
	// collapse state carries over the rename. Renaming the storage key
	// would force every user back to expanded on next visit.
	const collapsed = me?.preferences?.dashboardSectionsCollapsed?.proactive === true;

	// Refresh wiring — both mutations are server-side rate-limited so
	// the button is safe to spam from the UI. We surface the result via
	// a single toast so the user gets one piece of feedback for the
	// combined action.
	const lazyWarm = useMutation(anyApi.ai.queries.nextActions.lazyWarmForUser);
	const refreshBriefing = useMutation(anyApi.ai.briefingsPublic.refreshNow);
	const [refreshing, setRefreshing] = useState(false);

	async function handleRefresh() {
		if (!orgId || refreshing) return;
		setRefreshing(true);
		// Run both in parallel — they target different stores and
		// rate-limit themselves independently. We tolerate either side
		// failing (e.g. permissions) without blocking the other.
		const results = await Promise.allSettled([
			canRefreshPulse ? lazyWarm({ orgId }) : Promise.reject(new Error("Missing leads.view")),
			canRefreshBriefing
				? refreshBriefing({ orgId })
				: Promise.reject(new Error("Missing ai.briefingRefresh")),
		]);
		setRefreshing(false);
		const failures = results.filter((r) => r.status === "rejected").length;
		if (failures === 0) {
			toast.success("Refreshing", "Pulse + briefing will update in a few seconds.");
		} else if (failures === 2) {
			toast.error("Couldn't refresh", "Both proactive surfaces failed. Check permissions.");
		} else {
			toast.success(
				"Partially refreshed",
				"One surface updated; the other was rate-limited or unavailable.",
			);
		}
	}

	return (
		<section
			aria-label="AI Cockpit"
			data-tour="ai-cockpit"
			className={cn(
				"flex flex-col gap-3 rounded-[var(--radius)] border bg-card/50 p-3",
				className,
			)}
		>
			<header className="flex items-center justify-between gap-2">
				{/* The whole left side of the header is the collapse
				    toggle. `flex-1` so the hit area covers everything up
				    to the refresh button on the right. `cursor-pointer`
				    plus the explicit `aria-expanded` keep the affordance
				    visible to both sighted users and screen readers. The
				    chevron icon was removed per user request — the
				    cursor + the body's collapse animation are signal
				    enough. */}
				<button
					type="button"
					onClick={() =>
						void setCollapsed({ section: "proactive", collapsed: !collapsed })
					}
					className="flex flex-1 cursor-pointer items-center gap-2 text-start"
					aria-expanded={!collapsed}
					aria-controls="ai-cockpit-body"
				>
					<span
						aria-hidden
						className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<AIMark size="size-4" tone="brand" aria-hidden="true" />
					</span>
					<div className="flex flex-col">
						<h2 className="text-sm font-semibold tracking-wide text-foreground">
							{TITLE}
						</h2>
						<p className="text-xs text-muted-foreground">{SUBTITLE}</p>
					</div>
				</button>
				{/* Refresh control — always visible on the right side per
				    user spec (2026-05-27). One click rebuilds Pulse +
				    Brief. `onClick` calls `event.stopPropagation()` so a
				    click on the refresh button doesn't bubble up and
				    accidentally toggle the section's collapse state. */}
				<div className="flex items-center gap-1">
					{(canRefreshPulse || canRefreshBriefing) && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-foreground"
									onClick={(event) => {
										event.stopPropagation();
										void handleRefresh();
									}}
									disabled={refreshing || !orgId}
									aria-label="Refresh AI pulse and morning briefing"
								>
									<RefreshCw
										className={cn("size-4", refreshing && "animate-spin")}
										aria-hidden
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								Refresh pulse + briefing
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</header>
			<div id="ai-cockpit-body" className={cn("flex flex-col gap-3", collapsed && "hidden")}>
				{children}
			</div>
		</section>
	);
}
