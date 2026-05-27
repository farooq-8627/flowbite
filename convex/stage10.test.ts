/**
 * convex/stage10.test.ts
 *
 * Stage 10 of `/SPRINT-PLAN.md` (2026-05-26). Pure-helper regression
 * tests for the hardening pass:
 *
 *   1. `sanitiseExtractedText` / `sanitiseExtractedFields` —
 *      adversarial-file XSS / injection sanitiser used by
 *      `convex/ai/quarantined/fileAnalyzer.ts` BEFORE the structured
 *      extracted record is persisted or rendered.
 *   2. `decodeCsvBytes` / `detectEncoding` / `describeEncodingWarning`
 *      — encoding heuristics used by
 *      `convex/ai/quarantined/csvParser.ts` to handle UTF-8 BOM,
 *      UTF-16-LE/BE BOM, and Latin-1 / Windows-1252 CSVs that
 *      pre-Stage-10 silently corrupted into `?` chars.
 *   3. `createBulkStats` / `recordBulkSuccess` / `recordBulkFailure`
 *      / `summariseBulkResults` — bulk-progress reporter used by
 *      `commit_bulk_update_entities` + `commit_bulk_close_deals` to
 *      surface a row-level diff + retry chips instead of a silent
 *      `{ succeeded, failed }` counter.
 *   4. `mapEnrichmentError` — enrichment-provider error → friendly
 *      envelope mapper used by `enrichmentProviders.ts` on every
 *      provider trace push so the trace UI surfaces a code +
 *      retry hint instead of `String(e).slice(0, 300)`.
 *   5. RemindersCard gate contract — DASHBOARD-AUDIT.md §6 last
 *      pending checkbox. Asserts that an org seeded with the
 *      pre-Stage-1 `dashboardMetrics: ['reminders.list']` flows
 *      cleanly through `validateDashboardLayout` AND that the
 *      `WIDGETS` registry recognises every key the frontend's
 *      RemindersCard gate (`reminders.list || reminders.dueToday ||
 *      tasks.dueToday`) checks.
 *
 * No `convex-test` harness — every helper under test is pure. The
 * file lives at the convex root (matches stage5/6/7/8/9.test.ts) so
 * the module-glob path stays consistent.
 */

import { describe, expect, it } from "vitest";
import {
	BULK_FAILURE_SAMPLE_CAP,
	createBulkStats,
	recordBulkFailure,
	recordBulkSuccess,
	summariseBulkResults,
} from "./_shared/bulkProgress";
import {
	decodeCsvBytes,
	describeEncodingWarning,
	detectEncoding,
} from "./_shared/csvEncodingDetect";
import { mapEnrichmentError } from "./_shared/enrichmentErrorMap";
import {
	SANITISE_MAX_FIELD_LENGTH,
	sanitiseExtractedFields,
	sanitiseExtractedText,
} from "./_shared/sanitiseExtractedText";
import { validateDashboardLayout, WIDGET_KEYS, WIDGETS } from "./_shared/widgetRegistry";

// ─── 1. Sanitiser ─────────────────────────────────────────────────────────

