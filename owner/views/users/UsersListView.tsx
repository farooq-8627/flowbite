"use client";

/**
 * Owner-panel users view (Stage 5 — real implementation).
 *
 * Cursor-paginated table over all platform users. Search by email/name
 * (post-pagination, see queries.ts comment). Click a row to open a
 * drawer with the user's owned/joined orgs and per-org tier-change UI.
 *
 * NEVER displays per-org content (locked decision L7 — no leads, deals,
 * notes, etc.). Only metadata: email, name, role, lastActive, plan tier.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 2, §10 stage 5.
 */
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

export function UsersListView() {
	const [search, setSearch] = useState("");
	const [openUser, setOpenUser] = useState<Id<"users"> | null>(null);

	const { results, status, loadMore } = usePaginatedQuery(
		api._platform.users.queries.listAllUsers,
		{ search: search.trim() || undefined },
		{ initialNumItems: PAGE_SIZE },
	);

	return (
		<>
			<OwnerSettingsCard
				title="All users"
				description="Search across every platform user. Click a row to view the user's orgs + change a subscription."
			>
				<div className="mb-4 flex items-center gap-2">
					<div className="relative max-w-sm flex-1">
						<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search email or name…"
							className="ps-9"
							autoComplete="off"
						/>
					</div>
				</div>

				{status === "LoadingFirstPage" ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading users…
					</div>
				) : results.length === 0 ? (
					<p className="text-sm text-muted-foreground">No users match your filter.</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Email</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Platform role</TableHead>
									<TableHead>Last active</TableHead>
									<TableHead className="text-end">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{results.map((u) => (
									<TableRow key={u._id}>
										<TableCell className="font-mono text-xs">
											{u.email}
											{u.deletedAt !== null ? (
												<span className="ms-2 rounded-[var(--radius)] bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
													deleted
												</span>
											) : null}
										</TableCell>
										<TableCell className="text-sm">{u.name ?? "—"}</TableCell>
										<TableCell>
											{u.platformRole === "super_admin" ? (
												<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">
													super_admin
												</span>
											) : (
												<span className="text-xs text-muted-foreground">
													user
												</span>
											)}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{u.lastActiveAt
												? new Date(u.lastActiveAt).toLocaleString()
												: "—"}
										</TableCell>
										<TableCell className="text-end">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setOpenUser(u._id as Id<"users">)}
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

			<UserDrawer userId={openUser} onClose={() => setOpenUser(null)} />
		</>
	);
}

function UserDrawer({ userId, onClose }: { userId: Id<"users"> | null; onClose: () => void }) {
	const summary = useQuery(
		api._platform.users.queries.getUserSummary,
		userId ? { userId } : "skip",
	);
	const changeUserTier = useMutation(api._platform.tiers.mutations.changeUserTier);

	return (
		<Sheet open={userId !== null} onOpenChange={(v) => (v ? null : onClose())}>
			<SheetContent side="end" className="w-full overflow-y-auto sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{summary?.user.name ?? summary?.user.email ?? "User"}</SheetTitle>
					<SheetDescription className="font-mono">{summary?.user.email}</SheetDescription>
				</SheetHeader>

				{summary === undefined ? (
					<div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading…
					</div>
				) : summary === null ? (
					<p className="p-6 text-sm text-muted-foreground">User not found.</p>
				) : (
					<div className="space-y-5 px-4 pb-6 pt-4">
						<dl className="grid grid-cols-3 gap-2 text-xs">
							<dt className="text-muted-foreground">Joined</dt>
							<dd className="col-span-2">
								{new Date(summary.user.createdAt).toLocaleString()}
							</dd>
							<dt className="text-muted-foreground">Last active</dt>
							<dd className="col-span-2">
								{summary.user.lastActiveAt
									? new Date(summary.user.lastActiveAt).toLocaleString()
									: "—"}
							</dd>
							<dt className="text-muted-foreground">Platform role</dt>
							<dd className="col-span-2 font-mono text-xs">
								{summary.user.platformRole ?? "user"}
							</dd>
						</dl>

						<div>
							<h3 className="mb-2 text-sm font-semibold">Organisations</h3>
							{summary.orgs.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									This user is not a member of any organisation.
								</p>
							) : (
								<ul className="space-y-2">
									{summary.orgs.map((org) => (
										<li
											key={org._id}
											className="flex flex-col gap-2 rounded-[var(--radius)] border border-border p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{org.name}
												</p>
												<p className="truncate font-mono text-[11px] text-muted-foreground">
													/{org.slug} · joined{" "}
													{new Date(org.memberSince).toLocaleDateString()}
													{org.isOwnerLike ? " · admin/owner role" : ""}
												</p>
											</div>
											<TierPicker
												currentPlan={org.plan as TierKey}
												onChange={async (newKey) => {
													try {
														await changeUserTier({
															userId: summary.user._id as Id<"users">,
															orgId: org._id as Id<"orgs">,
															newKey,
														});
														toast.success(
															`Switched ${org.name} to ${newKey}`,
														);
													} catch (err) {
														toast.error(
															normalizeError(
																err,
																"Failed to change tier",
															),
														);
													}
												}}
											/>
										</li>
									))}
								</ul>
							)}
						</div>

						<p className="rounded-[var(--radius)] bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
							This drawer never displays org-scoped content — only the user's
							membership and the org's plan tier. Tier changes never delete data (see
							Data Preservation rule in `.github/agents/base/rbac.md`).
						</p>
					</div>
				)}
			</SheetContent>
		</Sheet>
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
