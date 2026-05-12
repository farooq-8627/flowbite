"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";
import { SettingsFormRow } from "../shared/SettingsFormRow";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { SettingsSection } from "../shared/SettingsSection";

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// Tags (manage)
// ────────────────────────────────────────────────────────────────────────────

const TAG_COLORS = [
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#14b8a6",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
];

function TagsSection({
	orgId,
	labels,
}: {
	orgId: Id<"orgs">;
	labels: ReturnType<typeof resolveEntityLabels>;
}) {
	const tags = useQuery(api.crm.shared.tags.queries.listByOrg, { orgId });
	const create = useMutation(api.crm.shared.tags.mutations.create);
	const remove = useMutation(api.crm.shared.tags.mutations.remove);

	const [newTag, setNewTag] = useState("");
	const [newColor, setNewColor] = useState(TAG_COLORS[0]);

	const handleCreate = async () => {
		const name = newTag.trim();
		if (!name) return;
		try {
			await create({ orgId, name, color: newColor });
			toast.success(`Added tag "${name}"`);
			setNewTag("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to add tag");
		}
	};

	// Dynamic description — "leads, contacts, and deals" reflects the org's
	// renamed labels (e.g. "inquiries, clients, and opportunities").
	const tagsDescription = `Shared tags for categorizing ${labels.lead.plural.toLowerCase()}, ${labels.contact.plural.toLowerCase()}, and ${labels.deal.plural.toLowerCase()}.`;

	return (
		<SettingsSection id="crm.tags" title="Tags" description={tagsDescription}>
			<div className="flex flex-col gap-4 py-2">
				<div className="flex flex-wrap gap-2">
					{tags === undefined ? null : tags.length === 0 ? (
						<span className="text-xs text-muted-foreground">No tags yet.</span>
					) : (
						tags.map((t) => (
							<Badge
								key={t._id}
								variant="secondary"
								className="gap-1 ps-2 pe-1 py-0.5"
								style={
									t.color
										? { backgroundColor: `${t.color}20`, color: t.color }
										: undefined
								}
							>
								{t.name}
								<button
									type="button"
									className="rounded hover:bg-foreground/10 p-0.5"
									aria-label={`Remove ${t.name}`}
									onClick={async () => {
										try {
											await remove({ orgId, tagId: t._id });
										} catch (err) {
											toast.error(
												err instanceof Error
													? err.message
													: "Failed to remove tag",
											);
										}
									}}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))
					)}
				</div>

				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Input
						placeholder="Enter tag name"
						value={newTag}
						onChange={(e) => setNewTag(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleCreate();
							}
						}}
						className="sm:max-w-xs"
					/>
					<div className="flex items-center gap-1">
						{TAG_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								aria-label={`Color ${c}`}
								onClick={() => setNewColor(c)}
								className="size-6 rounded-full ring-offset-2 transition-all"
								style={{
									backgroundColor: c,
									outline: newColor === c ? "2px solid var(--ring)" : undefined,
								}}
							/>
						))}
					</div>
					<Button size="sm" onClick={handleCreate} disabled={!newTag.trim()}>
						<Plus className="size-4" /> Add tag
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Reminder Defaults
// ────────────────────────────────────────────────────────────────────────────

const reminderSchema = z.object({
	followUpWindowHours: z.coerce.number().int().min(1).max(720),
	staleAlertDays: z.coerce.number().int().min(1).max(365),
	morningBriefingEnabled: z.boolean(),
	rentAlertEnabled: z.boolean(),
	rentAlertDays: z.coerce.number().int().min(1).max(90),
});

function RemindersSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
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
			id="crm.reminders"
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

// ────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────

export function CRMGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const labels = resolveEntityLabels(org.entityLabels);
	return (
		<div className="grid gap-6">
			<TagsSection orgId={orgId} labels={labels} />
			<RemindersSection org={org} orgId={orgId} />
		</div>
	);
}