describe("sanitiseExtractedText (Stage 10)", () => {
	it("returns empty string + zero counts for non-string input", () => {
		const r = sanitiseExtractedText(null);
		expect(r.text).toBe("");
		expect(r.report.strippedTags).toBe(0);
		expect(r.report.strippedHandlers).toBe(0);
		expect(r.report.strippedProtocols).toBe(0);
		expect(r.report.truncated).toBe(false);
	});

	it("strips <script> blocks", () => {
		const r = sanitiseExtractedText("hello <script>alert('xss')</script> world");
		expect(r.text).toBe("hello  world");
		expect(r.report.strippedTags).toBeGreaterThan(0);
	});

	it("strips orphan <iframe> opens that lack a close tag", () => {
		const r = sanitiseExtractedText('Click <iframe src="evil.com">here');
		expect(r.text).toContain("here");
		expect(r.text).not.toContain("<iframe");
		expect(r.report.strippedTags).toBeGreaterThan(0);
	});

	it("strips on*= event handlers from raw HTML", () => {
		const r = sanitiseExtractedText('<a href="x" onclick="alert(1)">hi</a>');
		expect(r.text).not.toContain("onclick");
		expect(r.report.strippedHandlers).toBe(1);
	});

	it("redacts javascript: protocol in href attributes", () => {
		const r = sanitiseExtractedText("<a href=\"javascript:fetch('/admin')\">click</a>");
		expect(r.text).toContain("#removed-unsafe-link");
		expect(r.text).not.toContain("javascript:");
		expect(r.report.strippedProtocols).toBe(1);
	});

	it("redacts data:text/html in href attributes", () => {
		const r = sanitiseExtractedText(
			'<a href="data:text/html,<script>alert(1)</script>">click</a>',
		);
		expect(r.text).toContain("#removed-unsafe-link");
		expect(r.report.strippedProtocols).toBe(1);
	});

	it("redacts dangerous markdown link targets but keeps the visible label", () => {
		const r = sanitiseExtractedText("[click me](javascript:alert(1))");
		expect(r.text).toContain("[click me]");
		expect(r.text).toContain("#removed-unsafe-link");
		expect(r.text).not.toContain("javascript:alert");
		expect(r.report.strippedProtocols).toBe(1);
	});

	it("leaves benign markdown links untouched", () => {
		const benign = "[FlowBite](https://example.com/abc)";
		const r = sanitiseExtractedText(benign);
		expect(r.text).toBe(benign);
		expect(r.report.strippedProtocols).toBe(0);
	});

	it("is idempotent — running twice yields the same output with zero new strips", () => {
		const dirty = '<script>x</script>[a](javascript:1) <a onload="bad">';
		const first = sanitiseExtractedText(dirty);
		const second = sanitiseExtractedText(first.text);
		expect(second.text).toBe(first.text);
		expect(second.report.strippedTags).toBe(0);
		expect(second.report.strippedHandlers).toBe(0);
		expect(second.report.strippedProtocols).toBe(0);
	});

	it("truncates oversized input + flags the report", () => {
		const blob = "a".repeat(SANITISE_MAX_FIELD_LENGTH + 100);
		const r = sanitiseExtractedText(blob);
		expect(r.text.length).toBe(SANITISE_MAX_FIELD_LENGTH);
		expect(r.report.truncated).toBe(true);
	});
});

describe("sanitiseExtractedFields (Stage 10)", () => {
	it("sanitises every string field on a flat record", () => {
		const out = sanitiseExtractedFields({
			vendor: "Acme <script>alert(1)</script> Inc",
			invoiceNumber: "INV-0001",
			notes: "[bad](javascript:alert(1))",
			total: 42, // not a string — passes through
			currency: "USD",
		});
		expect(out.record.vendor).toContain("Acme");
		expect(out.record.vendor).not.toContain("<script");
		expect(out.record.notes).toContain("#removed-unsafe-link");
		expect(out.record.invoiceNumber).toBe("INV-0001");
		expect(out.record.total).toBe(42);
		expect(out.record.currency).toBe("USD");
		expect(out.report.fieldsScanned).toBe(5);
		expect(out.report.fieldsTouched).toBeGreaterThanOrEqual(2);
	});

	it("element-wise sanitises string arrays (e.g. invoice line items)", () => {
		const out = sanitiseExtractedFields({
			items: ["Widget A", "<script>alert(1)</script>Widget B", "Widget C"],
		});
		const items = out.record.items as string[];
		expect(items[0]).toBe("Widget A");
		expect(items[1]).not.toContain("<script");
		expect(items[1]).toContain("Widget B");
		expect(items[2]).toBe("Widget C");
	});

	it("returns empty record + zero counts on null input", () => {
		const out = sanitiseExtractedFields(null);
		expect(out.record).toEqual({});
		expect(out.report.fieldsScanned).toBe(0);
	});
});

// ─── 2. CSV encoding ──────────────────────────────────────────────────────

