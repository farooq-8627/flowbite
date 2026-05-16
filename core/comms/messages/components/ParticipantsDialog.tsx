"use client";

/**
 * ParticipantsDialog — manage org members on a conversation thread.
 *
 * Reachable via the "People" button in `ThreadHeader`. Three actions:
 *   1. Search org members → multi-select → Add as participants.
 *   2. Remove an existing participant (owner-only or self-remove).
 *   3. Leave the conversation yourself.
 *
 * Every action calls a typed Convex mutation:
 *   - `useAddParticipants` / `useRemoveParticipant` / `useLeaveConversation`
 *
 * RBAC is enforced server-side; the UI only surfaces error toasts on
 * `ConvexError`. We never gate on roles client-side because the auth source
 * of truth is the server (locked decision #16 in AGENTS.md).
 *
 * 2026-05-16 update:
 *   - Avatars are clickable and navigate to the org member page.
 *   - When the org has no other members, the empty state explains why and
 *     links to Settings → Members instead of saying "No members match"
 *     (which felt like a bug).
 *   - DialogContent gets explicit horizontal margin on mobile so the card
 *     doesn't kiss the screen edges.
 */
import { useQuery } from "convex/react";
import { LogOut, MessageSquare, Search, UserMinus, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	useAddParticipants,
	useConversationParticipants,
	useLeaveConversation,
	useRemoveParticipant,
} from "@/core/comms/messages/hooks";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";

