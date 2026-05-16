"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Sheet — slide-out panel built on Radix Dialog.
 *
 * Sides:
 *   - `top` / `right` / `bottom` / `left`: fixed physical edges (legacy).
 *   - `start` / `end`: RTL-aware. `start` resolves to `left` in LTR and
 *     `right` in RTL; `end` is the inverse. Use these for any sidebar that
 *     should follow text direction.
 *
 * The `start`/`end` paths read `document.documentElement.dir` once at mount
 * and once on each open transition. SSR fallback is LTR (start=left). Since
 * the Sheet's content only mounts when `open === true` (Radix Portal), there
 * is no hydration-mismatch risk for the slide-in animation.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
	return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

type SheetSide = "top" | "right" | "bottom" | "left" | "start" | "end";

/**
 * Resolve a logical `start`/`end` side to a physical `left`/`right` based on
 * the document direction. Reads `document.documentElement.dir` on the client
 * and falls back to LTR on the server.
 */
function useResolvedSide(side: SheetSide): "top" | "right" | "bottom" | "left" {
	const [physical, setPhysical] = React.useState<"top" | "right" | "bottom" | "left">(() => {
		if (side === "top" || side === "right" || side === "bottom" || side === "left") return side;
		// SSR fallback — LTR.
		if (side === "start") return "left";
		return "right";
	});
	React.useEffect(() => {
		if (side !== "start" && side !== "end") {
			setPhysical(side);
			return;
		}
		const isRTL = typeof document !== "undefined" && document.documentElement.dir === "rtl";
		if (side === "start") setPhysical(isRTL ? "right" : "left");
		else setPhysical(isRTL ? "left" : "right");
	}, [side]);
	return physical;
}

function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: SheetSide;
	showCloseButton?: boolean;
}) {
	const physicalSide = useResolvedSide(side);
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				data-side={physicalSide}
				className={cn(
					"fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500",
					physicalSide === "right" &&
						"inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
					physicalSide === "left" &&
						"inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
					physicalSide === "top" &&
						"inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
					physicalSide === "bottom" &&
						"inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close className="absolute top-4 end-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1.5 p-4", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto flex flex-col gap-2 p-4", className)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("font-semibold text-foreground", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
};
