"use client";

/**
 * FormDrawer — reusable right-side drawer for all entity forms.
 *
 * Layout contract (mirrors Settings UI patterns — see core/settings/components/shared/*):
 *   ┌─ Header (tight, no border)  ──────────┐
 *   │   Title                                │
 *   │   Description                          │
 *   ├─ Body (native scroll, comfortable pad) ┤
 *   │   ...fields...                         │
 *   ├─ Footer (row, buttons right)  ─────────┤
 *   │                     [ Cancel ] [Save]  │
 *   └────────────────────────────────────────┘
 *
 * Design decisions:
 *   - Uses native `overflow-y-auto` instead of Radix `ScrollArea` because ScrollArea's
 *     Viewport captures pointer events that break Radix Select / Popover focus traps
 *     when they open inside the Sheet (observed: Source select freeze). Native scroll
 *     also avoids clipping the `focus-visible:ring-[3px]` on Inputs.
 *   - Header has zero gap between title + description, no bottom border — matches
 *     SettingsSection's tight CardHeader (gap-0).
 *   - Footer is always `flex-row` with buttons right-aligned. Overrides the shadcn
 *     SheetFooter default which is `flex-col gap-2`.
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type DrawerSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<DrawerSize, string> = {
	sm: "24rem",
	md: "28rem",
	lg: "36rem",
	xl: "44rem",
};

interface FormDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	size?: DrawerSize;
	children: ReactNode;
	/** Custom footer. When omitted, renders Cancel + Submit (row, right-aligned). */
	footer?: ReactNode;
	submitLabel?: string;
	cancelLabel?: string;
	onSubmit?: () => void;
	isSubmitting?: boolean;
	submitDisabled?: boolean;
	/** Extra className on the body. */
	bodyClassName?: string;
}

export function FormDrawer({
	open,
	onOpenChange,
	title,
	description,
	size = "md",
	children,
	footer,
	submitLabel = "Save",
	cancelLabel = "Cancel",
	onSubmit,
	isSubmitting,
	submitDisabled,
	bodyClassName,
}: FormDrawerProps) {
	const width = SIZE_MAP[size];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showCloseButton
				className="flex flex-col gap-0 p-0"
				style={{ width, maxWidth: "none" }}
			>
				{/* Header: tight, no border, no gap between title + description */}
				<div className="shrink-0 px-6 pt-5 pb-4">
					<SheetTitle className="text-base font-semibold leading-tight">
						{title}
					</SheetTitle>
					{description && (
						<SheetDescription className="mt-0.5 text-xs leading-snug text-muted-foreground">
							{description}
						</SheetDescription>
					)}
				</div>

				{/* Body: native scroll, comfortable padding so focus rings don't clip */}
				<div
					className={cn(
						"min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-6",
						"[&_input]:focus-visible:z-10",
						bodyClassName,
					)}
				>
					{children}
				</div>

				{/* Footer: row, right-aligned, fit-content buttons */}
				<div className="flex shrink-0 flex-row items-center justify-end gap-2 border-t bg-card px-6 py-3">
					{footer ?? (
						<>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onOpenChange(false)}
								disabled={isSubmitting}
							>
								{cancelLabel}
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={onSubmit}
								disabled={submitDisabled || isSubmitting}
							>
								{isSubmitting ? "Saving…" : submitLabel}
							</Button>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
