"use client";

/**
 * ThreadHeader — title bar for the active thread.
 *
 * 2026-05-16 update (per user direction):
 *   - The title used to read "Lead · P-005" verbatim. It now resolves the
 *     real entity name via `useEntityDisplay` and renders as a Link to the
 *     entity's profile/detail page. The personCode badge sits next to the
 *     name as a small monospace pill so power users still see the code.
 *   - Each participant avatar in the stack is now clickable. Clicking
 *     opens the participant's user profile route. The aggregate "+N" pill
 *     and the "People" button still open the participants dialog.
 *   - Mobile (<sm): the segmented notification control is replaced with a
 *     single-icon dropdown so it fits next to the People button. A leading
 *     hamburger button (visible only when `onOpenSidebar` is provided)
 *     surfaces the conversation sidebar in a Sheet.
 *
 * 2026-05-17 update (per user direction):
 *   - Notification segmented control / dropdown breakpoint moved from
 *     `sm` (640px) to `lg` (1024px) so iPads get the same compact dropdown
 *     mobile gets — the segmented tabs were squeezing into iPad's chrome.
 *   - The "People" button shows icon-only on mobile (label hidden < sm).
 *   - Avatar links to org members no longer point at the broken
 *     `/{orgSlug}/settings/members/<id>` route. They route to the existing
 *     settings members section (`/settings?group=team#team.members`). Self
 *     avatars are rendered without a link.
 */
import { useQuery } from "convex/react";
import { AtSign, Bell, BellOff, ExternalLink, Loader2, Menu, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	useConversationParticipants,
	useUpdateNotificationLevel,
} from "@/core/comms/messages/hooks";
import { useEntityDisplay } from "@/core/comms/messages/hooks/useEntityDisplay";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { ParticipantsDialog } from "./ParticipantsDialog";

type ThreadHeaderProps = {
	orgId: Id<"orgs">;
	conversation: Doc<"conversations"> | null;
	/** Pre-fetched participants from parent — avoids duplicate subscription. */
	participants?: Array<{
		membership: Doc<"conversationMembers">;
		user: Doc<"users"> & { avatarUrl?: string };
	}>;
	/** Pre-fetched myMembership from parent — avoids duplicate getById call. */
	myMembership?: Doc<"conversationMembers"> | null;
	/** Mobile-only: when supplied, a hamburger button opens the sidebar Sheet. */
	onOpenSidebar?: () => void;
	className?: string;
};

const MAX_AVATARS_SHOWN = 3;

const LEVELS = [
	{ id: "all", label: "All", Icon: Bell, hint: "Notify on every message" },
	{
		id: "mentions",
		label: "Mentions",
		Icon: AtSign,
		hint: "Notify only when @-mentioned",
	},
	{ id: "none", label: "Mute", Icon: BellOff, hint: "No notifications" },
] as const;

type Level = (typeof LEVELS)[number]["id"];

