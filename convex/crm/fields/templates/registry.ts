/**
 * Industry-template registry.
 *
 * Adding a new template:
 *   1. Create `definitions/<id>.ts` exporting one `IndustryTemplate`.
 *   2. Import it here and add it to `INDUSTRY_TEMPLATES`.
 *   3. Done — onboarding wizard + AI tools both auto-pick it up.
 *
 * The `id` field is the stable key persisted in `org.industry`. Don't change
 * it once shipped — extend `INDUSTRY_ID_ALIASES` instead so historical orgs
 * keep resolving.
 *
 * INDUSTRY_ID_ALIASES
 * ───────────────────
 * Maps the onboarding-picker industry strings (e.g. "technology", "agency",
 * old template ids like "real-estate") onto curated template ids when no
 * exact match exists. Lets us bring up a full template story without
 * forcing the picker UI to change every time we add or rename a template.
 *
 * Phase 3A renames (2026-05-22):
 *   "dubai-real-estate"          → "real-estate-dubai"
 *   "real-estate"                → "real-estate-global"
 *
 * Phase 3A productivity sub-niches (Q3 confirmed):
 *   "productivity-solo"          → "productivity"
 *   "productivity-student"       → "productivity"
 *   "productivity-side-project"  → "productivity"
 *   AI persona (Phase 3B) reads the sub-niche id off `org.industry` to swap
 *   flavour text — the template itself is the same.
 */
import { agencyFreelanceTemplate } from "./definitions/agency_freelance";
import { b2bSaasTemplate } from "./definitions/b2b_saas";
import { dubaiRealEstateTemplate } from "./definitions/dubai_real_estate";
import { freelancerTemplate } from "./definitions/freelancer";
import { genericTemplate } from "./definitions/generic";
import { productivityTemplate } from "./definitions/productivity";
import { realEstateTemplate } from "./definitions/real_estate";
import { realEstateSaudiTemplate } from "./definitions/real_estate_saudi";
import { recruitingTemplate } from "./definitions/recruiting";
import type { IndustryTemplate } from "./types";

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
	"agency-freelance": agencyFreelanceTemplate,
	"b2b-saas": b2bSaasTemplate,
	freelancer: freelancerTemplate,
	generic: genericTemplate,
	productivity: productivityTemplate,
	"real-estate-dubai": dubaiRealEstateTemplate,
	"real-estate-global": realEstateTemplate,
	"real-estate-saudi": realEstateSaudiTemplate,
	recruiting: recruitingTemplate,
};

/**
 * Aliases — onboarding picker ids that don't have a dedicated template.
 * Resolves to whichever curated template is the closest match. When you add
 * a curated definition for one of these, remove its alias.
 *
 * Backwards-compat for orgs that persisted old template ids:
 *   - "dubai-real-estate" → "real-estate-dubai"
 *   - "real-estate"       → "real-estate-global"
 *
 * Productivity sub-niches all alias to the same template:
 *   - "productivity-solo"
 *   - "productivity-student"
 *   - "productivity-side-project"
 *
 * Generic fallback for unknown picker values:
 *   - "other" → "generic"
 */
export const INDUSTRY_ID_ALIASES: Record<string, string> = {
	// Phase 3A renames — historical orgs.
	"dubai-real-estate": "real-estate-dubai",
	"real-estate": "real-estate-global",

	// Phase 3A productivity sub-niches.
	"productivity-solo": "productivity",
	"productivity-student": "productivity",
	"productivity-side-project": "productivity",
	// Bare-name forms used by the onboarding sub-niche picker.
	solo: "productivity",
	student: "productivity",
	"side-project": "productivity",

	// B2B SaaS sub-niches (per §22.2 — all map to b2b-saas in v1).
	"b2b-saas-early-stage": "b2b-saas",
	"b2b-saas-enterprise": "b2b-saas",

	// Generic fallback.
	other: "generic",
};

/**
 * O(1) lookup with alias fallback. Returns `undefined` only for unknown,
 * non-aliased keys — the `generic` template is always available so onboarding
 * never lands on `undefined` for a known industry id.
 */
export function getTemplate(id: string): IndustryTemplate | undefined {
	if (INDUSTRY_TEMPLATES[id]) return INDUSTRY_TEMPLATES[id];
	const alias = INDUSTRY_ID_ALIASES[id];
	if (alias && INDUSTRY_TEMPLATES[alias]) return INDUSTRY_TEMPLATES[alias];
	return undefined;
}

/**
 * Stable-ordered list (alphabetical by id) for UI listings — used by the
 * settings "re-apply template" picker, NOT by onboarding (onboarding shows
 * the full picker including aliased ids).
 */
export function listTemplates(): IndustryTemplate[] {
	return Object.values(INDUSTRY_TEMPLATES).sort((a, b) => a.id.localeCompare(b.id));
}
