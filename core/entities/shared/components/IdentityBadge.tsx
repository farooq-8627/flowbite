"use client";

/**
 * IdentityBadge — universal "this is a record" badge.
 *
 * Replaces (and supersedes) the older PersonCodeBadge. Used on cards, tables,
 * profile headers, hover cards — anywhere a record needs a compact, clickable
 * identity chip.
 *
 * SHAPE
 *   ┌─────────────────────────────────────────┐
 *   │ ◎ Acme Corp                             │   ← avatar + display name
 *   │   Technology · acme.com                 │   ← subtitle (optional, muted)
 *   └─────────────────────────────────────────┘
 *
 * CODE PILL VARIANT (compact, used in tight spaces like card bottom-left):
 *   `[P-001]` rendered as a coloured pill.
 *
 * The component supports three layouts:
 *   - "code"  : just the personCode/companyCode/dealCode pill (no name).
 *   - "row"   : avatar + name (+ subtitle), one line.
 *   - "stack" : avatar + name on row 1, subtitle on row 2 (card-style).
 *
 * Click navigates to the detail page derived from `entityType` + `code`:
 *   - person  → /:locale/:org/profile/:code
 *   - company → /:locale/:org/companies/:code
 *   - deal    → /:locale/:org/deals/:code
 *
 * For backwards compat the file also re-exports `PersonCodeBadge` as a thin
 * alias around `<IdentityBadge layout="code" />`.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type IdentityEntityType = "lead" | "contact" | "person" | "company" | "deal" | "user";

export interface IdentityBadgeProps {
	entityType: IdentityEntityType;
	/** Stable code (P-001 / C-001 / D-001) — drives navigation. */
	code?: string;
	/** Display name (person name / company name / deal title). */
	name?: string;
	/** Optional secondary line — e.g. email for a person, industry for a company. */
	subtitle?: string;
	/** Avatar / logo URL. Falls back to initials. */
	avatarUrl?: string;
	/**
	 * "code"  — pill badge only (just the code, e.g. P-001). No name shown.
	 * "row"   — avatar + name in one line (compact).
	 * "stack" — avatar + name on row 1, subtitle on row 2 (card-style).
	 */
	layout?: "code" | "row" | "stack";
	/** Disable navigation. Default: navigate to detail when code+orgSlug exist. */
	clickable?: boolean;
	/** Visual size. Default: sm. */
	size?: "xs" | "sm" | "md";
	className?: string;
}

const SIZE_TOKENS: Record<
	NonNullable<IdentityBadgeProps["size"]>,
	{
		avatar: string;
		name: string;
		subtitle: string;
		codePill: string;
		gap: string;
	}
> = {
	xs: {
		avatar: "size-5 text-[8px]",
		name: "text-[11px] font-medium",
		subtitle: "text-[10px]",
		codePill: "h-4 px-1.5 text-[9px]",
		gap: "gap-1.5",
	},
	sm: {
		avatar: "size-6 text-[9px]",
		name: "text-xs font-medium",
		subtitle: "text-[11px]",
		codePill: "h-5 px-2 text-[10px]",
		gap: "gap-2",
	},
	md: {
		avatar: "size-8 text-xs",
		name: "text-sm font-semibold",
		subtitle: "text-xs",
		codePill: "h-6 px-2.5 text-xs",
		gap: "gap-2.5",
	},
};

export function IdentityBadge({
	entityType,
	code,
	name,
	subtitle,
	avatarUrl,
	layout = "row",
	clickable = true,
	size = "sm",
	className,
}: IdentityBadgeProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;
	const tokens = SIZE_TOKENS[size];

	const href = code && orgSlug ? buildHref(entityType, code, orgSlug, locale) : null;

	if (layout === "code") {
		return (
			<MaybeLink href={clickable ? href : null} className={className}>
				<Badge
					variant="outline"
					className={cn(
						"font-mono tabular-nums no-underline border-primary/30 bg-primary/10 text-primary",
						tokens.codePill,
						clickable &&
							href &&
							"transition-colors hover:bg-primary/15 hover:border-primary/50 hover:no-underline",
					)}
				>
					{code}
				</Badge>
			</MaybeLink>
		);
	}

	const initials = (name ?? code ?? "?").trim().slice(0, 2).toUpperCase();
	const avatar = (
		<Avatar className={cn("shrink-0", tokens.avatar)}>
			<AvatarImage src={avatarUrl} alt={name ?? code ?? ""} />
			<AvatarFallback className={tokens.avatar.split(" ")[1]}>{initials}</AvatarFallback>
		</Avatar>
	);

	const displayName = name ?? code ?? "Unknown";

	const content =
		layout === "stack" ? (
			<div className={cn("flex min-w-0 items-center", tokens.gap)}>
				{avatar}
				<div className="flex min-w-0 flex-col leading-tight">
					<span className={cn("truncate", tokens.name)}>{displayName}</span>
					{subtitle && (
						<span className={cn("truncate text-muted-foreground", tokens.subtitle)}>
							{subtitle}
						</span>
					)}
				</div>
			</div>
		) : (
			<div className={cn("flex min-w-0 items-center", tokens.gap)}>
				{avatar}
				<span className={cn("truncate", tokens.name)}>{displayName}</span>
				{subtitle && (
					<span className={cn("truncate text-muted-foreground", tokens.subtitle)}>
						· {subtitle}
					</span>
				)}
			</div>
		);

	return (
		<MaybeLink href={clickable ? href : null} className={cn("min-w-0", className)}>
			{content}
		</MaybeLink>
	);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function MaybeLink({
	href,
	className,
	children,
}: {
	href: string | null;
	className?: string;
	children: React.ReactNode;
}) {
	if (!href) return <span className={className}>{children}</span>;
	return (
		<Link
			href={href}
			onClick={(e) => e.stopPropagation()}
			className={cn(
				"inline-flex min-w-0 no-underline outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[calc(var(--radius)-2px)] hover:no-underline",
				className,
			)}
			style={{ textDecoration: "none" }}
		>
			{children}
		</Link>
	);
}

function buildHref(
	entityType: IdentityEntityType,
	code: string,
	orgSlug: string,
	locale: string | undefined,
): string {
	const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;
	switch (entityType) {
		case "company":
			return `${prefix}/companies/${code}`;
		case "deal":
			return `${prefix}/deals/${code}`;
		default:
			return `${prefix}/profile/${code}`;
	}
}

// ─── Backwards-compat alias ──────────────────────────────────────────────────

export interface PersonCodeBadgeAliasProps {
	personCode: string;
	clickable?: boolean;
	className?: string;
}

/**
 * @deprecated Use `<IdentityBadge layout="code" entityType="person" code={...} />`.
 * This alias preserves the old import path so we don't have to migrate all
 * callers in a single change.
 */
export function PersonCodeBadge({ personCode, clickable, className }: PersonCodeBadgeAliasProps) {
	return (
		<IdentityBadge
			entityType="person"
			code={personCode}
			layout="code"
			clickable={clickable}
			className={className}
		/>
	);
}
