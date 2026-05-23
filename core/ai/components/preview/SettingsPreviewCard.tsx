"use client";
/**
 * core/ai/components/preview/SettingsPreviewCard.tsx
 *
 * Two-step preview for `update_org_settings` and `rename_entity_labels`.
 *
 * Both are workspace-wide changes (require `org.editSettings`), so the
 * card carries an "applies to whole workspace" reminder + a key/value
 * list of the change.
 */
import { Cog, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import type { PreviewCardProps } from "./index";

export function SettingsPreviewCard({ args }: PreviewCardProps) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgName = fullOrgEntry?.org.name ?? "this workspace";

	// rename_entity_labels variant — args.labels is { lead: {singular, plural}, … }
	if (args.labels && typeof args.labels === "object") {
		const labels = args.labels as Record<
			string,
			{ singular?: string; plural?: string } | undefined
		>;
		const entries = Object.entries(labels).filter(([, v]) => !!v?.singular);
		return (
			<div className="space-y-2.5">
				<div className="flex items-center gap-2">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
						<Tag className="size-3.5" />
					</div>
					<span className="font-semibold text-sm">Rename entity labels</span>
				</div>

				<p className="ps-9 text-[11px] text-muted-foreground">
					Applies to all members of <span className="font-medium">{orgName}</span>.
				</p>

				<dl className="ps-9 space-y-1">
					{entries.length === 0 ? (
						<div className="text-[11px] italic text-muted-foreground">
							(no labels to change)
						</div>
					) : (
						entries.map(([slot, value]) => (
							<div key={slot} className="flex items-center gap-2 text-[11px]">
								<dt className="font-mono text-muted-foreground min-w-16">{slot}</dt>
								<dd className="flex items-center gap-1">
									<Badge variant="secondary">{value?.singular}</Badge>
									<span className="text-muted-foreground/60">/</span>
									<Badge variant="outline">{value?.plural}</Badge>
								</dd>
							</div>
						))
					)}
				</dl>
			</div>
		);
	}

	// update_org_settings variant — args.patch is a flat object
	const patch = (args.patch ?? {}) as Record<string, unknown>;
	const entries = Object.entries(patch);

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-2">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
					<Cog className="size-3.5" />
				</div>
				<span className="font-semibold text-sm">Update workspace settings</span>
			</div>

			<p className="ps-9 text-[11px] text-muted-foreground">
				Applies to all members of <span className="font-medium">{orgName}</span>.
			</p>

			<dl className="ps-9 space-y-1">
				{entries.length === 0 ? (
					<div className="text-[11px] italic text-muted-foreground">
						(no settings to change)
					</div>
				) : (
					entries.slice(0, 8).map(([key, value]) => (
						<div key={key} className="flex items-center gap-2 text-[11px]">
							<dt className="min-w-32 shrink-0 font-mono text-muted-foreground">
								{key}
							</dt>
							<dd className="min-w-0 flex-1 truncate font-mono">
								{typeof value === "object"
									? JSON.stringify(value)
									: String(value ?? "—")}
							</dd>
						</div>
					))
				)}
				{entries.length > 8 && (
					<div className="text-[10px] italic text-muted-foreground">
						+{entries.length - 8} more
					</div>
				)}
			</dl>
		</div>
	);
}
