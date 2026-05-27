"use client";

/**
 * Settings → CRM → Tasks.
 *
 * Replaces the legacy RemindersSection + FollowupsSection per
 * TASKS-RENAME-PLAN.md (Stage 4B → 4D). Two org-settings blocks:
 *
 *   org.settings.taskDefaults     — task cadence defaults (used by
 *                                   `type === "followup"` tasks: due
 *                                   offset, priority, auto-close,
 *                                   advance reminder, notify-assignee,
 *                                   require-deal flag).
 *   org.settings.briefingDefaults — workspace toggle + hour for the AI
 *                                   morning briefing. Stage 4D split
 *                                   this out of the dropped
 *                                   `reminderDefaults` block.
 *
 * Two sections in one file, two save buttons, two forms — preserves the
 * "per-section save" decision (#5 in AGENTS.md "LOCKED ARCHITECTURAL
 * DECISIONS"). Combining them into one section would force the user to
 * save a block they didn't touch.
 */

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
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

// ─── Briefing defaults (workspace-wide morning briefing) ─────────────────────

const briefingSchema = z.object({
	morningBriefingEnabled: z.boolean(),
	morningBriefingTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM 24-hour format (e.g. 08:30)"),
});

function BriefingDefaultsForm({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const defaults = org.settings?.briefingDefaults ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: briefingSchema,
		values: {
			morningBriefingEnabled: defaults.morningBriefingEnabled ?? true,
			morningBriefingTime: defaults.morningBriefingTime ?? "08:30",
		},
		onSubmit: async (data) => {
			await update({
				orgId,
				settings: {
					briefingDefaults: data,
				},
			});
		},
	});

	const enabled = form.watch("morningBriefingEnabled");

	return (
		<Form {...form}>
			<form onSubmit={handleSubmit}>
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
									Receive a daily AI digest of today's tasks and due deals.
								</p>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				{enabled && (
					<SettingsFormRow
						control={form.control}
						name="morningBriefingTime"
						label="Briefing time"
						description="When the daily briefing is generated. Uses the workspace timezone."
						controlClassName="sm:min-w-auto"
					>
						{(field) => (
							<Input
								type="time"
								className="w-32"
								{...field}
								value={String(field.value ?? "08:30")}
							/>
						)}
					</SettingsFormRow>
				)}
				<SettingsSaveButton
					isSubmitting={isSubmitting}
					isDirty={isDirty}
					onReset={() => form.reset()}
				/>
			</form>
		</Form>
	);
}

// ─── Task cadence defaults ───────────────────────────────────────────────────

const PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof PRIORITY_VALUES)[number];
const PRIORITY_LABEL: Record<Priority, string> = {
	low: "Low",
	normal: "Normal",
	high: "High",
	urgent: "Urgent",
};

const taskSchema = z.object({
	defaultDueOffsetDays: z.coerce.number().int().min(1).max(365),
	defaultPriority: z.enum(PRIORITY_VALUES),
	autoCloseAfterDays: z.coerce.number().int().min(0).max(365),
	notifyAssignee: z.boolean(),
	requireDealCode: z.boolean(),
	reminderBeforeHours: z.coerce.number().int().min(0).max(72),
});

function TaskCadenceForm({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const defaults = org.settings?.taskDefaults ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: taskSchema,
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
					taskDefaults: {
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
		<Form {...form}>
			<form onSubmit={handleSubmit}>
				<SettingsFormRow
					control={form.control}
					name="defaultDueOffsetDays"
					label="Default due offset"
					description={
						"Days from now when a task of type \u201Cfollow-up\u201D is created without a date. Used by the form's \u201CUse default\u201D preset and the AI tool create_task."
					}
					controlClassName="sm:min-w-auto"
				>
					{(field) => (
						<div className="flex items-center gap-2">
							<Input type="number" min={1} max={365} className="w-24" {...field} />
							<span className="text-xs text-muted-foreground">days</span>
						</div>
					)}
				</SettingsFormRow>

				<SettingsFormRow
					control={form.control}
					name="defaultPriority"
					label="Default priority"
					description="Initial priority chip on a new follow-up task. Per-task overrides are always allowed."
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
					description="If a follow-up task sits past-due for this many days it will be marked completed automatically. Set to 0 to disable."
					controlClassName="sm:min-w-auto"
				>
					{(field) => (
						<div className="flex items-center gap-2">
							<Input type="number" min={0} max={365} className="w-24" {...field} />
							<span className="text-xs text-muted-foreground">days (0 = off)</span>
						</div>
					)}
				</SettingsFormRow>

				<SettingsFormRow
					control={form.control}
					name="reminderBeforeHours"
					label="Advance reminder"
					description="Send a notification to the assignee this many hours before a task is due. Set to 0 to disable."
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
					description="Send a notification when a task is assigned or updated."
					controlClassName="sm:min-w-auto"
				>
					{(field) => (
						<Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
					)}
				</SettingsFormRow>

				<SettingsFormRow
					control={form.control}
					name="requireDealCode"
					label="Require deal link"
					description="Prevent saving a follow-up task unless it is linked to a deal. Useful for sales teams that need every cadence touch tied to a pipeline deal."
					controlClassName="sm:min-w-auto"
				>
					{(field) => (
						<Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
					)}
				</SettingsFormRow>

				<SettingsSaveButton
					isSubmitting={isSubmitting}
					isDirty={isDirty}
					onReset={() => form.reset()}
				/>
			</form>
		</Form>
	);
}

// ─── Public section ──────────────────────────────────────────────────────────

export function TasksSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<>
			<SettingsSection
				id="crm.tasks.briefing"
				title="Morning briefing"
				description="Workspace toggle + time for the daily AI briefing of today's tasks and deals."
			>
				<BriefingDefaultsForm org={org} orgId={orgId} />
			</SettingsSection>
			<SettingsSection
				id="crm.tasks.followupDefaults"
				title="Follow-up task defaults"
				description="Default cadence applied when an agent or AI tool creates a follow-up task. Affects only tasks with type = followup; generic to-dos / calls / emails / meetings ignore these defaults."
			>
				<TaskCadenceForm org={org} orgId={orgId} />
			</SettingsSection>
		</>
	);
}
