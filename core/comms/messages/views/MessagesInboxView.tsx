"use client";

/**
 * MessagesInboxView — org-wide messages page (placeholder, no UI yet).
 *
 * UI Architecture (locked in CORE-FEATURES-ARCHITECTURE.md §3.1, confirmed 2026-05-16):
 *   - **Sidebar** (conversation list) and **Main section** (active thread) are
 *     INDEPENDENT components. Org-wide page composes both. Profile/Deal/Company
 *     tabs embed only the Main thread (no sidebar — there is no horizontal space).
 *
 * Status: backend wired (`useMessagesInbox`, `useMessagesForEntity`). UI pending.
 */
import { useState } from "react";
import { useMessagesForEntity, useMessagesInbox } from "@/core/comms/messages/hooks";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function MessagesInboxView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const conversations = useMessagesInbox({ orgId, filter: "all" });

	// Page-local UI state. Lifted, not zustand — see FRONTEND-DECISIONS Rule 4.
	const [selected, setSelected] = useState<{ entityType: string; entityId: string } | null>(null);

	const messages = useMessagesForEntity({
		orgId,
		entityType: selected?.entityType ?? "",
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
						threadCount: messages?.length,
					},
					null,
					2,
				)}
			</pre>
			{/* When UI lands:
			    <MessagesSidebar conversations={conversations} onSelect={setSelected} />
			    <MessagesThread orgId={orgId} entityType={selected?.entityType} entityId={selected?.entityId} messages={messages} />
			*/}
			<button type="button" onClick={() => setSelected(null)} className="sr-only">
				reset
			</button>
		</div>
	);
}
