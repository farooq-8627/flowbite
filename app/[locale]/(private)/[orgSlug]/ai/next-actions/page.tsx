import { AINextActionsView } from "@/core/ai/views/AINextActionsView";

/**
 * Stage 6 (SPRINT-PLAN.md / AI-AGENT-CAPABILITY-AUDIT.md §2.1) — full-screen
 * ranked next-actions view. Reads from `aiNextActions` (cron-rebuilt every
 * 30 min) so the page is constant-time regardless of workspace size.
 */
export default async function AINextActionsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	await params;
	return <AINextActionsView />;
}