type ParticipantsDialogProps = {
	orgId: Id<"orgs">;
	conversation: Doc<"conversations">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function ParticipantsDialog({
	orgId,
	conversation,
	open,
	onOpenChange,
}: ParticipantsDialogProps) {
	const router = useRouter();
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;
	const me = useQuery(api.users.queries.me);
	const allMembers = useQuery(api.orgs.queries.listMembers, open ? { orgId } : "skip");
	const participants = useConversationParticipants({
		orgId,
		conversationId: open ? conversation._id : undefined,
	});

	const addParticipants = useAddParticipants();
	const removeParticipant = useRemoveParticipant();
	const leave = useLeaveConversation();

	const [search, setSearch] = useState("");
	const [pending, setPending] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// IDs of users already in the conversation — hidden from the "Add" list.
	const participantIdSet = useMemo(() => {
		const set = new Set<string>();
		for (const p of participants ?? []) set.add(String(p.user._id));
		return set;
	}, [participants]);

	const addCandidates = useMemo(() => {
		if (!allMembers) return [];
		const needle = search.trim().toLowerCase();
		return allMembers
			.filter((m) => !participantIdSet.has(String(m.user._id)))
			.filter((m) => {
				if (needle.length === 0) return true;
				const hay = `${m.user.name ?? ""} ${m.user.email ?? ""}`.toLowerCase();
				return hay.includes(needle);
			})
			.sort((a, b) =>
				(a.user.name ?? a.user.email ?? "").localeCompare(
					b.user.name ?? b.user.email ?? "",
				),
			);
	}, [allMembers, participantIdSet, search]);

	const toggleSelect = (id: Id<"users">) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			const key = String(id);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleAdd = async () => {
		if (selectedIds.size === 0 || pending) return;
		const userIds = Array.from(selectedIds) as unknown as Id<"users">[];
		setPending(true);
		try {
			const res = await addParticipants({
				orgId,
				conversationId: conversation._id,
				userIds,
			});
			toast.success(`Added ${res.added} member${res.added === 1 ? "" : "s"} to the thread.`);
			setSelectedIds(new Set());
			setSearch("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't add members.");
		} finally {
			setPending(false);
		}
	};

	const handleRemove = async (userId: Id<"users">) => {
		if (pending) return;
		setPending(true);
		try {
			await removeParticipant({ orgId, conversationId: conversation._id, userId });
			toast.success("Removed from conversation.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't remove member.");
		} finally {
			setPending(false);
		}
	};

	const handleLeave = async () => {
		if (pending) return;
		setPending(true);
		try {
			await leave({ orgId, conversationId: conversation._id });
			toast.success("You left the conversation.");
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't leave conversation.");
		} finally {
			setPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<MessageSquare
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						People in this conversation
					</DialogTitle>
					<DialogDescription>
						Add teammates so they can read and reply. Leaving stops your notifications
						but keeps history visible to everyone else.
					</DialogDescription>
				</DialogHeader>

				{/* Active participants */}
				<section className="flex flex-col gap-2">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Active ({participants?.length ?? 0})
					</h3>
					{participants === undefined ? (
						<p className="text-xs text-muted-foreground">Loading…</p>
					) : participants.length === 0 ? (
						<p className="text-xs text-muted-foreground">No participants yet.</p>
					) : (
						<ul className="flex flex-col gap-1">
							{participants.map((p) => {
								const isMe = String(p.user._id) === String(me?._id);
								const role = p.membership.role;
								return (
									<li
										key={p.user._id}
										className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-muted/30 px-3 py-2"
									>
										<ChatAvatar
											name={p.user.name ?? p.user.email ?? "Member"}
											src={p.user.avatarUrl}
											size={1.75}
											onClick={
												!isMe && orgSlug
													? () =>
															router.push(
																`/${orgSlug}/settings?group=team#team.members`,
															)
													: undefined
											}
											clickLabel={`Open ${p.user.name ?? p.user.email ?? "member"}'s profile`}
										/>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-sm text-foreground">
												{p.user.name ?? p.user.email}
												{isMe && (
													<span className="ms-1 text-xs text-muted-foreground">
														(you)
													</span>
												)}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{role === "owner"
													? "Owner"
													: role === "watcher"
														? "Watcher"
														: "Participant"}
											</span>
										</div>
										{isMe ? (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												disabled={pending}
												onClick={handleLeave}
												className="h-7 gap-1 text-xs"
												aria-label="Leave conversation"
											>
												<LogOut className="size-3.5" aria-hidden="true" />
												Leave
											</Button>
										) : (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												disabled={pending}
												onClick={() =>
													handleRemove(p.user._id as Id<"users">)
												}
												className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
												aria-label={`Remove ${p.user.name ?? p.user.email ?? "member"}`}
											>
												<UserMinus
													className="size-3.5"
													aria-hidden="true"
												/>
												Remove
											</Button>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</section>

				{/* Add new participants */}
				<section className="flex flex-col gap-2">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Add teammates
					</h3>
					<div className="relative">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute start-2.5 top-2.5 size-3.5 text-muted-foreground"
						/>
						<input
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search org members…"
							aria-label="Search org members"
							className="h-9 w-full rounded-[var(--radius)] border border-input bg-background ps-8 pe-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						/>
					</div>

					{allMembers === undefined ? (
						<p className="text-xs text-muted-foreground">Loading members…</p>
					) : addCandidates.length === 0 ? (
						(() => {
							const onlyMe =
								(allMembers ?? []).length === 1 &&
								me?._id !== undefined &&
								String(allMembers[0]?.user._id) === String(me._id);
							if (onlyMe) {
								return (
									<div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-muted/30 p-3">
										<UsersRound
											className="size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<div className="flex-1 text-xs">
											<p className="text-foreground">
												You're the only person in this workspace.
											</p>
											<p className="mt-1 text-muted-foreground">
												Invite teammates first, then add them here.
											</p>
											{orgSlug && (
												<Link
													href={`/${orgSlug}/settings?group=team#team.members`}
													className="mt-2 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
												>
													Open Settings → Members
												</Link>
											)}
										</div>
									</div>
								);
							}
							if (search.trim().length > 0) {
								return (
									<p className="text-xs text-muted-foreground">
										No members match &quot;{search.trim()}&quot;. Try a
										different name or email.
									</p>
								);
							}
							return (
								<p className="text-xs text-muted-foreground">
									Everyone in the workspace is already in this thread.
								</p>
							);
						})()
					) : (
						<ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
							{addCandidates.map((m) => {
								const id = String(m.user._id);
								const checked = selectedIds.has(id);
								return (
									<li key={id}>
										<button
											type="button"
											onClick={() => toggleSelect(m.user._id as Id<"users">)}
											aria-pressed={checked}
											className={cn(
												"flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-start transition-colors",
												"hover:bg-accent hover:text-accent-foreground",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
												checked && "bg-accent text-accent-foreground",
											)}
										>
											<ChatAvatar
												name={m.user.name ?? m.user.email ?? "Member"}
												src={m.user.avatarUrl}
												size={1.75}
											/>
											<div className="flex min-w-0 flex-1 flex-col">
												<span className="truncate text-sm text-foreground">
													{m.user.name ?? m.user.email}
												</span>
												{m.user.email && m.user.name && (
													<span className="truncate text-xs text-muted-foreground">
														{m.user.email}
													</span>
												)}
											</div>
											<span
												className={cn(
													"flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
													checked
														? "border-primary bg-primary text-primary-foreground"
														: "border-border text-muted-foreground",
												)}
												aria-hidden="true"
											>
												{checked ? "✓" : ""}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				<div className="flex justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Done
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={selectedIds.size === 0 || pending}
						onClick={handleAdd}
						className="gap-1"
					>
						<UserPlus className="size-3.5" aria-hidden="true" />
						Add
						{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