export function ThreadHeader({
	orgId,
	conversation,
	participants: participantsProp,
	myMembership: myMembershipProp,
	onOpenSidebar,
	className,
}: ThreadHeaderProps) {
	const [participantsOpen, setParticipantsOpen] = useState(false);
	const [levelPending, setLevelPending] = useState<Level | null>(null);

	const router = useRouter();
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;

	const me = useMe();

	// Use prop if provided (from parent), otherwise fall back to own query.
	const participantsOwn = useConversationParticipants({
		orgId,
		conversationId: participantsProp ? undefined : conversation?._id,
	});
	const participants = participantsProp ?? participantsOwn;

	// Use prop if provided, otherwise fall back to own query.
	const detail = useQuery(
		api.crm.shared.conversations.queries.getById,
		conversation && !myMembershipProp ? { orgId, conversationId: conversation._id } : "skip",
	);
	const updateLevel = useUpdateNotificationLevel();

	const myLevel: Level | undefined = (myMembershipProp?.notificationLevel ??
		detail?.myMembership?.notificationLevel) as Level | undefined;

	const display = useEntityDisplay({
		orgId,
		entityType: conversation?.entityType,
		entityId: conversation?.entityId,
	});

	const handleSetLevel = async (level: Level) => {
		if (!conversation || levelPending) return;
		setLevelPending(level);
		try {
			await updateLevel({ orgId, conversationId: conversation._id, level });
		} catch (err) {
			toast.error(normalizeError(err, "Couldn't update notifications."));
		} finally {
			setLevelPending(null);
		}
	};

	if (!conversation) {
		return (
			<header
				className={cn(
					"flex h-14 shrink-0 items-center border-b border-border px-4",
					className,
				)}
			>
				<span className="text-sm text-muted-foreground">No conversation selected</span>
			</header>
		);
	}

	const title = conversation.title ?? display.name;

	const visible = (participants ?? []).slice(0, MAX_AVATARS_SHOWN);
	const overflow = Math.max(0, (participants?.length ?? 0) - MAX_AVATARS_SHOWN);

	const TitleNode = display.profileHref ? (
		<Link
			href={display.profileHref}
			className="group flex min-w-0 items-center gap-1.5 rounded-[var(--radius)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			title={`Open ${display.kindLabel.toLowerCase()} profile`}
		>
			<h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
			<ExternalLink
				className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
				aria-hidden="true"
			/>
		</Link>
	) : (
		<h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
	);

	return (
		<header
			className={cn(
				"flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border sm:px-4",
				className,
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				{onOpenSidebar && (
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-8 shrink-0 md:hidden"
						onClick={onOpenSidebar}
						aria-label="Open conversation list"
					>
						<Menu className="size-4" aria-hidden="true" />
					</Button>
				)}
				<ChatAvatar
					name={title}
					src={display.avatarUrl}
					size={2}
					onClick={
						display.profileHref ? () => router.push(display.profileHref!) : undefined
					}
					clickLabel={`Open ${display.kindLabel.toLowerCase()} profile`}
				/>
				<div className="flex min-w-0 flex-col">
					<div className="flex min-w-0 items-center gap-1.5">
						{TitleNode}
						{conversation.entityType !== "user" && (
							<span
								className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
								title={`${display.kindLabel} code`}
							>
								{conversation.entityId}
							</span>
						)}
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{display.secondary
							? display.secondary
							: participants === undefined
								? "Loading participants…"
								: `${participants.length} ${participants.length === 1 ? "participant" : "participants"}`}
					</p>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{/* Notification level — compact dropdown (mobile + iPad, < lg) */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-8 lg:hidden"
							aria-label="Notification level"
							title="Notification level"
							disabled={levelPending !== null}
						>
							{(() => {
								const cur = LEVELS.find((l) => l.id === myLevel) ?? LEVELS[0];
								const Icon = cur.Icon;
								return levelPending !== null ? (
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								) : (
									<Icon className="size-4" aria-hidden="true" />
								);
							})()}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						{LEVELS.map(({ id, label, Icon, hint }) => (
							<DropdownMenuItem
								key={id}
								onSelect={() => handleSetLevel(id)}
								className="gap-2"
							>
								<Icon className="size-3.5" aria-hidden="true" />
								<div className="flex flex-1 flex-col">
									<span>{label}</span>
									<span className="text-[10px] text-muted-foreground">
										{hint}
									</span>
								</div>
								{myLevel === id && (
									<span className="text-primary" aria-hidden="true">
										✓
									</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Notification level segmented control — desktop only (lg+) */}
				<fieldset className="hidden items-center gap-0.5 rounded-[var(--radius)] border border-border bg-muted/50 p-0.5 lg:flex">
					<legend className="sr-only">Notification level</legend>
					{LEVELS.map(({ id, label, Icon, hint }) => {
						const active = myLevel === id;
						const showSpinner = levelPending === id;
						return (
							<button
								type="button"
								aria-pressed={active}
								aria-label={label}
								title={hint}
								key={id}
								onClick={() => handleSetLevel(id)}
								disabled={levelPending !== null}
								className={cn(
									"flex h-7 items-center gap-1 rounded-[calc(var(--radius)-2px)] px-2 text-xs transition-colors",
									active
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
									levelPending !== null && "cursor-wait",
								)}
							>
								{showSpinner ? (
									<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
								) : (
									<Icon className="size-3.5" aria-hidden="true" />
								)}
								<span className="hidden xl:inline">{label}</span>
							</button>
						);
					})}
				</fieldset>

				{/* Avatar stack — each clickable */}
				{visible.length > 0 && (
					<div className="flex items-center -space-x-2 [dir=rtl]:space-x-reverse">
						{visible.map((p) => {
							const isMe =
								me?._id !== undefined && String(p.user._id) === String(me._id);
							// Member detail page doesn't exist yet — link to the
							// settings members section. Self avatars never link.
							const memberHref =
								!isMe && orgSlug
									? `/${orgSlug}/settings?group=team#team.members`
									: undefined;
							return (
								<ChatAvatar
									key={p.user._id}
									name={p.user.name ?? p.user.email ?? "Member"}
									src={p.user.avatarUrl}
									size={1.75}
									className="ring-2 ring-background"
									onClick={memberHref ? () => router.push(memberHref) : undefined}
									clickLabel={`Open ${p.user.name ?? p.user.email ?? "member"}'s profile`}
								/>
							);
						})}
						{overflow > 0 && (
							<button
								type="button"
								onClick={() => setParticipantsOpen(true)}
								className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background hover:bg-accent hover:text-accent-foreground"
								aria-label={`Show ${overflow} more participants`}
							>
								+{overflow}
							</button>
						)}
					</div>
				)}

				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => setParticipantsOpen(true)}
					className="h-7 gap-1 px-2 text-xs"
					aria-label="People"
					title="People"
				>
					<Users className="size-3.5" aria-hidden="true" />
					<span className="hidden sm:inline">People</span>
				</Button>
			</div>

			<ParticipantsDialog
				orgId={orgId}
				conversation={conversation}
				open={participantsOpen}
				onOpenChange={setParticipantsOpen}
			/>
		</header>
	);
}
