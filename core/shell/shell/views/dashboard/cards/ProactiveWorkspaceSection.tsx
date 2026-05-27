"use client";

/**
 * ProactiveWorkspaceSection — Stage 3-A.5 of /SPRINT-PLAN.md.
 *
 * Wraps the dashboard's AI cluster (AISuggestionsPanel + AIPulseRibbon
 * + AIQuickComposerCard + DailyBriefingCard + WeeklyInsightCard) under
 * a single H2 header so the user reads the cluster as one logical
 * surface ("PROACTIVE WORKSPACE — what to do next"). The cluster is
 * collapsible per-user via `users.preferences.dashboardSectionsCollapsed.proactive`
 * (default expanded).
 *
 * 2026-05-27 — added a single permanently-visible Refresh control on the
 * header right that triggers BOTH proactive surfaces in one click:
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
 * RTL: uses `ms-/me-/ps-/pe-/start-/end-` only. The chevron flips
 * automatically via `dir="rtl"` on the root layout because we use a
 * scaleX(-1) transform for the closed state — but for accessibility
 * we ALSO change `aria-expanded` so screen readers announce the state
 * correctly.
 *
 * `rounded-[var(--radius)]` per AGENTS.md — no hardcoded radii.
 */

import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg, useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface ProactiveWorkspaceSectionProps {
	children: ReactNode;
	className?: string;
}

const TITLE = "Proactive workspace";
const SUBTITLE = "What to do next";

export function ProactiveWorkspaceSection({ children, className }: ProactiveWorkspaceSectionProps) {
	const me = useMe();
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id as Id<"orgs"> | undefined;
	const permissions = useOrgPermissions();
	const canRefreshBriefing = permissions.includes("ai.briefingRefresh");
	const canRefreshPulse = permissions.includes("leads.view");

	const setCollapsed = useMutation(api.users.mutations.setDashboardSectionCollapsed);
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
			toast.error("Couldn't refresh", "Both proactive surfaces failed — check permissions.");
		} else {
			toast.success(
				"Partially refreshed",
				"One surface updated; the other was rate-limited or unavailable.",
			);
		}
	}

	return (
		<section
			aria-label="Proactive workspace"
			className={cn(
				"flex flex-col gap-3 rounded-[var(--radius)] border bg-card/50 p-3",
				className,
			)}
		>
			<header className="flex items-center justify-between gap-2">
				<button
					type="button"
					onClick={() =>
						void setCollapsed({ section: "proactive", collapsed: !collapsed })
					}
					className="flex items-center gap-2 text-start"
					aria-expanded={!collapsed}
					aria-controls="proactive-workspace-body"
				>
					<span
						aria-hidden
						className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<Sparkles className="size-4" />
					</span>
					<div className="flex flex-col">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
							{TITLE}
						</h2>
						<p className="text-xs text-muted-foreground">{SUBTITLE}</p>
					</div>
					{collapsed ? (
						<ChevronRight
							className="ms-1 size-4 text-muted-foreground rtl:rotate-180"
							aria-hidden
						/>
					) : (
						<ChevronDown className="ms-1 size-4 text-muted-foreground" aria-hidden />
					)}
				</button>
				{/* Refresh control — always visible on the right side per
				    user spec (2026-05-27). One click rebuilds Pulse + Brief. */}
				<div className="flex items-center gap-1">
					{(canRefreshPulse || canRefreshBriefing) && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-foreground"
									onClick={handleRefresh}
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
			<div
				id="proactive-workspace-body"
				className={cn("flex flex-col gap-3", collapsed && "hidden")}
			>
				{children}
			</div>
		</section>
	);
}
