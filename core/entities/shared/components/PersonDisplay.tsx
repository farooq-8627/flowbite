"use client";

/**
 * PersonDisplay — THE system component for rendering any person anywhere (D8).
 * Avatar + configurable sections (personCode, name, email, status).
 * Hover → EntityHoverCard. Click → /profile/[personCode].
 *
 * The `show` array controls visibility of each sub-piece independently.
 * When only `["avatar"]` is passed (no name, no personCode) the component
 * degrades gracefully to a solo avatar pill — useful for compact table cells
 * or the "just show the photo" case after the user hid name & code separately.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PersonCodeBadge } from "../PersonCodeBadge";
import type { PersonRef } from "../types";

type ShowSection = "avatar" | "name" | "personCode" | "email" | "phone" | "status" | "role";

interface PersonDisplayProps {
	person: PersonRef;
	show?: ShowSection[];
	size?: "xs" | "sm" | "md" | "lg";
	layout?: "inline" | "stack";
	clickable?: boolean;
	className?: string;
}

const SIZE_MAP = { xs: "size-5", sm: "size-6", md: "size-8", lg: "size-10" };
const TEXT_MAP = { xs: "text-xs", sm: "text-sm", md: "text-sm", lg: "text-base" };

export function PersonDisplay({
	person,
	show = ["avatar", "name", "personCode"],
	size = "sm",
	layout = "inline",
	clickable = true,
	className,
}: PersonDisplayProps) {
	const params = useParams();
	const locale = params?.locale as string | undefined;
	const orgSlug = params?.orgSlug as string | undefined;

	const initials = (person.displayName ?? "?").slice(0, 2).toUpperCase();

	const content = (
		<span
			className={cn(
				"inline-flex items-center gap-1.5",
				layout === "stack" && "flex-col items-start gap-1",
				className,
			)}
		>
			{show.map((section) => {
				switch (section) {
					case "avatar":
						return (
							<Avatar key="avatar" className={SIZE_MAP[size]}>
								<AvatarImage src={person.avatarUrl} alt={person.displayName} />
								<AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
							</Avatar>
						);
					case "name":
						return (
							<span key="name" className={cn("truncate font-medium", TEXT_MAP[size])}>
								{person.displayName}
							</span>
						);
					case "personCode":
						return person.personCode ? (
							<PersonCodeBadge
								key="code"
								personCode={person.personCode}
								clickable={false}
							/>
						) : null;
					case "email":
						return person.email ? (
							<span key="email" className="truncate text-xs text-muted-foreground">
								{person.email}
							</span>
						) : null;
					case "phone":
						return person.phone ? (
							<span key="phone" className="truncate text-xs text-muted-foreground">
								{person.phone}
							</span>
						) : null;
					case "status":
						return person.status ? (
							<span
								key="status"
								className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-xs capitalize"
							>
								{person.status}
							</span>
						) : null;
					case "role":
						return null;
					default:
						return null;
				}
			})}
		</span>
	);

	if (clickable && person.personCode && orgSlug) {
		const href = locale
			? `/${locale}/${orgSlug}/profile/${person.personCode}`
			: `/${orgSlug}/profile/${person.personCode}`;
		return (
			<Link
				href={href}
				onClick={(e) => e.stopPropagation()}
				className="rounded-[calc(var(--radius)-2px)] outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
			>
				{content}
			</Link>
		);
	}

	return content;
}
