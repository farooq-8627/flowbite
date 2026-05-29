"use client";

/**
 * MessagesPreviewWidget — top 5 recent messages across the org.
 *
 * Drops on the dashboard to give a quick at-a-glance view of latest activity
 * across all conversations. Each row links to the entity profile / deal /
 * company page. Server-side `messages.viewAll` permission is enforced; the
 * widget itself filters out anything the user shouldn't see.
 *
 * Per FRONTEND-DECISIONS Rule 1 — pure Convex live query, no Zustand.
 *
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3 Step 3) — empty
 * state replaced with a CTA card mirroring `<NextReminderFallback />`:
 * dashed border, icon, prompt, and a button that prefills the chat
 * composer so the user can send the first message via the AI rather
 * than navigating away. The widget no longer renders `null`-shaped
 * empty content; the dashboard always shows actionable affordance.
 */
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useRecentMessages } from "@/core/comms/messages/hooks";
import { useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { type EntityLabels, useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { ChatAvatar } from "./ChatAvatar";

type Author = { name: string; avatarUrl?: string };

type Props = {
	orgId: Id<"orgs">;
	orgSlug: string;
	limit?: number;
	className?: string;
};

function actionUrlFor(
	orgSlug: string,
	entityType: string,
	entityId: string,
	labels: EntityLabels,
): string {
	if (entityType === "deal") return `/${orgSlug}/${labels.deal.slug}/${entityId}`;
	if (entityType === "company") return `/${orgSlug}/${labels.company.slug}/${entityId}`;
	if (entityType === "lead" || entityType === "contact" || entityType === "person")
		return `/${orgSlug}/profile/${entityId}`;
	return `/${orgSlug}/messages`;
}

export function MessagesPreviewWidget({ orgId, orgSlug, limit = 5, className }: Props) {
	const messages = useRecentMessages({ orgId, limit });
	const members = useOrgMembers();
	const labels = useEntityLabels();
	const authorsById = useMemo(() => {
		const map = new Map<string, Author>();
		for (const m of members ?? []) {
			map.set(String(m.user._id), {
				name: m.user.name ?? m.user.email ?? "Member",
				avatarUrl: m.user.avatarUrl,
			});
		}
		return map;
	}, [members]);

	return (
		<Card className={`flex flex-col min-w-0 overflow-hidden ${className ?? ""}`.trim()}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
					<CardTitle className="text-base">Recent messages</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/messages`}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					View all →
				</Link>
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{messages === undefined ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : messages.length === 0 ? (
					<MessagesEmptyFallback orgSlug={orgSlug} />
				) : (
					<ul className="flex flex-col gap-1">
						{messages.map((m) => {
							const author = authorsById.get(String(m.authorId));
							const displayName =
								author?.name ??
								(m.authorType === "ai"
									? "AI"
									: m.authorType === "contact"
										? "Contact"
										: "Unknown");
							const href = actionUrlFor(orgSlug, m.entityType, m.entityId, labels);
							return (
								<li key={String(m._id)}>
									<Link
										href={href}
										className="flex items-start gap-3 rounded-[var(--radius)] px-2 py-1.5 transition-colors hover:bg-accent"
									>
										<ChatAvatar
											name={displayName}
											src={author?.avatarUrl}
											size={1.75}
											isAI={m.authorType === "ai"}
											className="mt-0.5"
										/>
										<div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-2">
											<span className="col-start-1 truncate text-sm font-medium text-foreground">
												{displayName}{" "}
												<span className="font-normal text-muted-foreground">
													· {m.entityType} {m.entityId}
												</span>
											</span>
											<span className="col-start-2 shrink-0 text-[10px] tabular-nums text-muted-foreground">
												{format(m.createdAt, "h:mm a")}
											</span>
											<p className="col-start-1 truncate text-xs text-muted-foreground">
												{m.content.slice(0, 100)}
												{m.content.length > 100 ? "…" : ""}
											</p>
										</div>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * Empty-state CTA — mirrors the `<NextReminderFallback />` pattern from
 * `RemindersCard`. Card-shaped, dashed border, icon, prompt, button.
 * The button dispatches a chat prefill so the user can compose the
 * first message via the AI sheet without navigating off the dashboard.
 */
function MessagesEmptyFallback({ orgSlug }: { orgSlug: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-6 text-center">
			<MessageSquare className="size-6 text-muted-foreground" aria-hidden="true" />
			<p className="text-sm font-medium text-foreground">No conversations yet</p>
			<p className="text-xs text-muted-foreground">
				Start a thread with a contact, lead, or teammate.
			</p>
			<div className="mt-1 flex items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={() =>
						sendChatPrefill("Send a message to a contact about a recent deal.")
					}
				>
					Ask AI to send one
				</Button>
				<Button asChild size="sm" variant="ghost" className="h-7 text-xs">
					<Link href={`/${orgSlug}/messages`}>Open messages</Link>
				</Button>
			</div>
		</div>
	);
}
