"use client";

/**
 * FollowUpsView — org-wide follow-ups workspace.
 *
 * STATUS: IMPLEMENTED.
 *
 * Pipedrive / HubSpot Tasks pattern:
 *   - Stat-row across the top: Total / Overdue / Today / This week / Completed
 *   - Tabs: All / Overdue / Today / This week / Completed
 *   - Per-tab: bucketed sections rendered as cards (NOT a DataTable —
 *     the cadence surface is read-skim, not a tabular grid).
 *
 * Why cards, not a DataTable: the operator's first move is "what's
 * overdue / today / urgent?" — that's a visual hierarchy question, not a
 * row-by-row scan. Card view lets us emphasise the priority chip + person
 * code. The Reminders surface uses a DataTable because it's an operational
 * queue with sortable columns; this surface is a CRM cadence lens.
 */

import {
	BellPlusIcon,
	CalendarClockIcon,
	CalendarPlusIcon,
	CheckCircle2Icon,
	ClockIcon,
	FlameIcon,
	HourglassIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Doc } from "@/convex/_generated/dataModel";
import { EntityPageLayout } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FollowUpCard } from "../components/FollowUpCard";
import { FollowUpForm } from "../components/FollowUpForm";
import { useDeleteFollowup, useFollowupsForOrg } from "../hooks";
import {
	bucketFollowups,
	FOLLOWUP_BUCKET_COLOR,
	FOLLOWUP_BUCKET_LABEL,
	FOLLOWUP_BUCKET_ORDER,
	type FollowupBucket,
} from "../lib/followup-buckets";

type FollowUp = Doc<"reminders">;
type ScopeTab = "all" | "overdue" | "today" | "thisWeek" | "completed";

// ─── Component ───────────────────────────────────────────────────────────────

