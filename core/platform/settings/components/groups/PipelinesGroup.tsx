"use client";

/**
 * PipelinesGroup — Settings → Pipelines.
 *
 * Single source of truth for pipeline management. Layout:
 *
 *   ┌─ Header: dropdown selector + "Create" button ─┐
 *   │                                                │
 *   ├─ Pipeline editor box — ONE pipeline at a time ┤
 *   │   • Pipeline-level settings                    │
 *   │   • Stages list                                │
 *   │   • Defaults / per-stage field tabs            │
 *   │                                                │
 *   └────────────────────────────────────────────────┘
 *
 * Why a dropdown (not a stacked list)
 * ───────────────────────────────────
 * The previous version stacked every pipeline editor card on top of each
 * other. With ≥3 pipelines that became hundreds of vertical pixels of
 * scroll. Switching contexts mentally was free; visually it was noisy.
 *
 * The new layout shows ONE pipeline at a time. Switching the dropdown
 * swaps the editor body without re-mounting the surrounding chrome.
 * Persisted per-device under `settings:pipelines:activeId` so refreshing
 * the page (or coming back from another route) restores the last edited
 * pipeline.
 */

import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDealPipelines } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { normalizeError } from "@/lib/normalizeError";
import { SettingsSection } from "../shared/SettingsSection";
import { PipelineEditor } from "./pipelines/PipelineEditor";

