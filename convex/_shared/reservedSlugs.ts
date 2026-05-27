/**
 * Reserved Slug Validation — convex/_shared/reservedSlugs.ts
 *
 * Prevents slugs from colliding with app routes, system paths, brand
 * names, or owner-defined reservations.
 *
 * As of 2026-05-27 (locked decision L9 of
 * INDUSTRY-TEMPLATES-DB-MIGRATION.md), the SOURCE OF TRUTH is the
 * `platformReservedSlugs` table — owner-managed via
 * `/xowner/reserved-slugs`. The static `RESERVED_SLUGS` Set below is
 * kept as a COMPILE-TIME FALLBACK only:
 *   - Drives the seed migration `_migrations/2026_05_27_seedReservedSlugs`
 *     (every entry is inserted as an `isBuiltIn: true` row).
 *   - Serves the legacy sync `validateSlug()` helper for tests + UI
 *     hints that need a non-async check.
 *
 * Server-side authoritative checks MUST use the async DB-backed
 * helpers (`isSlugReserved`, `validateSlugAsync`) — those reflect
 * owner-added entries that the static Set doesn't know about.
 *
 * Pattern: same as GitHub, Linear, Vercel — O(1) lookup, validated at
 * write time.
 *
 * Rules:
 *   - 3–48 characters
 *   - lowercase letters, numbers, hyphens only
 *   - cannot start or end with a hyphen
 *   - no consecutive hyphens
 *   - not in RESERVED_SLUGS (sync check) or platformReservedSlugs DB
 *     (async check — preferred for server writes).
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";

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
	"tasks",
	"notes",
	"timeline",

	// ── Platform admin ───────────────────────────────────────────────────────
	"platform",
	"superadmin",
	"super-admin",
	"staff",
	"internal",
	// Owner-panel internal route segment + common operator-chosen slugs.
	// `xowner` is the literal `app/xowner/...` route the middleware rewrites
	// the operator-chosen `OWNER_PANEL_SLUG` onto; an org with this slug
	// would shadow the internal path. The other entries are the slugs an
	// operator is most likely to pick — pre-reserving them prevents a
	// new org from being created on the same path the panel might use.
	"xowner",
	"owner",
	"owner-panel",
	"ownerpanel",
	"control",
	"control-panel",
	"controlpanel",
	"console",
	"god",

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

// ─── DB-backed authoritative helpers ─────────────────────────────────────────
//
// As of 2026-05-27 (locked decision L9), reserved slugs live in the
// `platformReservedSlugs` table. Owner-added entries that aren't in the
// static Set still need to be honoured server-side. These async helpers
// consult the DB.

export type ReservedSlugCategory = "org" | "template" | "industryGroup" | "entitySlug" | "route";

/**
 * Async authoritative reserved-slug check. Reads
 * `platformReservedSlugs` for the given (category, slug) pair. Use
 * this from any mutation/query that decides whether a user-supplied
 * slug is acceptable.
 */
export async function isSlugReserved(
	ctx: QueryCtx | MutationCtx,
	category: ReservedSlugCategory,
	slug: string,
): Promise<boolean> {
	const row = await ctx.db
		.query("platformReservedSlugs")
		.withIndex("by_category_slug", (q) =>
			q.eq("category", category).eq("slug", slug.toLowerCase()),
		)
		.unique();
	return row !== null;
}

/**
 * Async authoritative slug validator — same shape as `validateSlug`
 * but consults the DB for the reservation check. Defaults to category
 * `"org"` for back-compat with the existing onboarding flow.
 */
export async function validateSlugAsync(
	ctx: QueryCtx | MutationCtx,
	slug: string,
	category: ReservedSlugCategory = "org",
): Promise<SlugValidationResult> {
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
	if (await isSlugReserved(ctx, category, slug)) {
		return { valid: false, reason: "This name is reserved. Please choose another." };
	}
	return { valid: true };
}
