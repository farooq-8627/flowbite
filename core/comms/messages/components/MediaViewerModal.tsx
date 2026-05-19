"use client";

/**
 * MediaViewerModal — image / video lightbox.
 *
 * Two layouts driven by `useIsMobile()`:
 *   - Desktop: centered modal (max 90vw × 90vh) with a toolbar of zoom
 *     controls (in / out / reset / fit), drag-to-pan, scroll-wheel zoom
 *     (over images only).
 *   - Mobile: full-screen dark backdrop, no card, swipe gestures handled
 *     by the browser's native pinch-zoom (`touch-action: pinch-zoom`).
 *
 * Both layouts render inside a shared Radix `Dialog` so the focus trap,
 * Escape-to-close, and aria-labelling are correct.
 *
 * Files come in as `MediaFile[]` — caller is responsible for filtering to
 * image/video only. Index navigates via Arrow keys (desktop) or by tapping
 * left/right halves of the screen (mobile).
 *
 * Why a custom impl, not a library? We already use Radix Dialog throughout
 * the app, the gestures we need are minimal, and bringing in `react-photo-view`
 * or similar would double the messages bundle.
 *
 * 2026-05-17 fixes (per user direction):
 *   - The Dialog primitive renders its own auto-close X (top-right), AND we
 *     used to render another <DialogClose> next to the toolbar — two X's.
 *     Disabled the auto-close (`showCloseButton={false}`); the inline one
 *     stays. Also moved the inline button to use logical `end-*` so it
 *     doesn't visually duplicate under RTL.
 *   - The toolbar's "Maximize" icon used to call `setScale(1)` (reset zoom)
 *     even though the icon clearly reads "fullscreen". It now calls the
 *     browser's Fullscreen API on the modal stage. A separate "Reset zoom"
 *     button (RotateCcw icon) handles zoom-reset explicitly.
 */

