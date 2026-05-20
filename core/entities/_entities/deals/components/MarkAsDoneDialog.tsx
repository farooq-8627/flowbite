"use client";

/**
 * MarkAsDoneDialog — confirmation dialog for marking a deal as done (won).
 *
 * Honors the per-pipeline `markDoneRequiresAllFields` setting. When true
 * (default), the server's `closeAsDone` rejects with
 * `MISSING_REQUIRED_FIELDS_FOR_DONE` if any required field across any
 * non-final stage is unfilled — this dialog catches that and surfaces a
 * rich error so the user can fix it before retrying.
 *
 * The user said:
 *
 *   "To actually mark it as done I should move it to final stage and
 *    then mark it as done."
 *
 * Today we don't gate on "must be in a final stage first" because the
 * server already moves the deal into the positive-final stage as part of
 * `closeAsDone`. The user can mark a deal done from anywhere; we still
 * surface a confirmation step so it isn't accidental.
 */

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { normalizeError } from "@/lib/normalizeError";

interface MarkAsDoneDialogProps {
	deal: Doc<"deals">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function MarkAsDoneDialog({ deal, open, onOpenChange }: MarkAsDoneDialogProps) {
	const { orgId } = useCurrentOrg();
	const closeAsDone = useMutation(api.crm.entities.deals.mutations.closeAsDone);

	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [missingFieldList, setMissingFieldList] = useState<string[]>([]);

	const handleSubmit = async () => {
		if (!orgId) return;
		setSubmitting(true);
		setMissingFieldList([]);
		try {
			await closeAsDone({
				orgId,
				dealId: deal._id,
				finalType: "positive",
				outcomeReason: reason.trim() || undefined,
			});
			toast.success(`🎉 ${deal.dealCode} marked as won!`);
			// Confetti — same as the kanban "won" handler.
			import("canvas-confetti")
				.then((mod) => mod.default({ particleCount: 100, spread: 70 }))
				.catch(() => {});
			setReason("");
			onOpenChange(false);
		} catch (err) {
			const errorData = (err as { data?: Record<string, unknown> })?.data;
			const code =
				typeof errorData === "object" && errorData !== null
					? (errorData.code as string | undefined)
					: undefined;
			if (code === "MISSING_REQUIRED_FIELDS_FOR_DONE") {
				const missing = (
					errorData as {
						missingFields?: Array<{ label: string; stageName: string }>;
					}
				).missingFields;
				const labels = (missing ?? []).map((f) => `${f.label} (${f.stageName})`);
				setMissingFieldList(labels);
				toast.error("Some required fields are still missing", {
					description: `${labels.length} field(s) need to be filled before this deal can be marked as done.`,
				});
				return;
			}
			toast.error(normalizeError(err, "Couldn't mark as done"));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Mark deal as done</DialogTitle>
					<DialogDescription>
						This closes the deal as won. Confetti included. The pipeline policy may
						require all stage fields to be filled first — if so, we'll point them out
						below.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<div className="rounded-[var(--radius)] border bg-muted/40 px-3 py-2 text-xs">
						<div className="flex items-center justify-between gap-2">
							<span className="text-muted-foreground">Deal</span>
							<span className="font-medium">{deal.title}</span>
						</div>
						<div className="mt-1 flex items-center justify-between gap-2">
							<span className="text-muted-foreground">Code</span>
							<span className="font-mono">{deal.dealCode}</span>
						</div>
					</div>

					<div className="flex flex-col gap-1">
						<label htmlFor="done-reason" className="text-xs font-medium">
							Outcome notes (optional)
						</label>
						<Textarea
							id="done-reason"
							rows={2}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Anything to capture about this win? (optional)"
							className="text-sm"
						/>
					</div>

					{missingFieldList.length > 0 && (
						<div className="rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-3 text-xs">
							<p className="font-medium text-destructive">
								Required fields still missing:
							</p>
							<ul className="mt-1 list-disc ps-4 text-destructive/90">
								{missingFieldList.slice(0, 8).map((label) => (
									<li key={label}>{label}</li>
								))}
								{missingFieldList.length > 8 && (
									<li className="text-destructive/60">
										+{missingFieldList.length - 8} more…
									</li>
								)}
							</ul>
							<p className="mt-2 text-[10px] text-muted-foreground">
								Open the deal, fill the gaps, then try again. To skip this check, an
								admin can disable "Require all fields before mark as done" on the
								pipeline in Settings.
							</p>
						</div>
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
					<Button type="button" onClick={handleSubmit} disabled={submitting}>
						{submitting ? "Marking…" : "Mark as done"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