export function PipelinesGroup({ orgId }: { orgId: Id<"orgs"> }) {
	const labels = useEntityLabels();
	const dealPipelines = useDealPipelines(orgId);
	const canManage = useOrgPermission(orgId, "pipelines.manage");
	const createPipeline = useMutation(api.crm.fields.pipelines.mutations.create);
	const ensureFields = useMutation(api.crm.fields.fieldDefinitions.mutations.ensureForOrg);

	// Self-heal pass — when the pipelines panel mounts we fire the
	// idempotent `ensureForOrg` once. The seeder is a no-op for orgs that
	// already have every default field, but for orgs where someone
	// previously deleted a re-addable system field (most commonly the
	// `assignedTo` "Assignee" field, before we made it undeletable),
	// this re-inserts it and pins it back onto every deal pipeline's
	// default stage. Without this self-heal those orgs have no way to
	// re-surface "Assignee" in the field selector. Per AGENTS.md
	// "Convex schema/data changes — migrate IN THE SAME MESSAGE": this
	// keeps existing data consistent with the new "Assignee is
	// undeletable" rule.
	useEffect(() => {
		if (!orgId) return;
		ensureFields({ orgId }).catch(() => {
			/* idempotent — silent self-heal */
		});
	}, [orgId, ensureFields]);

	// Active pipeline shown in the editor — persisted per device so the
	// admin lands back on the same pipeline they were last editing.
	const [activeId, setActiveId] = usePersistedState<Id<"pipelines"> | undefined>(
		"settings:pipelines:activeId",
		undefined,
	);

	const [newName, setNewName] = useState("");
	const [creating, setCreating] = useState(false);
	const [showCreateInput, setShowCreateInput] = useState(false);

	// When pipelines load, fall back to the default if no persisted id is
	// valid (e.g. the persisted pipeline was deleted by another admin).
	useEffect(() => {
		if (!dealPipelines || dealPipelines.length === 0) return;
		if (activeId && dealPipelines.some((p) => p._id === activeId)) return;
		const fallback = dealPipelines.find((p) => p.isDefault) ?? dealPipelines[0];
		setActiveId(fallback._id);
	}, [dealPipelines, activeId, setActiveId]);

	const activePipeline = dealPipelines?.find((p) => p._id === activeId);

	const handleCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		setCreating(true);
		try {
			const newPipelineId = await createPipeline({
				orgId,
				name,
				entityType: "deal",
				stages: [],
				// First pipeline an org creates auto-defaults; subsequent ones
				// stay non-default unless promoted via the editor's actions.
				isDefault: (dealPipelines?.length ?? 0) === 0,
			});
			toast.success(`Pipeline "${name}" created`);
			setNewName("");
			setShowCreateInput(false);
			// Switch to the freshly-created pipeline so the user can start
			// adding stages immediately.
			setActiveId(newPipelineId as unknown as Id<"pipelines">);
		} catch (err) {
			toast.error(normalizeError(err, "Failed to create pipeline"));
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<SettingsSection
				id="pipelines.list"
				title="Pipelines"
				description={`Stage workflows that ${labels.deal.plural.toLowerCase()} move through. Pick a pipeline below to edit its stages, default fields, and stage-aware fields.`}
			>
				<div className="flex flex-col gap-4 py-2">
					{dealPipelines === undefined ? (
						<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
							Loading pipelines…
						</div>
					) : dealPipelines.length === 0 ? (
						<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
							No pipelines yet.{" "}
							{canManage
								? "Create your first pipeline below to get started."
								: "Ask an admin to create one."}
						</div>
					) : (
						<>
							{/* ── Selector + Create — single row ─────────── */}
							<div className="flex flex-wrap items-end justify-between gap-2 rounded-[var(--radius)] border bg-muted/10 p-3">
								<div className="flex flex-1 min-w-[16rem] flex-col gap-1.5">
									<Label
										htmlFor="pipeline-selector"
										className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
									>
										Editing pipeline
									</Label>
									<Select
										value={activeId ?? undefined}
										onValueChange={(v) => setActiveId(v as Id<"pipelines">)}
									>
										<SelectTrigger
											id="pipeline-selector"
											className="h-9 w-full text-sm"
										>
											<SelectValue placeholder="Choose a pipeline…" />
										</SelectTrigger>
										<SelectContent>
											{dealPipelines.map((p) => (
												<SelectItem key={p._id} value={p._id}>
													<span className="flex items-center gap-2">
														<span className="font-medium">
															{p.name}
														</span>
														{p.isDefault && (
															<Badge
																variant="secondary"
																className="text-[10px]"
															>
																Default
															</Badge>
														)}
														<span className="text-[10px] text-muted-foreground">
															· {p.stages.length} stages
														</span>
													</span>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{canManage && !showCreateInput && (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => setShowCreateInput(true)}
									>
										<Plus className="size-4" />
										New pipeline
									</Button>
								)}
							</div>

							{/* ── Inline create-pipeline input ─────────────── */}
							{canManage && showCreateInput && (
								<div className="flex flex-col gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 p-3">
									<Label
										htmlFor="new-pipeline-name"
										className="text-xs font-medium"
									>
										New pipeline name
									</Label>
									<div className="flex items-center gap-2">
										<Input
											id="new-pipeline-name"
											autoFocus
											value={newName}
											onChange={(e) => setNewName(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && newName.trim()) {
													e.preventDefault();
													void handleCreate();
												}
												if (e.key === "Escape") {
													setShowCreateInput(false);
													setNewName("");
												}
											}}
											placeholder="e.g. Renewals, Enterprise SaaS, SMB Sales…"
											className="h-9 flex-1 text-sm"
											disabled={creating}
										/>
										<Button
											size="sm"
											type="button"
											onClick={handleCreate}
											disabled={!newName.trim() || creating}
										>
											{creating ? "Creating…" : "Create"}
										</Button>
										<Button
											size="sm"
											type="button"
											variant="ghost"
											onClick={() => {
												setShowCreateInput(false);
												setNewName("");
											}}
											disabled={creating}
										>
											Cancel
										</Button>
									</div>
									<p className="text-[10px] leading-snug text-muted-foreground">
										New pipelines start with a "Default" stage that holds the
										fields shared across every deal. You can rename the Default
										stage and add more stages after creating.
									</p>
								</div>
							)}

							{/* ── Single pipeline editor box ─────────────────── */}
							{activePipeline ? (
								<PipelineEditor
									key={activePipeline._id}
									pipeline={activePipeline}
									orgId={orgId}
								/>
							) : (
								<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
									Pick a pipeline above to start editing.
								</div>
							)}
						</>
					)}
				</div>
			</SettingsSection>
		</div>
	);
}
