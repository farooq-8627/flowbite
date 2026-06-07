"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import type { OrgSettings } from "../../../types";
import { SettingsFormRow } from "../../shared/SettingsFormRow";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSaveButton } from "../../shared/SettingsSaveButton";
import { SettingsSection } from "../../shared/SettingsSection";

const TIMEZONES = [
	{ value: "UTC", label: "UTC" },
	{ value: "Asia/Dubai", label: "Dubai (UTC+4)" },
	{ value: "Asia/Riyadh", label: "Riyadh (UTC+3)" },
	{ value: "Asia/Kuwait", label: "Kuwait (UTC+3)" },
	{ value: "Asia/Bahrain", label: "Bahrain (UTC+3)" },
	{ value: "Asia/Qatar", label: "Qatar (UTC+3)" },
	{ value: "Asia/Muscat", label: "Muscat (UTC+4)" },
	{ value: "Asia/Karachi", label: "Karachi (UTC+5)" },
	{ value: "Asia/Kolkata", label: "India (UTC+5:30)" },
	{ value: "Europe/London", label: "London (UTC+0/+1)" },
	{ value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
	{ value: "America/New_York", label: "New York (UTC-5/-4)" },
	{ value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
];

const CURRENCIES = [
	{ value: "AED", label: "AED: UAE Dirham" },
	{ value: "SAR", label: "SAR: Saudi Riyal" },
	{ value: "KWD", label: "KWD: Kuwaiti Dinar" },
	{ value: "QAR", label: "QAR: Qatari Riyal" },
	{ value: "BHD", label: "BHD: Bahraini Dinar" },
	{ value: "OMR", label: "OMR: Omani Rial" },
	{ value: "USD", label: "USD: US Dollar" },
	{ value: "EUR", label: "EUR: Euro" },
	{ value: "GBP", label: "GBP: British Pound" },
	{ value: "INR", label: "INR: Indian Rupee" },
	{ value: "PKR", label: "PKR: Pakistani Rupee" },
];

const generalSchema = z.object({
	name: z.string().min(2, "At least 2 characters").max(80),
	timezone: z.string().min(1),
	defaultCurrency: z.string().min(1),
});

export function GeneralSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: generalSchema,
		values: {
			name: org.name,
			timezone: org.settings?.timezone ?? "UTC",
			defaultCurrency: org.settings?.defaultCurrency ?? "USD",
		},
		onSubmit: async (data) => {
			await update({
				orgId,
				name: data.name,
				settings: {
					timezone: data.timezone,
					defaultCurrency: data.defaultCurrency,
				},
			});
		},
	});

	return (
		<SettingsSection
			id="workspace.general"
			title="General"
			description="Basic information about your workspace."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					<SettingsFormRow
						control={form.control}
						name="name"
						label="Workspace name"
						description="Shown across the app and in emails to your team."
					>
						{(field) => <Input placeholder="Acme Corp" {...field} />}
					</SettingsFormRow>

					<SettingsRow
						label="Workspace URL"
						description="Set during onboarding — this cannot be changed."
					>
						<Input value={org.slug} readOnly disabled />
					</SettingsRow>

					<SettingsFormRow
						control={form.control}
						name="timezone"
						label="Timezone"
						description="Used for timestamps and scheduled reminders."
					>
						{(field) => (
							<Select onValueChange={field.onChange} value={field.value}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select timezone" />
								</SelectTrigger>
								<SelectContent>
									{TIMEZONES.map((tz) => (
										<SelectItem key={tz.value} value={tz.value}>
											{tz.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="defaultCurrency"
						label="Default currency"
						description="Used when creating deals and quotes."
					>
						{(field) => (
							<Select onValueChange={field.onChange} value={field.value}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select currency" />
								</SelectTrigger>
								<SelectContent>
									{CURRENCIES.map((c) => (
										<SelectItem key={c.value} value={c.value}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</SettingsFormRow>

					{org.industry && (
						<SettingsRow
							label="Industry"
							description="Set when you ran the AI workspace setup."
						>
							<Input value={org.industry} readOnly disabled />
						</SettingsRow>
					)}

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
