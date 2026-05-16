"use client";

/**
 * MessagesInboxView — org-wide messages page (placeholder, no UI yet).
 *
 * UI Architecture (locked in CORE-FEATURES-ARCHITECTURE.md §3.1, confirmed 2026-05-16):
 *   - **Sidebar** (conversation list) and **Main section** (active thread) are
 *     INDEPENDENT components. Org-wide page composes both. Profile/Deal/Company
 *     tabs embed only the Main thread (no sidebar — there is no horizontal space).
 *
 * Status: backend wired (production-grade conversations + multi-participant fan-out).
 * UI pending — see `core/comms/messages/IMPLEMENTATION.md`.
 */
import { useState } from "react";
import {
	type ChatEntityType,
	useConversationForEntity,
	useInbox,
} from "@/core/comms/messages/hooks";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function MessagesInboxView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const conversations = useInbox({ orgId, filter: "all" });

	// Page-local UI state. Lifted, not zustand — see FRONTEND-DECISIONS Rule 4.
	const [selected, setSelected] = useState<{
		entityType: ChatEntityType;
		entityId: string;
	} | null>(null);

	const thread = useConversationForEntity({
		orgId,
		entityType: selected?.entityType ?? "person",
		entityId: selected?.entityId ?? "",
	});

	return (
		<div data-status="messages-inbox-pending-ui" className="p-6">
			<h1 className="text-xl font-semibold">Messages</h1>
			<p className="text-sm text-muted-foreground">
				Backend connected — {conversations?.length ?? 0} conversation
				{(conversations?.length ?? 0) === 1 ? "" : "s"}, UI pending.
			</p>
			<pre className="mt-4 max-h-[40vh] overflow-auto rounded-[var(--radius)] border bg-muted p-3 text-xs">
				{JSON.stringify(
					{
						orgSlug,
						conversationCount: conversations?.length,
						selected,
						threadConversation: thread?.conversation?._id ?? null,
						messageCount: thread?.messages?.length ?? 0,
					},
					null,
					2,
				)}
			</pre>
			{/* When UI lands:
			    <MessagesSidebar conversations={conversations} onSelect={setSelected} />
			    <MessagesThread orgId={orgId} entityType={selected?.entityType} entityId={selected?.entityId} thread={thread} />
			*/}
			<button type="button" onClick={() => setSelected(null)} className="sr-only">
				reset
			</button>
		</div>
	);
}
