"use client";

/**
 * AIAuditFeedView — B.39 (S12 follow-up).
 *
 * Org-wide chronological feed of every AI capability call. Mounted at
 * `/{locale}/{orgSlug}/ai/audit`. Reads
 * `api.ai.queries.auditFeed.listAuditFeed` (cursor-paginated) +
 * `getAuditFeedFacets` for the filter dropdowns. RBAC is enforced
 * server-side via `ai.audit.view` (Owner + Admin default).
 *
 * The page complements the existing trace UI:
 *   - `/{orgSlug}/ai/trace/<conversationId>` — per-conversation tool
 *     timeline (`ai.trace.view`, member-eligible).
 *   - `/{orgSlug}/ai/audit` (this view)            — org-wide capability
 *     feed (`ai.audit.view`, manager-only).
 *
 * Layout follows the AINextActionsView pattern:
 *   - Single full-height scroll container with ms/me-safe paddings.
 *   - Header = icon-tile + title + sub-line (NOT a Card).
 *   - Stat strip = 4 inline counters that double as one-tap filters
 *     (status:all/ok/failed + risk:irreversible badge).
 *   - Filter dropdowns inline above the table — no nested Card chrome.
 *   - Empty state: centered Sparkles + value-prop bullet.
 */

import { useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	Bot,
	CheckCircle2,
	ChevronLeft,
	ListChecks,
	RefreshCcw,
	ShieldAlert,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

// ─── Types mirrored from convex/ai/queries/auditFeed.ts ────────────────────

type AuditFeedRow = {
	id: Id<"activityLogs">;
	createdAt: number;
	userId: Id<"users">;
	capability: string;
	action: string;
	description: string;
	status: string;
	channel: string;
	source: string;
	riskTier: string;
	module: string;
	group: string;
	conversationId?: string;
	personCode?: string;
	errorCount?: number;
	argSummary?: string;
};

type FilterState = {
	source: string | undefined;
	status: string | undefined;
	riskTier: "safe" | "reversible" | "irreversible" | undefined;
	capability: string | undefined;
};

const PAGE_SIZE = 50;

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
	try {
		return new Date(ts).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return String(ts);
	}
}

function statusVariant(status: string): "ok" | "warn" | "fail" {
	if (status === "ok") return "ok";
	if (status === "partial" || status === "infra_retry") return "warn";
	return "fail";
}

function statusLabel(status: string): string {
	return status.replace(/_/g, " ");
}

function riskBadgeClass(risk: string): string {
	if (risk === "irreversible") {
		return "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
	}
	if (risk === "reversible") {
		return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
	}
	return "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300";
}

function sourceBadgeClass(source: string): string {
	if (source === "autonomous" || source === "autonomous_reply") {
		return "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
	}
	if (source === "whatsapp") {
		return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
	}
	if (source === "mcp" || source === "rest") {
		return "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
	}
	return "bg-muted text-muted-foreground";
}

// ─── Stat-strip math (pure, in-memory over the accumulated rows) ────────────

type StatTotals = {
	total: number;
	ok: number;
	failed: number;
	irreversible: number;
};

function computeStats(rows: AuditFeedRow[]): StatTotals {
	let ok = 0;
	let failed = 0;
	let irreversible = 0;
	for (const r of rows) {
		const v = statusVariant(r.status);
		if (v === "ok") ok += 1;
		else if (v === "fail") failed += 1;
		if (r.riskTier === "irreversible") irreversible += 1;
	}
	return { total: rows.length, ok, failed, irreversible };
}

// ─── View ──────────────────────────────────────────────────────────────────

