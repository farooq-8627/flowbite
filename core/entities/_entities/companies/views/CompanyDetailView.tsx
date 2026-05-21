"use client";

/**
 * CompanyDetailView — full-screen, tabbed detail page for one company.
 *
 * Wired from `core/entities/views/EntityDetailRedirect.tsx` when the URL
 * resolves to the `company` slot:
 *
 *   /:locale/:org/{labels.company.slug}/CO-001
 *      ↓
 *   <EntityDetailRedirect> → <CompanyDetailView>
 *
 * The previous implementation was an inline component inside
 * `CompaniesView.tsx` that rendered as a placeholder ("coming soon").
 * That has been replaced by this file, which mirrors the look and feel
 * of the person profile shell:
 *
 *   ┌─ Header (sticky) ─────────────────────────────────────────────────┐
 *   │  ◎ Acme Corp                                       [+ Add user] │
 *   │  CO-001 · Technology · acme.com                                  │
 *   ├─ Tabs ───────────────────────────────────────────────────────────┤
 *   │  Overview · Users · Files · Timeline · Follow-ups · Calendar    │
 *   ├─ Active tab content (scrollable) ────────────────────────────────┤
 *   │  …                                                               │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Tab inventory
 * ─────────────
 *   Overview   — primary card (logo + name + meta + tags + assignee)
 *                + custom fields panel + a recent-activity preview
 *   Users      — table of every person (lead/contact) joined to the
 *                company via `companyMembers`. Click → /profile/{code}.
 *   Files      — generic EntityFilesPanel scoped to entityType=company,
 *                entityId=companyCode (drag-drop, browse, delete).
 *   Timeline   — full EntityTimeline for the company entity.
 *   Follow-ups — EntityFollowups for the company entity.
 *   Calendar   — EntityCalendarPanel for the company entity.
 *
 * Mobile layout
 * ─────────────
 *   • Tab strip is `overflow-x-auto` so all tabs stay reachable on
 *     narrow screens.
 *   • Overview cards stack at `<md`; switch to a 2-column grid at `md+`.
 *   • Users table collapses to a card list at `<sm` so phone/email
 *     don't get clipped (mirrors the deals card pattern).
 */

import { useQuery } from "convex/react";
import {
	BellIcon,
	BuildingIcon,
	CalendarIcon,
	FileTextIcon,
	HistoryIcon,
	MailIcon,
	PencilIcon,
	PhoneIcon,
	UsersIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityTimeline } from "@/core/comms/timeline/components/EntityTimeline";
import { DataTable } from "@/core/data-display/datatable/components/DataTable";
import { DataTableColumnHeader } from "@/core/data-display/datatable/components/DataTableColumnHeader";
import { useDataTable } from "@/core/data-display/datatable/hooks/useDataTable";
import { CompanyDrawer } from "@/core/entities/_entities/companies/components/CompanyDrawer";
import { EntityFilesPanel } from "@/core/entities/shared/components/EntityFilesPanel";
import { FieldValueRenderer } from "@/core/entities/shared/components/FieldValueRenderer";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import { EntityCalendarPanel } from "@/core/scheduling/calendar/panels/EntityCalendarPanel";
import { EntityFollowups } from "@/core/scheduling/followups/components/EntityFollowups";
import { useCurrentOrg, useOrgMemberMap } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityHref } from "@/core/shell/shared/hooks/useEntityHref";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { displayUrlLabel, normalizeExternalUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

type TabId = "overview" | "users" | "files" | "timeline" | "followups" | "calendar";

interface CompanyDetailViewProps {
	orgSlug: string;
	companyCode: string;
}

/**
 * Top-level view. Resolves the company by its companyCode (URL slug),
 * then renders the tabbed detail shell.
 */
export function CompanyDetailView({ orgSlug, companyCode }: CompanyDetailViewProps) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();
	const company = useQuery(
		api.crm.entities.companies.queries.getByCompanyCode,
		orgId ? { orgId, companyCode } : "skip",
	);

	if (company === undefined) {
		return (
			<div
				data-org={orgSlug}
				data-id={companyCode}
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
			>
				Loading {labels.company.singular.toLowerCase()}…
			</div>
		);
	}
	if (company === null) {
		return (
			<div
				data-org={orgSlug}
				data-id={companyCode}
				className="flex h-full flex-col items-center justify-center gap-1 text-center"
			>
				<p className="text-sm font-medium">{labels.company.singular} not found</p>
				<p className="text-xs text-muted-foreground">{companyCode}</p>
			</div>
		);
	}

	return (
		<CompanyShell
			orgSlug={orgSlug}
			company={company as Doc<"companies">}
			orgId={orgId as Id<"orgs">}
		/>
	);
}