describe("detectEncoding + decodeCsvBytes (Stage 10)", () => {
	const enc = (s: string) => new TextEncoder().encode(s);

	it("classifies an empty buffer as 'unknown' with 1.0 confidence", () => {
		const r = detectEncoding(new Uint8Array(0));
		expect(r.encoding).toBe("unknown");
		expect(r.confidence).toBe(1.0);
	});

	it("detects UTF-8 BOM and strips it during decode", () => {
		const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("name,email\nfoo,foo@x.com\n")]);
		const detect = detectEncoding(bytes);
		expect(detect.encoding).toBe("utf-8-bom");
		expect(detect.bomStripped).toBe(true);
		expect(detect.confidence).toBe(1.0);
		const decode = decodeCsvBytes(bytes);
		expect(decode.text.startsWith("name,email")).toBe(true);
	});

	it("detects UTF-16-LE BOM", () => {
		const bytes = new Uint8Array([0xff, 0xfe, ...enc("name")]);
		const r = detectEncoding(bytes);
		expect(r.encoding).toBe("utf-16-le");
	});

	it("detects UTF-16-BE BOM", () => {
		const bytes = new Uint8Array([0xfe, 0xff, ...enc("name")]);
		const r = detectEncoding(bytes);
		expect(r.encoding).toBe("utf-16-be");
	});

	it("classifies pure ASCII", () => {
		const r = detectEncoding(enc("name,email\njohn,john@x.com\n"));
		expect(r.encoding).toBe("ascii");
		expect(r.bomStripped).toBe(false);
	});

	it("classifies clean UTF-8 (Arabic content, no BOM)", () => {
		const r = detectEncoding(enc("الاسم,البريد\nمحمد,m@x.com\n"));
		expect(r.encoding).toBe("utf-8");
		expect(r.replacementChars).toBe(0);
	});

	it("falls back to latin-1 when high-bit bytes don't decode as UTF-8", () => {
		// 0xE9 is é in Latin-1 but an invalid lone continuation byte in UTF-8.
		// Spread it across the sample so the >1% replacement-char threshold trips.
		const ascii = enc("name,city\n");
		const latin1 = new Uint8Array(20);
		for (let i = 0; i < 20; i++) latin1[i] = i % 2 === 0 ? 0xe9 : 0x61;
		const bytes = new Uint8Array([...ascii, ...latin1]);
		const r = detectEncoding(bytes);
		expect(r.encoding).toBe("latin-1");
		expect(r.replacementChars).toBeGreaterThan(0);
	});

	it("describeEncodingWarning is null for a clean utf-8 file", () => {
		const r = detectEncoding(enc("a,b,c\n1,2,3\n"));
		expect(describeEncodingWarning(r)).toBeNull();
	});

	it("describeEncodingWarning surfaces a friendly message for unknown / latin-1 / replacement-char cases", () => {
		expect(
			describeEncodingWarning({
				encoding: "unknown",
				bomStripped: false,
				confidence: 1,
				replacementChars: 0,
			}),
		).toMatch(/UTF-8/);
		expect(
			describeEncodingWarning({
				encoding: "latin-1",
				bomStripped: false,
				confidence: 0.5,
				replacementChars: 5,
			}),
		).toMatch(/Latin-1/);
		expect(
			describeEncodingWarning({
				encoding: "utf-8",
				bomStripped: false,
				confidence: 0.6,
				replacementChars: 7,
			}),
		).toMatch(/unreadable/);
	});
});

// ─── 3. Bulk progress ─────────────────────────────────────────────────────

