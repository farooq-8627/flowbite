/**
 * convex/_shared/bulkProgress.ts
 *
 * Stage 10 of `/SPRINT-PLAN.md` — bulk-progress reporting
 * (`AI-AUDIT-COMPLETE.md §17` row "bulk_update_entities ✅ Works, but
 * **no progress streaming** + no row-level diff").
 *
 * Pre-Stage-10, `commit_bulk_update_entities` ran a `try/catch` per
 * row and returned `{ succeeded: number, failed: number }`. The user
 * saw "✅ Bulk update: 7 succeeded, 3 failed." but had no way to
 * find out WHICH 3 failed or WHY. That's a Constraint F violation
 * (no `suggestedNext` chips guiding recovery) AND an honest
 * usability gap.
 *
 * Stage 10 introduces:
 *
 *   1. `recordBulkFailure(...)` — accumulator helper used inside the
 *      bulk runner. Captures `{ entityId, error: { code, message } }`.
 *   2. `summariseBulkResults({...})` — pure helper turning the
 *      accumulated counts + failure list into a `ToolSummary` shape
 *      (headline + table + facts + suggestedNext) the existing
 *      `runTool` envelope can return verbatim.
 *
 * The mid-flight streaming (chunked patches per batch as the runner
 * walks the IDs) is documented in `Future-Enhancements.md` because
 * it requires changes to the streamLoop layer; the row-level diff
 * is the meaningful UX win and ships now.
 *
 * Pure function. No I/O. Tested in `convex/stage10.test.ts`.
 */

import type { ToolSummary, ToolSummaryRow, ToolSummarySuggestion } from "../ai/tools/_shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BulkRowFailure {
	/** The id (or code) of the row that failed. */
	entityId: string;
	/**
	 * Stable code so the summary can group by reason. Pull from
	 * `ConvexError.data.code` when available, else `"UNKNOWN"`.
	 */
	code: string;
	/** ≤ 200 chars. The user-visible reason. */
	message: string;
}

export interface BulkRunStats {
	/** Total rows the runner attempted. */
	attempted: number;
	/** Successful row count. */
	succeeded: number;
	/** Failed row count (== `failures.length`). */
	failed: number;
	/** Per-row failure list (capped). */
	failures: BulkRowFailure[];
}

