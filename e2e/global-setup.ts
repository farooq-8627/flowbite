/**
 * Playwright global-setup — runs once before all test suites.
 *
 * Signs in and saves the auth cookie to `playwright/.auth/owner.json`
 * so every spec can reuse it without repeating the login flow.
 */
import fs from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const AUTH_FILE = path.join(__dirname, "../playwright/.auth/owner.json");

const TEST_EMAIL = "e2e-owner@orbitly-test.local";
const TEST_PASSWORD = "Test1234!E2E";
const TEST_ORG_NAME = "E2E Test Org";

async function globalSetup() {
	fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

	const browser: Browser = await chromium.launch();
	const context: BrowserContext = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto(`${BASE_URL}/en/signin`);
		await page.waitForLoadState("networkidle");

		await page.getByLabel(/email/i).fill(TEST_EMAIL);
		await page.getByLabel(/password/i).fill(TEST_PASSWORD);
		await page.getByRole("button", { name: /sign in/i }).click();

		const result = await Promise.race([
			page.waitForURL(/\/en\/.+/, { timeout: 8000 }).then(() => "success"),
			page
				.locator('[data-testid="auth-error"], [role="alert"]')
				.waitFor({ timeout: 8000 })
				.then(() => "error"),
		]).catch(() => "timeout");

		if (result !== "success") {
			await signUpAndOnboard(page);
		}

		await page.waitForURL(/\/en\//, { timeout: 15000 });

		if (page.url().includes("/onboarding")) {
			await completeOnboarding(page);
		}

		await context.storageState({ path: AUTH_FILE });
	} finally {
		await browser.close();
	}
}

async function signUpAndOnboard(page: Page) {
	await page.goto(`${BASE_URL}/en/signup`);
	await page.waitForLoadState("networkidle");

	const nameInput = page.getByLabel(/name/i).first();
	if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
		await nameInput.fill("E2E Owner");
	}
	await page.getByLabel(/email/i).fill(TEST_EMAIL);
	await page.getByLabel(/password/i).fill(TEST_PASSWORD);
	await page.getByRole("button", { name: /sign up|create account|get started/i }).click();
	await page.waitForURL(/\/en\//, { timeout: 15000 });
}

async function completeOnboarding(page: Page) {
	const workspaceInput = page.getByPlaceholder(/workspace|company|org/i).first();
	if (await workspaceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
		await workspaceInput.fill(TEST_ORG_NAME);
	}

	for (let i = 0; i < 5; i++) {
		const nextBtn = page
			.getByRole("button", { name: /next|continue|get started|finish/i })
			.last();
		if (await nextBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
			await nextBtn.click();
			await page.waitForTimeout(500);
		}
		if (!page.url().includes("/onboarding")) break;
	}

	await page.waitForURL(/\/en\/[^/]+$/, { timeout: 10000 });
}

export default globalSetup;
