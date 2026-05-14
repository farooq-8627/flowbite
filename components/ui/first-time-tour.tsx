"use client";

/**
 * FirstTimeTour — sequential coachmarks that explain features the first time
 * a user encounters them, then never show again.
 *
 * Why this exists
 * ───────────────
 * Tooltips are noisy: they re-fire every hover, even after the user understands
 * the feature. A first-time tour fires ONCE per user, points at the right
 * elements with a description, and stays out of the way after that. Power
 * gestures (single-click vs double-click, drag-and-drop, keyboard shortcuts)
 * are exactly what coachmarks are for.
 *
 * Persistence
 * ───────────
 * Completed/dismissed tours are stored in `localStorage` under
 * `flowbite:tours:seen` as a JSON array of tour IDs. The hook checks the array
 * on mount; if the tour is already in there, we render nothing. Dismissing
 * (Got it / Skip / × close) appends the ID and the tour disappears for good.
 *
 * Why localStorage and not Convex
 * ───────────────────────────────
 * Per-device is fine for an in-app feature explanation — there's no need to
 * round-trip the network for "user has seen the kanban tour on this laptop".
 * Switch to `users.preferences.seenTours` later if cross-device sync becomes
 * useful (the API surface stays the same — flip a single internal flag).
 *
 * Targeting
 * ─────────
 * Each step targets a DOM element by `data-tour="<id>"`. The component uses
 * `document.querySelector('[data-tour="<id>"]')` so attribute selectors work
 * for any element type. The element is highlighted with a thin ring + a
 * caption card anchored to it. If the target is missing the step is skipped.
 *
 * Reusable usage
 * ──────────────
 *   1. Tag the elements you want to highlight:
 *        <button data-tour="convert-shortcut">+</button>
 *
 *   2. Drop the tour anywhere in the tree (mount once per route is fine):
 *        <FirstTimeTour
 *          id="leads-board-v1"
 *          steps={[
 *            { target: "convert-shortcut",
 *              title: "One-click convert",
 *              body: "Click once to convert a lead. Double-click to open the
 *                     full form with options." },
 *            { target: "kanban-card-grip",
 *              title: "Drag to change status",
 *              body: "Grab the grip on the right edge of any card to drop it
 *                     into a different column." },
 *          ]}
 *        />
 *
 *   3. The tour fires once, lets the user step through, and never returns.
 *
 * The popover lives inside a Radix `Popover`, but anchored to a virtual
 * element built from the target's bounding box. This keeps the highlight ring
 * and the caption card visually attached even when the target is inside a
 * scroll container.
 */

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TourStep {
	/** Value of `data-tour="…"` on the element to highlight. */
	target: string;
	/** Caption title (~3 words). */
	title: string;
	/** Caption body (one or two sentences). */
	body: React.ReactNode;
	/**
	 * Where to anchor the caption relative to the target. Defaults to "bottom".
	 * If the chosen side overflows the viewport, the component flips to the
	 * opposite side automatically.
	 */
	side?: "top" | "bottom" | "start" | "end";
}

interface FirstTimeTourProps {
	/**
	 * Unique tour identifier. When the user dismisses the tour this id is
	 * persisted to localStorage so the tour never fires again. Bump the
	 * version when you change the steps and want users to see the new tour.
	 */
	id: string;
	/** Sequential steps. Renders top→bottom. */
	steps: TourStep[];
	/** Delay before showing the first step (ms). Default: 600. */
	startDelay?: number;
	/** Disable the tour entirely (e.g. while modal is open). */
	enabled?: boolean;
	/** Override the persistence layer for testing. */
	storage?: TourStorage;
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "flowbite:tours:seen";

export interface TourStorage {
	hasSeen: (id: string) => boolean;
	markSeen: (id: string) => void;
	/** Re-show every tour again (debug helper, surfaced from Settings). */
	reset: () => void;
}

export function createLocalStorageTourStorage(): TourStorage {
	function read(): string[] {
		if (typeof window === "undefined") return [];
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed)
				? parsed.filter((x): x is string => typeof x === "string")
				: [];
		} catch {
			return [];
		}
	}
	function write(list: string[]): void {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
		} catch {
			// quota or private mode — silently no-op
		}
	}
	return {
		hasSeen: (id) => read().includes(id),
		markSeen: (id) => {
			const list = read();
			if (!list.includes(id)) write([...list, id]);
		},
		reset: () => write([]),
	};
}

const defaultStorage = createLocalStorageTourStorage();

/** Imperatively reset every seen tour (debug helper). */
export function resetAllTours() {
	defaultStorage.reset();
}

