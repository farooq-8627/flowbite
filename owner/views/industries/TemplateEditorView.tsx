"use client";

/**
 * Owner-panel template editor (Stage 2 — multi-tab editor).
 *
 * Renders a tabbed interface over a single `platformTemplates` row.
 * Each tab is its own form with its own save button — per locked
 * decision #5 in `AGENTS.md` ("per-section save in settings").
 *
 * Tabs (18 editable slots + 1 read-only):
 *   - Identity     — label / description / icon / region / groupKey / sortOrder / visible / archived
 *   - AI persona   — Markdown textarea overlay for system-prompt Layer 3
 *   - Defaults     — currency / timezone / leadStaleAfterDays / locale
 *   - Entity Labels— per-entity singular/plural/slug + Arabic
 *   - Entity Vis.  — per-entity visible/hidden flags
 *   - Code Prefixes— person/deal/company/task
 *   - Task Defaults— cadence / priority / auto-close / notifications
 *   - Briefing     — morning briefing toggle + time
 *   - File Upload  — allowed MIME categories + max size
 *   - Pipelines    — JSON editor (StagesEditor)
 *   - Fields       — JSON editor (FieldsEditor)
 *   - Modules      — JSON editor (ModulesEditor)
 *   - Note Cats    — JSON array editor
 *   - Tags         — JSON array editor
 *   - Dashboard    — string-array editor
 *   - Nav Hidden   — string-array editor
 *   - Custom Roles — JSON array editor
 *   - Saved Views  — JSON array editor
 *   - Mock Data    — READ-ONLY JSON preview (per L3 — full editor v2)
 *
 * Save semantics:
 *   - Each tab's save constructs a fresh `definition` blob (the entire
 *     existing one with the edited slot replaced) and submits it to
 *     `updateTemplate.patch.definition`. Partial saves never bypass
 *     `validateDefinition` cross-reference checks.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3 TemplateEditorView, §7.
 */

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useSettingsForm } from "@/core/platform/settings/hooks/useSettingsForm";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";
import { useOwnerPublicPrefix } from "../../hooks/useOwnerPublicPrefix";
import { AIPersonaEditor } from "./_components/AIPersonaEditor";
import { JsonSlotEditor } from "./_components/JsonSlotEditor";
import { MockDataPreview } from "./_components/MockDataPreview";
import { StringArrayEditor } from "./_components/StringArrayEditor";

const REGION_VALUES = ["", "global", "gcc", "us", "eu", "apac"] as const;
type RegionInput = (typeof REGION_VALUES)[number];

const identitySchema = z.object({
	label: z.string().trim().min(1, "Required").max(80),
	description: z.string().trim().min(1, "Required").max(280),
	icon: z.string().trim().max(8).optional(),
	region: z.enum(REGION_VALUES),
	groupKey: z.string().trim().min(1),
	sortOrder: z.coerce.number().int().min(0),
	visible: z.boolean(),
	isArchived: z.boolean(),
});
type IdentityFormValues = z.infer<typeof identitySchema>;

