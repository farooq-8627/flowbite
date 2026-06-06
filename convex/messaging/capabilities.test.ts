/**
 * Contract tests for the messaging capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`; this
 * file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../ai/registry/coverage";
import { MESSAGING_CAPABILITIES } from "./capabilities";

describe("messaging — contract test generator", () => {
	const cases = buildContractCasesForAll([...MESSAGING_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});
