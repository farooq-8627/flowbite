import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "happy-dom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		include: ["**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/convex/**", "**/.next/**", "**/e2e/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"convex/",
				".next/",
				"e2e/",
				"**/*.config.{ts,js}",
				"**/*.d.ts",
			],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./"),
		},
	},
});
