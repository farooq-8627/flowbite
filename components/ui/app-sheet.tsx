"use client";

import type * as React from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * AppSheet — centralized sheet used throughout the app.
 *
 * Matches the sidebar's own mobile sheet exactly:
 *   bg-sidebar · text-sidebar-foreground · p-0 · no header · no close button
 *
 * The content passed as children is responsible for its own internal layout
 * (header row, scroll area, footer, etc.) — just like AIChatPanelContent does.
 *
 * Width is applied via inline `style` rather than a Tailwind `w-…` class
 * because `SheetContent` ships with its own `w-3/4 sm:max-w-sm` defaults —
 * tailwind-merge can't reliably collapse arbitrary CSS-var widths with
 * fraction utilities, so instead we win via CSS specificity (inline style
 * beats className-level width) and explicitly strip the `max-width` cap.
 */
export function AppSheet({
	open,
	onOpenChange,
	title,
	side = "left",
	width = "18rem",
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Accessible title (sr-only) */
	title: string;
	side?: "left" | "right" | "top" | "bottom";
	/** CSS width value, e.g. "18rem", "min(85vw, 22rem)", or "24rem" */
	width?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side={side}
				style={{ width, maxWidth: "none" }}
				className={cn(
					"bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden",
					className,
				)}
			>
				{/* Accessible label — visually hidden */}
				<SheetTitle className="sr-only">{title}</SheetTitle>
				<SheetDescription className="sr-only">{title} panel</SheetDescription>
				{children}
			</SheetContent>
		</Sheet>
	);
}
