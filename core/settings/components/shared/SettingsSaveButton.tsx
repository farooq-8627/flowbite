import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
	isSubmitting: boolean;
	isDirty: boolean;
	onReset?: () => void;
};

export function SettingsSaveButton({ isSubmitting, isDirty, onReset }: Props) {
	const isDisabled = isSubmitting || !isDirty;
	return (
		<div className="flex justify-end gap-2 pt-4">
			{onReset && (
				<Button type="button" variant="outline" disabled={isDisabled} onClick={onReset}>
					Reset
				</Button>
			)}
			<Button type="submit" disabled={isDisabled}>
				{isSubmitting && <Loader2 className="me-2 size-4 animate-spin" />}
				Save
			</Button>
		</div>
	);
}
