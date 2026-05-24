"use client";
/**
 * core/ai/components/preview/FieldPreviewCard.tsx
 *
 * Two-step preview for `create_field`. Layout:
 *
 *   ⊞  Add custom field
 *
 *   Entity     · Lead
 *   Label      · "Lead Source Detail"
 *   Type       · select
 *   Options    · Cold call, Web form, Referral
 *   Required   · Yes
 *
 * Falls back gracefully if any field is missing — the model isn't always
 * thorough about including `options` for select/multiselect.
 */
import { ListChecks, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { PreviewCardProps } from "./index";

function humaniseEntityType(t: string, labels: ReturnType<typeof useEntityLabels>): string {
	switch (t) {
		case "lead":
			return labels.lead.singular ?? "Lead";
		case "contact":
			return labels.contact.singular ?? "Contact";
		case "deal":
			return labels.deal.singular ?? "Deal";
		case "company":
			return labels.company.singular ?? "Company";
		default:
			return t;
	}
}

export function FieldPreviewCard({ args }: PreviewCardProps) {
	const labels = useEntityLabels();
	const entityType = String(args.entityType ?? "—");
	const label = String(args.label ?? args.name ?? "Untitled field");
	const fieldType = String(args.fieldType ?? args.type ?? "text");
	const required = args.required === true;
	const options = Array.isArray(args.options) ? (args.options as unknown[]) : null;
	const optionsList = options
		? options
				.filter((o) => typeof o === "string" && o.length > 0)
				.map(String)
				.slice(0, 6)
		: [];

	return (
		<div className="space-y-2.5 min-w-0">
			<div className="flex items-center gap-2 min-w-0">
				<Sparkles className="size-3.5 text-primary shrink-0" />
				<p className="font-semibold text-sm truncate">Add custom field: {label}</p>
			</div>

			<dl className="space-y-1 text-[11px]">
				<Row dt="Entity">
					<Badge variant="secondary" className="text-[10px]">
						{humaniseEntityType(entityType, labels)}
					</Badge>
				</Row>
				<Row dt="Label">{label}</Row>
				<Row dt="Type">
					<span className="font-mono text-muted-foreground">{fieldType}</span>
				</Row>
				{optionsList.length > 0 && (
					<Row dt="Options">
						<div className="flex flex-wrap gap-1">
							{optionsList.map((o) => (
								<Badge key={o} variant="outline" className="text-[10px]">
									{o}
								</Badge>
							))}
							{options && options.length > optionsList.length && (
								<span className="text-muted-foreground">
									+{options.length - optionsList.length} more
								</span>
							)}
						</div>
					</Row>
				)}
				{(fieldType === "select" || fieldType === "multiselect") &&
					optionsList.length === 0 && (
						<Row dt="Options">
							<span className="text-amber-600 dark:text-amber-400 text-[11px] inline-flex items-center gap-1">
								<ListChecks className="size-3" />
								No options provided yet
							</span>
						</Row>
					)}
				<Row dt="Required">{required ? "Yes" : "No"}</Row>
			</dl>
		</div>
	);
}

function Row({ dt, children }: { dt: string; children: React.ReactNode }) {
	return (
		<div className="flex gap-2 min-w-0">
			<dt className="w-20 shrink-0 text-muted-foreground">{dt}</dt>
			<dd className="min-w-0 flex-1 break-words font-medium">{children}</dd>
		</div>
	);
}
