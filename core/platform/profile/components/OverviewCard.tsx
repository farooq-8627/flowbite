"use client";

import { useQuery } from "convex/react";
import {
	BellIcon,
	BotIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClockIcon,
	MailIcon,
	MessageSquareTextIcon,
	PhoneIcon,
	SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn, getInitials } from "@/lib/utils";

type Props = {
	personCode: string;
	/**
	 * Compact mode — used for hover quick-views. Renders without the outer
	 * `<Card>` chrome and limits each section to fewer rows so the popover
	 * stays small. Defaults to `false` (full embedded mode for the profile
	 * Overview tab).
	 */
	compact?: boolean;
	className?: string;
};

const MESSAGES_LIMIT_DEFAULT = 4;
const MESSAGES_LIMIT_COMPACT = 2;
const PER_CARD_LIMIT = 3;
const DEALS_LIMIT = 3;

type PersonResult = {
	entity: Doc<"leads"> | Doc<"contacts">;
	type: "lead" | "contact";
	createdBy: {
		userId: string;
		name?: string;
		email?: string;
		avatarUrl?: string;
	} | null;
};

export function OverviewCard({ personCode, compact = false, className }: Props) {
	const { orgId } = useCurrentOrg();
	const messageLimit = compact ? MESSAGES_LIMIT_COMPACT : MESSAGES_LIMIT_DEFAULT;

	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	// ── Person resolution (lead or contact) — also brings creator info ────
	const person = useQuery(
		api.crm.people.queries.getByPersonCode,
		orgId ? { orgId, personCode } : "skip",
	) as PersonResult | null | undefined;

	// ── Cross-section data, all bounded ───────────────────────────────────
	const messages = useQuery(
		api.crm.shared.messages.queries.listForPerson,
		orgId ? { orgId, personCode, limit: messageLimit } : "skip",
	);
	const reminders = useQuery(
		api.crm.shared.reminders.queries.listForPerson,
		orgId ? { orgId, personCode } : "skip",
	);
	const deals = useQuery(
		api.crm.entities.deals.queries.listByPersonCode,
		orgId ? { orgId, personCode, limit: DEALS_LIMIT } : "skip",
	);

	const isLoading = person === undefined;
	const entity = person?.entity;
	const personType = person?.type;
	const createdBy = person?.createdBy ?? null;

	const profileBaseHref = useMemo(() => {
		if (!orgSlug) return null;
		return `/${locale ?? "en"}/${orgSlug}/profile/${personCode}`;
	}, [orgSlug, locale, personCode]);

	const inner = (
		<div
			className={cn(
				"flex flex-col gap-3",
				compact ? "p-3 text-xs" : "p-4 text-sm",
				className,
			)}
		>
			{isLoading ? (
				<p className="text-xs text-muted-foreground">Loading…</p>
			) : !entity ? (
				<p className="text-xs text-muted-foreground">Person not found.</p>
			) : (
				<>
					<HeaderRow
						person={entity}
						personType={personType}
						orgId={orgId}
						createdBy={createdBy}
						compact={compact}
					/>

					{!compact && (
						<div className="grid gap-3 lg:grid-cols-3">
							<RecentMessagesCard
								personCode={personCode}
								profileBase={profileBaseHref}
								orgId={orgId}
								personEntity={entity}
								messages={messages as Array<Doc<"messages">> | undefined}
								limit={PER_CARD_LIMIT}
							/>
							<FollowupsCard
								personCode={personCode}
								profileBase={profileBaseHref}
								reminders={reminders as Array<Doc<"reminders">> | undefined}
								limit={PER_CARD_LIMIT}
							/>
							<RemindersCard
								personCode={personCode}
								profileBase={profileBaseHref}
								reminders={reminders as Array<Doc<"reminders">> | undefined}
								limit={PER_CARD_LIMIT}
							/>
						</div>
					)}

					{!compact && (
						<DealsCard
							profileBase={profileBaseHref}
							deals={deals as Array<Doc<"deals">> | undefined}
							limit={DEALS_LIMIT}
						/>
					)}

					{compact && (
						// Hover-card density — same data, single column
						<div className="flex flex-col gap-2">
							<RecentMessagesCard
								personCode={personCode}
								profileBase={profileBaseHref}
								orgId={orgId}
								personEntity={entity}
								messages={messages as Array<Doc<"messages">> | undefined}
								limit={2}
								dense
							/>
							<FollowupsCard
								personCode={personCode}
								profileBase={profileBaseHref}
								reminders={reminders as Array<Doc<"reminders">> | undefined}
								limit={2}
								dense
							/>
						</div>
					)}
				</>
			)}
		</div>
	);

	if (compact) {
		// Hover-card / popover usage — caller already provides the popover
		// frame, so we render plain content without our own Card chrome.
		return inner;
	}

	return <Card className={cn("py-0", className)}>{inner}</Card>;
}

