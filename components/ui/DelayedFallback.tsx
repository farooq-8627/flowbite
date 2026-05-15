"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * DelayedFallback — only renders its `fallback` once `delay` ms have elapsed
 * since mount. Prevents flash-of-skeleton-content (FOSC) for queries that
 * resolve quickly from Convex's subscription cache.
 *
 * USAGE:
 *   ```tsx
 *   {data === undefined ? (
 *     <DelayedFallback delay={300} fallback={<Skeleton />}>
 *       {null}
 *     </DelayedFallback>
 *   ) : (
 *     <Content data={data} />
 *   )}
 *   ```
 *
 * WHY 300ms:
 *   - Below ~150ms, humans don't perceive a transition as "loading" — it
 *     feels instant. Convex's reactive cache + warm-route data resolves
 *     in this window for the vast majority of navigations.
 *   - Above ~300ms, users start to notice the lag and benefit from a
 *     loading hint.
 *   - 300ms is the sweet spot: hides the skeleton for cached/fast queries
 *     while still appearing for genuinely slow ones.
 *
 * SCOPE:
 *   - Wrap the *data-dependent slot only*, never the whole page. The
 *     surrounding layout (sidebar, topnav) should always render
 *     synchronously — never inside a delayed fallback.
 */
export function DelayedFallback({
	children,
	fallback,
	delay = 300,
}: {
	children: ReactNode;
	fallback: ReactNode;
	delay?: number;
}) {
	const [show, setShow] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setShow(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return show ? fallback : children;
}
