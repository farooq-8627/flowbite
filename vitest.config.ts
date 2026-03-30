/**
 * Vitest configuration for Convex function tests.
 *
 * WHY edge-runtime:
 *   Convex functions run in the V8 Isolate runtime (not Node.js). Using
 *   @edge-runtime/vm mirrors this environment so tests catch runtime-specific
 *   issues (e.g. no Buffer, no fs, no Node built-ins in Convex functions).
 *
 * WHY inline: ["convex-test"]:
 *   convex-test ships ESM that needs to be processed by Vite's transform pipeline
 *   rather than loaded natively. Inlining it forces the module through the bundler.
 *
 * WHY tsconfig.test.json:
 *   Test files use `/// <reference types="vite/client" />` for `import.meta.glob`.
 *   The main tsconfig.json excludes test files to avoid polluting the Next.js build
 *   with Vite-specific types. tsconfig.test.json extends the main config and adds
 *   `vite/client` types only for test files.
 *
 * Sources:
 * - https://github.com/get-convex/convex-test — official convex-test package
 * - https://docs.convex.dev/functions/testing — Convex testing guide
 * - https://github.com/Develonaut/bnto/blob/main/packages/%40bnto/backend/vitest.config.ts
 *   — reference: real production project using convex-test + edge-runtime
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		/**
		 * Use the Edge Runtime VM environment to match Convex's V8 Isolate runtime.
		 * This prevents tests from accidentally depending on Node.js built-ins
		 * that aren't available in Convex functions.
		 */
		environment: "edge-runtime",

		/**
		 * Inline convex-test so Vite transforms it through the ESM pipeline.
		 * Without this, convex-test fails to load in the edge-runtime environment.
		 */
		server: {
			deps: {
				inline: ["convex-test"],
			},
		},

		/**
		 * Use the test-specific tsconfig that adds vite/client types for
		 * import.meta.glob support in test files.
		 */
		typecheck: {
			tsconfig: "./tsconfig.test.json",
		},
	},
});
