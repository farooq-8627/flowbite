/**
 * Contract tests for the notifications capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`; this
 * file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../ai/registry/coverage";
import { NOTIFICATIONS_CAPABILITIES } from "./capabilities";

describe("notifications — contract test generator", () => {
	const cases = buildContractCasesForAll([...NOTIFICATIONS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});
