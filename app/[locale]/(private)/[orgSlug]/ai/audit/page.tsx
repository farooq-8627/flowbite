import { AIAuditFeedView } from "@/core/ai/views/AIAuditFeedView";

/**
 * B.39 — full-screen org-wide AI audit feed.
 *
 * URL: `/{locale}/{orgSlug}/ai/audit`. Renders every AI capability call
 * with filters by source / status / risk / capability. Server-side RBAC
 * is enforced inside `convex/ai/queries/auditFeed.ts:listAuditFeed`
 * (`ai.audit.view` — Owner + Admin by default).
 */
export default function AIAuditFeedPage() {
	return <AIAuditFeedView />;
}
