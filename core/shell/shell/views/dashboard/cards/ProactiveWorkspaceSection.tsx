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
 * Why a wrapper (not inline in `DashboardHomeView`):
 *   - Single source of truth for the header treatment (so the same
 *     visual lands on the dashboard everywhere the AI cluster goes).
 *   - Keeps the collapse-state read + write isolated — the parent
 *     view doesn't need to know about the user-prefs row.
 *   - Centralises the `useMutation` call for `setDashboardSectionCollapsed`
 *     so optimistic updates can be added in one place later.
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
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

interface ProactiveWorkspaceSectionProps {
	children: ReactNode;
	className?: string;
}

const TITLE = "Proactive workspace";
const SUBTITLE = "What to do next";

export function ProactiveWorkspaceSection({ children, className }: ProactiveWorkspaceSectionProps) {
	const me = useMe();
	const setCollapsed = useMutation(api.users.mutations.setDashboardSectionCollapsed);
	const collapsed = me?.preferences?.dashboardSectionsCollapsed?.proactive === true;

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
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground"
					onClick={() =>
						void setCollapsed({ section: "proactive", collapsed: !collapsed })
					}
					aria-hidden
					tabIndex={-1}
				>
					{collapsed ? "Expand" : "Collapse"}
				</Button>
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
