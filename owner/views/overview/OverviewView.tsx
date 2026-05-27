"use client";

/**
 * Owner-panel overview view (Stage 6 — real implementation).
 *
 * Stat tiles for user/org counts + tier distribution + a recent-actions
 * list. NEVER reads org content (locked decision L7) — `getCounts`
 * returns aggregated numbers only.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 1, §10 stage 6.
 */
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

export function OverviewView() {
	const counts = useQuery(api._platform.overview.queries.getCounts, {});
	const recent = useQuery(api._platform.audit.queries.listRecent, { limit: 10 });

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Platform stats"
				description="Aggregated counts across the whole platform. No per-org content is read."
			>
				{counts === undefined ? (
					<Spinner label="Counting…" />
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<StatTile label="Active users" value={counts.activeUsers} />
						<StatTile
							label="Total users"
							value={counts.totalUsers}
							hint={`${counts.deletedUsers} deleted`}
						/>
						<StatTile label="Active orgs" value={counts.activeOrgs} />
						<StatTile
							label="Total orgs"
							value={counts.totalOrgs}
							hint={`${counts.totalOrgs - counts.activeOrgs} deleted`}
						/>
						<StatTile label="Free tier" value={counts.tierCounts.free ?? 0} />
						<StatTile label="Starter tier" value={counts.tierCounts.starter ?? 0} />
						<StatTile label="Pro tier" value={counts.tierCounts.pro ?? 0} />
						<StatTile
							label="Enterprise tier"
							value={counts.tierCounts.enterprise ?? 0}
						/>
						<StatTile
							label="Super admins"
							value={counts.superAdmins}
							hint="Users with platformRole='super_admin'"
						/>
					</div>
				)}
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Recent admin actions"
				description="Last 10 rows from `platformAuditLogs`."
			>
				{recent === undefined ? (
					<Spinner label="Loading…" />
				) : recent.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No actions recorded yet. Owner mutations will appear here.
					</p>
				) : (
					<ul className="space-y-2 text-xs">
						{recent.map((row) => (
							<li
								key={row._id}
								className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border/60 px-3 py-2"
							>
								<div className="min-w-0">
									<p className="truncate font-mono text-xs">{row.action}</p>
									<p className="truncate text-[11px] text-muted-foreground">
										{row.actorEmail}
										{row.targetType
											? ` · ${row.targetType}:${row.targetId ?? "—"}`
											: ""}
									</p>
								</div>
								<time
									className="shrink-0 text-[11px] text-muted-foreground"
									dateTime={new Date(row.createdAt).toISOString()}
								>
									{new Date(row.createdAt).toLocaleString()}
								</time>
							</li>
						))}
					</ul>
				)}
			</OwnerSettingsCard>
		</div>
	);
}

function StatTile({
	label,
	value,
	hint,
}: {
	label: string;
	value: number | string;
	hint?: string;
}) {
	return (
		<div className="rounded-[var(--radius)] border border-border bg-card p-4">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-2xl font-semibold">{value}</p>
			{hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

function Spinner({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<Loader2 className="h-4 w-4 animate-spin" /> {label}
		</div>
	);
}
