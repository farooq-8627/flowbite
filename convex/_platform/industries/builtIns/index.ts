/**
 * Platform built-in industry templates — one-time bootstrap fixtures.
 *
 * STAGE 3 OF INDUSTRY-TEMPLATES-DB-MIGRATION.md.
 *
 * Source-of-truth note
 * ────────────────────
 * After Stage 3 ships, the **runtime SOURCE OF TRUTH** for industry
 * templates is the `platformTemplates` table — not these files. Every
 * read site (the seeder, the onboarding picker, AI tools, settings →
 * re-apply template) goes through `convex/_platform/industries/queries`
 * and reads DB rows.
 *
 * These nine TS files exist for ONE purpose only: bootstrapping a fresh
 * deployment. They are consumed by:
 *   1. `_migrations/2026_05_27_seedIndustryTemplatesIntoDB` — seeds the
 *      9 built-in rows + 5 visible aliases + 6 invisible back-compat
 *      aliases the first time a deployment runs.
 *   2. `convex/ai/queries/widgets.test.ts` — uses the data to assert
 *      every built-in template's `dashboardMetrics` array round-trips
 *      through `validateDashboardLayout` cleanly.
 *
 * Adding a new industry — DO NOT add files here. The owner-panel route
 * `/xowner/industries/new` ships a clone-or-empty wizard that creates
 * (and edits) every template directly via `platformTemplates` row
 * writes. Zero code changes required.
 *
 * If you find yourself wanting to edit one of these files, you're
 * almost certainly in the wrong place — the file you want to edit is
 * the live row in the DB, via `/xowner/industries/<templateKey>`.
 *
 * Deletion roadmap
 * ────────────────
 * These fixtures are scheduled for removal once every environment has
 * the seed migration applied AND the operator confirms no fresh
 * deployments will need code-based seeding. Until then, they remain
 * the simplest path for `pnpm convex dev` against a clean DB.
 */

import type { IndustryTemplate } from "../../../crm/fields/templates/types";
import { agencyFreelanceTemplate } from "./agency_freelance";
import { b2bSaasTemplate } from "./b2b_saas";
import { dubaiRealEstateTemplate } from "./dubai_real_estate";
import { freelancerTemplate } from "./freelancer";
import { genericTemplate } from "./generic";
import { productivityTemplate } from "./productivity";
import { realEstateTemplate } from "./real_estate";
import { realEstateSaudiTemplate } from "./real_estate_saudi";
import { recruitingTemplate } from "./recruiting";

/**
 * Built-in template seeds keyed by `templateKey`. Identical shape to the
 * legacy `INDUSTRY_TEMPLATES` map from `crm/fields/templates/registry.ts`
 * (deleted in Stage 3). The seeder reads `[templateKey]?.definition` to
 * deep-clone the right shape into the DB row.
 */
export const BUILT_IN_TEMPLATES: Record<string, IndustryTemplate> = {
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
