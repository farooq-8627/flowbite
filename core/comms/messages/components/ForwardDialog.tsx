"use client";

/**
 * ForwardDialog — copy a message (and its attachments) to another conversation.
 *
 * Shipped 2026-05-17. Mirrors the WhatsApp / Telegram "Forward" UX:
 *   - User opens this from the message's actions menu.
 *   - The dialog lists the user's recent conversations from `useInbox` so
 *     forwarding to an existing thread is one click.
 *   - Multi-select is supported — picking N targets fans out N `send` calls
 *     (each with its own `idempotencyKey`).
 *   - Attachments are forwarded by re-referencing the same `Id<"files">[]`.
 *     Files are org-scoped, so any participant in the destination
 *     conversation can read them via `files.queries.listByIds`. We
 *     intentionally do NOT clone the file rows — that would double storage
 *     for no benefit and would make the source's "where this file shows up"
 *     view inconsistent.
 *   - "Forwarded from" is encoded in the message content so recipients can
 *     see provenance. The original `replyToId` is dropped because the
 *     reply target lives in a different conversation.
 *
 * Future hooks (not built yet, but doc'd in MODULE.md):
 *   - "Forward to a new entity" (open `<NewConversationDialog>` in
 *     forward mode and chain into it). Today users can do that via the
 *     sidebar `+ Search` flow first, then forward.
 *   - Cross-org forward (Phase 9 client portal): blocked by org boundary.
 *   - WhatsApp-channel forward (Phase 3): once the composer's WhatsApp
 *     toggle exists, forwards will respect the destination's last-used
 *     channel automatically.
 */
import { Forward, Loader2, Search } from "lucide-react";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useInbox, useSendMessage } from "@/core/comms/messages/hooks";
import type { BatchedEntityDisplay } from "@/core/comms/messages/hooks/useEntityDisplaysBatched";
import { useEntityDisplaysBatched } from "@/core/comms/messages/hooks/useEntityDisplaysBatched";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";

