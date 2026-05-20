"use client";

/**
 * MarkAsLostDialog — confirmation dialog for marking a deal as lost from
 * any stage.
 *
 * The user explicitly said:
 *
 *   "From any stage we will have mark as lost in a deal that too
 *    confirmation box as well … input asking (delete deal-code requried
 *    please to confirm)."
 *
 * Behaviour
 * ─────────
 *   - Renders a small body explaining what will happen.
 *   - Optional outcome reason text input (small).
 *   - REQUIRED confirmation field — the user must type the deal's
 *     `dealCode` exactly. The Mark-as-lost button stays disabled
 *     until the field matches.
 *   - On submit, calls `deals.mutations.markAsLost` with the typed
 *     value as `deleteCodeConfirmation` so the server re-validates.
 *
 * Cross-reference: `convex/crm/entities/deals/mutations.ts::markAsLost`.
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { normalizeError } from "@/lib/normalizeError";

interface MarkAsLostDialogProps {
	deal: Doc<"deals">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onMarked?: () => void;
}

export function MarkAsLostDialog({ deal, open, onOpenChange, onMarked }: MarkAsLostDialogProps) {
	const { orgId } = useCurrentOrg();
	const markAsLost = useMutation(api.crm.entities.deals.mutations.markAsLost);

	const [confirmation, setConfirmation] = useState("");
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);

	// Reset when the dialog re-opens so old values don't leak.
	useEffect(() => {
		if (!open) return;
		setConfirmation("");
		setReason("");
	}, [open]);

	const matches = confirmation.trim() === deal.dealCode;

	const handleSubmit = async () => {
		if (!orgId || !matches) return;
		setSubmitting(true);
		try {
			await markAsLost({
				orgId,
				dealId: deal._id,
				deleteCodeConfirmation: confirmation.trim(),
				outcomeReason: reason.trim() || undefined,
			});
			toast.success(`Marked ${deal.dealCode} as lost`);
			onOpenChange(false);
			onMarked?.();
		} catch (err) {
			toast.error(normalizeError(err, "Couldn't mark as lost"));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Mark deal as lost</DialogTitle>
					<DialogDescription>
						This closes the deal and removes it from the open pipeline. You can still
						see it in reports — but reminders, follow-ups, and notifications will stop.
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
						<Label htmlFor="lost-reason" className="text-xs">
							Reason (optional)
						</Label>
						<Textarea
							id="lost-reason"
							rows={2}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Why is this deal lost? (optional)"
							className="text-sm"
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor="lost-confirm" className="text-xs">
							Type{" "}
							<span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
								{deal.dealCode}
							</span>{" "}
							to confirm
						</Label>
						<Input
							id="lost-confirm"
							autoFocus
							value={confirmation}
							onChange={(e) => setConfirmation(e.target.value)}
							placeholder={deal.dealCode}
							className="font-mono"
						/>
						<p className="text-[10px] leading-snug text-muted-foreground">
							This guards against accidental loss. Type the exact code above.
						</p>
					</div>
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
						variant="destructive"
						onClick={handleSubmit}
						disabled={!matches || submitting}
					>
						{submitting ? "Marking…" : "Mark as lost"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
