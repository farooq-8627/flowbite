/**
 * Playwright auth fixture.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth";
 *
 * The `authedTest` fixture reuses a saved auth cookie (stored at
 * `playwright/.auth/owner.json` by `global-setup.ts`) so tests never
 * repeat the login flow. `orgSlug` is the test org created during setup.
 */
import { test as base, type Page } from "@playwright/test";

export type AuthFixtures = {
	orgSlug: string;
	authedPage: Page;
};

/**
 * The test org slug used by global-setup and all E2E specs.
 * Must match the value in `global-setup.ts`.
 */
export const TEST_ORG_SLUG = "test-e2e-org";

/** Base URL helpers */
export const routes = {
	signIn: "/en/signin",
	signUp: "/en/signup",
	dashboard: `/en/${TEST_ORG_SLUG}`,
	settings: `/en/${TEST_ORG_SLUG}/settings`,
	leads: `/en/${TEST_ORG_SLUG}/leads`,
	contacts: `/en/${TEST_ORG_SLUG}/contacts`,
	deals: `/en/${TEST_ORG_SLUG}/deals`,
	timeline: `/en/${TEST_ORG_SLUG}/timeline`,
	notes: `/en/${TEST_ORG_SLUG}/notes`,
	reminders: `/en/${TEST_ORG_SLUG}/reminders`,
};

/**
 * Pre-authenticated test that reuses the saved cookie from global-setup.
 * Uses `playwright/.auth/owner.json` as storageState.
 */
export const authedTest = base.extend<AuthFixtures>({
	storageState: "playwright/.auth/owner.json",
	orgSlug: async (_fixtures, use) => {
		await use(TEST_ORG_SLUG);
	},
	authedPage: async ({ page, orgSlug }, use) => {
		await page.goto(`/en/${orgSlug}`);
		await use(page);
	},
});

export { expect } from "@playwright/test";
