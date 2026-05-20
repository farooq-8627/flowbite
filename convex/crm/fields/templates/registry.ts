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
 */
import { b2bSaasTemplate } from "./definitions/b2b_saas";
import { freelancerTemplate } from "./definitions/freelancer";
import { realEstateTemplate } from "./definitions/real_estate";
import type { IndustryTemplate } from "./types";

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
	"b2b-saas": b2bSaasTemplate,
	freelancer: freelancerTemplate,
	"real-estate": realEstateTemplate,
};

/** O(1) lookup. Returns `undefined` for unknown keys. */
export function getTemplate(id: string): IndustryTemplate | undefined {
	return INDUSTRY_TEMPLATES[id];
}

/** Stable-ordered list (alphabetical by id) for UI listings. */
export function listTemplates(): IndustryTemplate[] {
	return Object.values(INDUSTRY_TEMPLATES).sort((a, b) => a.id.localeCompare(b.id));
}