export interface BulkSummariseInput {
	/** Verb describing what the bulk runner did — "update", "close as won", "tag" etc. */
	verb: string;
	/** Plural noun for the entities — "leads", "deals", "contacts" etc. */
	entityNounPlural: string;
	/**
	 * Bulk run stats. The helper computes the `headline` + `table` +
	 * `facts` + `suggestedNext` chips from these counts.
	 */
	stats: BulkRunStats;
	/**
	 * Optional retry-intent for the chip. Default uses
	 * "Retry the {failed} failed {entityNounPlural} from this run".
	 */
	retryIntent?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Cap how many failures we forward to the summary. Beyond this we
 * surface a "+ N more" footer to keep the chat card readable.
 */
export const BULK_FAILURE_SAMPLE_CAP = 10;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a fresh, empty `BulkRunStats` accumulator. Bulk runners call
 * this once at the top of the loop, then mutate it via
 * `recordBulkSuccess` / `recordBulkFailure` per row.
 */
export function createBulkStats(): BulkRunStats {
	return { attempted: 0, succeeded: 0, failed: 0, failures: [] };
}

/**
 * Record a successful row. Mutates `stats` in place — pure relative
 * to the input arguments (no I/O), but designed to be folded into a
 * for-loop without allocating a fresh object every iteration.
 */
export function recordBulkSuccess(stats: BulkRunStats): void {
	stats.attempted += 1;
	stats.succeeded += 1;
}

/**
 * Record a failed row. Captures up to `BULK_FAILURE_SAMPLE_CAP`
 * detailed failures; beyond that, only the count keeps incrementing.
 */
export function recordBulkFailure(stats: BulkRunStats, entityId: string, err: unknown): void {
	stats.attempted += 1;
	stats.failed += 1;
	if (stats.failures.length < BULK_FAILURE_SAMPLE_CAP) {
		stats.failures.push({
			entityId,
			code: extractErrorCode(err),
			message: extractErrorMessage(err),
		});
	}
}

/**
 * Build the `ToolSummary` envelope from a completed bulk run.
 *
 * The headline is one of:
 *   - "Updated 10 leads" (all succeeded)
 *   - "Updated 7 of 10 leads — 3 failed" (partial)
 *   - "All 10 lead updates failed" (every row threw)
 *
 * The table lists per-row failures (capped). `facts` summarises by
 * error code so the model can decide whether to retry. The
 * `suggestedNext` chips include "Retry failed rows" and "Show me the
 * failures".
 */
export function summariseBulkResults(input: BulkSummariseInput): {
	display: string;
	summary: ToolSummary;
} {
	const { verb, entityNounPlural, stats } = input;
	const total = stats.attempted;
	const ok = stats.succeeded;
	const ko = stats.failed;

	const headline = (() => {
		if (total === 0) return `No ${entityNounPlural} ${pastTense(verb)}.`;
		if (ko === 0) return `${capitalise(pastTense(verb))} ${ok} ${entityNounPlural}.`;
		if (ok === 0) return `All ${total} ${entityNounPlural} failed to ${verb}.`;
		return `${capitalise(pastTense(verb))} ${ok} of ${total} ${entityNounPlural} — ${ko} failed.`;
	})();

	// Group failures by code so the bullet list is short even when
	// the failure list is long.
	const byCode = new Map<string, { count: number; sample: BulkRowFailure }>();
	for (const f of stats.failures) {
		const prev = byCode.get(f.code);
		if (prev) {
			prev.count += 1;
		} else {
			byCode.set(f.code, { count: 1, sample: f });
		}
	}

	const table: ToolSummaryRow[] = [];
	if (total > 0) {
		table.push({ label: "Attempted", value: String(total), emphasis: "unchanged" });
		table.push({
			label: "Succeeded",
			value: String(ok),
			emphasis: ok > 0 ? "added" : "unchanged",
		});
		table.push({
			label: "Failed",
			value: String(ko),
			emphasis: ko > 0 ? "changed" : "unchanged",
		});
	}
	for (const f of stats.failures.slice(0, BULK_FAILURE_SAMPLE_CAP)) {
		table.push({
			label: f.entityId,
			value: `${f.code}: ${truncate(f.message, 120)}`,
			emphasis: "changed",
		});
	}
	if (stats.failed > stats.failures.length) {
		table.push({
			label: "More failures",
			value: `+${stats.failed - stats.failures.length} not shown`,
			emphasis: "changed",
		});
	}

	const facts: string[] = [];
	if (byCode.size > 0) {
		for (const [code, info] of byCode.entries()) {
			facts.push(`${info.count} row${info.count === 1 ? "" : "s"} failed with code ${code}.`);
		}
	}
	if (ko === 0 && ok > 0) {
		facts.push(
			`Every requested ${entityNounPlural.replace(/s$/, "")} ${pastTense(verb)} successfully.`,
		);
	}

	const suggestedNext: ToolSummarySuggestion[] = [];
	if (ko > 0) {
		const retryIds = stats.failures.slice(0, BULK_FAILURE_SAMPLE_CAP).map((f) => f.entityId);
		suggestedNext.push({
			label: "Retry failed rows",
			intent:
				input.retryIntent ??
				(retryIds.length > 0
					? `Retry the failed ${entityNounPlural} ${retryIds.join(", ")}`
					: `Retry the ${ko} failed ${entityNounPlural}`),
		});
		suggestedNext.push({
			label: "Show why they failed",
			intent: `Explain why ${ko} ${entityNounPlural} failed in the last bulk run`,
		});
	}
	if (ok > 0) {
		suggestedNext.push({
			label: "Add follow-up",
			intent: `Create a follow-up reminder to review the ${ok} ${entityNounPlural} I just ${pastTense(verb)}`,
		});
	}

	const summary: ToolSummary = {
		headline,
		table: table.length > 0 ? table : undefined,
		facts: facts.length > 0 ? facts : undefined,
		suggestedNext: suggestedNext.length > 0 ? suggestedNext : undefined,
	};

	const display = headline;
	return { display, summary };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function extractErrorCode(err: unknown): string {
	if (typeof err === "object" && err !== null) {
		const data = (err as { data?: unknown }).data;
		if (typeof data === "object" && data !== null) {
			const code = (data as { code?: unknown }).code;
			if (typeof code === "string") return code;
		}
		const direct = (err as { code?: unknown }).code;
		if (typeof direct === "string") return direct;
	}
	return "UNKNOWN";
}

function extractErrorMessage(err: unknown): string {
	if (typeof err === "string") return truncate(err, 200);
	if (typeof err === "object" && err !== null) {
		const data = (err as { data?: unknown }).data;
		if (typeof data === "object" && data !== null) {
			const message = (data as { message?: unknown }).message;
			if (typeof message === "string") return truncate(message, 200);
		}
		const direct = (err as { message?: unknown }).message;
		if (typeof direct === "string") return truncate(direct, 200);
	}
	return truncate(String(err), 200);
}

function truncate(s: string, n: number): string {
	if (s.length <= n) return s;
	return `${s.slice(0, Math.max(0, n - 1))}…`;
}

function capitalise(s: string): string {
	if (s.length === 0) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Tiny irregular-verb table for the noun-friendly headline. Bulk
 * runners only ever pass a small set of verbs ("update", "close",
 * "tag", "delete", "restore") so a hardcoded map is cheaper than
 * pulling in a verb-conjugator dependency.
 */
function pastTense(verb: string): string {
	const irregular: Record<string, string> = {
		update: "updated",
		create: "created",
		delete: "deleted",
		restore: "restored",
		close: "closed",
		"close as won": "closed as won",
		"close as lost": "closed as lost",
		tag: "tagged",
		untag: "untagged",
		archive: "archived",
		assign: "assigned",
		convert: "converted",
		"send message to": "sent message to",
	};
	const lower = verb.toLowerCase();
	if (irregular[lower]) return irregular[lower];
	if (lower.endsWith("e")) return `${lower}d`;
	return `${lower}ed`;
}
