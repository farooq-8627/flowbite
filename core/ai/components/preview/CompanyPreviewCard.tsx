"use client";
/**
 * core/ai/components/preview/CompanyPreviewCard.tsx
 *
 * Two-step preview for `create_company`. Logo placeholder + name +
 * website + industry. Renders the website as a real anchor so users can
 * verify the link before approving.
 */
import { Building2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { PreviewCardProps } from "./index";

function normalizeUrl(raw: string): { display: string; href: string } | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	const display = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
	return { display, href };
}

export function CompanyPreviewCard({ args }: PreviewCardProps) {
	const labels = useEntityLabels();
	const name = args.name ? String(args.name) : "Untitled company";
	const website = args.website ? normalizeUrl(String(args.website)) : null;
	const industry = args.industry ? String(args.industry) : null;

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-violet-500/15 text-violet-700 dark:text-violet-300">
					<Building2 className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="truncate font-semibold text-sm">{name}</p>
						<Badge variant="secondary" className="shrink-0 text-[10px]">
							{labels.company.singular ?? "Company"}
						</Badge>
					</div>
					{industry && (
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{industry}
						</p>
					)}
				</div>
			</div>

			{website && (
				<a
					href={website.href}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1.5 ps-12 text-[11px] text-primary hover:underline"
				>
					<ExternalLink className="size-3 shrink-0" />
					<span className="truncate">{website.display}</span>
				</a>
			)}
		</div>
	);
}
