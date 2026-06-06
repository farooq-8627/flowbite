"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useSearchFilter } from "@/core/shell/shared/layouts";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "../../../types";
import { SettingsSection } from "../../shared/SettingsSection";

/**
 * Settings → Workspace → Template.
 *
 * Surfaces the registered industry templates and lets owners / admins
 * re-apply the same template (to backfill any slot they accidentally
 * cleared) or switch to a different one. The seeder is **strictly
 * additive** — every step is a "skip-if-exists" check on the natural key
 * for that table — so re-applying / switching never deletes user data.
 *
 * **DB-gated visibility (B.42 follow-up, 2026-06-05).** The picker reads
 * `crm.fields.templates.queries.list` which now filters templates whose
 * `visible !== false` flag is set in the `platformTemplates` table. So
 * toggling an industry OFF in the platform-owner panel
 * (`/xowner/industries`) removes it from this list reactively.
 *
 * **Default-collapsed click-header (B.42 follow-up, 2026-06-05).**
 * The full grid is heavy (10–15 cards depending on workspace) so it's
 * collapsed by default — clicking the header row toggles open/close.
 * No chevron / caret per explicit user direction. The Sample-data
 * section sits below as its own un-collapsed `SettingsSection` so the
 * "Delete sample data" CTA stays one click away.
 *
 * RBAC: gated on `org.editSettings`. Viewer / Member tiers see the section
 * but cannot click "Apply".
 */
