"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import type { OrgSettings } from "../../../types";
import { resolveEntityLabels } from "../../../types";
import { SettingsFormRow } from "../../shared/SettingsFormRow";
import { SettingsSaveButton } from "../../shared/SettingsSaveButton";
import { SettingsSection } from "../../shared/SettingsSection";

const prefixSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.max(5, "Max 5 characters")
	.regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers, hyphens only");

const codePrefixesSchema = z.object({
	person: prefixSchema,
	deal: prefixSchema,
	company: prefixSchema,
	followup: prefixSchema,
});

export function CodePrefixesSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const labels = resolveEntityLabels(org.entityLabels);
	const prefixes = org.settings?.codePrefixes ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: codePrefixesSchema,
		values: {
			person: prefixes.person ?? "P",
			deal: prefixes.deal ?? "D",
			company: prefixes.company ?? "C",
			followup: prefixes.followup ?? "FU",
		},
		onSubmit: async (data) => {
			await update({
				orgId,
				settings: { codePrefixes: data },
			});
		},
	});

	const values = form.watch();

	return (
		<SettingsSection
			id="workspace.record-codes"
			title="Record Codes"
			description="Prefix used when generating unique codes for new records (e.g. P-001)."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					<SettingsFormRow
						control={form.control}
						name="person"
						label="People"
						description={`Next person code will look like ${values.person || "P"}-043.`}
					>
						{(field) => <Input maxLength={5} {...field} />}
					</SettingsFormRow>
					<SettingsFormRow
						control={form.control}
						name="deal"
						label={labels.deal.plural}
						description={`Next ${labels.deal.singular.toLowerCase()} code will look like ${values.deal || "D"}-072.`}
					>
						{(field) => <Input maxLength={5} {...field} />}
					</SettingsFormRow>
					<SettingsFormRow
						control={form.control}
						name="company"
						label={labels.company.plural}
						description={`Next ${labels.company.singular.toLowerCase()} code will look like ${values.company || "C"}-015.`}
					>
						{(field) => <Input maxLength={5} {...field} />}
					</SettingsFormRow>
					<SettingsFormRow
						control={form.control}
						name="followup"
						label="Follow-ups"
						description={`Next follow-up code will look like ${values.followup || "FU"}-001.`}
					>
						{(field) => <Input maxLength={5} {...field} />}
					</SettingsFormRow>
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
