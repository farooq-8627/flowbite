"use client";

/**
 * ConvertLeadDrawer — converts one or more leads to contacts.
 *
 * Single mode: opened with an empty `leadIds`, user picks a lead via PersonSelect.
 * Bulk mode:   opened with `leadIds.length > 0` (from the selection toolbar),
 *              drawer shows each selected lead with an optional per-lead deal title.
 *
 * "Create a deal?" toggles per-lead deal creation. When ON:
 *   - The drawer reveals a per-lead title input (pre-filled with the lead name).
 *   - On submit, we run `convert(leadId)` then `createDeal({...})` with the
 *     returned contactId for every selected lead.
 *   - Deal defaults: default pipeline (from `pipelines.queries.getDefault` for
 *     entityType "deal"), first stage of that pipeline, source = "lead".
 */

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import type { PersonRef } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

type LeadRecord = {
	id: string;
	displayName: string;
	personCode?: string;
	assignedTo?: Id<"users">;
};

interface ConvertLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	/** Pre-selected lead IDs (from bulk selection). Empty → single-pick mode. */
	leadIds?: Id<"leads">[];
	/** Optional lead records for display. When omitted we fall back to IDs. */
	leadRecords?: LeadRecord[];
	/**
	 * Convert a single lead → returns `{ contactId }` so we can chain deal creation.
	 */
	onConvert: (leadId: Id<"leads">) => Promise<{ contactId: Id<"contacts"> } | undefined>;
}

export function ConvertLeadDrawer({
	open,
	onOpenChange,
	orgId,
	leadIds = [],
	leadRecords = [],
	onConvert,
}: ConvertLeadDrawerProps) {
	const labels = useEntityLabels();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [singlePick, setSinglePick] = useState<PersonRef | null>(null);
	const [createDeal, setCreateDeal] = useState(false);
	const [dealTitleByLead, setDealTitleByLead] = useState<Record<string, string>>({});

	const createDealMutation = useMutation(api.crm.entities.deals.mutations.create);
	const defaultPipeline = useQuery(
		api.crm.fields.pipelines.queries.getDefault,
		orgId && createDeal ? { orgId, entityType: "deal" } : "skip",
	);

	const isBulk = leadIds.length > 0;

	const leadsToShow = useMemo<LeadRecord[]>(() => {
		if (isBulk) return leadRecords;
		if (singlePick) {
			return [
				{
					id: singlePick.id,
					displayName: singlePick.displayName,
					personCode: singlePick.personCode,
				},
			];
		}
		return [];
	}, [isBulk, leadRecords, singlePick]);

	const canSubmit = isBulk ? leadIds.length > 0 : !!singlePick;

	const reset = () => {
		setSinglePick(null);
		setCreateDeal(false);
		setDealTitleByLead({});
	};

	const handleSubmit = async () => {
		if (!canSubmit) return;
		const targets: Id<"leads">[] = isBulk
			? leadIds
			: singlePick
				? [singlePick.id as Id<"leads">]
				: [];
		if (targets.length === 0) return;

		setIsSubmitting(true);
		let converted = 0;
		let dealsCreated = 0;

		try {
			for (const leadId of targets) {
				const result = await onConvert(leadId);
				converted += 1;

				if (createDeal && result?.contactId && defaultPipeline) {
					const firstStage = defaultPipeline.stages[0]?.id;
					if (!firstStage) continue;
					const title =
						dealTitleByLead[leadId] ??
						`${labels.deal.singular} – ${
							leadRecords.find((r) => r.id === leadId)?.displayName ?? ""
						}`.trim();
					if (!orgId) continue;
					await createDealMutation({
						orgId,
						title,
						pipelineId: defaultPipeline._id,
						currentStageId: firstStage,
						contactId: result.contactId,
						source: "lead",
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
				description: err instanceof Error ? err.message : undefined,
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
			title={
				isBulk
					? `Convert ${leadIds.length} ${labels.lead.plural.toLowerCase()}`
					: `Convert ${labels.lead.singular}`
			}
			description={`Move to ${labels.contact.plural.toLowerCase()} — you can optionally open a ${labels.deal.singular.toLowerCase()} at the same time.`}
			size="md"
			submitLabel={isBulk ? `Convert ${leadIds.length}` : "Convert"}
			isSubmitting={isSubmitting}
			submitDisabled={!canSubmit}
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-4">
				{!isBulk && (
					<div className="space-y-1.5">
						<Label>Select {labels.lead.singular.toLowerCase()}</Label>
						<PersonSelect
							scope="lead"
							value={singlePick}
							onChange={setSinglePick}
							orgId={orgId}
							placeholder={`Pick a ${labels.lead.singular.toLowerCase()}…`}
						/>
					</div>
				)}

				{isBulk && leadsToShow.length > 0 && (
					<div className="space-y-1.5">
						<Label className="text-xs text-muted-foreground">
							{labels.lead.plural} to convert
						</Label>
						<ul className="flex flex-col gap-1.5 rounded-[var(--radius)] border bg-muted/20 p-2">
							{leadsToShow.map((lead) => (
								<li key={lead.id} className="flex items-center gap-2 text-sm">
									<Avatar className="size-6">
										<AvatarFallback className="text-[9px]">
											{lead.displayName.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span className="truncate font-medium">{lead.displayName}</span>
									{lead.personCode && (
										<span className="ms-auto font-mono text-xs text-muted-foreground">
											{lead.personCode}
										</span>
									)}
								</li>
							))}
						</ul>
					</div>
				)}

				<div className="flex items-start gap-2 rounded-[var(--radius)] border bg-background p-3">
					<Checkbox
						id="create-deal"
						checked={createDeal}
						onCheckedChange={(v) => setCreateDeal(!!v)}
						className="mt-0.5"
					/>
					<div className="flex-1 space-y-0.5">
						<Label htmlFor="create-deal" className="cursor-pointer text-sm font-medium">
							Also create a {labels.deal.singular.toLowerCase()}?
						</Label>
						<p className="text-xs text-muted-foreground">
							Opens a new {labels.deal.singular.toLowerCase()} in the default pipeline
							for each converted {labels.contact.singular.toLowerCase()}.
						</p>
					</div>
				</div>

				{createDeal && leadsToShow.length > 0 && (
					<div className="flex flex-col gap-2">
						{leadsToShow.map((lead) => (
							<div key={lead.id} className="space-y-1.5">
								<Label
									htmlFor={`deal-title-${lead.id}`}
									className="text-xs text-muted-foreground"
								>
									{labels.deal.singular} title for {lead.displayName}
								</Label>
								<Input
									id={`deal-title-${lead.id}`}
									value={
										dealTitleByLead[lead.id] ??
										`${labels.deal.singular} – ${lead.displayName}`
									}
									onChange={(e) =>
										setDealTitleByLead((prev) => ({
											...prev,
											[lead.id]: e.target.value,
										}))
									}
									placeholder={`${labels.deal.singular} – ${lead.displayName}`}
								/>
							</div>
						))}
						{!defaultPipeline && (
							<p className="text-xs text-amber-600">
								No default pipeline configured. Set one in Settings → CRM →
								Pipelines.
							</p>
						)}
					</div>
				)}
			</div>
		</FormDrawer>
	);
}
