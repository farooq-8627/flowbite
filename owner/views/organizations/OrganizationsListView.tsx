"use client";

/**
 * Owner-panel organisations view.
 *
 * Mirrors `UsersListView` — cursor-paginated table with search, drawer
 * on row-click. The drawer shows:
 *   - org metadata (name, slug, plan, industry, created)
 *   - member list with their role names
 *   - tier picker (changeOrgTier)
 *   - lifecycle actions: Suspend / Unsuspend / Delete / Restore
 *
 * Two destructive actions (Suspend, Delete) are guarded by an
 * `<AlertDialog>` confirmation. Reversible actions (Unsuspend, Restore)
 * fire on first click to keep recovery friction-free.
 *
 * NEVER displays per-org content (locked decision L7) — the panel only
 * surfaces metadata + memberships + roles.
 */
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, PauseCircle, PlayCircle, RotateCcw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

const PAGE_SIZE = 25;

type TierKey = "free" | "starter" | "pro" | "enterprise";
const TIER_OPTIONS: ReadonlyArray<{ key: TierKey; label: string }> = [
	{ key: "free", label: "Free" },
	{ key: "starter", label: "Starter" },
	{ key: "pro", label: "Pro" },
	{ key: "enterprise", label: "Enterprise" },
];

export function OrganizationsListView() {
	const [search, setSearch] = useState("");
	const [openOrg, setOpenOrg] = useState<Id<"orgs"> | null>(null);

	const { results, status, loadMore } = usePaginatedQuery(
		api._platform.orgs.queries.listAllOrgs,
		{ search: search.trim() || undefined },
		{ initialNumItems: PAGE_SIZE },
	);

	return (
		<>
			<OwnerSettingsCard
				title="All organisations"
				description="Search across every workspace. Click a row to view members + change tier or lifecycle state."
			>
				<div className="mb-4 flex items-center gap-2">
					<div className="relative max-w-sm flex-1">
						<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search workspace name or slug…"
							className="ps-9"
							autoComplete="off"
						/>
					</div>
				</div>

				{status === "LoadingFirstPage" ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading organisations…
					</div>
				) : results.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No workspaces match your filter.
					</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Slug</TableHead>
									<TableHead>Plan</TableHead>
									<TableHead>Members</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-end">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{results.map((o) => (
									<TableRow key={o._id}>
										<TableCell className="text-sm font-medium">
											{o.name}
										</TableCell>
										<TableCell className="font-mono text-xs">
											/{o.slug}
										</TableCell>
										<TableCell>
											<span className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
												{o.plan}
											</span>
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{o.memberCount}
										</TableCell>
										<TableCell>
											<OrgStatusBadge
												suspendedAt={o.suspendedAt}
												deletedAt={o.deletedAt}
											/>
										</TableCell>
										<TableCell className="text-end">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setOpenOrg(o._id as Id<"orgs">)}
											>
												View
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{results.length} loaded · {status}
					</span>
					{status === "CanLoadMore" || status === "LoadingMore" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => loadMore(PAGE_SIZE)}
							disabled={status !== "CanLoadMore"}
						>
							{status === "LoadingMore" ? (
								<>
									<Loader2 className="me-2 h-4 w-4 animate-spin" />
									Loading…
								</>
							) : (
								"Load more"
							)}
						</Button>
					) : null}
				</div>
			</OwnerSettingsCard>

			<OrgDrawer orgId={openOrg} onClose={() => setOpenOrg(null)} />
		</>
	);
}

// ─── Status badge — small visual marker for the table cell ───────────────────

function OrgStatusBadge({
	suspendedAt,
	deletedAt,
}: {
	suspendedAt: number | null;
	deletedAt: number | null;
}) {
	if (deletedAt !== null) {
		return (
			<span className="rounded-[var(--radius)] bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
				deleted
			</span>
		);
	}
	if (suspendedAt !== null) {
		return (
			<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:text-amber-400">
				suspended
			</span>
		);
	}
	return (
		<span className="rounded-[var(--radius)] bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
			active
		</span>
	);
}

// ─── Drawer — full org detail + lifecycle actions ────────────────────────────

