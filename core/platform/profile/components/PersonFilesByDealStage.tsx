"use client";

/**
 * PersonFilesByDealStage — profile-level "files grouped per deal → per stage".
 *
 * Why this lives outside `EntityFilesPanel`
 * ─────────────────────────────────────────
 * `EntityFilesPanel` renders ONE merged-and-sorted list of every file
 * touching the entity (direct scope + tag-bridge + optional person scope).
 * That's the right shape when you want to scan everything chronologically
 * — but it loses the deal/stage attribution that admins explicitly model
 * via per-stage file fields.
 *
 * This component sits NEXT TO `EntityFilesPanel` on the profile Files tab
 * and gives a complementary view:
 *
 *     Deal D-007 · Big Office Lease
 *       Stage 1 · Defaults
 *         contract.pdf, plan.png
 *       Stage 2 · Discovery
 *         budget.xlsx
 *       Stage 3 · Negotiation (current)
 *         redline.docx
 *       Free attachments
 *         random.pdf
 *     Deal D-008 · …
 *
 * It mirrors the per-stage file-bucketing already used by `PersonDealCard`
 * — same data sources, same render rules — so users get a single mental
 * model regardless of which surface they land on.
 *
 * Data sources (all org-scoped, batched once for all deals)
 *   - `useDealPipelines(orgId)` — pipelines for stage names + order.
 *   - `useEntityFields("deal", orgId)` — field defs for `showInStages`.
 *   - `crm.entities.deals.queries.listByPersonCode` — every deal linked
 *     to this person.
 *   - `files.queries.listForEntity` — one call PER deal; we accept the
 *     N+1 here because the alternative ("get me every file in the org
 *     scoped to any of these deal codes") doesn't have an index, and a
 *     person rarely has more than a handful of deals. If profile pages
 *     start carrying 50+ deals, fold a batched `listForEntities` query
 *     server-side.
 */

import { useQuery } from "convex/react";
import { PaperclipIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useDealPipelines } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";

interface PersonFilesByDealStageProps {
	orgId: Id<"orgs">;
	personCode: string;
}

export function PersonFilesByDealStage({ orgId, personCode }: PersonFilesByDealStageProps) {
	const labels = useEntityLabels();
	const deals = useQuery(
		api.crm.entities.deals.queries.listByPersonCode,
		orgId ? { orgId, personCode, limit: 50 } : "skip",
	) as Array<Doc<"deals">> | undefined;
	const pipelines = useDealPipelines(orgId);
	const { allFields, isLoading: fieldsLoading } = useEntityFields("deal", orgId);

	if (deals === undefined || pipelines === undefined || fieldsLoading) {
		return (
			<p className="text-xs text-muted-foreground">
				Loading {labels.deal.plural.toLowerCase()}…
			</p>
		);
	}
	if (deals.length === 0) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
				No {labels.deal.plural.toLowerCase()} linked yet — files attached directly to this
				person are listed above.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{deals.map((deal) => (
				<DealFilesByStageCard
					key={deal._id}
					orgId={orgId}
					deal={deal}
					pipelines={pipelines}
					allFields={allFields}
				/>
			))}
		</div>
	);
}

interface DealFilesByStageCardProps {
	orgId: Id<"orgs">;
	deal: Doc<"deals">;
	pipelines: readonly Doc<"pipelines">[];
	allFields: Doc<"fieldDefinitions">[];
}

/**
 * One card per deal.
 *
 * Bucketing rules — copied verbatim from `PersonDealCard` so the two
 * surfaces always agree on which file lands under which stage:
 *
 *   1. `fieldKey` set → look up the field def → use `showInStages` to
 *      place the file under each stage that field is pinned to.
 *   2. `fieldKey` missing → "Free attachments" group at the bottom.
 *   3. Stages AFTER the deal's current stage are hidden (matches
 *      `PersonDealCard`'s "show fields up to current stage" rule).
 */
