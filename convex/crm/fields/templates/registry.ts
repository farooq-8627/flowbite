/**
 * Industry-template registry.
 *
 * Adding a new template:
 *   1. Create `definitions/<id>.ts` exporting one `IndustryTemplate`.
 *   2. Import it here and add it to `INDUSTRY_TEMPLATES`.
 *   3. Done — onboarding wizard + AI tools both auto-pick it up.
 *
 * The `id` field is the stable key persisted in `org.industry`. Don't change
 * it once shipped.
 *
 * INDUSTRY_ID_ALIASES
 * ───────────────────
 * Maps the onboarding-picker industry strings ("technology", "finance", …)
 * onto curated template ids when no exact match exists. Lets us bring up a
 * full template story without forcing the picker UI to change every time we
 * add or rename a template.
 */
import { agencyFreelanceTemplate } from "./definitions/agency_freelance";
import { b2bSaasTemplate } from "./definitions/b2b_saas";
import { freelancerTemplate } from "./definitions/freelancer";
import { genericTemplate } from "./definitions/generic";
import { realEstateTemplate } from "./definitions/real_estate";
import { recruitingTemplate } from "./definitions/recruiting";
import type { IndustryTemplate } from "./types";

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
	"agency-freelance": agencyFreelanceTemplate,
	"b2b-saas": b2bSaasTemplate,
	freelancer: freelancerTemplate,
	"real-estate": realEstateTemplate,
	recruiting: recruitingTemplate,
	generic: genericTemplate,
};

/**
 * Aliases — onboarding picker ids that don't have a dedicated template yet.
 * Resolves to whichever curated template is the closest match. When you add
 * a curated definition for one of these, remove its alias.
 */
export const INDUSTRY_ID_ALIASES: Record<string, string> = {
	technology: "b2b-saas",
	finance: "generic",
	retail: "generic",
	healthcare: "generic",
	construction: "generic",
	hospitality: "generic",
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
