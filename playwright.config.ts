import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		// Auth setup project: produces playwright/.auth/owner.json
		{
			name: "setup",
			testMatch: /global-setup\.ts/,
		},
		// Desktop Chrome (uses saved auth)
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: "playwright/.auth/owner.json",
			},
			dependencies: ["setup"],
		},
		// Mobile Chrome
		{
			name: "Mobile Chrome",
			use: {
				...devices["Pixel 5"],
				storageState: "playwright/.auth/owner.json",
			},
			dependencies: ["setup"],
		},
	],
	webServer: {
		command: "pnpm dev:frontend",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
	},
});
