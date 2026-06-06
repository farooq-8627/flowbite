/**
 * S12 — registry-derived coverage / contract report.
 *
 * Reads the live `REGISTRY` (every domain's `capabilities.ts` registers via
 * a side-effect import) and returns the inventory + per-module gaps. Pure
 * read; no DB writes; gated on the platform-owner role since it surfaces
 * the entire AI surface in one shot.
 */
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { buildCoverageReport, type CoverageReport } from "../registry/coverage";
import { listCapabilities } from "../registry/define";
import { listGroups } from "../registry/groups";

// Side-effect imports — register every domain's capabilities + group
// playbook before we snapshot the registry. Mirrors `runtime/host.ts`
// so `getCoverageReport` reflects the same surface the host runs.
import "../../crm/entities/leads/capabilities";
import "../../crm/entities/deals/capabilities";
import "../../crm/entities/companies/capabilities";
import "../../crm/shared/tasks/capabilities";
import "../../crm/shared/notes/capabilities";
import "../../crm/shared/timeline/capabilities";
import "../../notifications/capabilities";
import "../../crm/fields/pipelines/capabilities";
import "../../crm/fields/fieldDefinitions/capabilities";
import "../../crm/shared/tags/capabilities";
import "../../crm/shared/savedViews/capabilities";
import "../../crm/shared/noteCategories/capabilities";
import "../../orgs/capabilities";
import "../../crm/shared/bulk/capabilities";
import "../../messaging/capabilities";
import "../../files/capabilities";
import "../../dashboard/capabilities";
import "../analytics/capabilities";
import "../creative/capabilities";
import "../interaction/capabilities";
import "../proactive/capabilities";
import "../quarantined/capabilities";

/** Build a fresh report from the live registry. Exported so tests can call it. */
export function snapshotCoverageReport(): CoverageReport {
	const caps = listCapabilities();
	const groupKeys = new Set(listGroups().map((g) => g.name));
	return buildCoverageReport(caps, groupKeys);
}

async function readReport(_ctx: QueryCtx): Promise<CoverageReport> {
	return snapshotCoverageReport();
}

/**
 * Internal query — surfaces the report to operators (run via the Convex
 * dashboard or a CLI). Defence-in-depth: the query is `internalQuery` so
 * only the platform owner can call it through the standard internal-action
 * surface; org-scoped chat tools cannot reach it.
 */
export const getCoverageReport = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await readReport(ctx);
	},
});

/**
 * Companion: a flat list of `(capName, status)` rows for ops-style "every
 * capability missing X" filters. Mirrors `getCoverageReport` but a thinner
 * shape — easier to grep through a long output.
 */
export const listCapabilityGaps = internalQuery({
	args: { kind: v.optional(v.union(v.literal("missingExample"), v.literal("missingPlaybook"))) },
	handler: async (_ctx, args) => {
		const report = snapshotCoverageReport();
		const rows: Array<{ name: string; module: string; group: string; gap: string }> = [];
		if (!args.kind || args.kind === "missingExample") {
			for (const m of report.perModule) {
				for (const name of m.missingExamples) {
					rows.push({ name, module: m.module, group: "", gap: "missingExample" });
				}
			}
		}
		if (!args.kind || args.kind === "missingPlaybook") {
			for (const groupName of report.summary.missingPlaybooks) {
				rows.push({
					name: "(group)",
					module: "",
					group: groupName,
					gap: "missingPlaybook",
				});
			}
		}
		return rows;
	},
});
