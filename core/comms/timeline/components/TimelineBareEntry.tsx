"use client";

/**
 * TimelineBareEntry — compact one-or-two-line activity log entry.
 *
 * Visual contract (action-first):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ◯  Lead created                          5m ago · by Umar 🟢│
 *   │     Acme Corp · P-001                                        │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *   - Left: small icon node with a coloured ring (action class colour
 *     — green for created, blue for updated, etc.). The ring carries
 *     the action's identity at a glance.
 *   - Title row: bold action statement first ("Lead created"), then
 *     trailing meta (relative time · "by {actor}" + tiny avatar) on
 *     the inline-end.
 *   - Subject row: the affected entity — the thing's display name
 *     plus its code badge. Click-through to the detail page when a
 *     code is available.
 *
 * Why this shape
 * ──────────────
 * Per direct user feedback (2026-05-19): the user reads the action
 * first ("what happened"), then the subject ("to what / whom"), and
 * only then the actor metadata. The previous design led with the
 * actor name + avatar which made every entry visually identical; the
 * eye had no anchor for distinguishing "lead created" from "deal won"
 * from "reminder set".
 */

import { format, formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useOrgMemberMap } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn, getInitials } from "@/lib/utils";
import { resolveActionTheme } from "./action-theme";
import { TimelineConnector } from "./TimelineConnector";
import type { TimelineActivityEntry } from "./types";

interface TimelineBareEntryProps {
	entry: TimelineActivityEntry;
	/** When true, this is the final entry — no connector below the icon. */
	isLast?: boolean;
	/** Pixel gap between siblings — forwarded to the icon's connector. */
	gapPx?: number;
}

