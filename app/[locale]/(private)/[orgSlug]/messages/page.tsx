import { MessagesInboxView } from "@/core/comms/messages/views/MessagesInboxView";

/**
 * Messages page — `/{locale}/{orgSlug}/messages`.
 *
 * Thin wrapper per FRONTEND-DECISIONS Rule "app/ contains thin wrappers only".
 */
export default async function MessagesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	await params; // orgSlug consumed via OrgProvider in the layout
	return <MessagesInboxView />;
}
