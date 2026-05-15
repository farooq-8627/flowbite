"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * RouteProgress — a 2px progress bar pinned to the top of the viewport that
 * animates while a route transition is in flight.
 *
 * Pattern (GitHub / YouTube / Vercel docs):
 *   - User clicks an internal `<a>` → bar starts at 20%, ramps to 80%
 *     across 500ms.
 *   - When `usePathname()` / `useSearchParams()` change → the new route
 *     finished rendering, snap to 100%, fade out.
 *   - If user clicks again before completion, restart the cycle.
 *
 * WHY THIS PATTERN:
 *   - Cheap visual ack of nav. Doesn't block content (unlike a full-page
 *     skeleton). Plays nicely with Convex query subscriptions that hydrate
 *     synchronously from cache on warm routes.
 *   - Uses click capture instead of router events so it fires reliably
 *     across both `<Link>` and `router.push()` triggers — and we avoid the
 *     Next.js App Router quirk of not exposing `routeChangeStart`.
 *
 * USAGE:
 *   Mount once, near the top of the dashboard layout. Don't put it inside
 *   the main scroll container — it's `position: fixed`.
 */
export function RouteProgress() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [progress, setProgress] = useState(0);
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

	const clearTimers = useCallback(() => {
		for (const t of timersRef.current) clearTimeout(t);
		timersRef.current = [];
	}, []);

	// Path/search changed → the navigation completed. Snap to 100, fade out.
	// Mounted with progress=0 (no nav in flight), so first render is a no-op.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname + searchParams are the trigger; intentionally omit `progress` to avoid restart loops
	useEffect(() => {
		if (progress === 0) return;
		clearTimers();
		setProgress(100);
		const t = setTimeout(() => setProgress(0), 200);
		timersRef.current = [t];
		return () => clearTimers();
	}, [pathname, searchParams, clearTimers]);

	// Listen for clicks on internal links → start the ramp.
	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			// Ignore modified clicks (open in new tab, etc.)
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
			const target = (e.target as HTMLElement | null)?.closest?.("a");
			if (!target) return;

			const href = target.getAttribute("href");
			if (!href) return;
			// Only animate for in-app navigation
			if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
				return;
			if (target.target === "_blank") return;

			// External http(s) links → let the browser handle it
			if (/^https?:\/\//i.test(href)) {
				try {
					const url = new URL(href);
					if (url.origin !== window.location.origin) return;
				} catch {
					return;
				}
			}

			// Internal nav: start the ramp
			clearTimers();
			setProgress(20);
			const t1 = setTimeout(() => setProgress(50), 100);
			const t2 = setTimeout(() => setProgress(80), 350);
			timersRef.current = [t1, t2];
		};

		document.addEventListener("click", onClick, true);
		return () => {
			document.removeEventListener("click", onClick, true);
			clearTimers();
		};
	}, [clearTimers]);

	if (progress === 0) return null;

	return (
		<div
			aria-hidden
			className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-primary transition-[width,opacity] duration-200 ease-out"
			style={{
				width: `${progress}%`,
				opacity: progress >= 100 ? 0 : 1,
			}}
		/>
	);
}
