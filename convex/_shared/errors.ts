/**
 * Centralised error messages.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/errors.ts
 * - .github/agents/base/rbac.md (RBAC-specific errors)
 *
 * Rule: Never throw raw strings — import from here.
 */

export const ERRORS = {
	// ── Auth ──────────────────────────────────────────────────────────────────
	UNAUTHORIZED: "Unauthorized: user not authenticated.",
	FORBIDDEN: "Forbidden: insufficient permissions.",
	USER_NOT_FOUND: "User not found.",
	SUPER_ADMIN_REQUIRED: "Forbidden: platform super_admin role required.",

	// ── Orgs ──────────────────────────────────────────────────────────────────
	ORG_NOT_FOUND: "Organization not found.",
	ORG_SLUG_TAKEN: "Organization slug is already taken.",
	ORG_MEMBER_NOT_FOUND: "Organization member not found.",
	ORG_ALREADY_MEMBER: "User is already a member of this organization.",

	// ── Invitations ───────────────────────────────────────────────────────────
	INVITATION_NOT_FOUND: "Invitation not found.",
	INVITATION_EXPIRED: "Invitation has expired.",
	INVITATION_ALREADY_USED: "Invitation has already been accepted.",
	INVITATION_EMAIL_MISMATCH: "This invitation was sent to a different email address.",

	// ── Plan & Features ───────────────────────────────────────────────────────
	// Thrown when an org tries to use a feature not included in their plan.
	// Data is preserved — the feature is simply not accessible.
	// Ref: .github/agents/base/rbac.md — Data Preservation Rule
	FEATURE_DISABLED: "This feature is not available on your current plan. Upgrade to enable it.",
	PLAN_LIMIT_REACHED: "You have reached the limit for your current plan. Upgrade to add more.",
	PLAN_DOWNGRADE_BLOCKED: "Cannot downgrade plan. Contact support.",

	// ── General ───────────────────────────────────────────────────────────────
	INVALID_ARGS: "Invalid arguments provided.",
	NOT_FOUND: "Resource not found.",
	INTERNAL_ERROR: "An unexpected error occurred.",
	RATE_LIMITED: "Too many requests. Please slow down and try again shortly.",

	// ── AI (Phase 3) ──────────────────────────────────────────────────────────
	// Thrown when the requesting user's role is not permitted to invoke a specific AI tool.
	// Distinct from FORBIDDEN — this surfaces a user-friendly "upgrade your role" message.
	AI_TOOL_UNAUTHORIZED: "Forbidden: your role does not permit this AI action.",
	// Thrown when the AI identifies multiple matching records and cannot proceed without
	// the user selecting one. The response payload should include disambiguation candidates.
	AI_DISAMBIGUATION_REQUIRED:
		"Multiple records match your request. Please clarify which one to act on.",
	// Thrown when the AI tool requires entity context (e.g. an open lead record) that
	// is missing from the conversation state.
	AI_CONTEXT_REQUIRED: "Additional context is needed to complete this action.",

	// ── CRM (Phase 2) ─────────────────────────────────────────────────────────
	CRM_ENTITY_NOT_FOUND: "The requested CRM record was not found.",
	PIPELINE_STAGE_INVALID: "The specified pipeline stage does not exist or is invalid.",
	DEAL_ALREADY_CLOSED: "This deal is already closed and cannot be moved.",
	LEAD_ALREADY_CONVERTED: "This lead has already been converted to a contact.",
} as const;
