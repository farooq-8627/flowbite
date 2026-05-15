/**
 * Reserved Slug Validation — convex/_shared/reservedSlugs.ts
 *
 * Prevents org slugs from colliding with app routes, system paths, or brand names.
 * Used at org creation time (onboarding mutation) and in the onboarding UI.
 *
 * Pattern: same as GitHub, Linear, Vercel — static Set, O(1) lookup, validated at write time.
 *
 * Rules:
 *   - 3–48 characters
 *   - lowercase letters, numbers, hyphens only
 *   - cannot start or end with a hyphen
 *   - no consecutive hyphens
 *   - not in RESERVED_SLUGS
 */

export const RESERVED_SLUGS = new Set([
	// ── Next.js / system routes ──────────────────────────────────────────────
	"api",
	"_next",
	"_vercel",
	"static",
	"public",

	// ── Auth routes ──────────────────────────────────────────────────────────
	"login",
	"logout",
	"signup",
	"sign-in",
	"sign-up",
	"sign-out",
	"register",
	"auth",
	"oauth",
	"sso",
	"saml",
	"callback",
	"verify",

	// ── App top-level routes ─────────────────────────────────────────────────
	"onboarding",
	"invite",
	"join",
	"accept",
	"settings",
	"admin",
	"dashboard",
	"home",
	"activity",
	"notifications",
	"search",
	"billing",
	"pricing",
	"plans",
	"upgrade",
	"help",
	"support",
	"docs",
	"documentation",
	"status",
	"health",
	"healthcheck",
	"ping",
	"about",
	"contact",
	"privacy",
	"terms",
	"legal",
	"blog",
	"changelog",
	"roadmap",

	// ── Workspace feature routes (cross-cutting, not entity slots) ───────────
	// These map to /{orgSlug}/{slug} static routes and must never collide with
	// renamable entity slugs.
	"profile",
	"messages",
	"calendar",
	"reminders",
	"notes",
	"timeline",

	// ── Platform admin ───────────────────────────────────────────────────────
	"platform",
	"superadmin",
	"super-admin",
	"staff",
	"internal",

	// ── Common confusables ───────────────────────────────────────────────────
	"null",
	"undefined",
	"true",
	"false",
	"test",
	"demo",
	"example",
	"localhost",
	"www",
	"mail",
	"email",
	"smtp",

	// ── Brand name ───────────────────────────────────────────────────────────
	"orbitly",
]);

/** Slug format: lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens */
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 48;

export type SlugValidationResult = { valid: true } | { valid: false; reason: string };

export function validateSlug(slug: string): SlugValidationResult {
	if (!slug || slug.length < SLUG_MIN)
		return { valid: false, reason: `Minimum ${SLUG_MIN} characters` };
	if (slug.length > SLUG_MAX) return { valid: false, reason: `Maximum ${SLUG_MAX} characters` };
	if (!SLUG_REGEX.test(slug))
		return {
			valid: false,
			reason: "Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.",
		};
	if (slug.includes("--"))
		return { valid: false, reason: "Consecutive hyphens are not allowed." };
	if (RESERVED_SLUGS.has(slug.toLowerCase()))
		return { valid: false, reason: "This name is reserved. Please choose another." };
	return { valid: true };
}
