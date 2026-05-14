"use client";

/**
 * FieldValueRenderer — switch over render kinds → JSX.
 * Used by EntityCard and list columns to render any field from the FIELD_CATALOG.
 */

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PersonCodeBadge } from "../PersonCodeBadge";
import type { FieldRenderKind } from "../types";
import { StaleIndicator } from "./StaleIndicator";

interface FieldValueRendererProps {
	kind: FieldRenderKind;
	value: unknown;
	/** For currency formatting */
	currencyCode?: string;
	/** For stale indicator */
	staleConfig?: {
		daysInStage: number;
		staleAfterDays?: number;
		warningAfterDays?: number;
		staleColor?: string;
		warningColor?: string;
	};
}

export function FieldValueRenderer({
	kind,
	value,
	currencyCode,
	staleConfig,
}: FieldValueRendererProps) {
	if (value === undefined || value === null) return null;

	switch (kind) {
		case "text":
			return <span className="truncate text-sm">{String(value)}</span>;

		case "email":
			return <span className="truncate text-sm text-muted-foreground">{String(value)}</span>;

		case "phone":
			return <span className="truncate text-sm text-muted-foreground">{String(value)}</span>;

		case "badge":
			return (
				<Badge variant="secondary" className="text-xs capitalize">
					{String(value)}
				</Badge>
			);

		case "tags": {
			const tags = Array.isArray(value) ? value : [];
			if (tags.length === 0) return null;
			return (
				<div className="flex flex-wrap gap-1">
					{tags.slice(0, 3).map((t) => (
						<Badge key={String(t)} variant="outline" className="text-xs">
							{String(t)}
						</Badge>
					))}
					{tags.length > 3 && (
						<Badge variant="outline" className="text-xs">
							+{tags.length - 3}
						</Badge>
					)}
				</div>
			);
		}

		case "personCode":
			return <PersonCodeBadge personCode={String(value)} />;

		case "entityCode":
			return (
				<Badge variant="outline" className="font-mono text-xs">
					{String(value)}
				</Badge>
			);

		case "personDisplay": {
			const person = value as { displayName?: string; avatarUrl?: string } | undefined;
			if (!person) return null;
			return (
				<div className="flex items-center gap-1.5">
					<Avatar className="size-5">
						<AvatarImage src={person.avatarUrl} />
						<AvatarFallback className="text-[9px]">
							{(person.displayName ?? "?").slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="truncate text-sm">{person.displayName}</span>
				</div>
			);
		}

		case "companyLink":
			return <span className="truncate text-sm">{String(value)}</span>;

		case "currency": {
			const num = Number(value);
			if (Number.isNaN(num)) return null;
			const formatted = new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: currencyCode ?? "USD",
				maximumFractionDigits: 0,
			}).format(num);
			return <span className="text-sm font-medium tabular-nums">{formatted}</span>;
		}

		case "stageBadge":
			return (
				<Badge variant="secondary" className="text-xs">
					{String(value)}
				</Badge>
			);

		case "stale":
			if (!staleConfig) return null;
			return <StaleIndicator {...staleConfig} />;

		case "relativeTime": {
			const ts = Number(value);
			if (Number.isNaN(ts)) return null;
			return (
				<span className="text-xs text-muted-foreground">
					{formatDistanceToNow(new Date(ts), { addSuffix: true })}
				</span>
			);
		}

		case "link": {
			const url = String(value);
			return (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
					onClick={(e) => e.stopPropagation()}
				>
					{url.replace(/^https?:\/\//, "").slice(0, 30)}
					<ExternalLinkIcon className="size-3" />
				</a>
			);
		}

		case "count":
			return <span className="text-sm tabular-nums">{String(value)}</span>;

		case "file":
		case "files": {
			// A file-type dynamic field shows a compact "N file(s)" chip with a
			// paperclip icon. The Profile / detail view is where the actual
			// dropzone lives; here we just indicate presence + count.
			const files = Array.isArray(value) ? value : value ? [value] : [];
			if (files.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
			return (
				<span className="inline-flex items-center gap-1 rounded-[calc(var(--radius)-2px)] bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
					📎 {files.length}
				</span>
			);
		}

		case "date": {
			const ts = Number(value);
			if (Number.isNaN(ts)) return <span className="text-sm">{String(value)}</span>;
			return (
				<span className="text-xs text-muted-foreground tabular-nums">
					{new Date(ts).toLocaleDateString()}
				</span>
			);
		}

		case "number":
			return <span className="text-sm tabular-nums">{String(value)}</span>;

		case "checkbox":
			return (
				<span className="text-sm">
					{value ? "✓" : <span className="text-muted-foreground">—</span>}
				</span>
			);

		default:
			return <span className="text-sm">{String(value)}</span>;
	}
}
