/**
 * convex/_shared/sanitiseExtractedText.ts
 *
 * Stage 10 of `/SPRINT-PLAN.md` — adversarial-file sanitisation
 * (`AI-AGENT-CAPABILITY-AUDIT.md §3 File analysis row` / `AI-AUDIT-COMPLETE.md §17`).
 *
 * The `analyze_file` flow runs OCR / vision LLMs over user-uploaded
 * files (passport scans, listing photos, invoices). The model is
 * instructed to treat the file as DATA but the EXTRACTED TEXT is then
 * persisted in `fileAnalyses.extracted` and rendered back in the chat
 * timeline + the proposal preview card. A malicious upload could
 * embed:
 *
 *   1. `<script>alert(1)</script>` inside a "notes" field — would
 *      execute when the chat renders the structured-output card if
 *      the renderer ever switched from React text-node escaping to
 *      `dangerouslySetInnerHTML` (some markdown renderers do).
 *   2. `<a href="javascript:fetch('/api/admin', ...)">click</a>` in
 *      a note — same XSS surface.
 *   3. `[click](javascript:...)` markdown — most sanitisers miss this
 *      because the URL is in the link target, not the visible text.
 *   4. Long blobs of zero-width / RTL-override Unicode trying to
 *      smuggle prompt-injection text past the model. We don't drop
 *      these (they may be legitimate Arabic / RTL content) but we DO
 *      cap length so a 50KB blob can't fill the proposal card.
 *
 * The rule is **"strip dangerous tokens; keep the data."** The
 * sanitiser never throws — invalid input collapses to an empty
 * string with a flag in the report.
 *
 * Pure function. No I/O. Safe to import from V8 actions, mutations,
 * queries, AND the frontend — see `core/ai/lib/sanitiseExtractedText.ts`
 * for the same helper re-exported (the frontend just imports from
 * `@/convex/_shared/...`).
 */

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Hard cap for any single sanitised text field. */
export const SANITISE_MAX_FIELD_LENGTH = 4_000;

/** Hard cap when the field is part of a record that has many fields. */
export const SANITISE_MAX_RECORD_FIELD_LENGTH = 1_000;

/**
 * Tags we strip wholesale (open + body + close). Matched case-insensitive.
 * Kept conservative — anything that could host JS or remote-load.
 */
const DANGEROUS_TAGS = [
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"form",
	"input",
	"button",
	"link",
	"meta",
	"base",
	"audio",
	"video",
	"source",
	"track",
	"svg",
	"math",
] as const;

/**
 * Protocol prefixes that must never appear in `href=` / `src=` /
 * markdown link targets. `javascript:` is the obvious one;
 * `data:text/html` lets you inline a full document; `vbscript:` is
 * dead but ships in some IE-era exports.
 */
const DANGEROUS_PROTOCOLS = [
	"javascript:",
	"vbscript:",
	"data:text/html",
	"data:application/x-javascript",
	"data:application/javascript",
] as const;

/**
 * Prefix marker used to redact dangerous markdown / HTML link targets
 * without losing the visible text. Reads "(removed: javascript: URL)"
 * in the rendered card.
 */
const REDACTED_LINK_REPLACEMENT = "#removed-unsafe-link";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SanitiseExtractedTextResult {
	/** The cleaned text. Always a string (never null/undefined). */
	text: string;
	/**
	 * What was stripped, surfaced for telemetry / debug. Counts only —
	 * the actual offending content is not echoed back so the report can
	 * itself be safely rendered.
	 */
	report: {
		strippedTags: number;
		strippedHandlers: number;
		strippedProtocols: number;
		truncated: boolean;
		originalLength: number;
		finalLength: number;
	};
}

