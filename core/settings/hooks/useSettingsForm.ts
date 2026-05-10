"use client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { ZodType } from "zod/v4";

/**
 * Shared form setup for every settings section.
 * - Wires react-hook-form + zod
 * - Resets dirty state after successful save
 * - Shows toast on success/error
 *
 * Usage:
 *   const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
 *     schema: myZodSchema,
 *     values: { name: org.name },
 *     onSubmit: async (data) => { await mutation(data); },
 *   });
 */
export function useSettingsForm<T extends Record<string, unknown>>({
	schema,
	values,
	onSubmit,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	schema: ZodType<T, any>;
	values: T;
	onSubmit: (data: T) => Promise<void>;
}): {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
	isSubmitting: boolean;
	isDirty: boolean;
	handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
	isDisabled: boolean;
} {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const form = useForm<any>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(schema as any),
		values,
	});

	const { isSubmitting, isDirty } = form.formState;

	const handleSubmit = form.handleSubmit(async (data: T) => {
		try {
			await onSubmit(data);
			form.reset(data);
			toast.success("Settings saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save settings");
		}
	});

	return {
		form,
		isSubmitting,
		isDirty,
		handleSubmit,
		isDisabled: isSubmitting || !isDirty,
	};
}
