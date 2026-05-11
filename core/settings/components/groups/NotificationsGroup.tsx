"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsRow } from "../shared/SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";

type NotifPrefs = NonNullable<
	NonNullable<ReturnType<typeof useQuery<typeof api.users.queries.getCurrent>>>["notificationPreferences"]
>;
type NotifKey = keyof NotifPrefs;

type NotifItem = {
	key: NotifKey;
	label: (l: ReturnType<typeof resolveEntityLabels>) => string;
	description: string;
};
type NotifGroupDef = {
	id: string;
	title: string;
	description: string;
	items: NotifItem[];
};

const NOTIF_GROUPS: NotifGroupDef[] = [
	{
		id: "crm",
		title: "CRM",
		description: "Notifications for lead, contact, and deal activity.",
		items: [
			{ key: "lead_assigned",      label: (l) => `${l.lead.singular} assigned`,      description: "When a lead is assigned to you." },
			{ key: "lead_converted",     label: (l) => `${l.lead.singular} converted`,     description: "When a lead is converted to a contact." },
			{ key: "contact_assigned",   label: (l) => `${l.contact.singular} assigned`,   description: "When a contact is assigned to you." },
			{ key: "deal_assigned",      label: (l) => `${l.deal.singular} assigned`,      description: "When a deal is assigned to you." },
			{ key: "deal_stage_changed", label: (l) => `${l.deal.singular} stage changed`, description: "When a deal moves to a new stage." },
			{ key: "deal_won",           label: (l) => `${l.deal.singular} won`,           description: "When a deal is marked as won." },
			{ key: "deal_stale",         label: (l) => `${l.deal.singular} gone stale`,    description: "When a deal has had no activity." },
		],
	},
	{
		id: "reminders",
		title: "Reminders",
		description: "Notifications for follow-up reminders.",
		items: [
			{ key: "reminder_due",     label: () => "Reminder due",     description: "When a reminder is due." },
			{ key: "reminder_overdue", label: () => "Reminder overdue", description: "When a reminder is past its due date." },
		],
	},
	{
		id: "ai",
		title: "AI",
		description: "Notifications for AI-powered actions and setup.",
		items: [
			{ key: "ai_action_completed", label: () => "AI action completed", description: "When an AI action finishes running." },
			{ key: "ai_workspace_setup",  label: () => "AI workspace setup",  description: "When AI workspace setup is complete." },
		],
	},
	{
		id: "team",
		title: "Team",
		description: "Notifications for team membership and role changes.",
		items: [
			{ key: "member_invited", label: () => "Member invited",    description: "When a new member is invited." },
			{ key: "member_joined",  label: () => "Member joined",     description: "When a new member joins the workspace." },
			{ key: "role_changed",   label: () => "Your role changed", description: "When your role is updated by an admin." },
		],
	},
	{
		id: "system",
		title: "System",
		description: "Billing and data import notifications.",
		items: [
			{ key: "billing_trial_ending", label: () => "Trial ending soon",   description: "When your trial is about to expire." },
			{ key: "billing_suspended",    label: () => "Account suspended",   description: "When your account is suspended." },
			{ key: "csv_import_complete",  label: () => "CSV import complete", description: "When a CSV import finishes successfully." },
			{ key: "csv_import_failed",    label: () => "CSV import failed",   description: "When a CSV import encounters an error." },
		],
	},
];

function NotifGroupCard({
	group,
	prefs,
	labels,
	onToggle,
	onToggleAll,
}: {
	group: NotifGroupDef;
	prefs: Partial<NotifPrefs>;
	labels: ReturnType<typeof resolveEntityLabels>;
	onToggle: (key: NotifKey, value: boolean) => void;
	onToggleAll: (group: NotifGroupDef, value: boolean) => void;
}) {
	const allOn = group.items.every((i) => prefs[i.key] !== false);

	return (
		<SettingsSection
			id={`notifications.${group.id}`}
			title={group.title}
			description={group.description}
			action={
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onToggleAll(group, !allOn)}
				>
					{allOn ? "Disable all" : "Enable all"}
				</Button>
			}
		>
			{group.items.map((item) => (
				<SettingsRow
					key={String(item.key)}
					label={item.label(labels)}
					description={item.description}
					compact
				>
					<Switch
						checked={prefs[item.key] !== false}
						onCheckedChange={(v) => onToggle(item.key, v)}
					/>
				</SettingsRow>
			))}
		</SettingsSection>
	);
}

export function NotificationsGroup({ org }: { org: OrgSettings }) {
	const user = useQuery(api.users.queries.getCurrent);
	const updatePrefs = useMutation(api.users.mutations.updateNotificationPreferences);
	const labels = resolveEntityLabels(org.entityLabels);

	if (!user) {
		return null;
	}

	const prefs = user.notificationPreferences ?? {};

	const handleToggle = async (key: NotifKey, value: boolean) => {
		try {
			await updatePrefs({ preferences: { [key]: value } });
		} catch {
			toast.error("Failed to update notification preference");
		}
	};

	const handleToggleAll = async (group: NotifGroupDef, value: boolean) => {
		const patch = Object.fromEntries(
			group.items.map((i) => [i.key, value]),
		) as Parameters<typeof updatePrefs>[0]["preferences"];
		try {
			await updatePrefs({ preferences: patch });
		} catch {
			toast.error("Failed to update notifications");
		}
	};

	return (
		<div className="grid gap-6">
			{NOTIF_GROUPS.map((group) => (
				<NotifGroupCard
					key={group.id}
					group={group}
					prefs={prefs}
					labels={labels}
					onToggle={handleToggle}
					onToggleAll={handleToggleAll}
				/>
			))}
		</div>
	);
}
