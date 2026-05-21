"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

	const currentTemplateId = org.industry ?? null;
	const confirmTemplate = templates?.find((t) => t.id === confirmTemplateId);

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

	return (
		<SettingsSection
			id="workspace.template"
			title="Workspace Template"
			description="Pre-built industry packs that seed pipelines, fields, tags, note categories, saved views, AI persona, and reminder defaults. Re-applying is additive — your data is preserved."
		>
			{templates === undefined ? (
				<div className="flex h-32 items-center justify-center text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
				</div>
			) : templates.length === 0 ? (
				<p className="text-muted-foreground text-sm">No templates registered yet.</p>
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
									<TemplateStat label="Pipeline" value={t.pipelineName} />
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

			<Dialog
				open={confirmTemplateId !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmTemplateId(null);
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
		</SettingsSection>
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
