"use client";

/**
 * Settings → CRM → Tags.
 *
 * Lets owners/admins curate the workspace's shared tag palette. Tags here
 * are referenced from leads, contacts, deals, and companies via tag-pickers
 * scattered across the app (entity card, detail header, deal kanban, …).
 *
 * Extracted from `CRMGroup` on 2026-05-17 when CRM gained a tabbed sub-nav
 * and several sibling sections (Notes, Reminders, Follow-ups, Timeline).
 */

import { useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { resolveEntityLabels } from "../../../types";
import { SettingsSection } from "../../shared/SettingsSection";

// 18 curated palette colours + a native custom colour picker fallback. Pairs
// are evenly spaced across the hue wheel so adjacent tags remain distinguishable.
const TAG_COLORS = [
	"#ef4444", // red
	"#f97316", // orange
	"#f59e0b", // amber
	"#eab308", // yellow
	"#84cc16", // lime
	"#22c55e", // green
	"#10b981", // emerald
	"#14b8a6", // teal
	"#06b6d4", // cyan
	"#0ea5e9", // sky
	"#3b82f6", // blue
	"#6366f1", // indigo
	"#8b5cf6", // violet
	"#a855f7", // purple
	"#d946ef", // fuchsia
	"#ec4899", // pink
	"#f43f5e", // rose
	"#64748b", // slate
];

interface TagsSectionProps {
	orgId: Id<"orgs">;
	labels: ReturnType<typeof resolveEntityLabels>;
}

export function TagsSection({ orgId, labels }: TagsSectionProps) {
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

				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
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
					<div className="flex items-center gap-1 flex-wrap">
						{TAG_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								aria-label={`Use color ${c}`}
								onClick={() => setNewColor(c)}
								className="size-4 rounded-full border border-transparent transition-transform hover:scale-110"
								style={{
									backgroundColor: c,
									outline: newColor === c ? "2px solid var(--ring)" : undefined,
									outlineOffset: newColor === c ? "1px" : undefined,
								}}
							/>
						))}
						<label
							className="group/custom relative inline-flex size-4 cursor-pointer items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-[9px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
							title="Custom color"
							aria-label="Custom color picker"
						>
							<span aria-hidden>+</span>
							<input
								type="color"
								value={newColor ?? "#3b82f6"}
								onChange={(e) => setNewColor(e.target.value)}
								className="absolute inset-0 size-full cursor-pointer opacity-0"
							/>
						</label>
					</div>
					<Button size="sm" onClick={handleCreate} disabled={!newTag.trim()}>
						<Plus className="size-4" /> Add tag
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
