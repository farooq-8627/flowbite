import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
	isSubmitting: boolean;
	isDirty: boolean;
	onReset?: () => void;
	/** Optional override for the submit button label */
	submitLabel?: string;
	/** Classes for the outer row */
	className?: string;
};

/**
 * Save/Reset row for a settings section.
 * Right-aligned, disabled when pristine. Matches shadboard settings pattern.
 */
export function SettingsSaveButton({
	isSubmitting,
	isDirty,
	onReset,
	submitLabel = "Save changes",
	className,
}: Props) {
	const isDisabled = isSubmitting || !isDirty;
	return (
		<div className={cn("flex justify-end gap-2 pt-4", className)}>
			{onReset && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isDisabled}
					onClick={onReset}
				>
					Reset
				</Button>
			)}
			<Button type="submit" size="sm" disabled={isDisabled}>
				{isSubmitting && <Loader2 className="me-2 size-4 animate-spin" />}
				{submitLabel}
			</Button>
		</div>
	);
}