type ForwardDialogProps = {
	orgId: Id<"orgs">;
	message: Doc<"messages">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/** Shape of a single inbox row from `useInbox`. Matches the backend's `listForUser` row. */
type InboxRow = {
	conversation: Doc<"conversations">;
	membership: Doc<"conversationMembers">;
	unread: boolean;
};

const FORWARD_HEADER = "↪ Forwarded";

function ForwardTargetRow({
	row,
	checked,
	onToggle,
	display,
}: {
	row: InboxRow;
	checked: boolean;
	onToggle: () => void;
	display: BatchedEntityDisplay | undefined;
}) {
	const { conversation } = row;
	const title = conversation.title ?? display?.name ?? conversation.entityId ?? "Thread";
	const preview = conversation.lastMessagePreview ?? "No messages yet";
	return (
		<li>
			<button
				type="button"
				onClick={onToggle}
				aria-pressed={checked}
				className={cn(
					"flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-start transition-colors",
					"hover:bg-accent hover:text-accent-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					checked && "bg-accent text-accent-foreground",
				)}
			>
				<ChatAvatar name={title} src={display?.avatarUrl} size={2} />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-sm text-foreground">{title}</span>
					<span className="truncate text-xs text-muted-foreground">{preview}</span>
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
}

export function ForwardDialog({ orgId, message, open, onOpenChange }: ForwardDialogProps) {
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [pending, setPending] = useState(false);

	const inbox = useInbox({ orgId: open ? orgId : undefined, filter: "all" });
	const sendMessage = useSendMessage();

	// Batched entity display — one subscription for all visible rows.
	const displayItems = useMemo(
		() =>
			(inbox ?? []).map((r: InboxRow) => ({
				entityType: r.conversation.entityType,
				entityId: r.conversation.entityId,
			})),
		[inbox],
	);
	const displaysMap = useEntityDisplaysBatched({
		orgId: open ? orgId : undefined,
		items: displayItems,
	});

	const visible = useMemo(() => {
		if (!inbox) return [];
		// Hide the source conversation — forwarding to itself is just sending.
		const filtered: InboxRow[] = (inbox as InboxRow[]).filter(
			(r) => String(r.conversation._id) !== String(message.conversationId),
		);
		const needle = search.trim().toLowerCase();
		if (needle.length === 0) return filtered;
		return filtered.filter((r: InboxRow) => {
			const title = r.conversation.title ?? "";
			const preview = r.conversation.lastMessagePreview ?? "";
			const code = r.conversation.entityId ?? "";
			return (
				title.toLowerCase().includes(needle) ||
				preview.toLowerCase().includes(needle) ||
				code.toLowerCase().includes(needle)
			);
		});
	}, [inbox, message.conversationId, search]);

	const toggle = (conversationId: Id<"conversations">) => {
		setSelected((prev) => {
			const next = new Set(prev);
			const key = String(conversationId);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleForward = async () => {
		if (selected.size === 0 || pending) return;
		setPending(true);
		const targets = Array.from(selected) as unknown as Id<"conversations">[];

		// Prepend a small "Forwarded" header to make provenance obvious. If the
		// original message was attachments-only we still mark the forward so
		// the recipient can tell.
		const body = message.content?.trim() ?? "";
		const forwardedContent = body.length > 0 ? `${FORWARD_HEADER}\n${body}` : FORWARD_HEADER;

		let succeeded = 0;
		const errors: string[] = [];
		for (const conversationId of targets) {
			try {
				await sendMessage({
					orgId,
					conversationId,
					content: forwardedContent,
					attachments:
						message.attachments && message.attachments.length > 0
							? message.attachments
							: undefined,
					idempotencyKey: crypto.randomUUID(),
				});
				succeeded += 1;
			} catch (err) {
				errors.push(normalizeError(err, "Unknown error"));
			}
		}
		setPending(false);

		if (succeeded > 0) {
			toast.success(`Forwarded to ${succeeded} ${succeeded === 1 ? "thread" : "threads"}.`);
		}
		if (errors.length > 0) {
			toast.error(
				`Couldn't forward to ${errors.length} thread${errors.length === 1 ? "" : "s"}.`,
			);
		}
		if (succeeded > 0 && errors.length === 0) {
			setSelected(new Set());
			setSearch("");
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<Forward className="size-4 text-muted-foreground" aria-hidden="true" />
						Forward message
					</DialogTitle>
					<DialogDescription>
						Pick one or more conversations to copy this message into. Attachments are
						forwarded too.
					</DialogDescription>
				</DialogHeader>

				<div className="relative">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute start-2.5 top-2.5 size-3.5 text-muted-foreground"
					/>
					<input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search conversations…"
						aria-label="Search conversations"
						className="h-9 w-full rounded-[var(--radius)] border border-input bg-background ps-8 pe-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					/>
				</div>

				{inbox === undefined ? (
					<p className="text-xs text-muted-foreground">Loading conversations…</p>
				) : visible.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						{search.trim().length > 0
							? `No conversations match "${search.trim()}".`
							: "No other conversations to forward to."}
					</p>
				) : (
					<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
						{visible.map((row: InboxRow) => (
							<ForwardTargetRow
								key={String(row.conversation._id)}
								row={row}
								checked={selected.has(String(row.conversation._id))}
								onToggle={() => toggle(row.conversation._id)}
								display={
									displaysMap?.[
										`${row.conversation.entityType}:${row.conversation.entityId}`
									]
								}
							/>
						))}
					</ul>
				)}

				<div className="flex justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={selected.size === 0 || pending}
						onClick={handleForward}
						className="gap-1"
					>
						{pending ? (
							<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
						) : (
							<Forward className="size-3.5" aria-hidden="true" />
						)}
						Forward
						{selected.size > 0 ? ` (${selected.size})` : ""}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
