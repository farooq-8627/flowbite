"use client";
/**
 * core/ai/components/preview/LeadPreviewCard.tsx
 *
 * Two-step preview for `create_lead`. Layout:
 *
 *   [👤 SK]  Sarah Khan                                    [Lead]
 *            sarah.khan@example.com  ·  +971…              [source: web]
 *            ───────────────────────────────────
 *            “Initial inquiry on Marina property”
 *
 * Fields shown only when present so the card stays compact.
 */
import { Briefcase, Mail, Phone, Sparkles, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { PreviewCardProps } from "./index";

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? "")
			.join("") || "?"
	);
}

export function LeadPreviewCard({ args }: PreviewCardProps) {
	const labels = useEntityLabels();
	const displayName = String(args.displayName ?? "Untitled lead");
	const email = args.email ? String(args.email) : null;
	const phone = args.phone ? String(args.phone) : null;
	const source = args.source ? String(args.source) : "manual";
	const notes = args.notes ? String(args.notes) : null;

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-3">
				<Avatar className="size-10 shrink-0 bg-primary/10 text-primary">
					<AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
						{initials(displayName)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="truncate font-semibold text-sm">{displayName}</p>
						<Badge variant="secondary" className="shrink-0 text-[10px]">
							{labels.lead.singular ?? "Lead"}
						</Badge>
					</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
						{email && (
							<span className="flex items-center gap-1 truncate">
								<Mail className="size-3 shrink-0" />
								{email}
							</span>
						)}
						{phone && (
							<span className="flex items-center gap-1">
								<Phone className="size-3 shrink-0" />
								{phone}
							</span>
						)}
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5 ps-12">
				<Badge variant="outline" className="text-[10px] gap-1">
					<Sparkles className="size-2.5" />
					source: {source}
				</Badge>
				{args.assignedTo ? (
					<Badge variant="outline" className="text-[10px] gap-1">
						<User className="size-2.5" />
						assignee set
					</Badge>
				) : null}
				{args.companyId ? (
					<Badge variant="outline" className="text-[10px] gap-1">
						<Briefcase className="size-2.5" />
						company linked
					</Badge>
				) : null}
			</div>

			{notes && (
				<div className="rounded-[var(--radius)] bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground italic line-clamp-3">
					“{notes}”
				</div>
			)}
		</div>
	);
}