export function TemplateEditorView({ templateKey }: { templateKey: string }) {
	const prefix = useOwnerPublicPrefix() ?? "";
	const template = useQuery(api._platform.industries.queries.getTemplateForAdmin, {
		templateKey,
	});
	const groups = useQuery(api._platform.industries.queries.listGroupsForAdmin, {});
	const usageCounts = useQuery(api._platform.industries.queries.usageCountByTemplate, {});

	if (template === undefined || groups === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading template…
			</div>
		);
	}
	if (template === null) {
		return (
			<OwnerSettingsCard
				title="Template not found"
				description={`No platformTemplates row with templateKey "${templateKey}".`}
			>
				<Link
					href={`${prefix}/industries`}
					className="text-sm text-muted-foreground underline hover:text-foreground"
				>
					Back to industries
				</Link>
			</OwnerSettingsCard>
		);
	}

	const usage = usageCounts?.[templateKey] ?? 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Link
					href={`${prefix}/industries`}
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" /> All industries
				</Link>
				<span className="text-[11px] text-muted-foreground">
					{usage} org{usage === 1 ? "" : "s"} using · last updated{" "}
					{template.updatedAt ? new Date(template.updatedAt).toLocaleString() : "—"}
				</span>
			</div>

			{template.isBuiltIn ? (
				<Alert
					variant="default"
					className="border-amber-500/40 bg-amber-500/10 text-foreground"
				>
					<AlertTitle className="text-sm">Built-in template</AlertTitle>
					<AlertDescription className="text-xs leading-relaxed">
						Edits ONLY affect new orgs that pick this template after the save. Orgs
						already on it are untouched. Hard delete is permitted via the typed-confirm
						dialog on the list page (per L8 of the migration spec) — but you'll lose the
						entire definition; archiving is usually the better choice.
					</AlertDescription>
				</Alert>
			) : null}

			<Tabs defaultValue="identity" className="flex flex-col gap-3">
				<TabsList className="flex flex-wrap gap-1 bg-transparent p-0">
					<TabsTrigger value="identity">Identity</TabsTrigger>
					<TabsTrigger value="ai-persona">AI persona</TabsTrigger>
					<TabsTrigger value="defaults">Defaults</TabsTrigger>
					<TabsTrigger value="entity-labels">Entity labels</TabsTrigger>
					<TabsTrigger value="entity-visibility">Entity visibility</TabsTrigger>
					<TabsTrigger value="code-prefixes">Code prefixes</TabsTrigger>
					<TabsTrigger value="task-defaults">Task defaults</TabsTrigger>
					<TabsTrigger value="briefing">Briefing</TabsTrigger>
					<TabsTrigger value="file-upload">File upload</TabsTrigger>
					<TabsTrigger value="pipelines">Pipelines</TabsTrigger>
					<TabsTrigger value="fields">Fields</TabsTrigger>
					<TabsTrigger value="modules">Modules</TabsTrigger>
					<TabsTrigger value="note-categories">Note categories</TabsTrigger>
					<TabsTrigger value="tags">Tags</TabsTrigger>
					<TabsTrigger value="dashboard">Dashboard</TabsTrigger>
					<TabsTrigger value="nav-hidden">Nav hidden</TabsTrigger>
					<TabsTrigger value="custom-roles">Custom roles</TabsTrigger>
					<TabsTrigger value="saved-views">Saved views</TabsTrigger>
					<TabsTrigger value="mock-data">Mock data</TabsTrigger>
				</TabsList>

				<TabsContent value="identity">
					<IdentityTab template={template} groups={groups} />
				</TabsContent>
				<TabsContent value="ai-persona">
					<AIPersonaEditor template={template} />
				</TabsContent>
				<TabsContent value="defaults">
					<JsonSlotEditor
						template={template}
						slot="defaults"
						title="Workspace defaults"
						hint='Org-level defaults applied at signup. Shape: { "currency": "USD", "timezone": "Asia/Dubai", "leadStaleAfterDays": 14, "locale": "en" }.'
					/>
				</TabsContent>
				<TabsContent value="entity-labels">
					<JsonSlotEditor
						template={template}
						slot="entityLabels"
						title="Entity labels"
						hint='Per-entity singular/plural/slug overrides. Shape: { "lead": { "singular": "Lead", "plural": "Leads", "slug": "leads" }, ... }.'
					/>
				</TabsContent>
				<TabsContent value="entity-visibility">
					<JsonSlotEditor
						template={template}
						slot="entityVisibility"
						title="Entity visibility"
						hint='Which of the 4+2 entity slots are visible on signup. Shape: { "lead": true, "contact": true, "deal": true, "company": true, "entity5": false, "entity6": false }.'
					/>
				</TabsContent>
				<TabsContent value="code-prefixes">
					<JsonSlotEditor
						template={template}
						slot="codePrefixes"
						title="Code prefixes"
						hint='Per-entity code prefix. Shape: { "person": "P", "deal": "D", "company": "C", "task": "T" }.'
					/>
				</TabsContent>
				<TabsContent value="task-defaults">
					<JsonSlotEditor
						template={template}
						slot="taskDefaults"
						title="Task defaults"
						hint='Followup-task cadence + priority. Shape: { "defaultDueOffsetDays": 3, "defaultPriority": "normal", "autoCloseAfterDays": 30, "notifyAssignee": true, "requireDealCode": false, "reminderBeforeHours": 1 }.'
					/>
				</TabsContent>
				<TabsContent value="briefing">
					<JsonSlotEditor
						template={template}
						slot="briefingDefaults"
						title="Morning briefing"
						hint='Shape: { "morningBriefingEnabled": true, "morningBriefingTime": "08:30" } (HH:MM 24-hour).'
					/>
				</TabsContent>
				<TabsContent value="file-upload">
					<JsonSlotEditor
						template={template}
						slot="fileUpload"
						title="File upload policy"
						hint='Shape: { "allowedMimeCategories": ["image", "pdf", "document", "spreadsheet"], "maxSizeMb": 25 }. Allowed categories: image / pdf / document / spreadsheet / video / audio / archive / other.'
					/>
				</TabsContent>
				<TabsContent value="pipelines">
					<JsonSlotEditor
						template={template}
						slot="pipelines"
						title="Pipelines"
						hint="Array of `{ entityType, name, isDefault, stageTransitionPolicy?, allowSkipStages?, markDoneRequiresAllFields?, stages: [{ name, code, color?, isFinal?, finalType?, staleAfterDays?, warningAfterDays?, isDefaultStage? }] }` objects."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="fields">
					<JsonSlotEditor
						template={template}
						slot="fieldDefinitions"
						title="Field definitions"
						hint='Per-entity field arrays. Shape: { "lead": [{ name, label, type, ... }], "contact": [...], "deal": [...], "company": [...] }.'
					/>
				</TabsContent>
				<TabsContent value="modules">
					<JsonSlotEditor
						template={template}
						slot="modules"
						title="Modules slot map"
						hint="Array of `{ slot, order, hidden?, defaultView?, cardFields?, listColumns?, boardGroupBy?, defaultFilters?, label?, meta? }` entries."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="note-categories">
					<JsonSlotEditor
						template={template}
						slot="noteCategories"
						title="Sticky-note categories"
						hint="Array of `{ name, bgColor, textColor?, isDefault?, position? }` entries."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="tags">
					<JsonSlotEditor
						template={template}
						slot="tags"
						title="Tag presets"
						hint="Array of `{ name, color? }` entries."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="dashboard">
					<StringArrayEditor
						template={template}
						slot="dashboardMetrics"
						title="Dashboard metrics"
						hint="Widget keys to show on the dashboard home (one per line). Order matters."
					/>
				</TabsContent>
				<TabsContent value="nav-hidden">
					<StringArrayEditor
						template={template}
						slot="navHiddenSlots"
						title="Sidebar slots hidden by default"
						hint="One slot key per line. Common values: lead, contact, deal, company, entity5, entity6."
					/>
				</TabsContent>
				<TabsContent value="custom-roles">
					<JsonSlotEditor
						template={template}
						slot="customRoles"
						title="Custom roles"
						hint="Array of `{ name, description?, color?, permissions: string[] }` entries."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="saved-views">
					<JsonSlotEditor
						template={template}
						slot="savedViews"
						title="Saved views"
						hint="Array of `{ entityType, name, scope, filters, sortBy?, sortOrder?, columns?, isPinned? }` entries. `filters` is a serialised string."
						allowEmptyArray
					/>
				</TabsContent>
				<TabsContent value="mock-data">
					<MockDataPreview template={template} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

