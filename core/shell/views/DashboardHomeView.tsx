"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CheckCircle2, X, Target, Handshake, Building2, Zap, Clock } from "lucide-react";

// ─── Get Started Card ─────────────────────────────────────────────────────────

const CHECKLIST = [
	{ id: "invite_team", label: "Invite your team" },
	{ id: "add_first_lead", label: "Add your first lead" },
	{ id: "setup_pipeline", label: "Review your pipeline stages" },
	{ id: "add_company", label: "Add a company" },
];

function GetStartedCard({ dismissedCards }: { dismissedCards: string[] }) {
	const updateProfile = useMutation(api.users.mutations.updateProfile);
	if (dismissedCards.includes("get_started_v1")) return null;

	const completed = CHECKLIST.filter((item) => dismissedCards.includes(item.id));
	const progress = Math.round((completed.length / CHECKLIST.length) * 100);

	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base">Get Started</CardTitle>
						<CardDescription>Complete these steps to set up your workspace</CardDescription>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						onClick={() => updateProfile({ dismissedCards: [...dismissedCards, "get_started_v1"] })}
					>
						<X className="size-4" />
					</Button>
				</div>
				<div className="mt-2 h-1.5 w-full rounded-full bg-muted">
					<div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
				</div>
				<p className="text-xs text-muted-foreground">{completed.length}/{CHECKLIST.length} completed</p>
			</CardHeader>
			<CardContent>
				<ul className="space-y-2">
					{CHECKLIST.map((item) => {
						const done = dismissedCards.includes(item.id);
						return (
							<li key={item.id} className="flex items-center gap-3">
								<CheckCircle2 className={`size-4 shrink-0 ${done ? "text-primary" : "text-muted-foreground/40"}`} />
								<span className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}

// ─── Metric Cards ─────────────────────────────────────────────────────────────

const METRIC_CARDS = [
	{ label: "Team Members", badge: "Active", badgeVariant: "secondary" as const },
	{ label: "Leads", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Open Deals", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Pipeline Value", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Contacts", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Companies", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Tasks Due", badge: "Phase 2", badgeVariant: "outline" as const },
	{ label: "Emails Sent", badge: "Phase 2", badgeVariant: "outline" as const },
];

function MetricCards({ memberCount }: { memberCount: number }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{METRIC_CARDS.map((card, i) => (
				<Card key={i}>
					<CardHeader className="pb-2">
						<CardDescription>{card.label}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<span className="text-3xl font-medium tabular-nums leading-none">
								{card.label === "Team Members" ? memberCount : "—"}
							</span>
							<Badge variant={card.badgeVariant}>
								{card.label === "Team Members" && <Users className="size-3 me-1" />}
								{card.badge}
							</Badge>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{card.label === "Team Members" ? "Workspace members" : "Available after CRM setup"}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

type ActivityItem = { action: string; description?: string; createdAt: number; actorType: string };

function RecentActivity({ activity }: { activity: ActivityItem[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Recent Activity</CardTitle>
			</CardHeader>
			<CardContent>
				{activity.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
						<Zap className="size-8 opacity-30" />
						<p className="text-sm">No activity yet. Start by inviting your team.</p>
					</div>
				) : (
					<ul className="space-y-3">
						{activity.map((item, i) => (
							<li key={i} className="flex items-start gap-3">
								<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
									<Clock className="size-3 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">{item.description ?? item.action}</p>
									<p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

export function DashboardHomeView({ orgSlug }: { orgSlug: string }) {
	const user = useQuery(api.users.queries.me);
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs);
	const currentOrg = myOrgs?.find((o) => o.org.slug === orgSlug);
	const stats = useQuery(
		api.orgs.queries.getDashboardStats,
		currentOrg ? { orgId: currentOrg.org._id } : "skip",
	);

	if (!currentOrg || !stats || user === undefined) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-8 w-48" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
				</div>
			</div>
		);
	}

	const dismissedCards = user?.dismissedCards ?? [];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
				</h1>
				<p className="text-sm text-muted-foreground">{currentOrg.org.name} workspace</p>
			</div>

			<GetStartedCard dismissedCards={dismissedCards} />
			<MetricCards memberCount={stats.memberCount} />
			<RecentActivity activity={stats.recentActivity} />
		</div>
	);
}
