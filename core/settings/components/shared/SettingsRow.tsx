import { cn } from "@/lib/utils";

type Props = {
	label: React.ReactNode;
	description?: React.ReactNode;
	/** If true, render the row vertically (label on top, control below).
	 *  Used rarely — for controls that need full width like long textareas. */
	vertical?: boolean;
	/** If true, align items to start (useful for multi-line controls). Default: center. */
	alignStart?: boolean;
	/** Additional classes for the control wrapper */
	controlClassName?: string;
	/** Additional classes for the outer row */
	className?: string;
	children: React.ReactNode;
};

/**
 * A single settings row inside a SettingsSection.
 *
 * Horizontal layout (default):
 *   [label + description .........................] [control]
 *
 * The label block takes remaining space; the control stays at a fixed min-width
 * aligned to the inline-end. Works correctly in both LTR and RTL.
 */
export function SettingsRow({
	label,
	description,
	vertical = false,
	alignStart = false,
	controlClassName,
	className,
	children,
}: Props) {
	if (vertical) {
		return (
			<div className={cn("flex flex-col gap-2 py-4", className)}>
				<div className="space-y-0.5">
					<div className="text-sm font-medium leading-none">{label}</div>
					{description && (
						<div className="text-xs text-muted-foreground">{description}</div>
					)}
				</div>
				<div className={cn("w-full", controlClassName)}>{children}</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
				alignStart && "sm:items-start",
				className,
			)}
		>
			<div className="min-w-0 flex-1 space-y-0.5">
				<div className="text-sm font-medium leading-none">{label}</div>
				{description && (
					<div className="text-xs text-muted-foreground">{description}</div>
				)}
			</div>
			<div
				className={cn(
					"w-full shrink-0 sm:w-auto sm:min-w-[220px] sm:max-w-sm",
					controlClassName,
				)}
			>
				{children}
			</div>
		</div>
	);
}