describe("bulkProgress helper (Stage 10)", () => {
	it("reports an all-success run with no failures", () => {
		const stats = createBulkStats();
		recordBulkSuccess(stats);
		recordBulkSuccess(stats);
		recordBulkSuccess(stats);
		const { display, summary } = summariseBulkResults({
			verb: "update",
			entityNounPlural: "leads",
			stats,
		});
		expect(display).toContain("Updated 3 leads");
		expect(summary.headline).toContain("Updated 3 leads");
		expect(summary.suggestedNext?.some((s) => s.label === "Add follow-up")).toBe(true);
		expect(summary.suggestedNext?.some((s) => s.label === "Retry failed rows")).toBe(false);
	});

	it("reports a partial failure with row-level table + retry chips", () => {
		const stats = createBulkStats();
		recordBulkSuccess(stats);
		recordBulkSuccess(stats);
		recordBulkFailure(stats, "L-007", {
			data: { code: "RBAC", message: "Missing leads.update permission" },
		});
		recordBulkFailure(stats, "L-008", new Error("Document not found"));
		const { display, summary } = summariseBulkResults({
			verb: "update",
			entityNounPlural: "leads",
			stats,
		});
		expect(display).toMatch(/Updated 2 of 4/);
		expect(summary.headline).toContain("2 of 4");
		expect(summary.headline).toContain("2 failed");
		// Per-row failure entries should be in the table.
		const labels = (summary.table ?? []).map((row) => row.label);
		expect(labels).toContain("L-007");
		expect(labels).toContain("L-008");
		// Retry + explain chips for the failed rows.
		const chipLabels = (summary.suggestedNext ?? []).map((s) => s.label);
		expect(chipLabels).toContain("Retry failed rows");
		expect(chipLabels).toContain("Show why they failed");
	});

	it("reports a total-failure run", () => {
		const stats = createBulkStats();
		recordBulkFailure(stats, "L-001", new Error("boom"));
		recordBulkFailure(stats, "L-002", new Error("boom"));
		const { display } = summariseBulkResults({
			verb: "update",
			entityNounPlural: "leads",
			stats,
		});
		expect(display).toMatch(/All 2 leads failed/);
	});

	it("caps detailed failure rows at BULK_FAILURE_SAMPLE_CAP and surfaces an overflow row", () => {
		const stats = createBulkStats();
		for (let i = 0; i < BULK_FAILURE_SAMPLE_CAP + 5; i++) {
			recordBulkFailure(stats, `L-${i}`, new Error("err"));
		}
		const { summary } = summariseBulkResults({
			verb: "update",
			entityNounPlural: "leads",
			stats,
		});
		expect(stats.failures.length).toBe(BULK_FAILURE_SAMPLE_CAP);
		expect(stats.failed).toBe(BULK_FAILURE_SAMPLE_CAP + 5);
		const overflow = (summary.table ?? []).find((row) => row.label === "More failures");
		expect(overflow).toBeDefined();
		expect(overflow?.value).toContain("+5 not shown");
	});

	it("close-deal verb past-tenses correctly", () => {
		const stats = createBulkStats();
		recordBulkSuccess(stats);
		const { display } = summariseBulkResults({
			verb: "close as won",
			entityNounPlural: "deals",
			stats,
		});
		expect(display).toContain("Closed as won 1 deals");
	});
});

// ─── 4. Enrichment friendly errors ────────────────────────────────────────

