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
	INVITATION_EMAIL_MISMATCH:
		"This invitation was sent to a different email address.",

	// ── Plan & Features ───────────────────────────────────────────────────────
	// Thrown when an org tries to use a feature not included in their plan.
	// Data is preserved — the feature is simply not accessible.
	// Ref: .github/agents/base/rbac.md — Data Preservation Rule
	FEATURE_DISABLED:
		"This feature is not available on your current plan. Upgrade to enable it.",
	PLAN_LIMIT_REACHED:
		"You have reached the limit for your current plan. Upgrade to add more.",
	PLAN_DOWNGRADE_BLOCKED:
		"Cannot downgrade plan. Contact support.",

	// ── General ───────────────────────────────────────────────────────────────
	INVALID_ARGS: "Invalid arguments provided.",
	NOT_FOUND: "Resource not found.",
	INTERNAL_ERROR: "An unexpected error occurred.",
} as const;
