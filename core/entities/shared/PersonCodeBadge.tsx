"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PersonCodeBadgeProps {
	personCode: string;
	/** If false, renders as plain badge (no link). Default: true */
	clickable?: boolean;
	className?: string;
}

/**
 * PersonCodeBadge — displays P-001 as a clickable link to /profile/P-001.
 *
 * Used on: lead cards, contact cards, deal cards, reminder cards, timeline entries.
 * Clicking navigates to the unified profile page for that person.
 *
 * When clickable=false (e.g., already on the profile page): renders as plain badge.
 *
 * NOTE on `no-underline`: some global CSS resets (and the base link style from
 * some Tailwind recipes) add `text-decoration: underline` to anchors. We
 * explicitly set `no-underline` on the Link AND `hover:no-underline` to
 * override any ancestor rule. If you see an underline reappear, search the
 * ancestors — don't re-add `underline` here.
 */
export function PersonCodeBadge({ personCode, clickable = true, className }: PersonCodeBadgeProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const badge = (
		<Badge
			variant="outline"
			className={cn(
				"font-mono text-xs tabular-nums no-underline",
				clickable &&
					"cursor-pointer transition-colors hover:bg-muted hover:border-ring/40 hover:no-underline",
				className,
			)}
		>
			{personCode}
		</Badge>
	);

	if (!clickable || !orgSlug) return badge;

	const href = locale
		? `/${locale}/${orgSlug}/profile/${personCode}`
		: `/${orgSlug}/profile/${personCode}`;

	return (
		<Link
			href={href}
			onClick={(e) => e.stopPropagation()}
			className="inline-block no-underline hover:no-underline focus:no-underline focus-visible:no-underline"
			style={{ textDecoration: "none" }}
		>
			{badge}
		</Link>
	);
}
