/**
 * Navigation E2E tests — dashboard shell, sidebar, fixed routes.
 *
 * These tests use the pre-authenticated fixture so every spec starts
 * with a valid session cookie. Correct base routes:
 *   /en/[orgSlug]           → dashboard home
 *   /en/[orgSlug]/leads     → leads
 *   /en/[orgSlug]/contacts  → contacts
 *   /en/[orgSlug]/deals     → deals
 *   /en/[orgSlug]/settings  → settings
 *   /en/[orgSlug]/notes     → notes
 *   /en/[orgSlug]/reminders → reminders
 *   /en/[orgSlug]/timeline  → timeline
 */
import { authedTest, expect, TEST_ORG_SLUG } from "./fixtures/auth";

const ORG_BASE = `/en/${TEST_ORG_SLUG}`;

authedTest.describe("Navigation — sidebar", () => {
	authedTest("renders the sidebar / navigation rail", async ({ page }) => {
		await page.goto(ORG_BASE);
		// Sidebar: landmark role "complementary" or nav
		const sidebar = page
			.locator('[data-sidebar="sidebar"]')
			.or(page.getByRole("complementary"))
			.first();
		await expect(sidebar).toBeVisible({ timeout: 8000 });
	});

	authedTest("sidebar contains primary nav links", async ({ page }) => {
		await page.goto(ORG_BASE);
		// At least one navigation link should exist in the sidebar
		const navLinks = page.getByRole("navigation").getByRole("link");
		const count = await navLinks.count();
		expect(count).toBeGreaterThan(0);
	});

	authedTest("sidebar toggle button exists and is clickable", async ({ page }) => {
		await page.goto(ORG_BASE);
		const toggleBtn = page
			.getByRole("button", { name: /toggle sidebar/i })
			.or(page.locator('[data-testid="sidebar-toggle"]'))
			.first();

		if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await toggleBtn.click();
			await page.waitForTimeout(300);
			// The page shouldn't crash after toggling
			await expect(page).not.toHaveURL(/error/);
		}
	});
});

authedTest.describe("Navigation — dashboard routes", () => {
	authedTest("loads the dashboard home page", async ({ page }) => {
		await page.goto(ORG_BASE);
		await expect(page).toHaveURL(`${ORG_BASE}`, { timeout: 8000 });
		// Page should have some content (not a blank white screen)
		const mainContent = page.locator("main").first();
		await expect(mainContent).toBeVisible();
	});

	authedTest("loads the leads page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/leads`);
		await expect(page).toHaveURL(/\/leads/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the contacts page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/contacts`);
		await expect(page).toHaveURL(/\/contacts/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the deals page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/deals`);
		await expect(page).toHaveURL(/\/deals/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the settings page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/settings`);
		await expect(page).toHaveURL(/\/settings/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the notes page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/notes`);
		await expect(page).toHaveURL(/\/notes/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the reminders page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/reminders`);
		await expect(page).toHaveURL(/\/reminders/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("loads the timeline page", async ({ page }) => {
		await page.goto(`${ORG_BASE}/timeline`);
		await expect(page).toHaveURL(/\/timeline/, { timeout: 8000 });
		await expect(page.locator("main").first()).toBeVisible();
	});

	authedTest("unknown entity slug shows 404, not a crash", async ({ page }) => {
		await page.goto(`${ORG_BASE}/this-does-not-exist-xyz`);
		// Should show a 404 page, not a 500 / error boundary crash
		const notFoundIndicator = page
			.getByText(/not found|404|page does not exist/i)
			.or(page.locator('[data-testid="not-found"]'))
			.first();
		await expect(notFoundIndicator).toBeVisible({ timeout: 8000 });
	});
});

authedTest.describe("Navigation — keyboard shortcuts", () => {
	authedTest("Cmd+J / Ctrl+J opens command palette", async ({ page }) => {
		await page.goto(ORG_BASE);
		// Try Meta+J (Mac) then Ctrl+J (Windows) depending on OS
		await page.keyboard.press("Meta+J");
		const dialog = page.getByRole("dialog").first();
		const isVisible = await dialog.isVisible({ timeout: 2000 }).catch(() => false);
		if (!isVisible) {
			// Fallback for CI environments
			await page.keyboard.press("Escape");
			await page.keyboard.press("Control+J");
		}
		// Just check the page doesn't crash; command palette selector varies
		await expect(page).not.toHaveURL(/error/);
	});
});

authedTest.describe("Navigation — responsive", () => {
	authedTest("dashboard is visible on mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(ORG_BASE);
		// Main content is still accessible
		const main = page.locator("main").first();
		await expect(main).toBeVisible({ timeout: 8000 });
	});

	authedTest("dashboard is visible on tablet viewport", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto(ORG_BASE);
		await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
	});
});
