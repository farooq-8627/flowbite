import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
	isSubmitting: boolean;
	isDirty: boolean;
	onReset?: () => void;
};

/**
 * Shadboard-style save button row.
 * w-fit, left-aligned, disabled when pristine — matches shadboard ButtonLoading pattern.
 */
export function SettingsSaveButton({ isSubmitting, isDirty, onReset }: Props) {
	const isDisabled = isSubmitting || !isDirty;
	return (
		<div className="flex items-center gap-2 mt-2">
			<Button type="submit" size="default" className="w-fit" disabled={isDisabled}>
				{isSubmitting && <Loader2 className="me-2 size-4 animate-spin" />}
				Save
			</Button>
			{onReset && (
				<Button type="button" variant="secondary" size="default" className="w-fit" disabled={isDisabled} onClick={onReset}>
					Reset
				</Button>
			)}
		</div>
	);
}