export function FollowUpsView({ orgSlug: _orgSlug }: { orgSlug?: string }) {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("reminders.create");

	const followups = useFollowupsForOrg({ orgId });
	const isLoading = followups === undefined;

	// ── State ────────────────────────────────────────────────────────
	const [tab, setTab] = useState<ScopeTab>("all");
	const [search, setSearch] = useState("");
	const [now] = useState(() => Date.now());

	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editing, setEditing] = useState<FollowUp | null>(null);

	const [deleting, setDeleting] = useState<FollowUp | null>(null);
	const [removing, setRemoving] = useState(false);
	const deleteFollowup = useDeleteFollowup();

	// ── Derive ───────────────────────────────────────────────────────
	const allFollowups = followups ?? [];
	const buckets = useMemo(() => bucketFollowups(allFollowups, now), [allFollowups, now]);

	const stats = useMemo(
		() => ({
			total: allFollowups.length,
			overdue: buckets.overdue.length,
			today: buckets.today.length,
			thisWeek: buckets.thisWeek.length,
			completed: buckets.completed.length,
		}),
		[
			allFollowups.length,
			buckets.overdue.length,
			buckets.today.length,
			buckets.thisWeek.length,
			buckets.completed.length,
		],
	);

	// Apply tab filter → list of buckets to render
	const visibleBuckets = useMemo<ReadonlyArray<FollowupBucket>>(() => {
		switch (tab) {
			case "overdue":
				return ["overdue"];
			case "today":
				return ["today"];
			case "thisWeek":
				return ["thisWeek"];
			case "completed":
				return ["completed"];
			default:
				return FOLLOWUP_BUCKET_ORDER;
		}
	}, [tab]);

	// Apply search across all currently-visible items
	const filteredBuckets = useMemo(() => {
		if (!search.trim()) return buckets;
		const q = search.trim().toLowerCase();
		const filtered = { ...buckets };
		for (const b of FOLLOWUP_BUCKET_ORDER) {
			filtered[b] = buckets[b].filter(
				(f) =>
					f.title.toLowerCase().includes(q) ||
					(f.note ?? "").toLowerCase().includes(q) ||
					f.followUpCode.toLowerCase().includes(q) ||
					f.personCode.toLowerCase().includes(q) ||
					(f.dealCode ?? "").toLowerCase().includes(q),
			);
		}
		return filtered;
	}, [buckets, search]);

	const totalVisible = visibleBuckets.reduce((sum, b) => sum + filteredBuckets[b].length, 0);

	// ── Handlers ─────────────────────────────────────────────────────
	const openCreate = useCallback(() => {
		setEditing(null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((f: FollowUp) => {
		setEditing(f);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((f: FollowUp) => {
		setDeleting(f);
	}, []);

	async function confirmDelete() {
		if (!deleting || !orgId) return;
		setRemoving(true);
		try {
			await deleteFollowup({ orgId, reminderId: deleting._id });
			toast.success("Follow-up deleted");
			setDeleting(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete follow-up");
		} finally {
			setRemoving(false);
		}
	}

	// ── Render ───────────────────────────────────────────────────────
	return (
		<EntityPageLayout
			views={[]}
			view="list"
			onViewChange={() => undefined}
			orgId={orgId}
			search={{
				value: search,
				onChange: setSearch,
				placeholder: "Search follow-ups…",
			}}
			primaryAction={
				canCreate
					? {
							label: "New follow-up",
							icon: BellPlusIcon,
							onClick: openCreate,
							permission: "reminders.create",
						}
					: undefined
			}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 xl:p-4">
				{/* Stats */}
				<div className="grid gap-2 grid-cols-2 xl:grid-cols-5">
					<StatCard
						label="Total"
						value={stats.total}
						icon={<HourglassIcon className="size-3.5" aria-hidden />}
						accent="text-foreground"
					/>
					<StatCard
						label="Overdue"
						value={stats.overdue}
						icon={<FlameIcon className="size-3.5" aria-hidden />}
						accent="text-red-600"
					/>
					<StatCard
						label="Today"
						value={stats.today}
						icon={<ClockIcon className="size-3.5" aria-hidden />}
						accent="text-amber-600"
					/>
					<StatCard
						label="This week"
						value={stats.thisWeek}
						icon={<CalendarClockIcon className="size-3.5" aria-hidden />}
						accent="text-blue-600"
					/>
					<StatCard
						label="Completed"
						value={stats.completed}
						icon={<CheckCircle2Icon className="size-3.5" aria-hidden />}
						accent="text-emerald-600"
					/>
				</div>

				{/* Tabs */}
				<Tabs
					value={tab}
					onValueChange={(v) => setTab(v as ScopeTab)}
					className="flex flex-1 flex-col gap-2 min-h-0 min-w-0"
				>
					<TabsList>
						<TabsTrigger value="all">
							All
							{stats.total > 0 && (
								<span className="ms-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
									{stats.total}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="overdue">
							Overdue
							{stats.overdue > 0 && (
								<span className="ms-2 rounded-full bg-red-500/15 text-red-600 px-1.5 py-0.5 text-[10px]">
									{stats.overdue}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="today">
							Today
							{stats.today > 0 && (
								<span className="ms-2 rounded-full bg-amber-500/15 text-amber-600 px-1.5 py-0.5 text-[10px]">
									{stats.today}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="thisWeek">
							This week
							{stats.thisWeek > 0 && (
								<span className="ms-2 rounded-full bg-blue-500/15 text-blue-600 px-1.5 py-0.5 text-[10px]">
									{stats.thisWeek}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="completed">Completed</TabsTrigger>
					</TabsList>

					{/* Body */}
					{isLoading ? (
						<EmptyState onCreate={canCreate ? openCreate : undefined} loading />
					) : allFollowups.length === 0 ? (
						<EmptyState onCreate={canCreate ? openCreate : undefined} />
					) : totalVisible === 0 ? (
						<FilteredEmptyState onClear={() => setSearch("")} />
					) : (
						<div className="grid gap-4">
							{visibleBuckets.map((bucket) => {
								const items = filteredBuckets[bucket];
								if (items.length === 0) return null;
								return (
									<BucketSection
										key={bucket}
										bucket={bucket}
										count={items.length}
									>
										<div className="grid gap-2">
											{items.map((f) => (
												<FollowUpCard
													key={f._id}
													followup={f}
													onEdit={openEdit}
													onDelete={askDelete}
												/>
											))}
										</div>
									</BucketSection>
								);
							})}
						</div>
					)}
				</Tabs>
			</div>

			{/* Drawer */}
			<FollowUpForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				followup={editing}
			/>

			{/* Delete confirm */}
			<AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this follow-up?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleting?.title}. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								void confirmDelete();
							}}
							disabled={removing}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{removing ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</EntityPageLayout>
	);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	icon,
	accent,
}: {
	label: string;
	value: number;
	icon: React.ReactNode;
	accent: string;
}) {
	return (
		<Card>
			<CardContent className="px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{label}
						</span>
						<span className={cn("text-xl font-bold leading-tight", accent)}>
							{value}
						</span>
					</div>
					<div className={cn("rounded-[var(--radius)] bg-muted p-1.5", accent)}>
						{icon}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function BucketSection({
	bucket,
	count,
	children,
}: {
	bucket: FollowupBucket;
	count: number;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-2">
			<header className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className="size-2 rounded-full"
						style={{ backgroundColor: FOLLOWUP_BUCKET_COLOR[bucket] }}
					/>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{FOLLOWUP_BUCKET_LABEL[bucket]}
					</h3>
					<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
						{count}
					</span>
				</div>
			</header>
			{children}
		</section>
	);
}

function EmptyState({
	onCreate,
	loading,
}: {
	onCreate?: () => void;
	loading?: boolean;
}) {
	if (loading) {
		return (
			<div className="flex min-h-[180px] items-center justify-center rounded-[var(--radius)] border border-dashed bg-muted/20 p-6">
				<p className="text-sm text-muted-foreground">Loading follow-ups…</p>
			</div>
		);
	}
	return (
		<div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 p-6 text-center">
			<CalendarPlusIcon className="size-6 text-muted-foreground" aria-hidden />
			<h3 className="text-sm font-semibold">No follow-ups yet</h3>
			<p className="max-w-md text-xs text-muted-foreground">
				Schedule the next touch with a lead, contact, or deal. Follow-ups land on the
				assignee's queue, the calendar, and the timeline — and surface as overdue if
				they slip past their due date.
			</p>
			{onCreate && (
				<Button size="sm" onClick={onCreate} className="mt-2">
					<CalendarPlusIcon className="me-2 size-4" />
					Schedule the first follow-up
				</Button>
			)}
		</div>
	);
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
	return (
		<div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 p-6 text-center">
			<p className="text-sm font-semibold">No follow-ups match</p>
			<p className="text-xs text-muted-foreground">
				Try clearing your search or switching to the All tab.
			</p>
			<Button size="sm" variant="outline" onClick={onClear} className="mt-1">
				Clear search
			</Button>
		</div>
	);
}