// ─── Header row ─────────────────────────────────────────────────────────────

function HeaderRow({
	person,
	personType,
	orgId,
	createdBy,
	compact,
}: {
	person: Doc<"leads"> | Doc<"contacts">;
	personType: "lead" | "contact" | undefined;
	orgId: Id<"orgs"> | undefined;
	createdBy: PersonResult["createdBy"];
	compact: boolean;
}) {
	const status = (person as Doc<"leads">).status;
	const source = (person as Doc<"leads">).source;
	const initials = getInitials(person.displayName ?? "?");
	const personId = person._id as string;
	const tagsEntityType = personType ?? "lead";

	return (
		<div className="flex items-start justify-between gap-3">
			{/* ── Left: avatar + identity + status + tags + source ── */}
			<div className="flex min-w-0 flex-1 items-start gap-3">
				<Avatar className={compact ? "size-9" : "size-11"}>
					<AvatarFallback className={compact ? "text-xs" : "text-sm"}>
						{initials}
					</AvatarFallback>
				</Avatar>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="truncate font-semibold leading-tight">
							{person.displayName}
						</span>
						<IdentityBadge
							entityType="person"
							code={person.personCode}
							layout="code"
							size="xs"
						/>
						{personType && (
							<Badge
								variant="outline"
								className="h-5 text-[10px] capitalize text-muted-foreground"
							>
								{personType}
							</Badge>
						)}
					</div>
					{/* Tags + source on second line */}
					<div className="flex flex-wrap items-center gap-1.5">
						{personType === "lead" && status && (
							<StatusPill slot="lead" value={status} kind="status" />
						)}
						{source && <StatusPill slot="lead" value={source} kind="source" />}
						{orgId && (
							<TagsCell
								orgId={orgId}
								entityType={tagsEntityType}
								entityId={personId}
								size="xs"
								readOnlyAfterFirst={false}
							/>
						)}
					</div>
				</div>
			</div>

			{/* ── Right: created-by, email, phone ── */}
			{!compact && (
				<div className="flex shrink-0 flex-row items-end gap-1.5 sm:gap-3 text-muted-foreground">
					{/* Created-by */}
					{createdBy && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Avatar className="size-6">
									<AvatarImage src={createdBy.avatarUrl} alt="" />
									<AvatarFallback className="text-[8px]">
										{getInitials(createdBy.name ?? createdBy.email ?? "?")}
									</AvatarFallback>
								</Avatar>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								Created by {createdBy.name ?? createdBy.email ?? "Unknown"}
							</TooltipContent>
						</Tooltip>
					)}
					{/* Email */}
					{person.email && (
						<Tooltip>
							<TooltipTrigger asChild>
								<a
									href={`mailto:${person.email}`}
									onClick={(e) => e.stopPropagation()}
									className="self-center"
								>
									<MailIcon className="size-5" aria-hidden />
								</a>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								{person.email}
							</TooltipContent>
						</Tooltip>
					)}
					{/* Phone */}
					{person.phone && (
						<Tooltip>
							<TooltipTrigger asChild>
								<a
									href={`tel:${person.phone}`}
									onClick={(e) => e.stopPropagation()}
									className="self-center"
								>
									<PhoneIcon className="size-5" aria-hidden />
								</a>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="text-xs">
								{person.phone}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * StatusPill — small chip with a colored dot prefix and the value text.
 * Reuses `getStatusColor` so leads' status (new/contacted/qualified/…) and
 * sources (manual/csv/…) render in their canonical hue.
 */
function StatusPill({
	slot,
	value,
	kind,
}: {
	slot: "lead" | "contact";
	value: string;
	kind: "status" | "source";
}) {
	const color = getStatusColor(slot, value);
	const Icon = kind === "status" ? CheckCircle2Icon : SparklesIcon;
	const tooltip = kind === "status" ? `Status: ${value}` : `Source: ${value}`;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge
					variant="outline"
					className="h-5 gap-1 px-1.5 text-[10px] capitalize"
					style={{
						backgroundColor: `${color}1a`,
						borderColor: `${color}66`,
						color,
					}}
				>
					<Icon className="size-3" aria-hidden />
					<span>{value}</span>
				</Badge>
			</TooltipTrigger>
			<TooltipContent side="top" className="text-xs capitalize">
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

// ─── Recent messages card ───────────────────────────────────────────────────

function RecentMessagesCard({
	personCode,
	profileBase,
	orgId,
	personEntity,
	messages,
	limit,
	dense,
}: {
	personCode: string;
	profileBase: string | null;
	orgId: Id<"orgs"> | undefined;
	personEntity: Doc<"leads"> | Doc<"contacts">;
	messages: Array<Doc<"messages">> | undefined;
	limit: number;
	dense?: boolean;
}) {
	const items = (messages ?? []).slice(0, limit);
	const href = profileBase ? `${profileBase}#messages.thread` : null;
	const members = useOrgMembers();
	const memberById = useMemo(() => {
		const map = new Map<string, { name?: string; email?: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(m.userId as string, {
				name: m.user?.name,
				email: m.user?.email,
				avatarUrl: m.user?.avatarUrl,
			});
		}
		return map;
	}, [members]);

	return (
		<MiniCard
			title="Latest messages"
			Icon={MessageSquareTextIcon}
			href={href}
			emptyLabel="No messages yet"
			isEmpty={items.length === 0}
			dense={dense}
		>
			<ul className="flex flex-col gap-2">
				{items.map((msg) => {
					const isFromContact = msg.authorType === "contact";
					const isAi = msg.authorType === "ai";
					// Resolve sender display:
					//   - contact → use the person's avatar/name
					//   - ai → AI badge
					//   - user → org member
					const sender = isFromContact
						? {
								name: personEntity.displayName,
								avatarUrl: undefined,
							}
						: isAi
							? { name: "AI", avatarUrl: undefined }
							: (memberById.get(msg.authorId as string) ?? {
									name: undefined,
									avatarUrl: undefined,
								});
					return (
						<li key={msg._id} className="flex items-start gap-1.5">
							<Avatar className="size-5 shrink-0">
								<AvatarImage src={sender.avatarUrl} alt={sender.name ?? ""} />
								<AvatarFallback className="text-[8px]">
									{isAi ? (
										<BotIcon className="size-3" />
									) : (
										getInitials(sender.name ?? "?")
									)}
								</AvatarFallback>
							</Avatar>
							<div
								className={cn(
									"flex min-w-0 flex-col rounded-[var(--radius)] border px-2 py-1 leading-snug",
									isFromContact
										? "bg-muted/30"
										: isAi
											? "bg-primary/5 border-primary/20"
											: "bg-card",
								)}
							>
								<span className="truncate text-[11px] text-foreground">
									{msg.content || "(empty message)"}
								</span>
								<span className="text-[10px] text-muted-foreground tabular-nums">
									{relativeShort(msg._creationTime)}
									{sender.name ? ` · ${sender.name}` : null}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
			{!orgId && null /* keep ESLint happy when orgId is unused */}
			{!personCode && null}
		</MiniCard>
	);
}

// ─── Follow-ups card (active only) ──────────────────────────────────────────

function FollowupsCard({
	personCode,
	profileBase,
	reminders,
	limit,
	dense,
}: {
	personCode: string;
	profileBase: string | null;
	reminders: Array<Doc<"reminders">> | undefined;
	limit: number;
	dense?: boolean;
}) {
	const items = useMemo(() => {
		return (reminders ?? [])
			.filter((r) => r.source === "followup" && r.status === "pending")
			.sort((a, b) => a.dueAt - b.dueAt)
			.slice(0, limit);
	}, [reminders, limit]);
	const href = profileBase ? `${profileBase}#reminders.followups` : null;

	return (
		<MiniCard
			title="Open follow-ups"
			Icon={CalendarClockIcon}
			href={href}
			emptyLabel="No active follow-ups"
			isEmpty={items.length === 0}
			dense={dense}
		>
			<ul className="flex flex-col gap-1.5">
				{items.map((r) => (
					<ReminderRow key={r._id} reminder={r} />
				))}
			</ul>
			{!personCode && null}
		</MiniCard>
	);
}

// ─── Reminders card (active only — non-followup sources) ────────────────────

function RemindersCard({
	personCode,
	profileBase,
	reminders,
	limit,
	dense,
}: {
	personCode: string;
	profileBase: string | null;
	reminders: Array<Doc<"reminders">> | undefined;
	limit: number;
	dense?: boolean;
}) {
	const items = useMemo(() => {
		return (reminders ?? [])
			.filter((r) => r.source !== "followup" && r.status === "pending")
			.sort((a, b) => a.dueAt - b.dueAt)
			.slice(0, limit);
	}, [reminders, limit]);
	const href = profileBase ? `${profileBase}#reminders.list` : null;

	return (
		<MiniCard
			title="Open reminders"
			Icon={BellIcon}
			href={href}
			emptyLabel="No active reminders"
			isEmpty={items.length === 0}
			dense={dense}
		>
			<ul className="flex flex-col gap-1.5">
				{items.map((r) => (
					<ReminderRow key={r._id} reminder={r} />
				))}
			</ul>
			{!personCode && null}
		</MiniCard>
	);
}

function ReminderRow({ reminder }: { reminder: Doc<"reminders"> }) {
	const isOverdue = reminder.dueAt < Date.now();
	return (
		<li className="flex items-start gap-1.5 text-[11px]">
			<ClockIcon
				className={cn(
					"mt-0.5 size-3 shrink-0",
					isOverdue ? "text-destructive" : "text-muted-foreground",
				)}
				aria-hidden
			/>
			<div className="flex min-w-0 flex-col leading-snug">
				<span className="truncate text-foreground">{reminder.title}</span>
				<span
					className={cn(
						"text-[10px] tabular-nums",
						isOverdue ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{formatDueLabel(reminder.dueAt, isOverdue)}
				</span>
			</div>
		</li>
	);
}

// ─── Deals card ─────────────────────────────────────────────────────────────

function DealsCard({
	profileBase,
	deals,
	limit,
}: {
	profileBase: string | null;
	deals: Array<Doc<"deals">> | undefined;
	limit: number;
}) {
	const items = (deals ?? []).slice(0, limit);
	const href = profileBase ? `${profileBase}#deals.list` : null;

	return (
		<MiniCard
			title="Deals"
			Icon={SparklesIcon}
			href={href}
			emptyLabel="No deals yet"
			isEmpty={items.length === 0}
		>
			<ul className="flex flex-col gap-1.5">
				{items.map((deal) => (
					<DealRow key={deal._id} deal={deal} />
				))}
			</ul>
		</MiniCard>
	);
}

function DealRow({ deal }: { deal: Doc<"deals"> }) {
	const stageColor = getStatusColor("deal", deal.currentStageId);
	const isWon = deal.wonAt !== undefined;
	const isLost = deal.lostAt !== undefined;
	return (
		<li className="flex items-center gap-2 text-[11px]">
			<IdentityBadge entityType="deal" code={deal.dealCode} layout="code" size="xs" />
			<span className="min-w-0 flex-1 truncate text-foreground">{deal.title}</span>
			<Badge
				variant="outline"
				className="h-5 px-1.5 text-[10px] capitalize"
				style={{
					backgroundColor: `${stageColor}1a`,
					borderColor: `${stageColor}66`,
					color: stageColor,
				}}
			>
				{isWon ? "Won" : isLost ? "Lost" : deal.currentStageId.replace(/^stage_/, "")}
			</Badge>
			{deal.value !== undefined && deal.value !== null && (
				<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
					{formatCompactCurrency(deal.value, deal.currency)}
				</span>
			)}
		</li>
	);
}

// ─── Mini-card primitive ────────────────────────────────────────────────────

function MiniCard({
	title,
	Icon,
	href,
	emptyLabel,
	isEmpty,
	children,
	dense,
}: {
	title: string;
	Icon: typeof BellIcon;
	href: string | null;
	emptyLabel: string;
	isEmpty: boolean;
	children: React.ReactNode;
	dense?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card",
				dense ? "p-2" : "p-2.5",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
					<Icon className="size-3" aria-hidden />
					<span>{title}</span>
				</div>
				{href && (
					<Link
						href={href}
						className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
					>
						View all
					</Link>
				)}
			</div>
			{isEmpty ? (
				<p className="text-[11px] text-muted-foreground/70">{emptyLabel}</p>
			) : (
				children
			)}
		</div>
	);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeShort(timestamp?: number): string {
	if (!timestamp) return "—";
	const diff = timestamp - Date.now();
	const abs = Math.abs(diff);
	const min = Math.round(abs / 60_000);
	if (min < 1) return "now";
	if (min < 60) return `${min}m`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.round(hr / 24);
	if (day < 30) return `${day}d`;
	const mo = Math.round(day / 30);
	if (mo < 12) return `${mo}mo`;
	return `${Math.round(mo / 12)}y`;
}

function formatDueLabel(dueAt: number, isOverdue: boolean): string {
	const diffDays = Math.round((dueAt - Date.now()) / (1000 * 60 * 60 * 24));
	if (diffDays === 0) return "today";
	if (diffDays === 1) return "tomorrow";
	if (diffDays === -1) return "yesterday";
	if (isOverdue) return `${Math.abs(diffDays)}d overdue`;
	if (diffDays > 0 && diffDays < 7) return `in ${diffDays}d`;
	try {
		return new Date(dueAt).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	} catch {
		return "—";
	}
}

function formatCompactCurrency(value: number, currency: string | undefined): string {
	const code = currency ?? "USD";
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code,
			notation: "compact",
			maximumFractionDigits: 1,
		}).format(value);
	} catch {
		// Convex sometimes stores `value` as a string from CSV imports; fall
		// back to a plain number so the card still renders.
		return `${code} ${value}`;
	}
}