export interface SanitiseFieldsResult {
	/** Cleaned record. Same key set as input (minus any non-string values, which are passed through unchanged). */
	record: Record<string, unknown>;
	/** Aggregated report covering every string field touched. */
	report: {
		fieldsScanned: number;
		fieldsTouched: number;
		strippedTags: number;
		strippedHandlers: number;
		strippedProtocols: number;
		truncations: number;
	};
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sanitise a single extracted-text value. Returns the cleaned text +
 * a structured report.
 *
 * - non-strings → return `{ text: "" }` plus zero-counts.
 * - strings → strip dangerous HTML tags, on*= handlers, and dangerous
 *   protocols, then truncate to `opts.maxLength`.
 *
 * The function is **idempotent** — running it twice on the same
 * input yields the same output, with `strippedX: 0` on the second
 * pass. That's important because the call sites apply it both
 * before persist (so the DB never holds danger) AND before render
 * (defence-in-depth).
 */
export function sanitiseExtractedText(
	input: unknown,
	opts: { maxLength?: number } = {},
): SanitiseExtractedTextResult {
	const maxLength = opts.maxLength ?? SANITISE_MAX_FIELD_LENGTH;

	if (typeof input !== "string") {
		return {
			text: "",
			report: {
				strippedTags: 0,
				strippedHandlers: 0,
				strippedProtocols: 0,
				truncated: false,
				originalLength: 0,
				finalLength: 0,
			},
		};
	}

	const originalLength = input.length;
	let text = input;

	// 1. Strip whole dangerous element pairs (`<script>...</script>`).
	//    Running pair removal first means handler-stripping in step 2
	//    has less work to do.
	let strippedTags = 0;
	for (const tag of DANGEROUS_TAGS) {
		// `[\s\S]` so the regex matches across newlines.
		const pairRx = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
		const before = text.length;
		text = text.replace(pairRx, () => {
			strippedTags += 1;
			return "";
		});
		// Self-closing / orphan opens (e.g. `<script src=...>` not closed).
		const orphanRx = new RegExp(`<${tag}\\b[^>]*?/?>`, "gi");
		text = text.replace(orphanRx, () => {
			strippedTags += 1;
			return "";
		});
		// Quiet the unused-binding lint.
		void before;
	}

	// 2. Strip HTML event handlers: `onclick="..."`, `onerror=...`,
	//    `onload=javascript:...`. Anything beginning `on` + a word +
	//    `=` followed by either a quoted or unquoted value.
	let strippedHandlers = 0;
	text = text.replace(/\son[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
		strippedHandlers += 1;
		return "";
	});

	// 3. Replace dangerous protocols inside HTML attributes.
	//    `<a href="javascript:fetch(...)">` and the like. The value
	//    must allow the *other* quote to appear inside (e.g.
	//    `href="javascript:fetch('/admin')"` with single quotes inside
	//    a double-quoted attribute), so we use a back-reference for
	//    the closing quote and `.*?` for the value (`.` is fine
	//    because attribute values shouldn't span newlines anyway).
	let strippedProtocols = 0;
	text = text.replace(
		/(href|src|xlink:href|action|formaction)\s*=\s*(["'])\s*(.*?)\s*\2/gi,
		(match, attr, quote, urlRaw) => {
			const lc = String(urlRaw).trim().toLowerCase();
			if (DANGEROUS_PROTOCOLS.some((p) => lc.startsWith(p))) {
				strippedProtocols += 1;
				return `${attr}=${quote}${REDACTED_LINK_REPLACEMENT}${quote}`;
			}
			return match;
		},
	);

	// 4. Markdown link target sanitisation.
	//    `[click](javascript:...)` — keep the visible text, replace the
	//    target. The regex is intentionally narrow (no nested parens)
	//    because the broader form would consume too much.
	text = text.replace(/\[([^\]]*)\]\(\s*([^)\s]+)([^)]*)\)/g, (match, label, url, _tail) => {
		const lc = String(url).trim().toLowerCase();
		if (DANGEROUS_PROTOCOLS.some((p) => lc.startsWith(p))) {
			strippedProtocols += 1;
			return `[${label}](${REDACTED_LINK_REPLACEMENT})`;
		}
		// Preserve the original match if not dangerous.
		return match;
	});

	// 5. Truncate.
	let truncated = false;
	if (text.length > maxLength) {
		text = `${text.slice(0, maxLength - 1)}…`;
		truncated = true;
	}

	return {
		text,
		report: {
			strippedTags,
			strippedHandlers,
			strippedProtocols,
			truncated,
			originalLength,
			finalLength: text.length,
		},
	};
}

/**
 * Sanitise every string field in a flat record (e.g. the structured
 * output of `analyze_file`). Non-string values (numbers, booleans,
 * arrays of primitives, nulls) pass through unchanged. Nested
 * objects pass through unchanged too — the `analyze_file` schemas
 * are flat by design (passport / listing / invoice) so the recursion
 * isn't needed and would just complicate the report.
 *
 * Each field is capped at `SANITISE_MAX_RECORD_FIELD_LENGTH` (smaller
 * than `SANITISE_MAX_FIELD_LENGTH`) because record fields are
 * field-sized, not document-sized.
 */
export function sanitiseExtractedFields(
	record: Record<string, unknown> | null | undefined,
): SanitiseFieldsResult {
	const cleaned: Record<string, unknown> = {};
	const aggregate = {
		fieldsScanned: 0,
		fieldsTouched: 0,
		strippedTags: 0,
		strippedHandlers: 0,
		strippedProtocols: 0,
		truncations: 0,
	};

	if (!record || typeof record !== "object") {
		return { record: cleaned, report: aggregate };
	}

	for (const [key, value] of Object.entries(record)) {
		aggregate.fieldsScanned += 1;
		if (typeof value === "string") {
			const r = sanitiseExtractedText(value, { maxLength: SANITISE_MAX_RECORD_FIELD_LENGTH });
			const touched =
				r.report.strippedTags + r.report.strippedHandlers + r.report.strippedProtocols >
					0 || r.report.truncated;
			if (touched) aggregate.fieldsTouched += 1;
			aggregate.strippedTags += r.report.strippedTags;
			aggregate.strippedHandlers += r.report.strippedHandlers;
			aggregate.strippedProtocols += r.report.strippedProtocols;
			if (r.report.truncated) aggregate.truncations += 1;
			cleaned[key] = r.text;
			continue;
		}
		// Pass non-strings through unchanged. Arrays of strings get
		// element-wise sanitisation so a `lineItems[]` array of
		// description strings doesn't smuggle markdown.
		if (Array.isArray(value)) {
			cleaned[key] = value.map((entry) => {
				if (typeof entry !== "string") return entry;
				const r = sanitiseExtractedText(entry, {
					maxLength: SANITISE_MAX_RECORD_FIELD_LENGTH,
				});
				if (
					r.report.strippedTags + r.report.strippedHandlers + r.report.strippedProtocols >
						0 ||
					r.report.truncated
				) {
					aggregate.fieldsTouched += 1;
				}
				aggregate.strippedTags += r.report.strippedTags;
				aggregate.strippedHandlers += r.report.strippedHandlers;
				aggregate.strippedProtocols += r.report.strippedProtocols;
				if (r.report.truncated) aggregate.truncations += 1;
				return r.text;
			});
			continue;
		}
		cleaned[key] = value;
	}

	return { record: cleaned, report: aggregate };
}
