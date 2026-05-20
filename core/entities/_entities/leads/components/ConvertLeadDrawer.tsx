"use client";

/**
 * ConvertLeadDrawer — converts one or more leads to contacts.
 *
 * Round 5 redesign: the single-pick PersonSelect is replaced with a
 * MultiSelect that lists EVERY lead whose status is not yet
 * "converted" or "lost". User checks the ones to convert; submitting
 * runs the conversion for each in turn.
 *
 * Pre-selected mode (entered via the bulk-action toolbar): the drawer
 * opens with `leadIds[]` already populated. The MultiSelect still
 * appears so the user can deselect / add others before submitting.
 *
 * "Create a deal?" toggles per-lead deal creation. When ON:
 *   - The drawer reveals a per-lead title input (pre-filled with the lead name).
 *   - On submit, we run `convert(leadId)` then `createDeal({...})` with the
 *     returned contactId for every selected lead.
 *   - Deal defaults: default pipeline (from `pipelines.queries.getDefault` for
 *     entityType "deal"), first stage of that pipeline, source = "lead".
 */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDefaultDealPipeline } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { normalizeErrorDescription } from "@/lib/normalizeError";

interface LeadOption extends MultiSelectOption {
	leadId: Id<"leads">;
	personCode?: string;
}

// A stable reference for the default empty array so the open-effect's deps
// don't churn when callers omit the `leadIds` prop. (Without this, every
// parent render created a new `[]` → effect re-ran → setSelectedLeadIds([]) →
// re-render → infinite loop. This is the root cause of "Maximum update depth
// exceeded" coming from this drawer.)
const EMPTY_LEAD_IDS: Id<"leads">[] = [];

interface ConvertLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	/** Pre-selected lead IDs (from bulk selection). User can edit. */
	leadIds?: Id<"leads">[];
	/**
	 * Convert a single lead → returns `{ contactId }` so we can chain deal creation.
	 */
	onConvert: (leadId: Id<"leads">) => Promise<{ contactId: Id<"contacts"> } | undefined>;
}

