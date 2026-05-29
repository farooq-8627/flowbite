"use client";

/**
 * DashboardEmptyState — the shared, motivating zero-data state for
 * dashboard widgets.
 *
 * Why this exists (DASHBOARD-V2-PLAN.md §1.G3, 2026-05-29): the old
 * widget empty states were flat one-liners ("No deals in this pipeline
 * yet"). They told the user nothing was there but gave no reason to
 * act and no sense of what the platform does once data exists. This
 * component replaces them with an icon + headline + one-line value
 * proposition + a primary CTA (go create the real thing) + an optional
 * "Ask AI" shortcut that pre-fills the chat composer (e.g. "create 5
 * sample deals"), so an empty workspace still demonstrates the product
 * and earns trust.
 */

import type { LucideIcon } from "lucide-react";
import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { cn } from "@/lib/utils";

interface DashboardEmptyStateProps {
	icon: LucideIcon;
	title: string;
	body: string;
	/** Primary call-to-action — links to the page where the user creates the real record. */
	primary?: { label: string; href: string };
	/** Optional "Ask AI" shortcut — pre-fills the chat composer with this intent. */
	aiIntent?: string;
	/** Label for the AI shortcut button. Defaults to "Ask AI". */
	aiLabel?: string;
	className?: string;
}

export function DashboardEmptyState({
	icon: Icon,
	title,
	body,
	primary,
	aiIntent,
	aiLabel = "Ask AI",
	className,
}: DashboardEmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 px-6 py-8 text-center",
				className,
			)}
		>
			<span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Icon className="size-5" />
			</span>
			<p className="text-sm font-semibold">{title}</p>
			<p className="max-w-xs text-xs text-muted-foreground">{body}</p>
			{(primary || aiIntent) && (
				<div className="mt-1 flex flex-wrap items-center justify-center gap-2">
					{primary && (
						<Button asChild size="sm">
							<Link href={primary.href}>{primary.label}</Link>
						</Button>
					)}
					{aiIntent && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="gap-1"
							onClick={() => sendChatPrefill(aiIntent)}
						>
							<SparklesIcon className="size-3.5" />
							{aiLabel}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
