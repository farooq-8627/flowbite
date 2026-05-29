"use client";

/**
 * components/ui/sparkline.tsx
 *
 * Minimal RTL-safe SVG sparkline. No external chart library — recharts
 * pulls in 80kb gzipped and we only need a single thin trend line +
 * area-fill for dashboard tiles.
 *
 * Why pure SVG over recharts:
 *   - 0 runtime cost beyond what React already pays.
 *   - RTL-friendly: SVG `viewBox` x-axis flips by adding `dir="rtl"` on
 *     a parent and applying `transform: scaleX(-1)` only on the path
 *     when the user's locale is RTL.
 *   - Tokenised: stroke + fill default to `currentColor`; consumers
 *     wrap in a coloured span (`<span className="text-emerald-600">…`).
 *   - Lifted-and-trimmed from
 *     `~/Clones/Orbitly/shadcn-dashboard-2/src/features/overview/components/area-graph.tsx`.
 *
 * Stage 2 of /DASHBOARD-V2-PLAN.md (2026-05-29) — first consumer is
 * `<SalesPipelinePanel>` Forecast tab's 12-week cumulative-won line.
 *
 * Conventions:
 *   - Y-axis is auto-scaled to `[0, max(values)]`. A floor of 1 stops a
 *     flat-zero series from collapsing the path into NaN.
 *   - X positions are evenly spaced; the data prop is responsible for
 *     ordering oldest → newest.
 *   - `area={true}` (default) renders a faint fill below the line so a
 *     low-contrast trend still reads at 16-px height.
 */

import { cn } from "@/lib/utils";

export interface SparklineProps {
	/** Ordered values, oldest first. Empty array renders a flat baseline. */
	values: readonly number[];
	/** Pixel width — defaults to `100%` of container via SVG. */
	width?: number | string;
	/** Pixel height — used as the SVG viewBox height. */
	height?: number;
	/** Stroke width in user units. */
	strokeWidth?: number;
	/**
	 * Render the soft area-fill under the line. Default `true`. Disable
	 * when the parent container is short and noisy.
	 */
	area?: boolean;
	/** ARIA label for screen readers. Required for non-decorative use. */
	"aria-label"?: string;
	className?: string;
}

const VIEW_W = 100; // virtual units; SVG scales to container

export function Sparkline({
	values,
	width = "100%",
	height = 32,
	strokeWidth = 1.5,
	area = true,
	className,
	"aria-label": ariaLabel,
}: SparklineProps) {
	if (values.length === 0) {
		return (
			<svg
				className={cn("text-muted-foreground", className)}
				width={width}
				height={height}
				viewBox={`0 0 ${VIEW_W} ${height}`}
				preserveAspectRatio="none"
				aria-hidden={ariaLabel ? undefined : true}
				aria-label={ariaLabel}
				role={ariaLabel ? "img" : undefined}
			>
				<line
					x1={0}
					x2={VIEW_W}
					y1={height / 2}
					y2={height / 2}
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeOpacity={0.3}
				/>
			</svg>
		);
	}

	// Scale: max with a floor of 1 so a flat-zero series doesn't divide
	// by zero. Min always pinned to 0 — sparkline anchors at the baseline.
	const max = Math.max(1, ...values);
	const stepX = values.length === 1 ? 0 : VIEW_W / (values.length - 1);

	const points = values.map((v, i) => {
		const x = stepX * i;
		// Invert y: SVG origin is top-left, we want larger values higher.
		const y = height - (v / max) * height;
		return { x, y };
	});

	const linePath = points
		.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
		.join(" ");

	const areaPath = area
		? `${linePath} L${points[points.length - 1].x.toFixed(2)},${height} L${points[0].x.toFixed(2)},${height} Z`
		: undefined;

	return (
		<svg
			className={cn("text-primary", className)}
			width={width}
			height={height}
			viewBox={`0 0 ${VIEW_W} ${height}`}
			preserveAspectRatio="none"
			aria-hidden={ariaLabel ? undefined : true}
			aria-label={ariaLabel}
			role={ariaLabel ? "img" : undefined}
		>
			{areaPath && <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" />}
			<path
				d={linePath}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
