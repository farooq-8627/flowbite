"use client";

/**
 * core/entities/_entities/deals/components/WarnModeBanner.tsx
 *
 * Amber pill that surfaces when:
 *   - The deal's pipeline `stageTransitionPolicy === "warn"` AND
 *   - The deal's CURRENT stage has required fields that aren't filled.
 *
 * Mounted inside `DealDetailCard` between the header and the tab body
 * so users see the warning before they start digging into the deal.
 *
 * Why warn-mode (not block) needs this banner
 * ───────────────────────────────────────────
 * `warn` lets the deal advance even with missing required fields. Without
 * a visual signal, owners forget the gap until close-time. The banner
 * keeps the gap one click away from being filled.
 *
 * `block` mode already gates the move via `<FillMissingFieldsDialog>`
 * (auto-opened when the kanban drag throws `MISSING_REQUIRED_FIELDS`).
 * `off` mode skips the check entirely. Both render nothing here.
 *
 * RTL-safe Tailwind only (`me-/ms-/ps-/pe-`). Border radius via
 * `var(--radius)`. App strings come from `useEntityLabels`.
 */

import { useQuery } from "convex/react";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { FillMissingFieldsDialog } from "./FillMissingFieldsDialog";

interface WarnModeBannerProps {
	orgId: Id<"orgs">;
	deal: Doc<"deals">;
}

export function WarnModeBanner({ orgId, deal }: WarnModeBannerProps) {
	const [fillOpen, setFillOpen] = useState(false);

	// `getMissingFieldsForStage` already honours the per-pipeline
	// `stageTransitionPolicy` — it returns `policy === "off"` with an
	// empty `missing` array when the policy is off, so we don't need to
	// duplicate that gate here.
	const result = useQuery(
		api.crm.entities.deals.queries.getMissingFieldsForStage,
		deal.currentStageId ? { orgId, dealId: deal._id, stageId: deal.currentStageId } : "skip",
	);

	if (!result) return null;
	if (result.policy !== "warn") return null;
	if (result.missing.length === 0) return null;

	const missingCount = result.missing.length;
	const fieldList = result.missing.map((f) => f.label).join(", ");

	return (
		<>
			<div
				role="status"
				className="flex flex-col gap-2 border-b border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 dark:border-amber-700/50 dark:bg-amber-950/30"
			>
				<div className="flex min-w-0 items-start gap-2">
					<AlertTriangleIcon
						className="size-3.5 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
						aria-hidden
					/>
					<div className="min-w-0 flex-1">
						<p className="font-medium text-amber-900 dark:text-amber-100">
							{missingCount === 1
								? "1 required field missing"
								: `${missingCount} required fields missing`}{" "}
							at <strong>{result.stageName}</strong>
						</p>
						<p className="mt-0.5 truncate text-amber-800/80 dark:text-amber-200/80">
							{fieldList}
						</p>
					</div>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="shrink-0 self-start border-amber-300/80 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50 sm:self-auto"
					onClick={() => setFillOpen(true)}
				>
					<CheckIcon className="me-1.5 size-3" />
					Fill now
				</Button>
			</div>

			{fillOpen && (
				<FillMissingFieldsDialog
					open={fillOpen}
					onOpenChange={setFillOpen}
					orgId={orgId}
					deal={deal}
					targetStageName={result.stageName}
					missingFields={result.missing.map((f) => ({ name: f.name, label: f.label }))}
					// `onFilled` is the callback the kanban uses to retry the
					// stage move. From the deal-detail surface there's no
					// pending move — just close the dialog and let the
					// query re-run to clear the banner.
					onFilled={() => setFillOpen(false)}
				/>
			)}
		</>
	);
}
