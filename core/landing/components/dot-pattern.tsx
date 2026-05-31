import { cn } from "@/lib/utils";

/**
 * Decorative dotted background grid with a radial fade. Uses neutral border
 * colours that work in both themes. Purely presentational.
 */
export function DotPattern({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] opacity-60 [mask-image:radial-gradient(ellipse_55%_55%_at_50%_45%,#000_60%,transparent_100%)]",
				className,
			)}
		/>
	);
}
