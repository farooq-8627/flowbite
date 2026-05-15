"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import type { OrgSettings } from "../../../types";
import { resolveEntityLabels } from "../../../types";
import { FloatingLabelInput } from "../../shared/FloatingLabelInput";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSaveButton } from "../../shared/SettingsSaveButton";
import { SettingsSection } from "../../shared/SettingsSection";

const ENTITY_KEYS = ["lead", "contact", "deal", "company"] as const;

const labelShape = z.object({
	singular: z.string().min(1, "Required").max(40),
	plural: z.string().min(1, "Required").max(40),
	slug: z
		.string()
		.min(1, "Required")
		.max(40)
		.regex(/^[a-z0-9-]+$/, "lowercase, numbers, hyphens only"),
});

const entityLabelsSchema = z.object({
	lead: labelShape,
	contact: labelShape,
	deal: labelShape,
	company: labelShape,
});

export function EntityLabelsSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const labels = resolveEntityLabels(org.entityLabels);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: entityLabelsSchema,
		values: {
			lead: labels.lead,
			contact: labels.contact,
			deal: labels.deal,
			company: labels.company,
		},
		onSubmit: async (data) => {
			await update({ orgId, entityLabels: data });
		},
	});

	return (
		<SettingsSection
			id="workspace.entity-labels"
			title="Entity Labels"
			description="Rename CRM entities to match your industry. Changes propagate everywhere instantly."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					{ENTITY_KEYS.map((key) => {
						const current = labels[key];
						return (
							<SettingsRow
								key={key}
								label={current.singular}
								description={`Singular + plural names and URL slug for "${current.singular}".`}
								alignStart
								controlClassName="sm:max-w-none sm:min-w-[480px] sm:flex-1"
								vertical={false}
							>
								<div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
									<EntityLabelField
										control={form.control}
										name={`${key}.singular`}
										floatingLabel="Singular"
										placeholder={current.singular}
									/>
									<EntityLabelField
										control={form.control}
										name={`${key}.plural`}
										floatingLabel="Plural"
										placeholder={current.plural}
									/>
									<div className="col-span-2 xl:col-span-1">
										<EntityLabelField
											control={form.control}
											name={`${key}.slug`}
											floatingLabel="Slug"
											placeholder={current.slug}
										/>
									</div>
								</div>
							</SettingsRow>
						);
					})}
					<SettingsSaveButton
						isSubmitting={isSubmitting}
						isDirty={isDirty}
						onReset={() => form.reset()}
					/>
				</form>
			</Form>
		</SettingsSection>
	);
}

function EntityLabelField({
	control,
	name,
	floatingLabel,
	placeholder,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: bound to useForm<any>
	control: any;
	name: string;
	floatingLabel: string;
	placeholder?: string;
}) {
	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className="space-y-1">
					<FormControl>
						<FloatingLabelInput
							label={floatingLabel}
							placeholder={placeholder}
							aria-label={floatingLabel}
							{...field}
						/>
					</FormControl>
					<FormMessage className="text-[10px]" />
				</FormItem>
			)}
		/>
	);
}
