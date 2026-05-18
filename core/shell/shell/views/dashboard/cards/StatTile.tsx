"use client";

/**
 * StatTile — single KPI tile in the dashboard's top stat strip.
 *
 * STATUS: IMPLEMENTED.
 *
 * Renders a label, an icon (with accent colour), and a value. When a
 * `href` is provided the tile becomes a Link with hover affordance —
 * otherwise it's a static read-only card.
 *
 * Used by `<DashboardHomeView />` for the four KPI tiles in row 1
 * (Open leads, Contacts, Open deals, Pipeline value). One file per
 * card (per AGENTS.md "no monolith dashboard view" rule).
 */

import Link from "next/link";
import type { ReactNode } from "react";

interface StatTileProps {
	label: string;
	value: string | number;
	icon: ReactNode;
	/** Tailwind colour class for the icon and value tint, e.g. "text-amber-600" */
	accent: string;
	/** Optional click target — if set the card becomes a navigable Link. */
	href?: string;
}

export function StatTile({ label, value, icon, accent, href }: StatTileProps) {
	const body = (
		<>
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</span>
				<span
					className={`flex size-6 items-center justify-center rounded-[var(--radius)] bg-muted ${accent}`}
				>
					{icon}
				</span>
			</div>
			<span className={`text-2xl font-bold leading-tight ${accent}`}>{value}</span>
		</>
	);
	if (href) {
		return (
			<Link
				href={href}
				className="flex flex-col gap-2 rounded-[var(--radius)] border bg-card px-3 py-2.5 transition-colors hover:border-ring/40 hover:bg-accent/30"
			>
				{body}
			</Link>
		);
	}
	return (
		<div className="flex flex-col gap-2 rounded-[var(--radius)] border bg-card px-3 py-2.5">
			{body}
		</div>
	);
}