/** Imperatively check whether a tour has been seen (handy for tests). */
export function hasSeenTour(id: string): boolean {
	return defaultStorage.hasSeen(id);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

export function FirstTimeTour({
	id,
	steps,
	startDelay = 600,
	enabled = true,
	storage = defaultStorage,
}: FirstTimeTourProps) {
	const overlayId = useId();
	const [active, setActive] = useState(false);
	const [stepIdx, setStepIdx] = useState(0);
	const [box, setBox] = useState<Box | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Decide whether to start. Runs once on mount.
	useEffect(() => {
		if (!enabled) return;
		if (steps.length === 0) return;
		if (storage.hasSeen(id)) return;
		const t = window.setTimeout(() => setActive(true), startDelay);
		return () => window.clearTimeout(t);
	}, [enabled, id, steps.length, startDelay, storage]);

	const step = steps[stepIdx];

	const finish = useCallback(() => {
		storage.markSeen(id);
		setActive(false);
		setStepIdx(0);
		setBox(null);
	}, [id, storage]);

	const next = useCallback(() => {
		if (stepIdx >= steps.length - 1) finish();
		else setStepIdx(stepIdx + 1);
	}, [stepIdx, steps.length, finish]);

	const prev = useCallback(() => {
		if (stepIdx > 0) setStepIdx(stepIdx - 1);
	}, [stepIdx]);

	// Re-measure the target whenever the active step changes, the window resizes,
	// or any ancestor scrolls. This keeps the spotlight glued to the element.
	useEffect(() => {
		if (!active || !step) return;
		const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
		if (!target) {
			// Element missing → skip this step. Last step → finish.
			if (stepIdx >= steps.length - 1) finish();
			else setStepIdx(stepIdx + 1);
			return;
		}

		const measure = () => {
			const r = target.getBoundingClientRect();
			setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
		};
		measure();

		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		const ro = new ResizeObserver(measure);
		ro.observe(target);
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
			ro.disconnect();
		};
	}, [active, step, stepIdx, steps.length, finish]);

	// Esc closes the tour entirely.
	useEffect(() => {
		if (!active) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault();
				finish();
			}
			if (e.key === "ArrowRight" || e.key === "Enter") {
				e.preventDefault();
				next();
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				prev();
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [active, next, prev, finish]);

	const captionPosition = useMemo(() => {
		if (!box) return null;
		const padding = 12;
		const captionWidth = 320;
		const captionHeight = 140; // approximate; the popover auto-flips on overflow
		const side = step?.side ?? "bottom";

		// Compute the desired position; clamp to viewport with margin.
		let top = 0;
		let left = 0;
		if (side === "bottom") {
			top = box.top + box.height + padding;
			left = box.left + box.width / 2 - captionWidth / 2;
			if (top + captionHeight > window.innerHeight - padding) {
				top = box.top - captionHeight - padding;
			}
		} else if (side === "top") {
			top = box.top - captionHeight - padding;
			left = box.left + box.width / 2 - captionWidth / 2;
			if (top < padding) top = box.top + box.height + padding;
		} else if (side === "end") {
			top = box.top + box.height / 2 - captionHeight / 2;
			left = box.left + box.width + padding;
			if (left + captionWidth > window.innerWidth - padding) {
				left = box.left - captionWidth - padding;
			}
		} else {
			top = box.top + box.height / 2 - captionHeight / 2;
			left = box.left - captionWidth - padding;
			if (left < padding) left = box.left + box.width + padding;
		}

		left = Math.max(padding, Math.min(left, window.innerWidth - captionWidth - padding));
		top = Math.max(padding, Math.min(top, window.innerHeight - captionHeight - padding));
		return { top, left, width: captionWidth };
	}, [box, step?.side]);

	if (!mounted || !active || !step || !box || !captionPosition) return null;

	const isLast = stepIdx === steps.length - 1;
	const isFirst = stepIdx === 0;

	const overlay = (
		<div
			role="dialog"
			aria-modal="false"
			aria-labelledby={`${overlayId}-title`}
			className="pointer-events-none fixed inset-0 z-50"
		>
			{/* Dimmed backdrop — clicking finishes the tour (soft-dismiss). */}
			<button
				type="button"
				aria-label="Close tour"
				className="pointer-events-auto absolute inset-0 cursor-default border-0 bg-black/30 transition-opacity"
				onClick={finish}
			/>

			{/* Spotlight ring around the target */}
			<div
				aria-hidden
				className="pointer-events-none absolute rounded-[var(--radius)] ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200"
				style={{
					top: box.top - 4,
					left: box.left - 4,
					width: box.width + 8,
					height: box.height + 8,
					boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
				}}
			/>

			{/* Caption card */}
			<div
				className={cn(
					"pointer-events-auto absolute rounded-[var(--radius)] border bg-popover p-4 text-sm shadow-lg",
					"animate-in fade-in zoom-in-95 duration-150",
				)}
				style={{
					top: captionPosition.top,
					left: captionPosition.left,
					width: captionPosition.width,
				}}
			>
				<div className="flex items-start justify-between gap-2 pb-1">
					<h3 id={`${overlayId}-title`} className="text-sm font-semibold leading-tight">
						{step.title}
					</h3>
					<button
						type="button"
						onClick={finish}
						aria-label="Skip tour"
						className="-me-1 -mt-1 rounded-[calc(var(--radius)-2px)] p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<XIcon className="size-3.5" />
					</button>
				</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
				<div className="mt-3 flex items-center justify-between gap-2">
					<span className="text-[10px] tabular-nums text-muted-foreground">
						{stepIdx + 1} / {steps.length}
					</span>
					<div className="flex items-center gap-1.5">
						{!isFirst && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={prev}
							>
								<ChevronLeftIcon className="me-1 size-3" />
								Back
							</Button>
						)}
						<Button
							type="button"
							size="sm"
							className="h-7 gap-1 px-2.5 text-xs"
							onClick={next}
						>
							{isLast ? "Got it" : "Next"}
							{!isLast && <ChevronRightIcon className="size-3" />}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);

	return createPortal(overlay, document.body);
}