// ─── Identity tab ────────────────────────────────────────────────────────────

type TemplateRow = NonNullable<
	ReturnType<typeof useQuery<typeof api._platform.industries.queries.getTemplateForAdmin>>
>;
type GroupRow = NonNullable<
	ReturnType<typeof useQuery<typeof api._platform.industries.queries.listGroupsForAdmin>>
>[number];

function IdentityTab({ template, groups }: { template: TemplateRow; groups: GroupRow[] }) {
	const updateTemplate = useMutation(api._platform.industries.mutations.updateTemplate);
	const setVisible = useMutation(api._platform.industries.mutations.setTemplateVisible);
	const archive = useMutation(api._platform.industries.mutations.archiveTemplate);

	const initial = useMemo<IdentityFormValues>(
		() => ({
			label: template.label,
			description: template.description,
			icon: template.icon ?? "",
			region: ((template.region as RegionInput | undefined) ?? "") as RegionInput,
			groupKey: template.groupKey,
			sortOrder: template.sortOrder,
			visible: template.visible,
			isArchived: template.isArchived,
		}),
		[template],
	);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm<IdentityFormValues>({
		schema: identitySchema,
		values: initial,
		onSubmit: async (data) => {
			// Patch the row + the visibility/archive flags through their
			// dedicated mutations so the audit log carries the right verb.
			await updateTemplate({
				templateKey: template.templateKey,
				patch: {
					label: data.label,
					description: data.description,
					icon: data.icon || undefined,
					region: data.region === "" ? undefined : data.region,
					groupKey: data.groupKey,
					sortOrder: data.sortOrder,
				},
			});
			if (data.visible !== template.visible) {
				await setVisible({ templateKey: template.templateKey, visible: data.visible });
			}
			if (data.isArchived !== template.isArchived) {
				await archive({ templateKey: template.templateKey, archive: data.isArchived });
			}
		},
	});

	useEffect(() => {
		form.reset(initial);
	}, [initial, form]);

	return (
		<OwnerSettingsCard
			title={`${template.label} · identity`}
			description={`Stable templateKey: ${template.templateKey} (uniqueness key — cannot be renamed; remove + recreate to change).`}
		>
			<Form {...form}>
				<form
					onSubmit={async (e) => {
						try {
							await handleSubmit(e);
							toast.success("Saved");
						} catch (err) {
							toast.error(normalizeError(err, "Failed to save"));
						}
					}}
					className="space-y-4"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<LabelledField
							label="Label"
							error={form.formState.errors.label?.message?.toString()}
						>
							<Input {...form.register("label")} autoComplete="off" />
						</LabelledField>
						<LabelledField
							label="Icon (emoji)"
							hint="Single emoji shown on onboarding card."
						>
							<Input {...form.register("icon")} autoComplete="off" />
						</LabelledField>
						<LabelledField
							label="Group"
							hint="Which onboarding group this template lives under."
						>
							<select
								value={form.watch("groupKey")}
								onChange={(e) =>
									form.setValue("groupKey", e.target.value, {
										shouldDirty: true,
									})
								}
								className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
							>
								{groups.map((g) => (
									<option key={g.groupKey} value={g.groupKey}>
										{g.label} ({g.groupKey})
									</option>
								))}
							</select>
						</LabelledField>
						<LabelledField
							label="Region"
							hint="Drives default currency / timezone hints."
						>
							<select
								value={form.watch("region")}
								onChange={(e) =>
									form.setValue("region", e.target.value as RegionInput, {
										shouldDirty: true,
									})
								}
								className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
							>
								<option value="">—</option>
								<option value="global">Global</option>
								<option value="gcc">GCC</option>
								<option value="us">US</option>
								<option value="eu">EU</option>
								<option value="apac">APAC</option>
							</select>
						</LabelledField>
						<LabelledField
							label="Sort order"
							hint="Within the group; ascending."
							error={form.formState.errors.sortOrder?.message?.toString()}
						>
							<Input
								type="number"
								min={0}
								step="10"
								{...form.register("sortOrder")}
							/>
						</LabelledField>
						<LabelledField label="Visible" hint="Shown on the onboarding picker.">
							<Switch
								checked={form.watch("visible")}
								onCheckedChange={(v) =>
									form.setValue("visible", v, { shouldDirty: true })
								}
							/>
						</LabelledField>
						<LabelledField
							label="Archived"
							hint="Hides forever; existing customers untouched."
						>
							<Switch
								checked={form.watch("isArchived")}
								onCheckedChange={(v) =>
									form.setValue("isArchived", v, { shouldDirty: true })
								}
							/>
						</LabelledField>
					</div>
					<LabelledField
						label="Description"
						error={form.formState.errors.description?.message?.toString()}
					>
						<Textarea rows={3} {...form.register("description")} />
					</LabelledField>

					<div className="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isSubmitting || !isDirty}
							onClick={() => form.reset(initial)}
						>
							Reset
						</Button>
						<Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
							{isSubmitting ? (
								<Loader2 className="me-2 h-4 w-4 animate-spin" />
							) : null}
							Save identity
						</Button>
					</div>
				</form>
			</Form>
		</OwnerSettingsCard>
	);
}

function LabelledField({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-foreground">{label}</span>
			{children}
			{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
			{error ? <span className="text-[11px] text-destructive">{error}</span> : null}
		</div>
	);
}
