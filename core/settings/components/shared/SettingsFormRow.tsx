import type { ControllerRenderProps, FieldValues, Path } from "react-hook-form";
import type { Control } from "react-hook-form";

import { cn } from "@/lib/utils";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";

type Props<TValues extends FieldValues, TName extends Path<TValues>> = {
	control: Control<TValues>;
	name: TName;
	label: React.ReactNode;
	description?: React.ReactNode;
	/** Render the input control given the bound field. */
	children: (field: ControllerRenderProps<TValues, TName>) => React.ReactNode;
	/** Force vertical stack (label above control). Default horizontal. */
	vertical?: boolean;
	/** Additional classes for the control wrapper */
	controlClassName?: string;
};

/**
 * A single row inside a settings section that wires up react-hook-form:
 *   [label + description] [control + message]
 *
 * Use this for every form-bound row. For plain toggles or non-form controls
 * (e.g. cookie-based appearance settings), use <SettingsRow> directly.
 */
export function SettingsFormRow<
	TValues extends FieldValues,
	TName extends Path<TValues>,
>({
	control,
	name,
	label,
	description,
	children,
	vertical = false,
	controlClassName,
}: Props<TValues, TName>) {
	if (vertical) {
		return (
			<FormField
				control={control}
				name={name}
				render={({ field }) => (
					<FormItem className="flex flex-col gap-2 space-y-0 py-4">
						<div className="space-y-0.5">
							<FormLabel className="text-sm font-medium leading-none">
								{label}
							</FormLabel>
							{description && (
								<FormDescription className="text-xs">{description}</FormDescription>
							)}
						</div>
						<div className={cn("w-full", controlClassName)}>
							<FormControl>{children(field)}</FormControl>
							<FormMessage className="mt-1" />
						</div>
					</FormItem>
				)}
			/>
		);
	}

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className="flex flex-col gap-3 space-y-0 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
					<div className="min-w-0 flex-1 space-y-0.5">
						<FormLabel className="text-sm font-medium leading-none">
							{label}
						</FormLabel>
						{description && (
							<FormDescription className="text-xs">{description}</FormDescription>
						)}
					</div>
					<div
						className={cn(
							"w-full shrink-0 sm:w-auto sm:min-w-[220px] sm:max-w-sm",
							controlClassName,
						)}
					>
						<FormControl>{children(field)}</FormControl>
						<FormMessage className="mt-1" />
					</div>
				</FormItem>
			)}
		/>
	);
}
