"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";

import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsFormRow } from "../shared/SettingsFormRow";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

// ────────────────────────────────────────────────────────────────────────────
// Pipelines (read-only overview)
// ────────────────────────────────────────────────────────────────────────────

function PipelinesSection({ orgId }: { orgId: Id<"orgs"> }) {
	const pipelines = useQuery(api.crm.fields.pipelines.queries.listByOrg, { orgId });

	return (
		<SettingsSection
			id="crm.pipelines"
			title="Pipelines"
			description="Deal stage workflows. Inline stage editing is coming soon — for now, manage pipelines inside deal boards."
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Pipeline</TableHead>
						<TableHead>Stages</TableHead>
						<TableHead className="text-end">Default</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pipelines === undefined ? (
						Array.from({ length: 2 }).map((_, i) => (
							<TableRow key={i}>
								<TableCell><Skeleton className="h-5 w-32" /></TableCell>
								<TableCell><Skeleton className="h-4 w-48" /></TableCell>
								<TableCell className="text-end"><Skeleton className="ms-auto h-5 w-16" /></TableCell>
							</TableRow>
						))
					) : pipelines.length === 0 ? (
						<TableRow>
							<TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
								No pipelines yet.
							</TableCell>
						</TableRow>
					) : (
						pipelines.map((p) => (
							<TableRow key={p._id}>
								<TableCell className="font-medium text-sm">{p.name}</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{p.stages.map((s) => (
											<Badge
												key={s.id}
												variant="secondary"
												style={s.color ? { backgroundColor: `${s.color}20`, color: s.color } : undefined}
											>
												{s.name}
											</Badge>
										))}
									</div>
								</TableCell>
								<TableCell className="text-end">
									{p.isDefault && <Badge>Default</Badge>}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Custom fields (entity-tabbed, read-only for now)
// ────────────────────────────────────────────────────────────────────────────

type EntityTab = "leads" | "contacts" | "deals" | "companies";

function FieldsSection({
	orgId,
	labels,
}: { orgId: Id<"orgs">; labels: ReturnType<typeof resolveEntityLabels> }) {
	const [active, setActive] = useState<EntityTab>("leads");

	return (
		<SettingsSection
			id="crm.fields"
			title="Custom Fields"
			description="Add custom fields to records. Inline field editing is coming soon — use the entity detail page to create fields for now."
		>
			<Tabs value={active} onValueChange={(v) => setActive(v as EntityTab)}>
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="leads">{labels.lead.plural}</TabsTrigger>
					<TabsTrigger value="contacts">{labels.contact.plural}</TabsTrigger>
					<TabsTrigger value="deals">{labels.deal.plural}</TabsTrigger>
					<TabsTrigger value="companies">{labels.company.plural}</TabsTrigger>
				</TabsList>
				{(["leads", "contacts", "deals", "companies"] as const).map((entity) => (
					<TabsContent key={entity} value={entity} className="mt-4">
						<FieldsTable orgId={orgId} entityType={entity} />
					</TabsContent>
				))}
			</Tabs>
		</SettingsSection>
	);
}

function FieldsTable({ orgId, entityType }: { orgId: Id<"orgs">; entityType: EntityTab }) {
	const fields = useQuery(api.crm.fields.fieldDefinitions.queries.listByEntity, {
		orgId,
		entityType,
	});

	if (fields === undefined) {
		return (
			<div className="grid gap-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (fields.length === 0) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
				No custom fields for {entityType}.
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Label</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Group</TableHead>
					<TableHead className="text-end">Required</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{fields.map((f) => (
					<TableRow key={f._id}>
						<TableCell className="font-medium text-sm">{f.label}</TableCell>
						<TableCell>
							<Badge variant="secondary" className="capitalize">{f.type}</Badge>
						</TableCell>
						<TableCell className="text-xs text-muted-foreground">{f.groupName ?? "—"}</TableCell>
						<TableCell className="text-end text-xs">
							{f.required ? "Required" : "Optional"}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Tags (manage)
// ────────────────────────────────────────────────────────────────────────────

const TAG_COLORS = [
	"#ef4444", "#f97316", "#eab308", "#22c55e",
	"#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

function TagsSection({ orgId }: { orgId: Id<"orgs"> }) {
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

	return (
		<SettingsSection
			id="crm.tags"
			title="Tags"
			description="Shared tags for categorizing leads, contacts, and deals."
		>
			<div className="flex flex-col gap-4 py-2">
				<div className="flex flex-wrap gap-2">
					{tags === undefined ? (
						Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-20" />)
					) : tags.length === 0 ? (
						<span className="text-xs text-muted-foreground">No tags yet.</span>
					) : (
						tags.map((t) => (
							<Badge
								key={t._id}
								variant="secondary"
								className="gap-1 ps-2 pe-1 py-0.5"
								style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
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
											toast.error(err instanceof Error ? err.message : "Failed to remove tag");
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
						onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
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
	staleAlertDays:      z.coerce.number().int().min(1).max(365),
	morningBriefingEnabled: z.boolean(),
	rentAlertEnabled:       z.boolean(),
	rentAlertDays:       z.coerce.number().int().min(1).max(90),
});

function RemindersSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const defaults = org.settings?.reminderDefaults ?? {};

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: reminderSchema,
		values: {
			followUpWindowHours:     defaults.followUpWindowHours     ?? 24,
			staleAlertDays:          defaults.staleAlertDays          ?? 14,
			morningBriefingEnabled:  defaults.morningBriefingEnabled  ?? true,
			rentAlertEnabled:        defaults.rentAlertEnabled        ?? false,
			rentAlertDays:           defaults.rentAlertDays           ?? 30,
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
									<FormLabel className="text-sm font-medium">Morning briefing</FormLabel>
									<p className="text-xs text-muted-foreground">
										Receive a daily digest of today's reminders and due deals.
									</p>
								</div>
								<FormControl>
									<Switch checked={field.value} onCheckedChange={field.onChange} />
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
											<FormLabel className="text-sm font-medium">Rent alert</FormLabel>
											<p className="text-xs text-muted-foreground">
												Alert when rent payments are approaching their due date.
											</p>
										</div>
										<FormControl>
											<Switch checked={field.value} onCheckedChange={field.onChange} />
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

export function CRMGroup({
	org,
	orgId,
}: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const labels = resolveEntityLabels(org.entityLabels);
	return (
		<div className="grid gap-6">
			<PipelinesSection orgId={orgId} />
			<FieldsSection orgId={orgId} labels={labels} />
			<TagsSection orgId={orgId} />
			<RemindersSection org={org} orgId={orgId} />
		</div>
	);
}