import {
	ChevronLeft,
	ChevronRight,
	Download,
	Maximize,
	Minus,
	Plus,
	RotateCcw,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type MediaFile = {
	id: string;
	name: string;
	url: string;
	mimeType: string;
};

type Props = {
	files: MediaFile[];
	/** Index of the file to show on open. */
	startIndex?: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;

export function MediaViewerModal({ files, startIndex = 0, open, onOpenChange }: Props) {
	const isMobile = useIsMobile();
	const [index, setIndex] = useState(startIndex);
	const [scale, setScale] = useState(1);
	const [translate, setTranslate] = useState({ x: 0, y: 0 });
	const dragOriginRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);

	// Real fullscreen via the Fullscreen API. We target the stage element
	// (image / video) rather than the whole modal so the OS chrome around
	// the dialog doesn't render at fullscreen. Falls back gracefully if the
	// browser denies the request (Safari iOS, in-app webviews, etc.).
	const requestFullscreen = useCallback(() => {
		const el = stageRef.current;
		if (!el) return;
		if (document.fullscreenElement) {
			void document.exitFullscreen?.();
			return;
		}
		const req = el.requestFullscreen?.bind(el);
		if (req) {
			req().catch(() => {
				// ignore — user-rejected or unsupported
			});
		}
	}, []);

	// Reset when target file changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: index is the actual trigger
	useEffect(() => {
		setScale(1);
		setTranslate({ x: 0, y: 0 });
	}, [index]);

	// Sync the index when consumer changes the requested start.
	useEffect(() => {
		if (open) setIndex(startIndex);
	}, [open, startIndex]);

	const file = files[index];
	const isImage = file?.mimeType?.startsWith("image/") ?? false;
	const isVideo = file?.mimeType?.startsWith("video/") ?? false;

	const next = useCallback(() => {
		if (files.length <= 1) return;
		setIndex((i) => (i + 1) % files.length);
	}, [files.length]);
	const prev = useCallback(() => {
		if (files.length <= 1) return;
		setIndex((i) => (i - 1 + files.length) % files.length);
	}, [files.length]);

	// Keyboard nav (desktop).
	useEffect(() => {
		if (!open || isMobile) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") next();
			else if (e.key === "ArrowLeft") prev();
			else if (e.key === "+" || e.key === "=")
				setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
			else if (e.key === "-") setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
			else if (e.key === "0") {
				setScale(1);
				setTranslate({ x: 0, y: 0 });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, isMobile, next, prev]);

	// Wheel zoom over images (desktop).
	const onWheel = useCallback(
		(e: React.WheelEvent<HTMLDivElement>) => {
			if (isMobile || !isImage) return;
			e.preventDefault();
			const dir = e.deltaY < 0 ? 1 : -1;
			setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + dir * SCALE_STEP)));
		},
		[isMobile, isImage],
	);

	// Drag-to-pan (desktop, only when zoomed in).
	const onMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (isMobile || scale <= 1) return;
			dragOriginRef.current = {
				x: e.clientX,
				y: e.clientY,
				tx: translate.x,
				ty: translate.y,
			};
		},
		[isMobile, scale, translate.x, translate.y],
	);
	const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		if (!dragOriginRef.current) return;
		const dx = e.clientX - dragOriginRef.current.x;
		const dy = e.clientY - dragOriginRef.current.y;
		setTranslate({
			x: dragOriginRef.current.tx + dx,
			y: dragOriginRef.current.ty + dy,
		});
	}, []);
	const onMouseUp = useCallback(() => {
		dragOriginRef.current = null;
	}, []);

	const transformStyle = useMemo<React.CSSProperties>(
		() => ({
			transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
			transformOrigin: "center center",
			transition: dragOriginRef.current ? "none" : "transform 120ms ease-out",
		}),
		[translate.x, translate.y, scale],
	);

	if (!file) return null;

	const Toolbar = (
		<div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-white backdrop-blur">
			{isImage && (
				<>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7 text-white hover:bg-white/10"
						aria-label="Zoom out"
						onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
						disabled={scale <= MIN_SCALE}
					>
						<Minus className="size-4" aria-hidden="true" />
					</Button>
					<span className="min-w-12 text-center text-xs tabular-nums">
						{Math.round(scale * 100)}%
					</span>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7 text-white hover:bg-white/10"
						aria-label="Zoom in"
						onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
						disabled={scale >= MAX_SCALE}
					>
						<Plus className="size-4" aria-hidden="true" />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7 text-white hover:bg-white/10"
						aria-label="Reset zoom"
						title="Reset zoom"
						onClick={() => {
							setScale(1);
							setTranslate({ x: 0, y: 0 });
						}}
					>
						<RotateCcw className="size-4" aria-hidden="true" />
					</Button>
				</>
			)}
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="size-7 text-white hover:bg-white/10"
				aria-label="Toggle fullscreen"
				title="Fullscreen"
				onClick={requestFullscreen}
			>
				<Maximize className="size-4" aria-hidden="true" />
			</Button>
			<a
				href={file.url}
				download={file.name}
				className="flex size-7 items-center justify-center rounded-full text-white hover:bg-white/10"
				aria-label="Download"
				target="_blank"
				rel="noopener noreferrer"
			>
				<Download className="size-4" aria-hidden="true" />
			</a>
		</div>
	);

	// Stage — for desktop, this contains the absolutely-positioned media so
	// the parent's natural size is the media's intrinsic size constrained by
	// `max-w-[90vw] max-h-[calc(90vh-3rem)]`. Mobile uses the same JSX but
	// fills the full screen via the parent's flex-1.
	const Stage = (
		// biome-ignore lint/a11y/noStaticElementInteractions: Stage handles wheel/drag for zoom-and-pan; semantic role would mislead AT.
		<div
			ref={stageRef}
			className={cn(
				"relative flex items-center justify-center overflow-hidden bg-black",
				// Mobile fills its flex-1 parent. Desktop is intrinsic-sized
				// by the inner media (max-w/max-h on the <img>/<video>).
				isMobile ? "size-full" : "min-h-0",
				scale > 1 && !isMobile && "cursor-grab active:cursor-grabbing",
			)}
			onWheel={onWheel}
			onMouseDown={onMouseDown}
			onMouseMove={onMouseMove}
			onMouseUp={onMouseUp}
			onMouseLeave={onMouseUp}
			style={{ touchAction: isMobile ? "pinch-zoom" : "none" }}
		>
			{isImage && (
				// biome-ignore lint/performance/noImgElement: Convex signed URL — next/image not applicable.
				<img
					src={file.url}
					alt={file.name}
					draggable={false}
					className={cn(
						"select-none object-contain",
						// On desktop the image's natural size drives the
						// dialog width; mobile uses the full screen.
						isMobile ? "max-h-full max-w-full" : "max-h-[calc(90vh-3rem)] max-w-[90vw]",
					)}
					style={transformStyle}
				/>
			)}
			{isVideo && (
				<video
					src={file.url}
					controls
					autoPlay
					playsInline
					className={cn(
						"object-contain",
						isMobile ? "max-h-full max-w-full" : "max-h-[calc(90vh-3rem)] max-w-[90vw]",
					)}
				>
					<track kind="captions" />
				</video>
			)}
		</div>
	);

	const NavButtons = files.length > 1 && (
		<>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="absolute start-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/50 text-white hover:bg-black/70"
				aria-label="Previous"
				onClick={prev}
			>
				<ChevronLeft className="size-5" aria-hidden="true" />
			</Button>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="absolute end-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/50 text-white hover:bg-black/70"
				aria-label="Next"
				onClick={next}
			>
				<ChevronRight className="size-5" aria-hidden="true" />
			</Button>
		</>
	);

	if (isMobile) {
		// Full-screen dark backdrop, no card.
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					showCloseButton={false}
					className="fixed inset-0 left-0 top-0 max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 text-white"
					style={{ height: "100dvh" }}
				>
					<DialogTitle className="sr-only">{file.name}</DialogTitle>
					<div className="flex items-center justify-between px-3 py-2">
						<span className="truncate text-sm">{file.name}</span>
						<DialogClose asChild>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8 text-white hover:bg-white/10"
								aria-label="Close"
							>
								<X className="size-4" aria-hidden="true" />
							</Button>
						</DialogClose>
					</div>
					<div className="relative flex-1">
						{Stage}
						{NavButtons}
					</div>
					<div className="flex justify-center pb-3">{Toolbar}</div>
				</DialogContent>
			</Dialog>
		);
	}

	// Desktop modal.
	//
	// The media drives the modal size (Twitter / Instagram / lightgallery
	// pattern). The <img> / <video> inside `Stage` carries
	// `max-w-[90vw] max-h-[calc(90vh-3rem)]` + `object-contain`, so:
	//   - 16:9 landscape → width binds at 90vw, height adjusts proportionally
	//   - 9:16 portrait  → height binds at 90vh-3rem, width adjusts (~25vw)
	// The DialogContent uses `w-fit max-w-[95vw]` so it shrink-wraps the
	// media's natural rendered size — no wasted black space on the sides
	// for portrait videos. We also override the base dialog's `grid` with
	// `flex flex-col` so the toolbar row + stage stack without grid
	// auto-sizing fighting the intrinsic-width layout.
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="flex h-fit max-h-[95vh] w-fit max-w-[95vw] flex-col gap-0 overflow-hidden border-0 bg-black p-0 text-white sm:max-w-[95vw]"
			>
				<DialogTitle className="sr-only">{file.name}</DialogTitle>
				<div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
					<span className="truncate text-sm">{file.name}</span>
					<div className="flex shrink-0 items-center gap-2">
						{Toolbar}
						<DialogClose asChild>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8 text-white hover:bg-white/10"
								aria-label="Close"
							>
								<X className="size-4" aria-hidden="true" />
							</Button>
						</DialogClose>
					</div>
				</div>
				<div className="relative flex min-h-0 flex-1 items-center justify-center">
					{Stage}
					{NavButtons}
				</div>
			</DialogContent>
		</Dialog>
	);
}
