"use client";

/**
 * ConfirmDialog — reusable "are you sure?" prompt.
 *
 * Use this for every destructive UI action where the user benefits from a
 * second-thought wall: deleting a pipeline, soft-deleting a lead/contact/
 * deal/company, hard-deleting from trash, etc. The dialog renders a
 * title, a body description, an optional callout slot (for amber/red
 * warning banners), and a Cancel / Confirm button pair where the
 * confirm button can be styled `default` or `destructive`.
 *
 * Locked 2026-06-10 (per user): the user explicitly asked for a single
 * shared dialog primitive ("First build the delete dialog box so we
 * can use it whereever we want more efficiently"). Every entity-level
 * delete in the dashboard routes through this component. The owner-
 * panel's `<TypedDeleteDialog>` (type-name-to-confirm) stays separate
 * because that's a different UX shape — used only for hard-deletes
 * where typing the literal entity name is the explicit safety wall.
 *
 * Async-aware
 * ───────────
 * `onConfirm` returns a `Promise`. The dialog manages an internal busy
 * state, disables both buttons while the promise is in flight, and
 * surfaces a "...ing" label on the confirm button via `busyLabel`.
 * If the promise rejects the dialog stays open and the caller is
 * expected to surface a toast (per project convention).
 */

import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
	/** Controlled open state. */
	open: boolean;
	/** Controlled open setter — fires on Cancel + Esc + backdrop click. */
	onOpenChange: (open: boolean) => void;
	/** Dialog title. Required. */
	title: ReactNode;
	/** Body description rendered under the title. Required. */
	description: ReactNode;
	/**
	 * Optional callout slot, typically a coloured banner above the
	 * description. Use this for "this is your default pipeline" or
	 * "this action cannot be undone" warnings. Free-form ReactNode so
	 * callers control the visual.
	 */
	callout?: ReactNode;
	/** Confirm-button label. Defaults to "Confirm". */
	confirmLabel?: ReactNode;
	/** In-flight confirm-button label. Defaults to "…". */
	busyLabel?: ReactNode;
	/** Cancel-button label. Defaults to "Cancel". */
	cancelLabel?: ReactNode;
	/** Confirm-button variant. Defaults to `"destructive"`. */
	confirmVariant?: "default" | "destructive";
	/**
	 * Async confirm handler. Dialog manages busy state + auto-closes on
	 * resolve. On reject, the dialog stays open so the caller can
	 * toast the error and the user can retry / cancel. Errors are
	 * intentionally swallowed here — surface them via `toast.error` in
	 * the caller's handler.
	 */
	onConfirm: () => Promise<void>;
	/**
	 * Optional extra disable trigger for the confirm button (e.g. a
	 * "type the name to confirm" extension can pass `false` until the
	 * input matches). Independent of the internal busy state.
	 */
	confirmDisabled?: boolean;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	callout,
	confirmLabel = "Confirm",
	busyLabel,
	cancelLabel = "Cancel",
	confirmVariant = "destructive",
	onConfirm,
	confirmDisabled,
}: ConfirmDialogProps) {
	const [busy, setBusy] = useState(false);

	const handleConfirm = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} catch {
			// Error surfaced by caller via toast — dialog stays open.
		} finally {
			setBusy(false);
		}
	};

	const resolvedBusy =
		busyLabel ??
		(typeof confirmLabel === "string" ? `${confirmLabel.replace(/[….]+$/, "")}…` : "Working…");

	return (
		<Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{callout}
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						{cancelLabel}
					</Button>
					<Button
						type="button"
						variant={confirmVariant}
						onClick={handleConfirm}
						disabled={busy || confirmDisabled === true}
					>
						{busy ? (
							<>
								<Loader2 className="me-2 size-3.5 animate-spin" />
								{resolvedBusy}
							</>
						) : (
							confirmLabel
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
