"use client";

/**
 * Settings → CRM → Follow-up Defaults.
 *
 * Wires `org.settings.followupDefaults` (see schema/identity.ts) — three
 * fields, all optional:
 *
 *   • defaultDueOffsetDays — when the user clicks "Follow up" without a
 *     date, default to today + N days. Default: 3.
 *   • defaultPriority      — default priority chip on a new follow-up.
 *     Default: "normal".
 *   • autoCloseAfterDays   — Phase B: auto-mark a follow-up completed if
 *     it sits past-due for N days. `0` / undefined disables.
 *
 * Doctrine: follow-ups are reminders with `source === "followup"`. These
 * settings affect that subset only — generic reminders ignore them. See
 * CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md.
 */

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
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import type { OrgSettings } from "../../../types";
import { SettingsFormRow } from "../../shared/SettingsFormRow";
import { SettingsSaveButton } from "../../shared/SettingsSaveButton";
import { SettingsSection } from "../../shared/SettingsSection";

const PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof PRIORITY_VALUES)[number];

const PRIORITY_LABEL: Record<Priority, string> = {
	low: "Low",
	normal: "Normal",
	high: "High",
	urgent: "Urgent",
};

const followupSchema = z.object({
	defaultDueOffsetDays: z.coerce.number().int().min(1).max(365),
	defaultPriority: z.enum(PRIORITY_VALUES),
	autoCloseAfterDays: z.coerce.number().int().min(0).max(365),
	notifyAssignee: z.boolean(),
	requireDealCode: z.boolean(),
	reminderBeforeHours: z.coerce.number().int().min(0).max(72),
});

export function FollowupsSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const defaults = org.settings?.followupDefaults ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: followupSchema,
		values: {
			defaultDueOffsetDays: defaults.defaultDueOffsetDays ?? 3,
			defaultPriority: (defaults.defaultPriority ?? "normal") as Priority,
			autoCloseAfterDays: defaults.autoCloseAfterDays ?? 0,
			notifyAssignee: defaults.notifyAssignee ?? true,
			requireDealCode: defaults.requireDealCode ?? false,
			reminderBeforeHours: defaults.reminderBeforeHours ?? 0,
		},
		onSubmit: async (data) => {
			await update({
				orgId,
				settings: {
					followupDefaults: {
						defaultDueOffsetDays: data.defaultDueOffsetDays,
						defaultPriority: data.defaultPriority,
						autoCloseAfterDays:
							data.autoCloseAfterDays > 0 ? data.autoCloseAfterDays : undefined,
						notifyAssignee: data.notifyAssignee,
						requireDealCode: data.requireDealCode,
						reminderBeforeHours:
							data.reminderBeforeHours > 0 ? data.reminderBeforeHours : undefined,
					},
				},
			});
		},
	});

	return (
		<SettingsSection
			id="notes.followups"
			title="Follow-up Defaults"
			description="Default cadence applied when an agent or AI tool creates a follow-up. Affects reminders with source = followup; generic reminders are unaffected."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					<SettingsFormRow
						control={form.control}
						name="defaultDueOffsetDays"
						label="Default due offset"
						description="Days from now when a follow-up is created without a date. Used by the form's “Use default” preset and the AI tool create_followup."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={1}
									max={365}
									className="w-24"
									{...field}
								/>
								<span className="text-xs text-muted-foreground">days</span>
							</div>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="defaultPriority"
						label="Default priority"
						description="Initial chip on a new follow-up. Per-follow-up overrides are always allowed."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<Select
								value={String(field.value ?? "normal")}
								onValueChange={(v) => field.onChange(v as Priority)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select priority" />
								</SelectTrigger>
								<SelectContent>
									{PRIORITY_VALUES.map((p) => (
										<SelectItem key={p} value={p}>
											{PRIORITY_LABEL[p]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="autoCloseAfterDays"
						label="Auto-close stale follow-ups"
						description="If a follow-up sits past-due for this many days it will be marked completed automatically. Set to 0 to disable."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0}
									max={365}
									className="w-24"
									{...field}
								/>
								<span className="text-xs text-muted-foreground">
									days (0 = off)
								</span>
							</div>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="reminderBeforeHours"
						label="Advance reminder"
						description="Send a notification to the assignee this many hours before a follow-up is due. Set to 0 to disable."
					>
						{(field) => (
							<div className="flex items-center gap-2">
								<Input type="number" min={0} max={72} className="w-24" {...field} />
								<span className="text-xs text-muted-foreground">
									hours before due (0 = off)
								</span>
							</div>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="notifyAssignee"
						label="Notify assignee"
						description="Send a notification when a follow-up is assigned or updated."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<Switch
								checked={Boolean(field.value)}
								onCheckedChange={field.onChange}
							/>
						)}
					</SettingsFormRow>

					<SettingsFormRow
						control={form.control}
						name="requireDealCode"
						label="Require deal link"
						description="Prevent saving a follow-up unless it is linked to a deal. Useful for sales teams that need every cadence touch tied to a pipeline deal."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<Switch
								checked={Boolean(field.value)}
								onCheckedChange={field.onChange}
							/>
						)}
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
