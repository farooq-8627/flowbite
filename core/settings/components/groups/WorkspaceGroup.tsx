"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// ─── General ──────────────────────────────────────────────────────────────────

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
			await update({ orgId, name: data.name, settings: { timezone: data.timezone, defaultCurrency: data.defaultCurrency } });
		},
	});

	return (
		<SettingsSection
			id="workspace.general"
			title="General"
			description="Update your workspace name, timezone, and default currency."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit} className="grid gap-y-3">
					<div className="grid gap-3 md:grid-cols-2">
						<FormField control={form.control} name="name" render={({ field }) => (
							<FormItem>
								<FormLabel>Workspace name</FormLabel>
								<FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
								<FormMessage />
							</FormItem>
						)} />

						<FormItem>
							<FormLabel>Workspace URL</FormLabel>
							<Input value={org.slug} readOnly disabled />
							<FormDescription>Set during onboarding — cannot be changed.</FormDescription>
						</FormItem>

						<FormField control={form.control} name="timezone" render={({ field }) => (
							<FormItem>
								<FormLabel>Timezone</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger></FormControl>
									<SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)} />

						<FormField control={form.control} name="defaultCurrency" render={({ field }) => (
							<FormItem>
								<FormLabel>Default currency</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select currency" /></SelectTrigger></FormControl>
									<SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)} />
					</div>
					<SettingsSaveButton isSubmitting={isSubmitting} isDirty={isDirty} onReset={() => form.reset()} />
				</form>
			</Form>
		</SettingsSection>
	);
}

// ─── Entity Labels ────────────────────────────────────────────────────────────

const labelSchema = z.object({
	singular: z.string().min(1, "Required").max(40),
	plural:   z.string().min(1, "Required").max(40),
	slug:     z.string().min(1, "Required").max(40).regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens only"),
});

const entityLabelsSchema = z.object({
	lead: labelSchema, contact: labelSchema, deal: labelSchema, company: labelSchema,
});

const ENTITY_KEYS = ["lead", "contact", "deal", "company"] as const;
const ENTITY_DISPLAY: Record<typeof ENTITY_KEYS[number], string> = {
	lead: "Lead", contact: "Contact", deal: "Deal", company: "Company",
};

function EntityLabelsSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const labels = resolveEntityLabels(org.entityLabels);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: entityLabelsSchema,
		values: { lead: labels.lead, contact: labels.contact, deal: labels.deal, company: labels.company },
		onSubmit: async (data) => { await update({ orgId, entityLabels: data }); },
	});

	return (
		<SettingsSection
			id="workspace.entity-labels"
			title="Entity Labels"
			description="Rename CRM entities to match your industry. Changes propagate everywhere instantly via Convex reactivity."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit} className="grid gap-y-4">
					{ENTITY_KEYS.map((key) => (
						<div key={key} className="grid gap-3">
							<p className="text-sm font-medium">{ENTITY_DISPLAY[key]}</p>
							<div className="grid gap-3 sm:grid-cols-3">
								<FormField control={form.control} name={`${key}.singular`} render={({ field }) => (
									<FormItem>
										<FormLabel>Singular</FormLabel>
										<FormControl><Input placeholder={ENTITY_DISPLAY[key]} {...field} /></FormControl>
										<FormMessage />
									</FormItem>
								)} />
								<FormField control={form.control} name={`${key}.plural`} render={({ field }) => (
									<FormItem>
										<FormLabel>Plural</FormLabel>
										<FormControl><Input placeholder={`${ENTITY_DISPLAY[key]}s`} {...field} /></FormControl>
										<FormMessage />
									</FormItem>
								)} />
								<FormField control={form.control} name={`${key}.slug`} render={({ field }) => (
									<FormItem>
										<FormLabel>URL slug</FormLabel>
										<FormControl><Input placeholder={`${ENTITY_DISPLAY[key].toLowerCase()}s`} {...field} /></FormControl>
										<FormMessage />
									</FormItem>
								)} />
							</div>
						</div>
					))}
					<SettingsSaveButton isSubmitting={isSubmitting} isDirty={isDirty} onReset={() => form.reset()} />
				</form>
			</Form>
		</SettingsSection>
	);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function WorkspaceGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<GeneralSection org={org} orgId={orgId} />
			<EntityLabelsSection org={org} orgId={orgId} />
		</div>
	);
}