export function WorkspaceTemplateSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const templates = useQuery(api.crm.fields.templates.queries.list, {});
	const applyTemplate = useMutation(api.orgs.mutations.applyTemplate);

	const [pending, setPending] = useState<string | null>(null);
	const [confirmTemplateId, setConfirmTemplateId] = useState<string | null>(null);
	const [confirmClear, setConfirmClear] = useState(false);
	const [clearing, setClearing] = useState(false);

	// Click-header collapse — default closed. Same UX rule the AI Cockpit
	// uses on the dashboard: the entire header row IS the toggle, no arrow.
	const [open, setOpen] = useState(false);

	const clearMockData = useMutation(api.orgs.mutations.clearMockData);

	const currentTemplateId = org.industry ?? null;
	const confirmTemplate = templates?.find((t) => t.id === confirmTemplateId);

	const mockDataSeededAt = org.settings?.mockDataSeededAt;
	const hasSampleData = typeof mockDataSeededAt === "number";

	// Honour the settings search filter — when the user types a query the
	// shell narrows visible sections via `matchingIds`. Mirror what
	// `<SettingsSection>` does so this custom card disappears just like a
	// regular section when filtered out.
	const { matchingIds } = useSearchFilter();
	const sectionId = "workspace.template";
	if (matchingIds && !matchingIds.has(sectionId)) {
		// Sample-data section is its own SettingsSection below, so still
		// render the wrapper fragment to evaluate that branch.
	}

	const handleClear = async () => {
		setClearing(true);
		try {
			const r = await clearMockData({ orgId });
			toast.success(
				`Cleared ${r.deleted} sample records`,
				"Real data is untouched. The dashboard banner will disappear and the template seeder can run again later.",
			);
			setConfirmClear(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't clear sample data. Please try again.");
		} finally {
			setClearing(false);
		}
	};

	const handleConfirm = async () => {
		if (!confirmTemplateId) return;
		setPending(confirmTemplateId);
		try {
			await applyTemplate({ orgId, templateId: confirmTemplateId });
			toast.success(
				`Applied "${confirmTemplate?.label ?? confirmTemplateId}" template`,
				"Existing data was kept untouched. Any missing pipelines, fields, tags, note categories, or saved views were added.",
			);
			setConfirmTemplateId(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't apply template. Please try again.");
		} finally {
			setPending(null);
		}
	};

	const showInline = !matchingIds || matchingIds.has(sectionId);

	return (
		<>
			{showInline && (
				<Card
					id={sectionId}
					className="min-w-0 max-w-full scroll-mt-6 gap-0 overflow-hidden p-0"
				>
					{/* Header IS the toggle. No chevron per explicit user
					    direction; the cursor change + hover background +
					    aria-expanded carry the affordance. */}
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						className={cn(
							"flex w-full min-w-0 items-start gap-2 px-6 py-4 text-start transition-colors",
							"hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
						aria-expanded={open}
						aria-controls={`${sectionId}-body`}
					>
						<div className="min-w-0 flex-1">
							<h3 className="min-w-0 font-semibold text-sm sm:text-base">
								Workspace Template
							</h3>
							<p className="mt-0.5 min-w-0 break-words text-balance text-muted-foreground text-xs sm:text-sm">
								Pre-built industry packs that seed pipelines, fields, tags, note
								categories, saved views, AI persona, and reminder defaults.
								Re-applying is additive — your data is preserved.
							</p>
						</div>
						<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{open ? "Hide" : "Show"}
						</span>
					</button>

					{open && (
						<CardContent
							id={`${sectionId}-body`}
							className="flex min-w-0 flex-col border-t pt-4"
						>
							{templates === undefined ? (
								<div className="flex h-32 items-center justify-center text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
								</div>
							) : templates.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No templates registered yet, or every template was hidden in the
									platform admin panel.
								</p>
							) : (
								<ul className="grid gap-3 md:grid-cols-2">
									{templates.map((t) => {
										const isCurrent = t.id === currentTemplateId;
										const isPending = pending === t.id;
										return (
											<li
												key={t.id}
												className={cn(
													"flex flex-col gap-3 rounded-[var(--radius)] border p-3 transition-colors sm:p-4",
													isCurrent
														? "border-primary/50 bg-primary/5"
														: "border-border bg-background hover:bg-muted/40",
												)}
											>
												<header className="flex items-start gap-2 sm:gap-3">
													<span
														className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-muted text-lg"
														aria-hidden="true"
													>
														{t.icon ?? "📋"}
													</span>
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-1.5">
															<h3 className="truncate font-medium text-sm">
																{t.label}
															</h3>
															{isCurrent && (
																<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[10px] text-primary uppercase tracking-wide">
																	<Check className="size-3" />
																	Current
																</span>
															)}
															{t.region && t.region !== "global" && (
																<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
																	{t.region}
																</span>
															)}
														</div>
														<p className="mt-1 text-muted-foreground text-xs leading-snug">
															{t.description}
														</p>
													</div>
												</header>

												<dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
													<TemplateStat
														label="Pipeline"
														value={t.pipelineName}
													/>
													<TemplateStat
														label="Stages"
														value={`${t.pipelineStageCount}`}
													/>
													<TemplateStat
														label="Tags"
														value={`${t.tagCount} preset${t.tagCount === 1 ? "" : "s"}`}
													/>
													<TemplateStat
														label="Note categories"
														value={`${t.noteCategoryCount}`}
													/>
													<TemplateStat
														label="Saved views"
														value={`${t.savedViewCount}`}
													/>
													<TemplateStat
														label="Custom roles"
														value={`${t.customRoleCount}`}
													/>
												</dl>

												<div className="mt-auto flex justify-end pt-1">
													<Button
														type="button"
														size="sm"
														variant={isCurrent ? "outline" : "default"}
														disabled={!canEdit || isPending}
														onClick={() => setConfirmTemplateId(t.id)}
													>
														{isPending ? (
															<>
																<Loader2 className="size-3.5 animate-spin" />
																Applying…
															</>
														) : isCurrent ? (
															<>
																<Sparkles className="size-3.5" />
																Re-apply
															</>
														) : (
															"Switch to this template"
														)}
													</Button>
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</CardContent>
					)}
				</Card>
			)}

			<Dialog
				open={confirmTemplateId !== null}
				onOpenChange={(modalOpen) => {
					if (!modalOpen) setConfirmTemplateId(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{confirmTemplate?.id === currentTemplateId
								? `Re-apply "${confirmTemplate?.label}" template?`
								: `Switch to "${confirmTemplate?.label}"?`}
						</DialogTitle>
						<DialogDescription>
							This is <strong>additive only</strong>. Your existing pipelines, fields,
							tags, note categories, saved views, and roles are kept untouched —
							anything that's missing from the template will be added. Nothing is
							deleted.
						</DialogDescription>
					</DialogHeader>
					<ul className="ms-2 list-disc space-y-1 text-muted-foreground text-sm">
						<li>
							{confirmTemplate?.pipelineStageCount ?? 0}-stage pipeline ("
							{confirmTemplate?.pipelineName}") added if missing
						</li>
						<li>
							{confirmTemplate?.tagCount ?? 0} curated tags ·{" "}
							{confirmTemplate?.noteCategoryCount ?? 0} note categories ·{" "}
							{confirmTemplate?.savedViewCount ?? 0} saved views (skipped if already
							present by name)
						</li>
						<li>
							{confirmTemplate?.customRoleCount ?? 0} custom orgRoles seeded (skipped
							if already present)
						</li>
						<li>
							Workspace AI persona, reminder defaults, follow-up cadence, and
							file-upload policy filled in for any keys you haven't set
						</li>
					</ul>
					<DialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setConfirmTemplateId(null)}
							disabled={pending !== null}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleConfirm}
							disabled={pending !== null || !canEdit}
						>
							{pending !== null ? (
								<>
									<Loader2 className="size-3.5 animate-spin" />
									Applying…
								</>
							) : (
								"Apply template"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{hasSampleData && (
				<SettingsSection
					id="workspace.sampleData"
					title="Sample Data"
					description="Your workspace was seeded with sample leads, contacts, deals, companies, notes, and reminders so it didn't feel empty on first open. Clear them once you've added your own — real data is never touched."
				>
					<div className="flex flex-col gap-3 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-700/40 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-3">
							<Trash2 className="mt-0.5 size-4 flex-none text-amber-600 dark:text-amber-300" />
							<div className="text-sm">
								<p className="font-medium">Delete sample data</p>
								<p className="mt-0.5 text-muted-foreground">
									Hard-deletes every record tagged{" "}
									<code className="text-xs">source: "template_seed"</code> across
									all six tables. Counters update automatically. Cannot be undone.
								</p>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="self-end border-amber-400/60 text-amber-900 hover:bg-amber-100 dark:border-amber-700/50 dark:text-amber-100 dark:hover:bg-amber-900/30 sm:self-auto"
							disabled={!canEdit || clearing}
							onClick={() => setConfirmClear(true)}
						>
							{clearing ? (
								<>
									<Loader2 className="size-3.5 animate-spin" />
									Clearing…
								</>
							) : (
								<>
									<Trash2 className="size-3.5" />
									Delete sample data
								</>
							)}
						</Button>
					</div>

					<Dialog open={confirmClear} onOpenChange={setConfirmClear}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete all sample data?</DialogTitle>
								<DialogDescription>
									This permanently removes the sample leads, contacts, deals,
									companies, notes, and reminders that were seeded when you picked
									your industry template.{" "}
									<strong>Your real data is untouched.</strong> This action cannot
									be undone.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setConfirmClear(false)}
									disabled={clearing}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleClear}
									disabled={clearing || !canEdit}
								>
									{clearing ? (
										<>
											<Loader2 className="size-3.5 animate-spin" />
											Clearing…
										</>
									) : (
										"Delete sample data"
									)}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</SettingsSection>
			)}
		</>
	);
}

function TemplateStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2 sm:contents">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="truncate font-medium text-foreground text-end sm:text-start">{value}</dd>
		</div>
	);
}