// ─── Shell — header + tab strip + active panel ─────────────────────────────

interface CompanyShellProps {
	orgSlug: string;
	company: Doc<"companies">;
	orgId: Id<"orgs">;
}

function CompanyShell({ orgSlug, company, orgId }: CompanyShellProps) {
	const _labels = useEntityLabels();
	const [activeTab, setActiveTab] = useState<TabId>("overview");
	const memberMap = useOrgMemberMap();
	const assignee = company.assignedTo
		? memberMap.get(String(company.assignedTo))?.user
		: undefined;

	const tabs: Array<{
		id: TabId;
		label: string;
		icon: React.ComponentType<{ className?: string }>;
	}> = [
		{ id: "overview", label: "Overview", icon: BuildingIcon },
		{ id: "users", label: "Users", icon: UsersIcon },
		{ id: "files", label: "Files", icon: FileTextIcon },
		{ id: "timeline", label: "Timeline", icon: HistoryIcon },
		{ id: "followups", label: "Follow-ups", icon: BellIcon },
		{ id: "calendar", label: "Calendar", icon: CalendarIcon },
	];

	const websiteHref = company.website ? normalizeExternalUrl(company.website) : null;

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-org={orgSlug}
			data-id={company.companyCode}
		>
			{/* ─── Header ─────────────────────────────────────────────── */}
			<header className="flex flex-col gap-3 border-b bg-background px-3 py-3 sm:px-4 sm:py-4">
				<div className="flex flex-wrap items-start gap-3">
					<Avatar className="size-10 shrink-0 sm:size-12">
						<AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
							{getInitials(company.name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<h1 className="text-base font-semibold tracking-tight sm:text-lg">
							{company.name}
						</h1>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
							<IdentityBadge
								entityType="company"
								code={company.companyCode}
								layout="code"
								size="xs"
								clickable={false}
							/>
							{company.industry && <span>{company.industry}</span>}
							{websiteHref && (
								<>
									<span aria-hidden>·</span>
									<a
										href={websiteHref}
										target="_blank"
										rel="noopener noreferrer external"
										className="text-primary hover:underline"
									>
										{displayUrlLabel(websiteHref, 36)}
									</a>
								</>
							)}
						</div>
					</div>
					{assignee && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Avatar className="size-7 shrink-0">
									<AvatarImage
										src={assignee.avatarUrl ?? undefined}
										alt={assignee.name ?? assignee.email ?? "Assignee"}
									/>
									<AvatarFallback className="text-[10px]">
										{getInitials(assignee.name ?? assignee.email ?? "?")}
									</AvatarFallback>
								</Avatar>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								Owned by {assignee.name ?? assignee.email}
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				{/* Tab strip — horizontally scrollable on mobile so every tab is reachable. */}
				<div className="-mb-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none">
					{tabs.map((t) => {
						const active = activeTab === t.id;
						const Icon = t.icon;
						return (
							<button
								type="button"
								key={t.id}
								onClick={() => setActiveTab(t.id)}
								aria-pressed={active}
								className={cn(
									"relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm transition-colors",
									active
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="size-3.5" aria-hidden />
								<span>{t.label}</span>
								{active && (
									<span
										aria-hidden
										className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
									/>
								)}
							</button>
						);
					})}
				</div>
			</header>

			{/* ─── Tab body — scrolls within the shell ──────────────────── */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{activeTab === "overview" && (
					<CompanyOverviewTab company={company} orgId={orgId} assignee={assignee} />
				)}
				{activeTab === "users" && <CompanyUsersTab company={company} orgId={orgId} />}
				{activeTab === "files" && (
					<div className="p-3 sm:p-4">
						<EntityFilesPanel
							orgId={orgId}
							entityType="company"
							entityId={company.companyCode}
						/>
					</div>
				)}
				{activeTab === "timeline" && (
					<EntityTimeline entityType="company" entityId={company.companyCode} />
				)}
				{activeTab === "followups" && (
					<div className="p-3 sm:p-4">
						<EntityFollowups entityType="company" entityId={company.companyCode} />
					</div>
				)}
				{activeTab === "calendar" && (
					<EntityCalendarPanel entityType="company" entityId={company.companyCode} />
				)}
			</div>
		</div>
	);
}

// ─── Overview tab ───────────────────────────────────────────────────────────

interface CompanyOverviewTabProps {
	company: Doc<"companies">;
	orgId: Id<"orgs">;
	assignee:
		| {
				name?: string;
				email?: string;
				avatarUrl?: string;
		  }
		| undefined;
}

function CompanyOverviewTab({ company, orgId, assignee }: CompanyOverviewTabProps) {
	const labels = useEntityLabels();
	const { visibleFields } = useEntityFields("company", orgId);
	const { valuesByEntityId } = useEntityFieldValuesMap("company", orgId);
	const customValues = valuesByEntityId[company._id] ?? {};
	const canEdit = useOrgPermission(orgId, "companies.update");

	// Single drawer instance shared by both card headers — clicking
	// "Edit" anywhere in the overview opens the same form.
	const [editOpen, setEditOpen] = useState(false);

	// Skip core columns we already render in the dedicated cards (name,
	// industry, website, assignedTo, size). Everything else — including
	// admin-defined custom fields — falls through to the generic list.
	const SKIP = new Set(["name", "industry", "website", "assignedTo", "assignees", "companyCode"]);
	const fieldsToRender = visibleFields.filter((f) => !SKIP.has(f.name));

	const websiteHref = company.website ? normalizeExternalUrl(company.website) : null;

	return (
		<div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
			{/* ── Primary details card ──────────────────────────────── */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
					<CardTitle className="text-sm">Details</CardTitle>
					{canEdit && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onClick={() => setEditOpen(true)}
									className="size-7"
									aria-label={`Edit ${labels.company.singular.toLowerCase()}`}
								>
									<PencilIcon className="size-3.5" aria-hidden />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">
								Edit {labels.company.singular.toLowerCase()}
							</TooltipContent>
						</Tooltip>
					)}
				</CardHeader>
				<CardContent>
					<dl className="flex flex-col divide-y text-xs">
						<DetailRow label="Code">
							<span className="font-mono">{company.companyCode}</span>
						</DetailRow>
						<DetailRow label="Industry">
							{company.industry ?? <Muted>—</Muted>}
						</DetailRow>
						<DetailRow label="Size">{company.size ?? <Muted>—</Muted>}</DetailRow>
						<DetailRow label="Website">
							{websiteHref ? (
								<a
									href={websiteHref}
									target="_blank"
									rel="noopener noreferrer external"
									className="text-primary hover:underline"
								>
									{displayUrlLabel(websiteHref, 32)}
								</a>
							) : (
								<Muted>—</Muted>
							)}
						</DetailRow>
						<DetailRow label="Owner">
							{assignee ? (
								<span className="inline-flex items-center gap-1.5">
									<Avatar className="size-4">
										<AvatarImage src={assignee.avatarUrl ?? undefined} />
										<AvatarFallback className="text-[8px]">
											{getInitials(assignee.name ?? assignee.email ?? "?")}
										</AvatarFallback>
									</Avatar>
									<span className="truncate">
										{assignee.name ?? assignee.email}
									</span>
								</span>
							) : (
								<Muted>Unassigned</Muted>
							)}
						</DetailRow>
						<DetailRow label="People">
							<span className="tabular-nums">{company.personCodes?.length ?? 0}</span>
						</DetailRow>
						<DetailRow label="Tags">
							<TagsCell
								orgId={orgId}
								entityType="company"
								entityId={company._id}
								className="justify-end"
							/>
						</DetailRow>
					</dl>
				</CardContent>
			</Card>

			{/* ── Custom fields card (admin-defined extras) ─────────── */}
			{fieldsToRender.length > 0 && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
						<CardTitle className="text-sm">More fields</CardTitle>
						{canEdit && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										onClick={() => setEditOpen(true)}
										className="size-7"
										aria-label="Edit fields"
									>
										<PencilIcon className="size-3.5" aria-hidden />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Edit fields
								</TooltipContent>
							</Tooltip>
						)}
					</CardHeader>
					<CardContent>
						<dl className="flex flex-col divide-y text-xs">
							{fieldsToRender.map((field) => {
								const raw =
									field.storage === "column"
										? (company as unknown as Record<string, unknown>)[
												field.columnKey ?? field.name
											]
										: customValues[field.name];
								const has =
									raw !== undefined &&
									raw !== null &&
									!(typeof raw === "string" && raw.length === 0) &&
									!(Array.isArray(raw) && raw.length === 0);
								return (
									<DetailRow key={field._id} label={field.label}>
										{has ? (
											<FieldValueRenderer
												kind={pickRenderKind(field)}
												value={raw}
											/>
										) : (
											<Muted>—</Muted>
										)}
									</DetailRow>
								);
							})}
						</dl>
					</CardContent>
				</Card>
			)}

			{/* ── Recent activity preview — full-width on tablet+ ──── */}
			<Card className="md:col-span-2">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Recent activity</CardTitle>
				</CardHeader>
				<CardContent className="-mx-2 sm:-mx-3">
					<EntityTimeline
						entityType="company"
						entityId={company.companyCode}
						pageSize={20}
						visibleCap={20}
						showFilters={false}
						showComposer={false}
					/>
				</CardContent>
			</Card>

			{/* ── Open follow-ups card — same row on md+ ───────────── */}
			<Card className="md:col-span-2">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Open follow-ups</CardTitle>
				</CardHeader>
				<CardContent>
					<EntityFollowups entityType="company" entityId={company.companyCode} />
				</CardContent>
			</Card>

			{/* ── Empty-state hint ──────────────────────────────────── */}
			{fieldsToRender.length === 0 && (
				<p className="text-xs text-muted-foreground md:col-span-2">
					Add custom fields under Settings → {labels.company.singular} to surface more
					information here.
				</p>
			)}

			{/* Edit drawer — re-used by both Details and More fields card
			    headers. Re-mounting it once at the tab level keeps a
			    single form instance in flight. */}
			<CompanyDrawer
				open={editOpen}
				onOpenChange={setEditOpen}
				orgId={orgId}
				mode="edit"
				company={company}
			/>
		</div>
	);
}

// ─── Users tab — table of people linked via companyMembers ─────────────────

function CompanyUsersTab({ company, orgId }: { company: Doc<"companies">; orgId: Id<"orgs"> }) {
	const buildHref = useEntityHref();
	const router = useRouter();
	const memberMap = useOrgMemberMap();
	const persons = useQuery(api.crm.entities.companies.queries.listPersonsForCompany, {
		orgId,
		companyId: company._id,
	});

	// Stable row shape so the DataTable's `getRowId` works.
	type Row = NonNullable<typeof persons>[number] & { id: string };

	const rows = useMemo<Row[] | undefined>(
		() =>
			persons?.map((p) => ({
				...p,
				id: p.personCode,
			})),
		[persons],
	);

	// Column factory — mirrors the canonical entity-table conventions:
	//   - Every header is `<DataTableColumnHeader>` (sortable, no chevron
	//     until hover) so the list-view ergonomics carry over.
	//   - The dispatcher renders the same Avatar + IdentityBadge pill the
	//     leads/contacts list uses, so people on the company page look
	//     identical to people on the leads/contacts page.
	const columns = useMemo<import("@tanstack/react-table").ColumnDef<Row, unknown>[]>(() => {
		return [
			{
				id: "displayName",
				accessorKey: "displayName",
				header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
				cell: ({ row }) => {
					const p = row.original;
					return (
						<div className="flex min-w-0 items-center gap-2">
							<Avatar className="size-6 shrink-0">
								<AvatarFallback className="text-[9px]">
									{getInitials(p.displayName)}
								</AvatarFallback>
							</Avatar>
							<span className="min-w-0 truncate font-medium text-foreground">
								{p.displayName}
							</span>
							<IdentityBadge
								entityType="person"
								code={p.personCode}
								layout="code"
								size="xs"
								clickable={false}
							/>
						</div>
					);
				},
			},
			{
				id: "kind",
				accessorKey: "kind",
				header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
				cell: ({ row }) => <KindBadge kind={row.original.kind} />,
			},
			{
				id: "email",
				accessorKey: "email",
				header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
				cell: ({ row }) => {
					const email = row.original.email;
					if (!email) return <Muted>—</Muted>;
					return (
						<a
							href={`mailto:${email}`}
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							<MailIcon className="size-3" aria-hidden />
							<span className="truncate">{email}</span>
						</a>
					);
				},
			},
			{
				id: "phone",
				accessorKey: "phone",
				header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
				cell: ({ row }) => {
					const phone = row.original.phone;
					if (!phone) return <Muted>—</Muted>;
					return (
						<a
							href={`tel:${phone}`}
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							<PhoneIcon className="size-3" aria-hidden />
							<span className="truncate">{phone}</span>
						</a>
					);
				},
			},
			{
				id: "owner",
				accessorKey: "assignedTo",
				header: ({ column }) => <DataTableColumnHeader column={column} title="Owner" />,
				cell: ({ row }) => {
					const ownerId = row.original.assignedTo;
					const owner = ownerId ? memberMap.get(ownerId)?.user : undefined;
					if (!owner) return <Muted>Unassigned</Muted>;
					return (
						<span className="inline-flex items-center gap-1.5 text-xs">
							<Avatar className="size-4">
								<AvatarImage src={owner.avatarUrl ?? undefined} />
								<AvatarFallback className="text-[8px]">
									{getInitials(owner.name ?? owner.email ?? "?")}
								</AvatarFallback>
							</Avatar>
							<span className="truncate">{owner.name ?? owner.email}</span>
						</span>
					);
				},
			},
		];
	}, [memberMap]);

	if (rows === undefined) {
		return (
			<div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
				Loading people…
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="m-3 rounded-[var(--radius)] border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground sm:m-4">
				No people linked to this company yet. Add them from a lead/contact's profile
				(Overview → Company) or from this company's edit drawer.
			</div>
		);
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
			<CompanyUsersDataTable
				columns={columns}
				rows={rows}
				onRowClick={(row) => {
					const href = buildHref("contact", row.personCode);
					if (href) router.push(href);
				}}
			/>
		</div>
	);
}

/**
 * Inner shell — the `useDataTable` call has to live below the early
 * returns above so we don't violate React's rule of hooks (the early
 * returns make `useDataTable` conditional on the data being ready).
 */
function CompanyUsersDataTable({
	columns,
	rows,
	onRowClick,
}: {
	columns: import("@tanstack/react-table").ColumnDef<
		NonNullable<
			ReturnType<
				typeof useQuery<typeof api.crm.entities.companies.queries.listPersonsForCompany>
			>
		>[number] & { id: string },
		unknown
	>[];
	rows: Array<
		NonNullable<
			ReturnType<
				typeof useQuery<typeof api.crm.entities.companies.queries.listPersonsForCompany>
			>
		>[number] & { id: string }
	>;
	onRowClick: (row: (typeof rows)[number]) => void;
}) {
	const { table } = useDataTable({
		data: rows,
		columns,
		pageCount: Math.ceil(rows.length / 25),
		initialState: {
			pagination: { pageSize: 25, pageIndex: 0 },
			sorting: [{ id: "displayName", desc: false }] as never,
		},
		getRowId: (row) => row.id,
		// Don't sync this table's state to the URL — multiple tables on
		// the same page would collide on `?page=` / `?perPage=` / `?sort=`
		// query params. We use static client state for embedded tables.
		shallow: true,
		clearOnDefault: true,
	});

	return <DataTable table={table} pageSizeOptions={[10, 25, 50, 100]} onRowClick={onRowClick} />;
}

// ─── Tiny helpers ──────────────────────────────────────────────────────────

/**
 * DetailRow — horizontal label/value pair that fills the row's width.
 *
 * Renders a single flex line so on narrow screens we don't waste the
 * right half of the card. Long values wrap, never overflow.
 */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex w-full items-start justify-between gap-3 py-1">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 flex-1 break-words text-end">{children}</dd>
		</div>
	);
}

function Muted({ children }: { children: React.ReactNode }) {
	return <span className="text-muted-foreground">{children}</span>;
}

function KindBadge({ kind }: { kind: "lead" | "contact" | "unknown" }) {
	if (kind === "unknown") {
		return (
			<Badge variant="outline" className="h-4 px-1.5 text-[9px]">
				—
			</Badge>
		);
	}
	const variant = kind === "contact" ? "default" : "secondary";
	return (
		<Badge variant={variant} className="h-4 px-1.5 text-[9px] capitalize">
			{kind}
		</Badge>
	);
}

function getInitials(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "?";
	const parts = trimmed.split(/\s+/).slice(0, 2);
	return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

/**
 * Pick a render kind for `<FieldValueRenderer>`. Mirrors the same logic
 * the entity card uses but shorter — the company overview only renders
 * a small handful of admin-defined fields.
 */
function pickRenderKind(
	field: Doc<"fieldDefinitions">,
): React.ComponentProps<typeof FieldValueRenderer>["kind"] {
	if (field.kind) {
		switch (field.kind) {
			case "tags":
			case "currency":
			case "personCode":
			case "entityCode":
				return field.kind;
			default:
				break;
		}
	}
	switch (field.type) {
		case "number":
			return "number";
		case "date":
			return "date";
		case "boolean":
			return "checkbox";
		case "url":
			return "link";
		case "email":
			return "email";
		case "file":
		case "files":
			return field.type === "files" ? "files" : "file";
		case "multiselect":
			return "tags";
		default:
			return "text";
	}
}
