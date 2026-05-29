"use client";

/**
 * RecentActivityWidget — Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29).
 *
 * Replaces `<TimelineActivityWidget>` on the dashboard with the Orbitly
 * recent-sales shape (`~/Clones/Orbitly/shadcn-dashboard-2/src/features/
 * overview/components/recent-sales.tsx`):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ ◯ Olivia Martin       moved deal D-001 to Won      2m ago  │
 *   │ ◯ AI                  created lead Acme Corp       5m ago  │
 *   │ ◯ Will Kim            updated contact P-001       10m ago  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Data source — the parent (`DashboardHomeView`) already loads
 * `getDashboardStats.recentActivity` (the most recent 10 `activityLogs`
 * rows, no extra permission gate). We read those rows via prop instead
 * of issuing a second query — same approach `<RecentActivityCard>`
 * (legacy) used and kept zero extra subscriptions on the dashboard.
 *
 * The plan referenced `convex/_shared/activityLog.ts:listForOrg` as the
 * data feed, but no such function exists today. The closest live query
 * is `convex/crm/shared/timeline/queries.ts:getForOrg` which is gated
 * on `activityLogs.viewOrg` — that would hide the widget from members
 * without the permission. Reading from the already-loaded
 * `getDashboardStats` payload works for every member and adds zero
 * subscription cost.
 *
 * Empty state — dashed-border CTA card mirroring the
 * `<MessagesPreviewWidget>` pattern (icon + heading + body + button).
 */