function DealFilesByStageCard({ orgId, deal, pipelines, allFields }: DealFilesByStageCardProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;
	const labels = useEntityLabels();

	const dealFiles = useQuery(
		api.files.queries.listForEntity,
		orgId ? { orgId, scope: "deal", scopeId: deal.dealCode } : "skip",
	);

	const pipeline = useMemo(
		() => pipelines.find((p) => p._id === deal.pipelineId),
		[pipelines, deal.pipelineId],
	);

	const sortedStages = useMemo(() => {
		if (!pipeline) return [] as Doc<"pipelines">["stages"];
		return [...pipeline.stages].sort((a, b) => a.order - b.order);
	}, [pipeline]);

	const currentStageIndex = useMemo(() => {
		if (!pipeline) return -1;
		return sortedStages.findIndex((s) => s.id === deal.currentStageId);
	}, [sortedStages, deal.currentStageId, pipeline]);

	const stagesToRender = useMemo(() => {
		if (currentStageIndex < 0) return sortedStages.length > 0 ? [sortedStages[0]] : [];
		return sortedStages.slice(0, currentStageIndex + 1);
	}, [sortedStages, currentStageIndex]);

	const fieldByName = useMemo(() => {
		const m = new Map<string, Doc<"fieldDefinitions">>();
		for (const f of allFields) m.set(f.name, f);
		return m;
	}, [allFields]);

	const filesByFieldKey = useMemo(() => {
		const map: Record<string, NonNullable<typeof dealFiles>> = {};
		if (!dealFiles) return map;
		for (const f of dealFiles) {
			const key = f.fieldKey ?? "_freeform";
			if (!map[key]) map[key] = [];
			map[key].push(f);
		}
		return map;
	}, [dealFiles]);

	const filesByStageId = useMemo(() => {
		const m = new Map<string, NonNullable<typeof dealFiles>>();
		for (const [fieldKey, list] of Object.entries(filesByFieldKey)) {
			if (fieldKey === "_freeform") continue;
			const def = fieldByName.get(fieldKey);
			if (!def?.showInStages || def.showInStages.length === 0) continue;
			for (const sid of def.showInStages) {
				if (!m.has(sid)) m.set(sid, []);
				m.get(sid)!.push(...list);
			}
		}
		return m;
	}, [filesByFieldKey, fieldByName]);

	const freeformFiles = filesByFieldKey._freeform ?? [];
	const totalFiles = (dealFiles ?? []).length;

	const dealHref =
		orgSlug && locale ? `/${locale}/${orgSlug}/${labels.deal.slug}/${deal.dealCode}` : null;

	return (
		<article className="flex flex-col overflow-hidden rounded-[var(--radius)] border bg-background">
			{/* Header — deal title + code + total files */}
			<header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 sm:px-4">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					{dealHref ? (
						<Link
							href={dealHref}
							className="truncate text-sm font-semibold hover:underline"
							title={deal.title}
						>
							{deal.title}
						</Link>
					) : (
						<span className="truncate text-sm font-semibold" title={deal.title}>
							{deal.title}
						</span>
					)}
					<IdentityBadge
						entityType="deal"
						code={deal.dealCode}
						layout="code"
						size="xs"
					/>
				</div>
				<Badge
					variant={totalFiles === 0 ? "outline" : "secondary"}
					className="h-5 gap-1 px-1.5 text-[10px]"
				>
					<PaperclipIcon className="size-3" aria-hidden />
					{totalFiles} {totalFiles === 1 ? "file" : "files"}
				</Badge>
			</header>

			{/* Body — per-stage groups + free attachments */}
			{dealFiles === undefined ? (
				<div className="px-3 py-3 text-xs text-muted-foreground sm:px-4">Loading…</div>
			) : totalFiles === 0 ? (
				<div className="px-3 py-3 text-xs text-muted-foreground sm:px-4">
					No files attached to this {labels.deal.singular.toLowerCase()} yet.
				</div>
			) : (
				<div className="flex flex-col divide-y">
					{stagesToRender.map((stage) => {
						const stageFiles = filesByStageId.get(stage.id) ?? [];
						if (stageFiles.length === 0) return null;
						const isCurrent = stage.id === deal.currentStageId;
						const isDefault = stage.isDefaultStage === true;
						const stageNumber = sortedStages.findIndex((s) => s.id === stage.id) + 1;
						return (
							<StageFileGroup
								key={stage.id}
								stage={stage}
								stageNumber={stageNumber}
								files={stageFiles}
								isCurrent={isCurrent}
								isDefault={isDefault}
							/>
						);
					})}
					{freeformFiles.length > 0 && (
						<section className="flex flex-col gap-2 px-3 py-3 sm:px-4">
							<div className="flex flex-wrap items-center gap-2">
								<PaperclipIcon
									className="size-3.5 text-muted-foreground"
									aria-hidden
								/>
								<h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
									Free attachments
								</h3>
								<Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
									{freeformFiles.length}
								</Badge>
							</div>
							<DealFileList files={freeformFiles} />
						</section>
					)}
				</div>
			)}
		</article>
	);
}

interface StageFileGroupProps {
	stage: Doc<"pipelines">["stages"][number];
	stageNumber: number;
	files: NonNullable<ReturnType<typeof useQuery<typeof api.files.queries.listForEntity>>>;
	isCurrent: boolean;
	isDefault: boolean;
}

function StageFileGroup({
	stage,
	stageNumber,
	files,
	isCurrent,
	isDefault,
}: StageFileGroupProps) {
	const stageColor = stage.color ?? "#94a3b8";

	return (
		<section
			className={cn(
				"flex flex-col gap-2 px-3 py-3 sm:px-4",
				isCurrent && "bg-primary/[0.03]",
			)}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span
					aria-hidden
					className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
					style={{ backgroundColor: `${stageColor}24`, color: stageColor }}
				>
					{stageNumber}
				</span>
				<h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-foreground">
					{isDefault ? "Defaults" : stage.name}
				</h3>
				{isDefault && (
					<Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-normal">
						Always-on
					</Badge>
				)}
				{isCurrent && (
					<Badge
						variant="outline"
						className="h-4 border-primary/40 bg-primary/10 px-1.5 text-[9px] font-medium text-primary"
					>
						Current
					</Badge>
				)}
				<Badge variant="secondary" className="ms-auto h-4 px-1.5 text-[9px]">
					{files.length}
				</Badge>
			</div>
			<DealFileList files={files} />
		</section>
	);
}

type DealFiles = NonNullable<ReturnType<typeof useQuery<typeof api.files.queries.listForEntity>>>;

function DealFileList({ files }: { files: DealFiles }) {
	if (files.length === 0) return null;
	return (
		<ul className="flex flex-wrap gap-1.5">
			{files.map((f) => (
				<li
					key={f._id}
					className="flex max-w-full items-center gap-1.5 rounded-[var(--radius)] border bg-background px-2 py-1 text-[11px]"
				>
					<PaperclipIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
					{f.url ? (
						<a
							href={f.url}
							target="_blank"
							rel="noopener noreferrer"
							className="max-w-[18ch] truncate hover:underline"
							title={f.name}
						>
							{f.name}
						</a>
					) : (
						<span className="max-w-[18ch] truncate" title={f.name}>
							{f.name}
						</span>
					)}
					<span className="text-[9px] tabular-nums text-muted-foreground">
						{formatBytes(f.size)}
					</span>
				</li>
			))}
		</ul>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
