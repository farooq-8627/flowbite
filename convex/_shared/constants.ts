/**
 * Shared constants for the Convex backend.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts
 * - .github/agents/base/rbac.md — plan/feature mapping
 * - .github/agents/base/schema.md
 */
import type { OrgPlan } from "./validators";

// Invitation token TTL: 48 hours (matches dbjpanda/convex-tenants default)
// Ref: https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
export const INVITATION_EXPIRY_MS = 48 * 60 * 60 * 1000;

// Activity log entity types
export const ENTITY_TYPES = {
	ORG: "org",
	USER: "user",
	MEMBER: "member",
	INVITATION: "invitation",
	NOTIFICATION: "notification",
	CONNECTION: "connection",
	WORKFLOW: "workflow",
	WORK_ITEM: "workItem",
	REPORT: "report",
} as const;

// Default plan for new orgs
export const DEFAULT_ORG_PLAN = "free" as const;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// ─── Plan → Feature Flag Mapping ──────────────────────────────────────────────
//
// CRITICAL — Data Preservation Rule (rbac.md):
//   On plan downgrade, ONLY feature flags change. Data is NEVER deleted.
//   Features become "paused" — data preserved, re-enabled on upgrade.
//   Each plan's features are additive. Enterprise includes everything.
//
// Feature key format: "<module>.<tier>"  e.g. "connections.full"
//
// HOW IT WORKS:
//   1. When super_admin changes an org's plan, `convex/orgs/mutations.ts:setPlan()`
//      reads PLAN_FEATURES[newPlan] and writes to `featureFlags.orgOverrides[orgId]`.
//   2. All feature checks call `isFeatureEnabled(ctx, orgId, featureKey)` which
//      checks orgOverrides first, then the global flag.
//   3. UI gates use `useFeatureEnabled("connections.kanban_view")` hook.

export const PLAN_FEATURES: Record<OrgPlan, readonly string[]> = {
	free: [
		"members.basic", // max 3 members (enforced by PLAN_LIMITS)
		"connections.basic", // max 5 connections (enforced by PLAN_LIMITS)
	],
	starter: [
		"members.full", // max 10 members
		"connections.full", // unlimited connections
		"messaging.full",
		"workflows.basic",
		"approvals.basic",
	],
	pro: [
		"members.full",
		"connections.full",
		"messaging.full",
		"workflows.full",
		"approvals.full",
		"reports.basic",
		"dynamic_forms.basic",
		"commissions.basic",
	],
	enterprise: [
		"members.full",
		"connections.full",
		"messaging.full",
		"workflows.full",
		"approvals.full",
		"reports.full",
		"dynamic_forms.full",
		"commissions.full",
		"custom_branding",
		"api_access",
		"audit_logs.full",
	],
} as const;

// ─── Plan Limits ──────────────────────────────────────────────────────────────
// -1 = unlimited. Checked in relevant mutations before creating rows.
export const PLAN_LIMITS: Record<OrgPlan, { maxMembers: number; maxConnections: number }> = {
	free: { maxMembers: 3, maxConnections: 5 },
	starter: { maxMembers: 10, maxConnections: -1 },
	pro: { maxMembers: 25, maxConnections: -1 },
	enterprise: { maxMembers: -1, maxConnections: -1 },
} as const;

// ─── Feature Flag Keys ────────────────────────────────────────────────────────
// Central registry of all feature flag keys. Add here as features are built.
// Format: module.feature_name  (lowercase, underscores)
export const FEATURE_FLAGS = {
	// Members
	MEMBERS_BASIC: "members.basic",
	MEMBERS_FULL: "members.full",
	// Connections (Phase 1)
	CONNECTIONS_BASIC: "connections.basic",
	CONNECTIONS_FULL: "connections.full",
	// Messaging (Phase 1, within Connections)
	MESSAGING_FULL: "messaging.full",
	// Workflows (Phase 2)
	WORKFLOWS_BASIC: "workflows.basic",
	WORKFLOWS_FULL: "workflows.full",
	// Approvals (Phase 2)
	APPROVALS_BASIC: "approvals.basic",
	APPROVALS_FULL: "approvals.full",
	// Reports (Phase 5)
	REPORTS_BASIC: "reports.basic",
	REPORTS_FULL: "reports.full",
	// Dynamic Forms (Phase 4)
	DYNAMIC_FORMS_BASIC: "dynamic_forms.basic",
	DYNAMIC_FORMS_FULL: "dynamic_forms.full",
	// Commissions (Phase 5)
	COMMISSIONS_BASIC: "commissions.basic",
	COMMISSIONS_FULL: "commissions.full",
	// Enterprise only
	CUSTOM_BRANDING: "custom_branding",
	API_ACCESS: "api_access",
	AUDIT_LOGS_FULL: "audit_logs.full",
} as const;

