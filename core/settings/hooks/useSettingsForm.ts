"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormReturn, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { ZodType } from "zod/v4";

/**
 * Shared form setup for every settings section.
 * - Wires react-hook-form + zod
 * - Resets dirty state after successful save
 * - Shows toast on success/error
 *
 * WHY THE `any` GENERICS:
 *   `react-hook-form`'s `UseFormReturn` and `useForm` are not generic over the
 *   zod-resolved output type in a way that survives a thin wrapper like this.
 *   Casting `schema as any` is required by `zodResolver`'s typings when the
 *   schema is passed as a generic. These are well-understood, narrow `any`s —
 *   the outer function is still fully typed by `<T extends Record<string, unknown>>`.
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
	// biome-ignore lint/suspicious/noExplicitAny: zod's second type parameter is any by design in its v4 type lattice
	schema: ZodType<T, any>;
	values: T;
	onSubmit: (data: T) => Promise<void>;
}): {
	// biome-ignore lint/suspicious/noExplicitAny: useForm loses its generic through a generic wrapper — see file header
	form: UseFormReturn<any>;
	isSubmitting: boolean;
	isDirty: boolean;
	handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
	isDisabled: boolean;
} {
	// biome-ignore lint/suspicious/noExplicitAny: useForm loses its generic through a generic wrapper — see file header
	const form = useForm<any>({
		// biome-ignore lint/suspicious/noExplicitAny: zodResolver can't narrow the schema parameter through this wrapper
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
