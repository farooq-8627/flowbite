"use client";

import * as React from "react";
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
	/** CSS width value, e.g. "18rem" or "85vw" */
	width?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side={side}
				style={{ "--sidebar-width": width } as React.CSSProperties}
				className={cn(
					"w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden",
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