export function AIAuditFeedView() {
	const { fullOrgEntry: currentOrg } = useCurrentOrg();
	const orgId = currentOrg?.org._id;
	const orgSlug = currentOrg?.org.slug;

	const [filters, setFilters] = useState<FilterState>({
		source: undefined,
		status: undefined,
		riskTier: undefined,
		capability: undefined,
	});

	const [accumulated, setAccumulated] = useState<AuditFeedRow[]>([]);
	const [cursor, setCursor] = useState<number | undefined>(undefined);
	// Reset accumulated rows when filters change. `filterKey` is the trigger;
	// the effect body intentionally only calls setters and doesn't read it.
	const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: filterKey is the trigger, not a read
	useEffect(() => {
		setAccumulated([]);
		setCursor(undefined);
	}, [filterKey]);

	const facets = useQuery(
		api.ai.queries.auditFeed.getAuditFeedFacets,
		orgId ? { orgId } : "skip",
	);

	const page = useQuery(
		api.ai.queries.auditFeed.listAuditFeed,
		orgId
			? {
					orgId,
					limit: PAGE_SIZE,
					...(cursor !== undefined ? { cursor } : {}),
					filters: {
						...(filters.source ? { source: filters.source } : {}),
						...(filters.status ? { status: filters.status } : {}),
						...(filters.riskTier ? { riskTier: filters.riskTier } : {}),
						...(filters.capability ? { capability: filters.capability } : {}),
					},
				}
			: "skip",
	);

	useEffect(() => {
		if (!page) return;
		setAccumulated((prev) => {
			const seen = new Set(prev.map((r) => r.id));
			const merged = [...prev];
			for (const r of page.rows) {
				if (!seen.has(r.id)) {
					merged.push(r);
					seen.add(r.id);
				}
			}
			return merged;
		});
	}, [page]);

	// B.42 follow-up — mark this org's audit feed as "seen" for the
	// current user once the page resolves with a non-null payload
	// (i.e. permission check passed). Drives the sidebar's
	// `AI → Audit feed` unread-count badge: writing
	// `lastSeenAuditAt = Date.now()` flushes the count to 0 reactively.
	// We fire ONCE per (org, mount) — re-mounting the view (including
	// after a workspace switch) re-arms the ref. A filter change does
	// NOT re-fire, so the badge clear is anchored to "the user actually
	// opened the feed" rather than every interaction.
	const markAuditSeen = useMutation(api.users.mutations.updatePreferences);
	const markedSeenForOrgRef = useRef<Id<"orgs"> | null>(null);
	useEffect(() => {
		if (!orgId || page === undefined || page === null) return;
		if (markedSeenForOrgRef.current === orgId) return;
		markedSeenForOrgRef.current = orgId;
		void markAuditSeen({ lastSeenAuditAt: Date.now() }).catch(() => {});
	}, [orgId, markAuditSeen, page]);

	const stats = useMemo(() => computeStats(accumulated), [accumulated]);
	const hasActiveFilter = useMemo(
		() => Object.values(filters).some((v) => v !== undefined),
		[filters],
	);

	// Progressive loading (B.42 follow-up, 2026-06-05) — Convex makes the
	// page reactive from the moment it mounts. Don't gate the entire
	// surface on `page === undefined`; render the header / stat strip /
	// filter chrome immediately and surface skeleton rows in the table
	// while the first page resolves. Subsequent paginations get an
	// in-place skeleton appended below `accumulated` instead of a full
	// blanking out.
	const isInitialLoading = page === undefined && accumulated.length === 0;
	const isPaginationLoading = page === undefined && accumulated.length > 0;

	// ── No permission ──────────────────────────────────────────────────

	if (page === null) {
		return (
			<div className="h-full overflow-y-auto p-3 md:p-4">
				<div className="mx-auto flex max-w-3xl flex-col gap-4">
					<PageHeader orgSlug={orgSlug} />
					<Card className="border-dashed">
						<CardHeader className="flex flex-row items-center gap-3">
							<span
								aria-hidden
								className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-muted text-muted-foreground"
							>
								<ShieldAlert className="size-5" />
							</span>
							<div>
								<CardTitle className="text-base">Audit feed unavailable</CardTitle>
								<p className="mt-0.5 text-xs text-muted-foreground">
									You don't have permission to view this workspace's audit feed.
								</p>
							</div>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<p>
								The{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-[11px]">
									ai.audit.view
								</code>{" "}
								permission is required. Owners and admins see this by default — ask
								an owner to grant the permission to your role.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	const rows = accumulated;
	const hasMore = page !== undefined && page.nextCursor !== null;

	return (
		<div className="h-full overflow-y-auto p-3 md:p-4">
			<div className="mx-auto flex max-w-6xl flex-col gap-4">
				<PageHeader orgSlug={orgSlug} />

				{/* Stat strip — quick visual summary + 1-tap filters */}
				<StatStrip
					stats={stats}
					activeStatus={filters.status}
					onSelectStatus={(value) =>
						setFilters((f) => ({ ...f, status: value || undefined }))
					}
					onlyIrreversible={filters.riskTier === "irreversible"}
					onToggleIrreversible={() =>
						setFilters((f) => ({
							...f,
							riskTier: f.riskTier === "irreversible" ? undefined : "irreversible",
						}))
					}
				/>

				{/* Filter row — inline, no card chrome */}
				<div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border bg-card/50 px-3 py-2.5">
					<FilterSelect
						label="Source"
						value={filters.source}
						options={facets?.sources ?? []}
						onChange={(value) =>
							setFilters((f) => ({ ...f, source: value || undefined }))
						}
					/>
					<FilterSelect
						label="Status"
						value={filters.status}
						options={facets?.statuses ?? []}
						onChange={(value) =>
							setFilters((f) => ({ ...f, status: value || undefined }))
						}
					/>
					<FilterSelect
						label="Risk"
						value={filters.riskTier}
						options={facets?.riskTiers ?? []}
						onChange={(value) =>
							setFilters((f) => ({
								...f,
								riskTier:
									value === "safe" ||
									value === "reversible" ||
									value === "irreversible"
										? value
										: undefined,
							}))
						}
					/>
					<FilterSelect
						label="Capability"
						value={filters.capability}
						options={facets?.capabilities ?? []}
						onChange={(value) =>
							setFilters((f) => ({ ...f, capability: value || undefined }))
						}
					/>
					<div className="ms-auto flex items-center gap-2">
						{hasActiveFilter ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									setFilters({
										source: undefined,
										status: undefined,
										riskTier: undefined,
										capability: undefined,
									})
								}
							>
								<RefreshCcw className="me-1 size-3.5" />
								Clear
							</Button>
						) : null}
					</div>
				</div>

				{/* Feed — table renders DIRECTLY (no Card wrapper, no extra
				    padding above/below). Progressive: skeleton rows show
				    while the first page resolves, then real rows replace
				    them in place; subsequent paginations append a thin
				    skeleton row below the accumulated rows. */}
				{isInitialLoading ? (
					<TableSkeleton />
				) : rows.length === 0 ? (
					<EmptyState hasActiveFilter={hasActiveFilter} />
				) : (
					<div className="overflow-hidden rounded-[var(--radius)] border">
						<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
							<p className="text-xs font-medium text-muted-foreground">
								{rows.length} action{rows.length === 1 ? "" : "s"}
								{page?.overflowed
									? " (older results truncated; refine filters to dig further)"
									: ""}
							</p>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
									<tr>
										<th className="ps-4 py-2 text-start font-medium">When</th>
										<th className="px-2 py-2 text-start font-medium">
											Capability
										</th>
										<th className="px-2 py-2 text-start font-medium">Status</th>
										<th className="px-2 py-2 text-start font-medium">Source</th>
										<th className="px-2 py-2 text-start font-medium">Risk</th>
										<th className="px-2 py-2 text-start font-medium">Detail</th>
										<th className="pe-4 py-2 text-end font-medium">Trace</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<AuditRow key={row.id} row={row} orgSlug={orgSlug} />
									))}
									{isPaginationLoading && <SkeletonRow />}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{hasMore ? (
					<div className="flex justify-center pb-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								if (page && page.nextCursor !== null) setCursor(page.nextCursor);
							}}
						>
							Load older
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PageHeader({ orgSlug }: { orgSlug: string | undefined }) {
	return (
		<header className="flex items-start gap-3">
			<span
				aria-hidden
				className="mt-0.5 flex size-9 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
			>
				<Bot className="size-5" />
			</span>
			<div className="min-w-0 flex-1">
				<h1 className="text-lg font-semibold leading-tight">AI audit feed</h1>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Every capability call in this workspace, newest first. Click any row's{" "}
					<span className="font-medium text-foreground/80">Trace</span> to open the
					per-conversation tool timeline.
				</p>
			</div>
			{orgSlug ? (
				<Button asChild variant="ghost" size="sm" className="shrink-0">
					<Link href={`/${orgSlug}`}>
						<ChevronLeft className="me-1 size-4" />
						Dashboard
					</Link>
				</Button>
			) : null}
		</header>
	);
}

function StatStrip({
	stats,
	activeStatus,
	onSelectStatus,
	onlyIrreversible,
	onToggleIrreversible,
}: {
	stats: StatTotals;
	activeStatus: string | undefined;
	onSelectStatus: (value: string) => void;
	onlyIrreversible: boolean;
	onToggleIrreversible: () => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatTile
				icon={<ListChecks className="size-4" />}
				label="Total"
				value={stats.total}
				active={!activeStatus && !onlyIrreversible}
				onClick={() => onSelectStatus("")}
			/>
			<StatTile
				icon={<CheckCircle2 className="size-4" />}
				label="Successful"
				value={stats.ok}
				tone="ok"
				active={activeStatus === "ok"}
				onClick={() => onSelectStatus(activeStatus === "ok" ? "" : "ok")}
			/>
			<StatTile
				icon={<AlertTriangle className="size-4" />}
				label="Failed"
				value={stats.failed}
				tone="fail"
				active={
					activeStatus === "business_error" ||
					activeStatus === "needs_repair" ||
					activeStatus === "denied"
				}
				onClick={() =>
					onSelectStatus(activeStatus === "business_error" ? "" : "business_error")
				}
			/>
			<StatTile
				icon={<ShieldAlert className="size-4" />}
				label="Irreversible"
				value={stats.irreversible}
				tone="risk"
				active={onlyIrreversible}
				onClick={onToggleIrreversible}
			/>
		</div>
	);
}

function StatTile({
	icon,
	label,
	value,
	tone,
	active,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	tone?: "ok" | "fail" | "risk";
	active: boolean;
	onClick: () => void;
}) {
	const toneClass =
		tone === "ok"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "fail"
				? "text-rose-600 dark:text-rose-400"
				: tone === "risk"
					? "text-amber-600 dark:text-amber-400"
					: "text-foreground/80";
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group flex flex-col items-start gap-1 rounded-[var(--radius)] border bg-card px-4 py-3 text-start transition-colors hover:border-foreground/20 hover:bg-muted/40",
				active && "border-primary/60 bg-primary/5 ring-1 ring-primary/20",
			)}
			aria-pressed={active}
		>
			<span
				className={cn(
					"flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide",
					toneClass,
				)}
			>
				{icon}
				{label}
			</span>
			<span className="text-2xl font-semibold tabular-nums">{value}</span>
		</button>
	);
}

function FilterSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string | undefined;
	options: string[];
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<Select value={value ?? "_all"} onValueChange={(v) => onChange(v === "_all" ? "" : v)}>
				<SelectTrigger size="sm" className="h-8 min-w-[130px]">
					<SelectValue placeholder="All" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="_all">All</SelectItem>
					{options.map((opt) => (
						<SelectItem key={opt} value={opt}>
							{opt}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function EmptyState({ hasActiveFilter }: { hasActiveFilter: boolean }) {
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
				<span
					aria-hidden
					className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<Sparkles className="size-6" />
				</span>
				<div className="space-y-1">
					<p className="text-sm font-semibold">
						{hasActiveFilter ? "No actions match these filters" : "No AI activity yet"}
					</p>
					<p className="max-w-md text-xs leading-relaxed text-muted-foreground">
						{hasActiveFilter
							? "Try clearing one or two filters to widen the window. The audit feed records every capability call across chat, autonomous turns, WhatsApp, MCP and REST."
							: "Every time the AI runs a capability (creating a lead, moving a deal, sending a message) it lands here with the full result envelope, source, risk tier and a link to the conversation trace."}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function AuditRow({ row, orgSlug }: { row: AuditFeedRow; orgSlug: string | undefined }) {
	const variant = statusVariant(row.status);
	return (
		<tr className="border-t align-top transition-colors hover:bg-muted/30">
			<td className="ps-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
				{formatTimestamp(row.createdAt)}
			</td>
			<td className="px-2 py-3">
				<div className="font-medium leading-tight">{row.capability}</div>
				{row.module || row.group ? (
					<div className="mt-0.5 text-xs text-muted-foreground">
						{[row.module, row.group].filter(Boolean).join(" · ")}
					</div>
				) : null}
			</td>
			<td className="px-2 py-3">
				{variant === "ok" ? (
					<Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-400">
						<CheckCircle2 className="me-1 size-3" />
						{statusLabel(row.status)}
					</Badge>
				) : variant === "warn" ? (
					<Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 dark:bg-amber-900/40 dark:text-amber-300">
						<AlertTriangle className="me-1 size-3" />
						{statusLabel(row.status)}
					</Badge>
				) : (
					<Badge variant="destructive">
						<AlertTriangle className="me-1 size-3" />
						{statusLabel(row.status)}
					</Badge>
				)}
				{typeof row.errorCount === "number" && row.errorCount > 0 ? (
					<div className="mt-1 text-xs text-muted-foreground">
						{row.errorCount} per-row error{row.errorCount === 1 ? "" : "s"}
					</div>
				) : null}
			</td>
			<td className="px-2 py-3">
				<Badge className={sourceBadgeClass(row.source)} variant="secondary">
					{row.source}
				</Badge>
				{row.channel && row.channel !== row.source ? (
					<div className="mt-0.5 text-xs text-muted-foreground">via {row.channel}</div>
				) : null}
			</td>
			<td className="px-2 py-3">
				<Badge className={riskBadgeClass(row.riskTier)} variant="secondary">
					{row.riskTier}
				</Badge>
			</td>
			<td className="px-2 py-3 max-w-[420px]">
				<div className="text-sm leading-snug">{row.description || "—"}</div>
				{row.argSummary ? (
					<div className="mt-1 line-clamp-1 font-mono text-xs text-muted-foreground">
						{row.argSummary}
					</div>
				) : null}
				{row.personCode ? (
					<div className="mt-0.5 text-xs text-muted-foreground">{row.personCode}</div>
				) : null}
			</td>
			<td className="pe-4 py-3 text-end">
				{row.conversationId && orgSlug ? (
					<Button asChild variant="ghost" size="sm">
						<Link href={`/${orgSlug}/ai/trace/${row.conversationId}`}>Open</Link>
					</Button>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</td>
		</tr>
	);
}

// ─── Skeleton rows (progressive Convex-style loading) ──────────────────────

/**
 * 6-row table skeleton. Renders the EXACT same column shape as the real
 * table so the layout doesn't shift when the first page resolves and
 * real `<AuditRow>`s replace these. Each shimmer block uses
 * `animate-pulse` + `bg-muted` so it inherits the workspace theme tokens
 * (works in light + dark; matches the `--radius` of the workspace).
 */
function TableSkeleton() {
	return (
		<div className="overflow-hidden rounded-[var(--radius)] border">
			<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
				<div className="h-3 w-24 animate-pulse rounded bg-muted" />
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
						<tr>
							<th className="ps-4 py-2 text-start font-medium">When</th>
							<th className="px-2 py-2 text-start font-medium">Capability</th>
							<th className="px-2 py-2 text-start font-medium">Status</th>
							<th className="px-2 py-2 text-start font-medium">Source</th>
							<th className="px-2 py-2 text-start font-medium">Risk</th>
							<th className="px-2 py-2 text-start font-medium">Detail</th>
							<th className="pe-4 py-2 text-end font-medium">Trace</th>
						</tr>
					</thead>
					<tbody>
						{Array.from({ length: 6 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton — never re-orders
							<SkeletonRow key={i} />
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function SkeletonRow() {
	return (
		<tr className="border-t align-top">
			<td className="ps-4 py-3">
				<div className="h-3 w-20 animate-pulse rounded bg-muted" />
			</td>
			<td className="px-2 py-3">
				<div className="h-3 w-32 animate-pulse rounded bg-muted" />
				<div className="mt-1 h-2.5 w-20 animate-pulse rounded bg-muted/70" />
			</td>
			<td className="px-2 py-3">
				<div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
			</td>
			<td className="px-2 py-3">
				<div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
			</td>
			<td className="px-2 py-3">
				<div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
			</td>
			<td className="px-2 py-3 max-w-[420px]">
				<div className="h-3 w-full max-w-[300px] animate-pulse rounded bg-muted" />
				<div className="mt-1 h-2.5 w-24 animate-pulse rounded bg-muted/70" />
			</td>
			<td className="pe-4 py-3 text-end">
				<div className="ms-auto h-3 w-10 animate-pulse rounded bg-muted" />
			</td>
		</tr>
	);
}