function OrgDrawer({ orgId, onClose }: { orgId: Id<"orgs"> | null; onClose: () => void }) {
	const summary = useQuery(api._platform.orgs.queries.getOrgSummary, orgId ? { orgId } : "skip");

	const changeOrgTier = useMutation(api._platform.orgs.mutations.changeOrgTier);
	const suspendOrg = useMutation(api._platform.orgs.mutations.suspendOrg);
	const unsuspendOrg = useMutation(api._platform.orgs.mutations.unsuspendOrg);
	const softDeleteOrg = useMutation(api._platform.orgs.mutations.softDeleteOrg);
	const restoreOrg = useMutation(api._platform.orgs.mutations.restoreOrg);

	const [confirming, setConfirming] = useState<null | "suspend" | "delete">(null);
	const [busy, setBusy] = useState(false);

	const handleConfirm = async () => {
		if (!summary || !orgId || !confirming) return;
		setBusy(true);
		try {
			if (confirming === "suspend") {
				await suspendOrg({ orgId });
				toast.success(`${summary.org.name} suspended`);
			} else if (confirming === "delete") {
				await softDeleteOrg({ orgId });
				toast.success(`${summary.org.name} marked deleted`);
			}
			setConfirming(null);
		} catch (err) {
			toast.error(normalizeError(err, "Action failed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Sheet open={orgId !== null} onOpenChange={(v) => (v ? null : onClose())}>
				<SheetContent side="end" className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>{summary?.org.name ?? "Workspace"}</SheetTitle>
						<SheetDescription className="font-mono">
							{summary ? `/${summary.org.slug}` : ""}
						</SheetDescription>
					</SheetHeader>

					{summary === undefined ? (
						<div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" /> Loading…
						</div>
					) : summary === null ? (
						<p className="p-6 text-sm text-muted-foreground">Workspace not found.</p>
					) : (
						<div className="space-y-5 px-4 pb-6 pt-4">
							{/* Status banner — communicates lifecycle state */}
							{(summary.org.suspendedAt !== null ||
								summary.org.deletedAt !== null) && (
								<div className="rounded-[var(--radius)] border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
									{summary.org.deletedAt !== null ? (
										<>
											<p className="font-medium text-destructive">
												Marked for deletion
											</p>
											<p className="mt-0.5 text-muted-foreground">
												Soft-deleted on{" "}
												{new Date(summary.org.deletedAt).toLocaleString()}.
												Members are locked out. Restore to undo.
											</p>
										</>
									) : (
										<>
											<p className="font-medium text-amber-700 dark:text-amber-400">
												Workspace suspended
											</p>
											<p className="mt-0.5 text-muted-foreground">
												Suspended on{" "}
												{summary.org.suspendedAt !== null
													? new Date(
															summary.org.suspendedAt,
														).toLocaleString()
													: "—"}
												. Members can't sign in until you unsuspend.
											</p>
											{summary.org.suspensionReason ? (
												<p className="mt-1 italic text-muted-foreground">
													Reason: {summary.org.suspensionReason}
												</p>
											) : null}
										</>
									)}
								</div>
							)}

							{/* Metadata */}
							<dl className="grid grid-cols-3 gap-2 text-xs">
								<dt className="text-muted-foreground">Created</dt>
								<dd className="col-span-2">
									{new Date(summary.org.createdAt).toLocaleString()}
								</dd>
								<dt className="text-muted-foreground">Industry</dt>
								<dd className="col-span-2">{summary.org.industry ?? "—"}</dd>
								<dt className="text-muted-foreground">Team size</dt>
								<dd className="col-span-2">{summary.org.teamSize ?? "—"}</dd>
								<dt className="text-muted-foreground">Subscription</dt>
								<dd className="col-span-2 font-mono text-xs">
									{summary.org.lemonSqueezySubscriptionStatus ?? "—"}
								</dd>
							</dl>

							{/* Tier picker */}
							<div className="rounded-[var(--radius)] border border-border p-3">
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="text-sm font-semibold">Plan tier</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											Change the workspace's tier. Data is preserved across
											any change.
										</p>
									</div>
									<TierPicker
										currentPlan={summary.org.plan as TierKey}
										onChange={async (newKey) => {
											try {
												await changeOrgTier({
													orgId: summary.org._id as Id<"orgs">,
													newKey,
												});
												toast.success(
													`${summary.org.name} switched to ${newKey}`,
												);
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to change tier"),
												);
											}
										}}
									/>
								</div>
							</div>

							{/* Members */}
							<div>
								<h3 className="mb-2 text-sm font-semibold">
									Members ({summary.members.length})
								</h3>
								{summary.members.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										This workspace has no active members.
									</p>
								) : (
									<ul className="space-y-1.5">
										{summary.members.map((m) => (
											<li
												key={m._id}
												className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-2.5 text-xs"
											>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium">
														{m.name ?? m.email}
													</p>
													<p className="truncate font-mono text-[11px] text-muted-foreground">
														{m.email}
													</p>
												</div>
												<div className="flex items-center gap-2">
													{m.suspendedAt !== null ? (
														<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:text-amber-400">
															suspended
														</span>
													) : null}
													<span
														className={`rounded-[var(--radius)] px-1.5 py-0.5 text-[10px] font-medium uppercase ${
															m.isOwnerLike
																? "bg-primary/10 text-primary"
																: "bg-muted text-muted-foreground"
														}`}
													>
														{m.roleName}
													</span>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>

							{/* Lifecycle actions */}
							<div className="rounded-[var(--radius)] border border-border p-3">
								<h3 className="mb-2 text-sm font-semibold">Lifecycle</h3>
								<p className="mb-3 text-xs text-muted-foreground">
									Suspend locks every member out without destroying data. Delete
									soft-deletes the workspace; both are reversible from here.
								</p>
								<div className="flex flex-wrap items-center gap-2">
									{summary.org.deletedAt !== null ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="gap-1.5"
											disabled={busy}
											onClick={async () => {
												setBusy(true);
												try {
													await restoreOrg({
														orgId: summary.org._id as Id<"orgs">,
													});
													toast.success(`${summary.org.name} restored`);
												} catch (err) {
													toast.error(
														normalizeError(err, "Failed to restore"),
													);
												} finally {
													setBusy(false);
												}
											}}
										>
											<RotateCcw className="size-3.5" aria-hidden />
											Restore
										</Button>
									) : (
										<>
											{summary.org.suspendedAt !== null ? (
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="gap-1.5"
													disabled={busy}
													onClick={async () => {
														setBusy(true);
														try {
															await unsuspendOrg({
																orgId: summary.org
																	._id as Id<"orgs">,
															});
															toast.success(
																`${summary.org.name} unsuspended`,
															);
														} catch (err) {
															toast.error(
																normalizeError(
																	err,
																	"Failed to unsuspend",
																),
															);
														} finally {
															setBusy(false);
														}
													}}
												>
													<PlayCircle className="size-3.5" aria-hidden />
													Unsuspend
												</Button>
											) : (
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="gap-1.5"
													disabled={busy}
													onClick={() => setConfirming("suspend")}
												>
													<PauseCircle className="size-3.5" aria-hidden />
													Suspend
												</Button>
											)}
											<Button
												type="button"
												variant="destructive"
												size="sm"
												className="gap-1.5"
												disabled={busy}
												onClick={() => setConfirming("delete")}
											>
												<Trash2 className="size-3.5" aria-hidden />
												Delete workspace
											</Button>
										</>
									)}
								</div>
							</div>

							<p className="rounded-[var(--radius)] bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
								This drawer never displays workspace content — only metadata,
								members, and lifecycle controls. Every action writes a row to the
								platform audit log.
							</p>
						</div>
					)}
				</SheetContent>
			</Sheet>

			{/* Confirmation dialog for destructive actions */}
			<AlertDialog
				open={confirming !== null}
				onOpenChange={(v) => !v && !busy && setConfirming(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirming === "delete"
								? "Delete this workspace?"
								: "Suspend this workspace?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirming === "delete"
								? "All members will lose access immediately. Workspace data is preserved and can be restored from this panel until the daily purge cron runs after the retention window."
								: "All members will be locked out until you unsuspend. Workspace data stays intact."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={busy}
							onClick={handleConfirm}
							className={
								confirming === "delete"
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: undefined
							}
						>
							{busy ? (
								<>
									<Loader2 className="me-2 h-4 w-4 animate-spin" />
									Working…
								</>
							) : confirming === "delete" ? (
								"Delete"
							) : (
								"Suspend"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function TierPicker({
	currentPlan,
	onChange,
}: {
	currentPlan: TierKey;
	onChange: (newKey: TierKey) => Promise<void> | void;
}) {
	const [busy, setBusy] = useState(false);
	return (
		<Select
			value={currentPlan}
			disabled={busy}
			onValueChange={async (v) => {
				if (v === currentPlan) return;
				setBusy(true);
				try {
					await onChange(v as TierKey);
				} finally {
					setBusy(false);
				}
			}}
		>
			<SelectTrigger size="sm" className="w-32">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{TIER_OPTIONS.map((t) => (
					<SelectItem key={t.key} value={t.key}>
						{t.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