export function TimelineBareEntry({ entry, isLast, gapPx }: TimelineBareEntryProps) {
	const memberMap = useOrgMemberMap();
	const member = memberMap.get(String(entry.userId));
	const actorName = member?.user?.name ?? member?.user?.email ?? "Someone";
	const avatarUrl = member?.user?.avatarUrl;

	const theme = resolveActionTheme({
		entityType: entry.entityType,
		action: entry.action,
		actorType: entry.actorType,
	});

	// `field_updated` entries carry the precise change in their
	// description (e.g. "Status: new → qualified"). Surface that as the
	// headline directly so the user sees WHAT changed at a glance,
	// instead of a generic "Lead updated" verb. Other actions fall
	// through to the theme's resolved verb.
	const headline =
		entry.action === "field_updated" && entry.description ? entry.description : theme.titleVerb;

	const subject = extractSubject(entry);

	return (
		<div className="relative flex items-start gap-3">
			{/* Action node — small ring with icon. Centred at the rail. */}
			<ActionNode theme={theme} isLast={isLast} gapPx={gapPx} />

			{/* Content */}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
				{/* Title row */}
				<div className="flex items-baseline justify-between gap-3">
					<div className="text-sm font-semibold text-foreground">{headline}</div>
					<TrailingMeta
						time={entry.createdAt}
						actorName={actorName}
						actorAvatarUrl={avatarUrl}
					/>
				</div>

				{/* Subject row — the affected entity */}
				{subject && (
					<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
						{subject.name && <span className="text-foreground/80">{subject.name}</span>}
						{subject.code && (
							<>
								{subject.name && <span aria-hidden>·</span>}
								<IdentityBadge
									entityType={subject.codeKind}
									code={subject.code}
									layout="code"
									size="xs"
								/>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Action node (small ring with icon, sits on rail) ────────────────────────

export function ActionNode({
	theme,
	isLast = false,
	gapPx = 28,
	className,
}: {
	theme: ReturnType<typeof resolveActionTheme>;
	/** When true, the connector beneath this icon is hidden (final entry). */
	isLast?: boolean;
	/** Pixel gap between sibling entries — used by the connector. */
	gapPx?: number;
	className?: string;
}) {
	const Icon = theme.Icon;
	return (
		<div
			className={cn(
				// 32px slot — same total width as the "sm" avatar (24px) + ring/breathing
				// room. Acts as the column the rail connectors live in.
				"relative z-10 flex size-8 shrink-0 items-center justify-center",
				className,
			)}
		>
			<div
				className={cn(
					// 24px circle — same size as a default sm avatar so entries don't
					// look top-heavy. ring-2 ring-background covers the connector
					// stub at the icon edge so the line reads as joining the icons.
					"flex size-6 items-center justify-center rounded-full border-2 ring-2 ring-background",
					theme.ringClass,
					theme.bgClass,
				)}
			>
				<Icon className={cn("size-3", theme.iconClass)} aria-hidden />
			</div>
			<TimelineConnector visible={!isLast} gapPx={gapPx} />
		</div>
	);
}

// ─── Trailing meta (time + actor avatar + name, on inline-end) ───────────────

export function TrailingMeta({
	time,
	actorName,
	actorAvatarUrl,
}: {
	time: number;
	actorName: string;
	actorAvatarUrl?: string;
}) {
	return (
		<div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
			<time
				dateTime={new Date(time).toISOString()}
				title={format(time, "PPP p")}
				className="tabular-nums"
			>
				{formatDistanceToNow(time, { addSuffix: true })}
			</time>
			<span aria-hidden>·</span>
			<span className="hidden whitespace-nowrap sm:inline">by {actorName}</span>
			<Avatar size="sm" className="size-4 shrink-0">
				<AvatarImage src={actorAvatarUrl} alt={actorName} />
				<AvatarFallback className="text-[8px]">{getInitials(actorName)}</AvatarFallback>
			</Avatar>
		</div>
	);
}

// ─── Subject extraction ──────────────────────────────────────────────────────

/**
 * Pull the "affected thing" out of the entry. Three sources, in priority:
 *   1. `description` — usually formatted "Lead created: Acme Corp" or
 *      "Deal won: Big Deal". We split on the colon to extract the name.
 *   2. `metadata.followUpCode` / `dealCode` — present for cross-entity actions.
 *   3. `personCode` — the stable identity for person-related actions.
 *
 * Returns `{ name?, code?, codeKind? }` so the renderer can compose
 * "{name} · {code}".
 */
function extractSubject(entry: TimelineActivityEntry): {
	name?: string;
	code?: string;
	codeKind: "person" | "deal" | "company" | "lead" | "contact";
} | null {
	const meta = entry.metadata as
		| { followUpCode?: string; dealCode?: string; companyCode?: string }
		| undefined;

	// Code preference order: deal/company-specific code > person code
	const codeKind: "person" | "deal" | "company" | "lead" | "contact" =
		entry.entityType === "deal"
			? "deal"
			: entry.entityType === "company"
				? "company"
				: entry.entityType === "lead"
					? "lead"
					: entry.entityType === "contact"
						? "contact"
						: "person";

	let code: string | undefined;
	if (entry.entityType === "deal" && meta?.dealCode) {
		code = meta.dealCode;
	} else if (entry.entityType === "company" && meta?.companyCode) {
		code = meta.companyCode;
	} else if (entry.personCode) {
		code = entry.personCode;
	}

	// Pull the display name out of the description ("Lead created: Acme Corp"
	// → "Acme Corp"). If no colon, drop the description (it's just the verb).
	//
	// `field_updated` is special — its description IS the headline
	// ("Status: new → qualified"), not a subject hint. Skip the colon
	// split so we don't mis-render half the change pair as the subject.
	let name: string | undefined;
	if (entry.description && entry.action !== "field_updated") {
		const colonIdx = entry.description.indexOf(":");
		if (colonIdx >= 0 && colonIdx < entry.description.length - 1) {
			name = entry.description.slice(colonIdx + 1).trim();
		}
	}

	if (!name && !code) return null;
	return { name, code, codeKind };
}
