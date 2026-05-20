"use client";

/**
 * ChangePipelineDialog — move a deal to a different pipeline.
 *
 * Shows current pipeline + stage, lets the user pick a target pipeline,
 * previews the new (auto-assigned) stage, and submits via the
 * `deals.changePipeline` mutation.
 *
 * Server-side guarantees (mirrored here for friendly UX):
 *   - Closed deals (wonAt/lostAt set) are blocked → button hidden by caller.
 *   - Same-pipeline submission is blocked → candidates list excludes it.
 *   - Activity log keeps the old stage history intact.
 *
 * Reads the pipeline list from the centralized `useDealPipelines` hook so
 * no extra subscription fires when this dialog mounts.
 */

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useDealPipelines } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { normalizeError } from "@/lib/normalizeError";

interface Props {
	deal: Doc<"deals">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ChangePipelineDialog({ deal, open, onOpenChange }: Props) {
	const { orgId } = useCurrentOrg();
	const dealPipelines = useDealPipelines(orgId);
	const changePipeline = useMutation(api.crm.entities.deals.mutations.changePipeline);

	const [target, setTarget] = useState<Id<"pipelines"> | undefined>(undefined);
	const [submitting, setSubmitting] = useState(false);

	const candidates = useMemo(
		() => (dealPipelines ?? []).filter((p) => p._id !== deal.pipelineId),
		[dealPipelines, deal.pipelineId],
	);

	// Reset target whenever the dialog re-opens or the candidates list changes.
	useEffect(() => {
		if (!open) return;
		setTarget(candidates[0]?._id);
	}, [open, candidates]);

	const fromPipeline = useMemo(
		() => dealPipelines?.find((p) => p._id === deal.pipelineId),
		[dealPipelines, deal.pipelineId],
	);
	const fromStage = useMemo(
		() => fromPipeline?.stages.find((s) => s.id === deal.currentStageId),
		[fromPipeline, deal.currentStageId],
	);
	const targetPipeline = useMemo(
		() => candidates.find((p) => p._id === target),
		[candidates, target],
	);
	const targetStage = useMemo(() => {
		if (!targetPipeline) return undefined;
		const sorted = [...targetPipeline.stages].sort((a, b) => a.order - b.order);
		return sorted.find((s) => !s.isFinal) ?? sorted[0];
	}, [targetPipeline]);

	const submit = async () => {
		if (!orgId || !target) return;
		setSubmitting(true);
		try {
			await changePipeline({ orgId, dealId: deal._id, toPipelineId: target });
			toast.success(`Moved to ${targetPipeline?.name}`);
			onOpenChange(false);
		} catch (err) {
			toast.error(normalizeError(err, "Failed to change pipeline"));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move {deal.dealCode} to another pipeline</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-3 text-sm">
					<div className="text-muted-foreground">
						Current:{" "}
						<span className="text-foreground">{fromPipeline?.name ?? "—"}</span>
						{fromStage ? (
							<>
								{" "}
								· <span className="text-foreground">{fromStage.name}</span>
							</>
						) : null}
					</div>

					{candidates.length === 0 ? (
						<div className="rounded-[var(--radius)] border border-dashed p-3 text-center text-muted-foreground">
							No other pipelines available. Create one in Settings first.
						</div>
					) : (
						<>
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="change-pipeline-target"
									className="text-xs font-medium"
								>
									Move to
								</label>
								<Select
									value={target ?? undefined}
									onValueChange={(v) => setTarget(v as Id<"pipelines">)}
								>
									<SelectTrigger id="change-pipeline-target" className="h-9">
										<SelectValue placeholder="Choose a pipeline" />
									</SelectTrigger>
									<SelectContent>
										{candidates.map((p) => (
											<SelectItem key={p._id} value={p._id}>
												<span className="flex items-center gap-2">
													{p.name}
													{p.isDefault && (
														<Badge
															variant="secondary"
															className="text-[10px]"
														>
															Default
														</Badge>
													)}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="text-xs text-muted-foreground">
								New stage:{" "}
								<span className="text-foreground">
									{targetStage?.name ?? "(empty pipeline)"}
								</span>{" "}
								(auto)
							</div>

							<p className="rounded-[var(--radius)] bg-muted/40 p-2 text-xs text-muted-foreground">
								Activity history is preserved. Stage references in old log entries
								stay intact.
							</p>
						</>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={!target || candidates.length === 0 || submitting}
					>
						{submitting ? "Moving…" : "Move"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
