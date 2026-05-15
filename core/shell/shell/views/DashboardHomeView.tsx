"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Clock, FolderOpen, Users, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FirstTimeTour, type TourStep } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import { FileUpload } from "@/core/data-io/files/components/FileUpload";
import { type EntityLabels, useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";

// ─── Dashboard tour ───────────────────────────────────────────────────────────

const DASHBOARD_TOUR_STEPS: TourStep[] = [
	{
		target: "quick-add",
		title: "Create from anywhere",
		body: "Press the + button in the top nav (or Cmd/Ctrl + K) to create leads, contacts, deals, and companies without leaving the page.",
		side: "bottom",
	},
];

// ─── Get Started Card ─────────────────────────────────────────────────────────

/**
 * Checklist items are a function of labels so "Add your first lead" becomes
 * "Add your first inquiry" when an admin renames the lead entity. Ids stay
 * stable (they key into `user.dismissedCards`).
 */
function buildChecklist(labels: EntityLabels) {
	return [
		{ id: "invite_team", label: "Invite your team" },
		{ id: "add_first_lead", label: `Add your first ${labels.lead.singular.toLowerCase()}` },
		{ id: "setup_pipeline", label: "Review your pipeline stages" },
		{ id: "add_company", label: `Add a ${labels.company.singular.toLowerCase()}` },
	];
}

function GetStartedCard({
	dismissedCards,
	labels,
}: {
	dismissedCards: string[];
	labels: EntityLabels;
}) {
	const updateProfile = useMutation(api.users.mutations.updateProfile);
	if (dismissedCards.includes("get_started_v1")) return null;

	const checklist = buildChecklist(labels);
	const completed = checklist.filter((item) => dismissedCards.includes(item.id));
	const progress = Math.round((completed.length / checklist.length) * 100);

	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base">Get Started</CardTitle>
						<CardDescription>
							Complete these steps to set up your workspace
						</CardDescription>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						onClick={() =>
							updateProfile({ dismissedCards: [...dismissedCards, "get_started_v1"] })
						}
					>
						<X className="size-4" />
					</Button>
				</div>
				<div className="mt-2 h-1.5 w-full rounded-full bg-muted">
					<div
						className="h-1.5 rounded-full bg-primary transition-all"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					{completed.length}/{checklist.length} completed
				</p>
			</CardHeader>
			<CardContent>
				<ul className="space-y-2">
					{checklist.map((item) => {
						const done = dismissedCards.includes(item.id);
						return (
							<li key={item.id} className="flex items-center gap-3">
								<CheckCircle2
									className={`size-4 shrink-0 ${done ? "text-primary" : "text-muted-foreground/40"}`}
								/>
								<span
									className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}
								>
									{item.label}
								</span>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}

// ─── Metric Cards ─────────────────────────────────────────────────────────────

/**
 * Metric cards labels follow entity-label renames too. The "Team Members"
 * and "Pipeline Value" cards stay generic; the four CRM-entity cards are
 * rewritten to the admin's plural labels (Leads → Inquiries, etc.).
 */
function buildMetricCards(labels: EntityLabels) {
	return [
		{ label: "Team Members", badge: "Active", badgeVariant: "secondary" as const },
		{ label: labels.lead.plural, badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: `Open ${labels.deal.plural}`, badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: "Pipeline Value", badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: labels.contact.plural, badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: labels.company.plural, badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: "Tasks Due", badge: "Phase 2", badgeVariant: "outline" as const },
		{ label: "Emails Sent", badge: "Phase 2", badgeVariant: "outline" as const },
	];
}

function MetricCards({ memberCount, labels }: { memberCount: number; labels: EntityLabels }) {
	const cards = buildMetricCards(labels);
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{cards.map((card) => (
				<Card key={card.label}>
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
							{card.label === "Team Members"
								? "Workspace members"
								: "Available after CRM setup"}
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
						{activity.map((item) => (
							// Activity items don't expose a stable `_id` in this shape, so
							// we build a composite key from the timestamp + action which is
							// unique per-entry in practice.
							<li
								key={`${item.createdAt}-${item.action}`}
								className="flex items-start gap-3"
							>
								<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
									<Clock className="size-3 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">
										{item.description ?? item.action}
									</p>
									<p className="text-xs text-muted-foreground">
										{new Date(item.createdAt).toLocaleDateString()}
									</p>
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
	// Auto-resolves orgId from the URL — same hook used by the sidebar — so
	// renaming "Lead" → "Inquiry" flows into the checklist and metric cards.
	const labels = useEntityLabels();

	if (!currentOrg || !stats || user === undefined) {
		return null;
	}

	const dismissedCards = user?.dismissedCards ?? [];

	return (
		<div className="h-full overflow-y-auto p-4 md:p-6">
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
					</h1>
					<p className="text-sm text-muted-foreground">{currentOrg.org.name} workspace</p>
				</div>

				<GetStartedCard dismissedCards={dismissedCards} labels={labels} />
				<MetricCards memberCount={stats.memberCount} labels={labels} />
				<RecentActivity activity={stats.recentActivity} />
				<OrgDocsVault orgId={currentOrg.org._id} />
			</div>
			<FirstTimeTour id="dashboard-v1" steps={DASHBOARD_TOUR_STEPS} />
		</div>
	);
}

// ─── Org-wide Docs vault ──────────────────────────────────────────────────────

/**
 * OrgDocsVault — workspace-scoped attachments. Every member can drop files
 * here (training material, contracts templates, brand assets, etc.) and they
 * persist on the dashboard for the whole org. AI access requires explicit
 * consent (future pass).
 */
function OrgDocsVault({ orgId }: { orgId: Parameters<typeof FileUpload>[0]["orgId"] }) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center gap-2">
					<FolderOpen className="size-4 text-muted-foreground" />
					<CardTitle className="text-base">Workspace Docs</CardTitle>
				</div>
				<CardDescription>
					Files shared across the workspace. AI uses these only with explicit consent.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FileUpload
					orgId={orgId}
					scope="org"
					scopeId={String(orgId)}
					label="Drop org-wide files here or click to browse"
					emptyText="No workspace files yet."
				/>
			</CardContent>
		</Card>
	);
}
