"use client";

/**
 * ChatAvatar — small avatar with optional AI subscript badge.
 *
 * Donor: shadboard `apps/chat/_components/chat-avatar.tsx`. Adapted to:
 *   - Use our `Avatar` primitive (radix-based).
 *   - Support our AI on-behalf badge per FRONTEND-DECISIONS Rule 20
 *     (human's avatar + small "AI" subscript when authorType === "ai").
 *   - Drop the user-status dot (we don't track presence yet — Phase 4).
 *
 * 2026-05-16 update: avatars are ALWAYS `rounded-full`, never themed via
 * `--radius`. AGENTS.md explicitly allows `rounded-full` for avatars/pills/dots.
 * Mixing themed radii with circular avatars produced visually inconsistent
 * stacks (square avatars at radius=0 looked broken in the participant strip).
 *
 * RTL-safe: uses logical `end-*` for the AI badge corner.
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AIMark } from "@/core/ai/components/AIMark";
import { cn, getInitials } from "@/lib/utils";

type ChatAvatarProps = {
	/** Display name — used to derive initials for the fallback. */
	name: string | undefined;
	/** Resolved avatar URL (may be undefined while loading). */
	src?: string;
	/** Avatar diameter in rem. Defaults to 1.75rem (28px) — matches shadboard. */
	size?: number;
	/** When true, overlays a small AI badge in the end-bottom corner. */
	isAI?: boolean;
	/** When provided, the avatar becomes a clickable button (e.g. → profile). */
	onClick?: () => void;
	/** ARIA label when `onClick` is supplied. */
	clickLabel?: string;
	className?: string;
};

export function ChatAvatar({
	name,
	src,
	size = 1.75,
	isAI = false,
	onClick,
	clickLabel,
	className,
}: ChatAvatarProps) {
	const sizeStyle = { height: `${size}rem`, width: `${size}rem` };
	const initials = name ? getInitials(name) : "?";

	const wrapperClasses = cn(
		"relative shrink-0 rounded-full",
		onClick &&
			"cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
		className,
	);

	const inner = (
		<>
			<Avatar style={{ ...sizeStyle, fontSize: `${size / 2.5}rem` }} className="rounded-full">
				<AvatarImage src={src} alt={name ?? "Avatar"} />
				<AvatarFallback className="rounded-full">{initials}</AvatarFallback>
			</Avatar>
			{isAI && (
				<span
					role="img"
					aria-label="Sent on behalf via AI"
					className="absolute -bottom-1 -end-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
				>
					<AIMark size="size-2.5" tone="inverse" aria-hidden="true" />
				</span>
			)}
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				style={sizeStyle}
				className={wrapperClasses}
				onClick={(e) => {
					e.stopPropagation();
					onClick();
				}}
				aria-label={clickLabel ?? `Open ${name ?? "profile"}`}
			>
				{inner}
			</button>
		);
	}

	return (
		<div style={sizeStyle} className={wrapperClasses}>
			{inner}
		</div>
	);
}
