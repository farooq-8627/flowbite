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
 */
export function PersonCodeBadge({ personCode, clickable = true, className }: PersonCodeBadgeProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const badge = (
		<Badge
			variant="outline"
			className={cn(
				"font-mono text-xs tabular-nums",
				clickable && "cursor-pointer hover:bg-muted transition-colors",
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
		<Link href={href} onClick={(e) => e.stopPropagation()}>
			{badge}
		</Link>
	);
}
