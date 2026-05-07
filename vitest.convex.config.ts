import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		environment: "edge-runtime",
		server: { deps: { inline: ["convex-test"] } },
		include: ["convex/**/*.test.ts"],
		exclude: ["**/node_modules/**"],
	},
	resolve: {
		alias: { "@": path.resolve(__dirname, "./") },
	},
});