describe("mapEnrichmentError (Stage 10)", () => {
	it("maps a 401 to AUTH_FAILED with a key-rotate hint, not retryable, fall-through", () => {
		const r = mapEnrichmentError("web_search", { status: 401 });
		expect(r.code).toBe("AUTH_FAILED");
		expect(r.retryable).toBe(false);
		expect(r.fallThrough).toBe(true);
		expect(r.hint).toMatch(/Rotate/);
	});

	it("maps a 429 to RATE_LIMITED, retryable, NOT fall-through (give it a moment)", () => {
		const r = mapEnrichmentError("web_search", { status: 429 });
		expect(r.code).toBe("RATE_LIMITED");
		expect(r.retryable).toBe(true);
		expect(r.fallThrough).toBe(false);
	});

	it("maps a 500 to PROVIDER_DOWN, retryable AND fall-through", () => {
		const r = mapEnrichmentError("linkedin_lookup", { status: 502 });
		expect(r.code).toBe("PROVIDER_DOWN");
		expect(r.retryable).toBe(true);
		expect(r.fallThrough).toBe(true);
	});

	it("maps Convex PROVIDER_NOT_CONFIGURED to NOT_CONFIGURED with provider-specific hint", () => {
		const fc = mapEnrichmentError("web_search", {
			data: { code: "PROVIDER_NOT_CONFIGURED" },
		});
		expect(fc.code).toBe("NOT_CONFIGURED");
		expect(fc.hint).toMatch(/FIRECRAWL_API_KEY/);
		const li = mapEnrichmentError("linkedin_lookup", {
			data: { code: "PROVIDER_NOT_CONFIGURED" },
		});
		expect(li.code).toBe("NOT_CONFIGURED");
		expect(li.hint).toMatch(/Phase 4/);
		const ef = mapEnrichmentError("email_finder", {
			data: { code: "PROVIDER_NOT_CONFIGURED" },
		});
		expect(ef.code).toBe("NOT_CONFIGURED");
		expect(ef.hint).toMatch(/Phase 4/);
	});

	it("recognises ENOTFOUND as DNS_ERROR via heuristic", () => {
		const r = mapEnrichmentError(
			"web_search",
			new Error("getaddrinfo ENOTFOUND api.firecrawl.dev"),
		);
		expect(r.code).toBe("DNS_ERROR");
		expect(r.retryable).toBe(true);
	});

	it("recognises 'rate limit' string as RATE_LIMITED", () => {
		const r = mapEnrichmentError("web_search", "rate limit exceeded");
		expect(r.code).toBe("RATE_LIMITED");
	});

	it("recognises ETIMEDOUT / aborted as TIMEOUT", () => {
		expect(mapEnrichmentError("web_search", new Error("ETIMEDOUT")).code).toBe("TIMEOUT");
		expect(mapEnrichmentError("web_search", new Error("Request aborted")).code).toBe("TIMEOUT");
	});

	it("falls back to UNKNOWN for unrecognised input + still attaches a hint", () => {
		const r = mapEnrichmentError("domain_whois", { weird: "thing" });
		expect(r.code).toBe("UNKNOWN");
		expect(r.hint).toBeTruthy();
	});

	it("never throws — passes through an undefined input", () => {
		expect(() => mapEnrichmentError("web_search", undefined)).not.toThrow();
		const r = mapEnrichmentError("web_search", undefined);
		expect(typeof r.code).toBe("string");
	});
});

// ─── 5. RemindersCard gate contract (DASHBOARD-AUDIT.md §6 last checkbox) ──

describe("RemindersCard dashboard gate (Stage 10)", () => {
	/**
	 * The user reported "reminders not showing on the dashboard". Root
	 * cause: the `generic` template wrote `dashboardMetrics:
	 * ['reminders.list']` but the frontend's RemindersCard gate
	 * checked only `reminders.dueToday || tasks.dueToday`. Stage 1
	 * fixed this in two halves — registry + frontend gate. This test
	 * asserts both halves stay in sync so the regression cannot
	 * silently come back.
	 */
	it("validateDashboardLayout(['reminders.list']) accepts the key with zero rejects", () => {
		const r = validateDashboardLayout(["reminders.list"]);
		expect(r.keys).toEqual(["reminders.list"]);
		expect(r.rejected).toEqual([]);
	});

	it("WIDGET_KEYS contains every key the RemindersCard gate checks", () => {
		// Mirrors the JSX at core/shell/shell/views/dashboard/DashboardHomeView.tsx :
		//   isEnabled("reminders.list") || isEnabled("reminders.dueToday") || isEnabled("tasks.dueToday")
		for (const key of ["reminders.list", "reminders.dueToday", "tasks.dueToday"] as const) {
			expect(WIDGET_KEYS as readonly string[]).toContain(key);
			expect(WIDGETS[key]).toBeDefined();
			expect(WIDGETS[key].label).toBeTruthy();
		}
	});

	it("validateDashboardLayout rejects the legacy calendar.miniWidget alias at runtime", () => {
		// Stage 3-A session 2 (2026-05-27) — pure-code directive. The
		// `calendar.miniWidget` alias is no longer auto-coerced at
		// runtime; the rename map lives ONLY inside the migration
		// `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts`.
		// validateDashboardLayout MUST reject the legacy key so a
		// regression that re-introduces it as a runtime path is caught
		// immediately.
		const result = validateDashboardLayout(["calendar.miniWidget", "reminders.list"]);
		expect(result.rejected).toEqual(["calendar.miniWidget"]);
		expect(result.keys).toEqual(["reminders.list"]);
	});
});
