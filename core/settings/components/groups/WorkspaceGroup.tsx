"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsFormRow } from "../shared/SettingsFormRow";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { FloatingLabelInput } from "../shared/FloatingLabelInput";
import { Form, FormField, FormControl, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const TIMEZONES = [
	{ value: "UTC",                 label: "UTC" },
	{ value: "Asia/Dubai",          label: "Dubai (UTC+4)" },
	{ value: "Asia/Riyadh",         label: "Riyadh (UTC+3)" },
	{ value: "Asia/Kuwait",         label: "Kuwait (UTC+3)" },
	{ value: "Asia/Bahrain",        label: "Bahrain (UTC+3)" },
	{ value: "Asia/Qatar",          label: "Qatar (UTC+3)" },
	{ value: "Asia/Muscat",         label: "Muscat (UTC+4)" },
	{ value: "Asia/Karachi",        label: "Karachi (UTC+5)" },
	{ value: "Asia/Kolkata",        label: "India (UTC+5:30)" },
	{ value: "Europe/London",       label: "London (UTC+0/+1)" },
	{ value: "Europe/Paris",        label: "Paris (UTC+1/+2)" },
	{ value: "America/New_York",    label: "New York (UTC-5/-4)" },
	{ value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
];

const CURRENCIES = [
	{ value: "AED", label: "AED — UAE Dirham" },
	{ value: "SAR", label: "SAR — Saudi Riyal" },
	{ value: "KWD", label: "KWD — Kuwaiti Dinar" },
	{ value: "QAR", label: "QAR — Qatari Riyal" },
	{ value: "BHD", label: "BHD — Bahraini Dinar" },
	{ value: "OMR", label: "OMR — Omani Rial" },
	{ value: "USD", label: "USD — US Dollar" },
	{ value: "EUR", label: "EUR — Euro" },
	{ value: "GBP", label: "GBP — British Pound" },
	{ value: "INR", label: "INR — Indian Rupee" },
	{ value: "PKR", label: "PKR — Pakistani Rupee" },
];

// ────────────────────────────────────────────────────────────────────────────
// General — org name, timezone, currency
// ────────────────────────────────────────────────────────────────────────────

const generalSchema = z.object({
	name:            z.string().min(2, "At least 2 characters").max(80),
	timezone:        z.string().min(1),
	defaultCurrency: z.string().min(1),
});

function GeneralSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: generalSchema,
		values: {
			name:            org.name,
			timezone:        org.settings?.timezone        ?? "UTC",
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

// ────────────────────────────────────────────────────────────────────────────
// Entity Labels
// ────────────────────────────────────────────────────────────────────────────

const labelShape = z.object({
	singular: z.string().min(1, "Required").max(40),
	plural:   z.string().min(1, "Required").max(40),
	slug:     z.string().min(1, "Required").max(40).regex(/^[a-z0-9-]+$/, "lowercase, numbers, hyphens only"),
});

const entityLabelsSchema = z.object({
	lead:    labelShape,
	contact: labelShape,
	deal:    labelShape,
	company: labelShape,
});

const ENTITY_KEYS = ["lead", "contact", "deal", "company"] as const;
const ENTITY_DISPLAY: Record<typeof ENTITY_KEYS[number], string> = {
	lead:    "Lead",
	contact: "Contact",
	deal:    "Deal",
	company: "Company",
};

function EntityLabelsSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const labels = resolveEntityLabels(org.entityLabels);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: entityLabelsSchema,
		values: {
			lead:    labels.lead,
			contact: labels.contact,
			deal:    labels.deal,
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
					{ENTITY_KEYS.map((key) => (
						<SettingsRow
							key={key}
							label={ENTITY_DISPLAY[key]}
							description={`Singular + plural names and URL slug for "${ENTITY_DISPLAY[key]}".`}
							alignStart
							controlClassName="sm:max-w-none sm:min-w-[480px] sm:flex-1"
							vertical={false}
						>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3">
								<EntityLabelField
									control={form.control}
									name={`${key}.singular`}
									floatingLabel="Singular"
									placeholder={ENTITY_DISPLAY[key]}
								/>
								<EntityLabelField
									control={form.control}
									name={`${key}.plural`}
									floatingLabel="Plural"
									placeholder={`${ENTITY_DISPLAY[key]}s`}
								/>
								<EntityLabelField
									control={form.control}
									name={`${key}.slug`}
									floatingLabel="Slug"
									placeholder={`${ENTITY_DISPLAY[key].toLowerCase()}s`}
								/>
							</div>
						</SettingsRow>
					))}
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

/** Form-bound wrapper around FloatingLabelInput used by the Entity Labels editor. */
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

// ────────────────────────────────────────────────────────────────────────────
// Record Code Prefixes
// ────────────────────────────────────────────────────────────────────────────

const prefixSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.max(5, "Max 5 characters")
	.regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers, hyphens only");

const codePrefixesSchema = z.object({
	person:   prefixSchema,
	deal:     prefixSchema,
	company:  prefixSchema,
	followup: prefixSchema,
});

function CodePrefixesSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const prefixes = org.settings?.codePrefixes ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: codePrefixesSchema,
		values: {
			person:   prefixes.person   ?? "P",
			deal:     prefixes.deal     ?? "D",
			company:  prefixes.company  ?? "C",
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
						label="Deals"
						description={`Next deal code will look like ${values.deal || "D"}-072.`}
					>
						{(field) => <Input maxLength={5} {...field} />}
					</SettingsFormRow>
					<SettingsFormRow
						control={form.control}
						name="company"
						label="Companies"
						description={`Next company code will look like ${values.company || "C"}-015.`}
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

// ────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────

export function WorkspaceGroup({
	org,
	orgId,
}: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<GeneralSection     org={org} orgId={orgId} />
			<EntityLabelsSection org={org} orgId={orgId} />
			<CodePrefixesSection org={org} orgId={orgId} />
		</div>
	);
}
