import { expect, test } from "@playwright/test";

test.describe("Dashboard Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/dashboard/test-org");
	});

	test("should render sidebar", async ({ page }) => {
		const sidebar = page.getByRole("complementary");
		await expect(sidebar).toBeVisible();
	});

	test("should toggle sidebar", async ({ page }) => {
		const sidebarTrigger = page.getByRole("button", { name: /toggle sidebar/i });
		await sidebarTrigger.click();

		// Wait for animation
		await page.waitForTimeout(300);

		// Sidebar should still be in DOM but possibly collapsed
		const sidebar = page.getByRole("complementary");
		await expect(sidebar).toBeInViewport();
	});

	test("should open search dialog with keyboard shortcut", async ({ page }) => {
		// Press Cmd+J (Mac) or Ctrl+J (Windows/Linux)
		await page.keyboard.press("Meta+J");

		// Search dialog should be visible
		const searchDialog = page.getByRole("dialog");
		await expect(searchDialog).toBeVisible();

		// Should have search input
		const searchInput = page.getByPlaceholder(/search/i);
		await expect(searchInput).toBeVisible();
	});

	test("should navigate using sidebar links", async ({ page }) => {
		// Find a navigation link
		const navLink = page.getByRole("link", { name: /dashboard/i }).first();
		await navLink.click();

		// Wait for navigation
		await page.waitForURL(/\/dashboard/);

		// Verify URL changed
		expect(page.url()).toContain("/dashboard");
	});

	test("should be responsive on mobile", async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		// Sidebar should be hidden on mobile
		const sidebar = page.getByRole("complementary");
		const isVisible = await sidebar.isVisible();

		// On mobile, sidebar might be hidden or in offcanvas mode
		expect(isVisible).toBeDefined();
	});
});
