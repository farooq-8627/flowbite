"use client";

/**
 * Settings → Notes → Reminder Defaults.
 *
 * Workspace-wide defaults for the reminders system. The Reminders module
 * itself ships its panels and detail UI in a later slice — values written
 * here are read by `reminders.create` and the dashboard widgets.
 *
 * Extracted from `CRMGroup` on 2026-05-17 when the Notes settings group
 * gained its own slot. CRM keeps Tags only.
 */

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import type { OrgSettings } from "../../../types";
import { SettingsFormRow } from "../../shared/SettingsFormRow";
import { SettingsSaveButton } from "../../shared/SettingsSaveButton";
import { SettingsSection } from "../../shared/SettingsSection";

const reminderSchema = z.object({
	followUpWindowHours: z.coerce.number().int().min(1).max(720),
	staleAlertDays: z.coerce.number().int().min(1).max(365),
	morningBriefingEnabled: z.boolean(),
	rentAlertEnabled: z.boolean(),
	rentAlertDays: z.coerce.number().int().min(1).max(90),
});

export function RemindersSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const defaults = org.settings?.reminderDefaults ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: reminderSchema,
		values: {
			followUpWindowHours: defaults.followUpWindowHours ?? 24,
			staleAlertDays: defaults.staleAlertDays ?? 14,
			morningBriefingEnabled: defaults.morningBriefingEnabled ?? true,
			rentAlertEnabled: defaults.rentAlertEnabled ?? false,
			rentAlertDays: defaults.rentAlertDays ?? 30,
		},
		onSubmit: async (data) => {
			await update({
				orgId,
				settings: {
					reminderDefaults: data,
				},
			});
		},
	});

	const rentEnabled = form.watch("rentAlertEnabled");
	const isRealEstate = (org.industry ?? "").toLowerCase() === "real-estate";

	return (
		<SettingsSection
			id="notes.reminders"
			title="Reminder Defaults"
			description="Default timing for automated reminders across the workspace."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					<SettingsFormRow
						control={form.control}
						name="followUpWindowHours"
						label="Follow-up window"
						description="Hours after a reminder is due before it's marked overdue."
					>
						{(field) => <Input type="number" min={1} max={720} {...field} />}
					</SettingsFormRow>
					<SettingsFormRow
						control={form.control}
						name="staleAlertDays"
						label="Deal stale after"
						description="Number of days without activity before a deal is flagged stale."
					>
						{(field) => <Input type="number" min={1} max={365} {...field} />}
					</SettingsFormRow>
					<FormField
						control={form.control}
						name="morningBriefingEnabled"
						render={({ field }) => (
							<FormItem className="flex items-center justify-between py-4 sm:gap-6">
								<div className="space-y-0.5">
									<FormLabel className="text-sm font-medium">
										Morning briefing
									</FormLabel>
									<p className="text-xs text-muted-foreground">
										Receive a daily digest of today's reminders and due deals.
									</p>
								</div>
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
					{isRealEstate && (
						<>
							<FormField
								control={form.control}
								name="rentAlertEnabled"
								render={({ field }) => (
									<FormItem className="flex items-center justify-between py-4 sm:gap-6">
										<div className="space-y-0.5">
											<FormLabel className="text-sm font-medium">
												Rent alert
											</FormLabel>
											<p className="text-xs text-muted-foreground">
												Alert when rent payments are approaching their due
												date.
											</p>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							{rentEnabled && (
								<SettingsFormRow
									control={form.control}
									name="rentAlertDays"
									label="Rent alert window"
									description="Days before due date to send a rent alert."
								>
									{(field) => <Input type="number" min={1} max={90} {...field} />}
								</SettingsFormRow>
							)}
						</>
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
