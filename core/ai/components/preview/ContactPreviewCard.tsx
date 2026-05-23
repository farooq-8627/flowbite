"use client";
/**
 * core/ai/components/preview/ContactPreviewCard.tsx
 *
 * Two-step preview for `create_contact`. Like LeadPreviewCard but with
 * job title + company link slots, since contacts are usually qualified
 * people already attached to an account.
 */
import { Briefcase, Mail, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { PreviewCardProps } from "./index";

function initials(first?: string, last?: string): string {
	const a = (first ?? "").trim()[0]?.toUpperCase() ?? "";
	const b = (last ?? "").trim()[0]?.toUpperCase() ?? "";
	return a + b || "?";
}

export function ContactPreviewCard({ args }: PreviewCardProps) {
	const labels = useEntityLabels();
	const firstName = args.firstName ? String(args.firstName) : "";
	const lastName = args.lastName ? String(args.lastName) : "";
	const fullName = `${firstName} ${lastName}`.trim() || "Untitled contact";
	const email = args.email ? String(args.email) : null;
	const phone = args.phone ? String(args.phone) : null;
	const jobTitle = args.jobTitle ? String(args.jobTitle) : null;
	const companyId = args.companyId ? String(args.companyId) : null;

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-3">
				<Avatar className="size-10 shrink-0 bg-sky-500/15 text-sky-700 dark:text-sky-300">
					<AvatarFallback className="bg-sky-500/15 text-sky-700 dark:text-sky-300 text-xs font-semibold">
						{initials(firstName, lastName)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="truncate font-semibold text-sm">{fullName}</p>
						<Badge variant="secondary" className="shrink-0 text-[10px]">
							{labels.contact.singular ?? "Contact"}
						</Badge>
					</div>
					{jobTitle && (
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{jobTitle}
						</p>
					)}
				</div>
			</div>

			<div className="space-y-1 ps-12 text-[11px] text-muted-foreground">
				{email && (
					<div className="flex items-center gap-1.5 truncate">
						<Mail className="size-3 shrink-0" />
						<span className="truncate">{email}</span>
					</div>
				)}
				{phone && (
					<div className="flex items-center gap-1.5">
						<Phone className="size-3 shrink-0" />
						{phone}
					</div>
				)}
				{companyId && (
					<div className="flex items-center gap-1.5">
						<Briefcase className="size-3 shrink-0" />
						company linked
					</div>
				)}
			</div>
		</div>
	);
}