export function ConvertLeadDrawer({
	open,
	onOpenChange,
	orgId,
	leadIds: initialLeadIds = EMPTY_LEAD_IDS,
	onConvert,
}: ConvertLeadDrawerProps) {
	const labels = useEntityLabels();

	// State for the multi-select (lead ids) and per-lead deal title.
	const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
	const [createDeal, setCreateDeal] = useState(false);
	const [dealTitleByLead, setDealTitleByLead] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const allLeads = useQuery(api.crm.entities.leads.queries.list, orgId ? { orgId } : "skip");
	const createDealMutation = useMutation(api.crm.entities.deals.mutations.create);
	const copyTagsMutation = useMutation(api.crm.shared.tags.mutations.copyEntityTags);
	// Centralized — single subscription per (orgId), shared with the deals
	// board and settings UI. We only need the default pipeline here.
	const defaultPipelineFromHook = useDefaultDealPipeline(orgId && createDeal ? orgId : undefined);
	const defaultPipeline = defaultPipelineFromHook ?? undefined;

	// Re-seed selected ids ONLY when the drawer transitions closed → open.
	// We compare the previous `open` value via a ref so React state changes
	// inside the drawer (which trigger parent re-renders that may pass a
	// fresh `initialLeadIds` reference) don't blow away the user's selection.
	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (!open) {
			wasOpenRef.current = false;
			return;
		}
		if (wasOpenRef.current) return;
		wasOpenRef.current = true;
		setSelectedLeadIds(initialLeadIds.map((id) => id as string));
		setCreateDeal(false);
		setDealTitleByLead({});
	}, [open, initialLeadIds]);

	// Filter to unconverted leads (status != converted/lost).
	const unconverted = useMemo(
		() => (allLeads ?? []).filter((l) => l.status !== "converted" && l.status !== "lost"),
		[allLeads],
	);

	// Quick lookup table — name + personCode for the per-lead deal-title section.
	const leadById = useMemo(() => {
		const map = new Map<string, { displayName: string; personCode?: string }>();
		for (const l of unconverted) {
			map.set(l._id as string, { displayName: l.displayName, personCode: l.personCode });
		}
		return map;
	}, [unconverted]);

	const options: LeadOption[] = useMemo(
		() =>
			unconverted.map((l) => ({
				value: l._id as string,
				label: l.displayName,
				subtitle: l.email ?? l.personCode,
				leadId: l._id as Id<"leads">,
				personCode: l.personCode,
			})),
		[unconverted],
	);

	const canSubmit = selectedLeadIds.length > 0;

	const reset = () => {
		setSelectedLeadIds([]);
		setCreateDeal(false);
		setDealTitleByLead({});
	};

	const handleSubmit = async () => {
		if (!canSubmit || !orgId) return;
		setIsSubmitting(true);
		let converted = 0;
		let dealsCreated = 0;

		try {
			for (const leadIdStr of selectedLeadIds) {
				const leadId = leadIdStr as Id<"leads">;
				const result = await onConvert(leadId);
				converted += 1;

				if (createDeal && result?.contactId && defaultPipeline) {
					const firstStage = defaultPipeline.stages[0]?.id;
					if (!firstStage) continue;
					const lookup = leadById.get(leadIdStr);
					const title =
						dealTitleByLead[leadIdStr] ??
						`${labels.deal.singular} – ${lookup?.displayName ?? ""}`.trim();
					const { dealId } = await createDealMutation({
						orgId,
						title,
						pipelineId: defaultPipeline._id,
						currentStageId: firstStage,
						contactId: result.contactId,
						source: "lead",
					});
					await copyTagsMutation({
						orgId,
						fromEntityType: "lead",
						fromEntityId: leadId,
						toEntityType: "deal",
						toEntityId: dealId,
					}).catch(() => {
						/* tag propagation is non-fatal */
					});
					dealsCreated += 1;
				}
			}

			toast.success(
				converted === 1
					? `${labels.lead.singular} converted${dealsCreated ? ` · ${dealsCreated} ${labels.deal.singular.toLowerCase()} created` : ""}`
					: `${converted} ${labels.lead.plural.toLowerCase()} converted${dealsCreated ? ` · ${dealsCreated} ${labels.deal.plural.toLowerCase()} created` : ""}`,
			);
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error("Conversion failed", {
				description: normalizeErrorDescription(err),
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
			title={`Convert ${labels.lead.plural.toLowerCase()}`}
			description={`Pick the ${labels.lead.plural.toLowerCase()} to move to ${labels.contact.plural.toLowerCase()}. You can optionally open a ${labels.deal.singular.toLowerCase()} for each.`}
			size="md"
			submitLabel={
				selectedLeadIds.length > 0 ? `Convert ${selectedLeadIds.length}` : "Convert"
			}
			isSubmitting={isSubmitting}
			submitDisabled={!canSubmit}
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-4">
				{/* Selection */}
				<section className="flex flex-col gap-2.5">
					<div className="flex items-center gap-2">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Selection
						</span>
						<div className="h-px flex-1 bg-border" />
					</div>
					<div className="flex flex-col gap-1">
						<Label className="text-[11px] font-medium leading-none">
							{labels.lead.plural} to convert
							<span className="ms-0.5 text-destructive/60">*</span>
						</Label>
						<MultiSelect<LeadOption>
							value={selectedLeadIds}
							onChange={setSelectedLeadIds}
							options={options}
							placeholder={`Pick ${labels.lead.plural.toLowerCase()}…`}
							searchPlaceholder="Search by name, email, or code…"
							emptyText={
								unconverted.length === 0
									? `No unconverted ${labels.lead.plural.toLowerCase()}.`
									: "No matches."
							}
							renderRow={(opt) => (
								<>
									<Avatar className="size-5 shrink-0">
										<AvatarFallback className="text-[8px]">
											{opt.label.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col leading-tight">
										<span className="truncate text-sm">{opt.label}</span>
										<span className="truncate text-[11px] text-muted-foreground">
											{opt.personCode
												? `${opt.personCode}${opt.subtitle && opt.subtitle !== opt.personCode ? ` · ${opt.subtitle}` : ""}`
												: opt.subtitle}
										</span>
									</div>
								</>
							)}
						/>
					</div>
				</section>

				{/* Deal option */}
				<section className="flex flex-col gap-2.5">
					<div className="flex items-start gap-2 rounded-[var(--radius)] border bg-card p-3">
						<Checkbox
							id="create-deal"
							checked={createDeal}
							onCheckedChange={(v) => setCreateDeal(!!v)}
							className="mt-0.5"
						/>
						<div className="flex-1 space-y-0.5">
							<Label
								htmlFor="create-deal"
								className="cursor-pointer text-sm font-medium"
							>
								Also create a {labels.deal.singular.toLowerCase()}?
							</Label>
							<p className="text-[11px] text-muted-foreground">
								Opens a new {labels.deal.singular.toLowerCase()} in the default
								pipeline for each converted {labels.contact.singular.toLowerCase()}.
							</p>
						</div>
					</div>

					{createDeal && selectedLeadIds.length > 0 && (
						<div className="flex flex-col gap-2.5">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.deal.plural} to create
							</span>
							{selectedLeadIds.map((leadIdStr) => {
								const lookup = leadById.get(leadIdStr);
								const fallback = `${labels.deal.singular} – ${lookup?.displayName ?? ""}`;
								return (
									<div key={leadIdStr} className="flex flex-col gap-1">
										<Label
											htmlFor={`deal-title-${leadIdStr}`}
											className="text-[11px] font-medium leading-none"
										>
											{lookup?.displayName ?? leadIdStr}
											{lookup?.personCode && (
												<span className="ms-1 font-mono text-[10px] text-muted-foreground">
													{lookup.personCode}
												</span>
											)}
										</Label>
										<Input
											id={`deal-title-${leadIdStr}`}
											value={dealTitleByLead[leadIdStr] ?? fallback}
											onChange={(e) =>
												setDealTitleByLead((prev) => ({
													...prev,
													[leadIdStr]: e.target.value,
												}))
											}
											placeholder={fallback}
											className="h-9 text-sm"
										/>
									</div>
								);
							})}
							{!defaultPipeline && (
								<p className="text-[11px] text-amber-600">
									No default pipeline configured. Set one in Settings → Modules →
									Deal → Pipelines.
								</p>
							)}
						</div>
					)}
				</section>
			</div>
		</FormDrawer>
	);
}
