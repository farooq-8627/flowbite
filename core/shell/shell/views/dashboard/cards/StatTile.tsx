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
 * 2026-05-30 — number weight bumped from `text-2xl` to `text-4xl` and
 * a `min-h-[110px]` floor added so KPI numbers read as the headline of
 * the card (per the "show the numbers big" dashboard feedback). Icon
 * bumped one size class (size-6 → size-7) for visual parity.
 *
 * 2026-05-30 (mobile overflow fix) — value font size made responsive:
 * `text-3xl sm:text-4xl` so a wide currency string like `$263,500`
 * fits inside a 2-column mobile grid (each tile is ~144px wide on
 * a 320px viewport — the prior fixed `text-4xl` rendered the value
 * at ~260px and forced horizontal overflow). The `min-w-0 truncate`
 * pair guarantees an even longer string (e.g. `$2,635,500`) clips
 * cleanly with an ellipsis instead of pushing the dashboard wider.
 *
 * Used by `<DashboardHomeView />` for the four KPI tiles in row 1.
 * One file per card (per AGENTS.md "no monolith dashboard view" rule).
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
			<div className="flex items-center justify-between gap-2 min-w-0">
				<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
					{label}
				</span>
				<span
					className={`flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-muted ${accent}`}
				>
					{icon}
				</span>
			</div>
			<span
				className={`text-3xl sm:text-4xl font-bold leading-none tabular-nums tracking-tight truncate ${accent}`}
				title={typeof value === "string" ? value : undefined}
			>
				{value}
			</span>
		</>
	);
	if (href) {
		return (
			<Link
				href={href}
				className="flex flex-col justify-between gap-4 rounded-[var(--radius)] border bg-card px-4 py-4 transition-colors hover:border-ring/40 hover:bg-accent/30 min-h-[110px] min-w-0 overflow-hidden"
			>
				{body}
			</Link>
		);
	}
	return (
		<div className="flex flex-col justify-between gap-4 rounded-[var(--radius)] border bg-card px-4 py-4 min-h-[110px] min-w-0 overflow-hidden">
			{body}
		</div>
	);
}
