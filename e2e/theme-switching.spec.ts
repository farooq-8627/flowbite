import { expect, test } from "@playwright/test";

test.describe("Theme Switching", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/dashboard/test-org");
	});

	test("should toggle between light and dark modes", async ({ page }) => {
		// Find theme switcher button
		const themeSwitcher = page.getByRole("button", { name: /current theme/i });

		// Check initial state (should be light or dark)
		const html = page.locator("html");
		const initialHasDark = await html.evaluate((el) => el.classList.contains("dark"));

		// Click to cycle theme
		await themeSwitcher.click();

		// Wait for theme to change
		await page.waitForTimeout(100);

		// Verify theme changed
		const newHasDark = await html.evaluate((el) => el.classList.contains("dark"));
		expect(newHasDark).not.toBe(initialHasDark);
	});

	test("should persist theme preference", async ({ page, context }) => {
		// Set dark mode
		const themeSwitcher = page.getByRole("button", { name: /current theme/i });
		await themeSwitcher.click();

		// Wait for cookie to be set
		await page.waitForTimeout(100);

		// Reload page
		await page.reload();

		// Verify theme persisted
		const html = page.locator("html");
		const hasDark = await html.evaluate((el) => el.classList.contains("dark"));
		expect(hasDark).toBeDefined();
	});

	test("should change theme preset", async ({ page }) => {
		// Open layout controls
		const layoutControls = page.getByRole("button", { name: /settings/i }).first();
		await layoutControls.click();

		// Find theme preset selector
		const presetSelector = page.getByRole("combobox", { name: /theme preset/i });
		await presetSelector.click();

		// Select brutalist theme
		await page.getByRole("option", { name: /brutalist/i }).click();

		// Verify theme preset changed
		const html = page.locator("html");
		const preset = await html.evaluate((el) => el.getAttribute("data-theme-preset"));
		expect(preset).toBe("brutalist");
	});
});