import { format } from "date-fns";
import { ActivityIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { type EntityLabels, useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "../types";

interface RecentActivityWidgetProps {
	/** Activity rows already loaded by the parent's `getDashboardStats`. */
	activity: ActivityItem[];
	orgSlug: string;
	className?: string;
	/**
	 * Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) — render at most
	 * this many rows. The parent normally fetches the same number from
	 * `getDashboardStats.recentActivity`, but the prop is honoured even
	 * when the array is longer (defensive slice). Default 10 — matches
	 * the long-standing hardcoded behaviour for callers that don't pass
	 * a limit.
	 */
	limit?: number;
}

export function RecentActivityWidget({
	activity,
	orgSlug,
	className,
	limit = 10,
}: RecentActivityWidgetProps) {
	const members = useOrgMembers();
	const labels = useEntityLabels();

	const visibleActivity = useMemo(() => {
		if (limit >= activity.length) return activity;
		return activity.slice(0, limit);
	}, [activity, limit]);

	const actorMap = useMemo(() => {
		const map = new Map<string, { name: string; email?: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(String(m.userId), {
				name: m.user?.name ?? m.user?.email ?? "Member",
				email: m.user?.email,
				avatarUrl: m.user?.avatarUrl,
			});
		}
		return map;
	}, [members]);

	return (
		<Card className={cn("flex h-full flex-col", className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<ActivityIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Recent activity</CardTitle>
				</div>
				<Button
					asChild
					size="sm"
					variant="ghost"
					className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
				>
					<Link
						href={`/${orgSlug}/timeline`}
						aria-label="Open the full activity timeline"
					>
						View all
						<ArrowRightIcon className="size-3" aria-hidden />
					</Link>
				</Button>
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{visibleActivity.length === 0 ? (
					<RecentActivityEmpty orgSlug={orgSlug} />
				) : (
					<ul className="flex flex-col gap-1">
						{visibleActivity.map((item) => {
							const meta = resolveActor(item, actorMap);
							const href = resolveHref(item, orgSlug, labels);
							const description = describeActivity(item);
							const Container: React.ElementType = href ? Link : "div";
							const containerProps = href ? { href } : {};
							return (
								<li key={activityReactKey(item)}>
									<Container
										{...containerProps}
										className={cn(
											"flex items-start gap-3 rounded-[var(--radius)] px-2 py-1.5 transition-colors",
											href && "hover:bg-accent",
										)}
									>
										<Avatar size="sm">
											{meta.avatarUrl ? (
												<AvatarImage src={meta.avatarUrl} alt="" />
											) : null}
											<AvatarFallback>{meta.initials}</AvatarFallback>
										</Avatar>
										<div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-2">
											<span className="col-start-1 truncate text-sm font-medium text-foreground">
												{meta.name}
											</span>
											<span className="col-start-2 shrink-0 text-[10px] tabular-nums text-muted-foreground">
												{format(item.createdAt, "MMM d, h:mm a")}
											</span>
											<p className="col-start-1 truncate text-xs text-muted-foreground">
												{description}
											</p>
										</div>
									</Container>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Empty-state CTA ────────────────────────────────────────────────────────

function RecentActivityEmpty({ orgSlug }: { orgSlug: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-6 text-center">
			<ActivityIcon className="size-6 text-muted-foreground" aria-hidden />
			<p className="text-sm font-medium text-foreground">Nothing yet</p>
			<p className="text-xs text-muted-foreground">
				Workspace activity will appear here as you create leads, deals, or notes.
			</p>
			<div className="mt-1 flex items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={() =>
						sendChatPrefill("Create a new lead — pick a name and seed the basics.")
					}
				>
					Ask AI to create a lead
				</Button>
				<Button asChild size="sm" variant="ghost" className="h-7 text-xs">
					<Link href={`/${orgSlug}/timeline`}>Open timeline</Link>
				</Button>
			</div>
		</div>
	);
}

// ─── Pure helpers (exported for unit tests) ─────────────────────────────────

/**
 * Stable composite key — useful for diagnostics, snapshot tests, and
 * de-duping rows in memory. **Do NOT use as a React key**: two
 * `activityLogs` rows can land in the same millisecond on the same
 * entity (e.g. a multi-field bulk save emits one `field_updated` row
 * per field), and every component of this tuple would still be equal.
 * Use `activityReactKey` for JSX `key` attributes — it prefers the
 * row's Convex `_id` and only falls back to this composite when the
 * id is missing.
 */
export function activityKey(item: ActivityItem): string {
	return `${item.createdAt}-${item.action}-${item.entityType}-${item.entityId}`;
}

/**
 * React key for an activity row. Prefers the Convex `_id` (guaranteed
 * unique by the database) and falls back to the composite key only if
 * a caller synthesises an `ActivityItem` without an id (test fixtures,
 * future synthetic rows). This is the helper to use for `key={…}` in
 * any list rendering activity rows.
 */
export function activityReactKey(item: ActivityItem): string {
	return item._id ?? activityKey(item);
}

/**
 * Resolve the actor's display name + avatar fallback. Honours the
 * actorType so AI / system / integration rows render with predictable
 * labels even when the underlying userId no longer maps to an active
 * member (e.g. the actor left the workspace).
 */
export function resolveActor(
	item: ActivityItem,
	actorMap: ReadonlyMap<string, { name: string; email?: string; avatarUrl?: string }>,
): { name: string; initials: string; avatarUrl?: string } {
	if (item.actorType === "ai") {
		return { name: "AI", initials: "AI" };
	}
	if (item.actorType === "system") {
		return { name: "System", initials: "SY" };
	}
	if (item.actorType === "integration") {
		return { name: "Integration", initials: "IN" };
	}
	const member = actorMap.get(String(item.userId));
	if (!member) {
		return { name: "Member", initials: "·" };
	}
	const initials = computeInitials(member.name);
	return {
		name: member.name,
		initials,
		...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
	};
}

/**
 * Build the deep-link to the entity touched by the activity row. Falls
 * back to the full timeline when the entity type isn't routable today
 * (e.g. workflow / system).
 */
export function resolveHref(
	item: ActivityItem,
	orgSlug: string,
	labels: EntityLabels,
): string | null {
	if (item.personCode) {
		return `/${orgSlug}/profile/${item.personCode}`;
	}
	switch (item.entityType) {
		case "lead":
		case "contact":
		case "person":
			return item.entityId ? `/${orgSlug}/profile/${item.entityId}` : null;
		case "deal":
			return item.entityId
				? `/${orgSlug}/${labels.deal.slug}/${item.entityId}`
				: `/${orgSlug}/${labels.deal.slug}`;
		case "company":
			return item.entityId
				? `/${orgSlug}/${labels.company.slug}/${item.entityId}`
				: `/${orgSlug}/${labels.company.slug}`;
		case "task":
			return `/${orgSlug}/tasks`;
		default:
			return null;
	}
}

/**
 * Render the secondary line. Prefers the row's `description` (already
 * humanised by the activity-log writer); falls back to the bare action
 * verb when no description is present (e.g. legacy rows from before the
 * description field was made canonical).
 */
export function describeActivity(item: ActivityItem): string {
	if (item.description?.trim().length) return item.description;
	return prettifyAction(item.action, item.entityType);
}

function prettifyAction(action: string, entityType: string): string {
	const verb = action.replace(/[._]/g, " ");
	if (!entityType) return capitalize(verb);
	return `${capitalize(verb)} ${entityType}`;
}

function capitalize(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function computeInitials(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "·";
	const parts = trimmed.split(/\s+/);
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
