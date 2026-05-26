/**
 * convex/_shared/csvEncodingDetect.ts
 *
 * Stage 10 of `/SPRINT-PLAN.md` — CSV encoding heuristics
 * (`AI-AGENT-CAPABILITY-AUDIT.md §3 CSV import row` /
 * `AI-AUDIT-COMPLETE.md §17 row "Encoding issues"`).
 *
 * Before this helper, `quarantined/csvParser.ts` called `blob.text()`
 * which assumes UTF-8 and substitutes `?` for un-decodable bytes.
 * Real-world spreadsheets exported from Excel are frequently:
 *
 *   - UTF-8 with BOM (Excel default on Windows when "Save as CSV UTF-8")
 *   - UTF-16-LE with BOM (Excel default on macOS for non-ASCII text)
 *   - Latin-1 / Windows-1252 (older Excel exports, German / French names)
 *
 * The orchestrator response was a generic "File is empty or
 * unreadable as CSV" — useless for a user trying to import their
 * 5000-row contact list with non-ASCII names.
 *
 * This helper detects the encoding by inspecting the first ~512
 * bytes (the BOM is the first 2-3 bytes; absence of BOM + presence
 * of high-bit bytes hints Latin-1) and returns:
 *
 *   - the decoded text (best-effort)
 *   - the encoding it picked
 *   - a structured report so the parser can include it in the
 *     friendly error if decoding fails outright
 *
 * Pure function. Safe in V8 sandboxes — uses `TextDecoder` which is
 * available in Node 18+, the Web platform, and Convex's V8 isolate.
 */

export type CsvEncoding =
	| "utf-8"
	| "utf-8-bom"
	| "utf-16-le"
	| "utf-16-be"
	| "latin-1"
	| "ascii"
	| "unknown";

export interface CsvEncodingDetectionResult {
	/** The encoding the helper picked. `unknown` means decoding gave up. */
	encoding: CsvEncoding;
	/** Did we strip a BOM from the head of the buffer before decoding? */
	bomStripped: boolean;
	/**
	 * Confidence — 1.0 when we matched a BOM signature, 0.6 when we
	 * fell back to UTF-8 against high-bit bytes, 0.3 when we guessed
	 * Latin-1 because UTF-8 decoding produced replacement chars.
	 */
	confidence: number;
	/**
	 * Number of UTF-8 replacement chars (U+FFFD) we observed during
	 * the initial decode attempt. Surfaces silent corruption so the
	 * parser can prompt the user to re-export.
	 */
	replacementChars: number;
}

export interface CsvDecodeResult extends CsvEncodingDetectionResult {
	/** The decoded text — empty string when `encoding === "unknown"`. */
	text: string;
}

// ─── BOM signatures ──────────────────────────────────────────────────────────

const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const;
const BOM_UTF16_LE = [0xff, 0xfe] as const;
const BOM_UTF16_BE = [0xfe, 0xff] as const;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
	if (bytes.length < prefix.length) return false;
	for (let i = 0; i < prefix.length; i++) {
		if (bytes[i] !== prefix[i]) return false;
	}
	return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect the encoding of a byte buffer (typically the first chunk of
 * an uploaded CSV). Doesn't decode — just classifies. Cheap.
 */
export function detectEncoding(buffer: Uint8Array): CsvEncodingDetectionResult {
	if (buffer.length === 0) {
		return {
			encoding: "unknown",
			bomStripped: false,
			confidence: 1.0,
			replacementChars: 0,
		};
	}
	if (startsWith(buffer, BOM_UTF8)) {
		return { encoding: "utf-8-bom", bomStripped: true, confidence: 1.0, replacementChars: 0 };
	}
	if (startsWith(buffer, BOM_UTF16_LE)) {
		return { encoding: "utf-16-le", bomStripped: true, confidence: 1.0, replacementChars: 0 };
	}
	if (startsWith(buffer, BOM_UTF16_BE)) {
		return { encoding: "utf-16-be", bomStripped: true, confidence: 1.0, replacementChars: 0 };
	}
	// No BOM. Check whether the buffer is plain ASCII (every byte < 0x80).
	let highBitCount = 0;
	const sampleLen = Math.min(buffer.length, 4096);
	for (let i = 0; i < sampleLen; i++) {
		if (buffer[i] >= 0x80) highBitCount += 1;
	}
	if (highBitCount === 0) {
		return { encoding: "ascii", bomStripped: false, confidence: 1.0, replacementChars: 0 };
	}
	// Try UTF-8 — count replacement chars to decide between UTF-8 and Latin-1.
	const replacementChars = countUtf8ReplacementChars(buffer);
	if (replacementChars === 0) {
		return { encoding: "utf-8", bomStripped: false, confidence: 0.85, replacementChars: 0 };
	}
	// Heuristic: if more than 1% of bytes triggered replacement chars,
	// the file is probably Latin-1 / Windows-1252.
	const ratio = replacementChars / sampleLen;
	if (ratio > 0.01) {
		return {
			encoding: "latin-1",
			bomStripped: false,
			confidence: 0.5,
			replacementChars,
		};
	}
	return {
		encoding: "utf-8",
		bomStripped: false,
		confidence: 0.6,
		replacementChars,
	};
}

/**
 * Decode a CSV byte buffer. Returns the detected encoding + the text.
 * If the encoding cannot be confidently identified, falls back to
 * UTF-8 (still produces text) and surfaces the replacement-char count
 * in the report so the caller can show a "re-export with UTF-8" hint.
 */
export function decodeCsvBytes(buffer: Uint8Array): CsvDecodeResult {
	const detection = detectEncoding(buffer);
	if (detection.encoding === "unknown") {
		return { ...detection, text: "" };
	}

	let payload = buffer;
	if (detection.bomStripped) {
		const skip =
			detection.encoding === "utf-8-bom"
				? 3
				: detection.encoding.startsWith("utf-16")
					? 2
					: 0;
		payload = buffer.subarray(skip);
	}

	let decoded: string;
	switch (detection.encoding) {
		case "utf-8-bom":
		case "utf-8":
		case "ascii":
			decoded = new TextDecoder("utf-8", { fatal: false }).decode(payload);
			break;
		case "utf-16-le":
			decoded = new TextDecoder("utf-16le", { fatal: false }).decode(payload);
			break;
		case "utf-16-be":
			decoded = new TextDecoder("utf-16be", { fatal: false }).decode(payload);
			break;
		case "latin-1":
			decoded = decodeLatin1(payload);
			break;
		default:
			decoded = new TextDecoder("utf-8", { fatal: false }).decode(payload);
	}

	return { ...detection, text: decoded };
}

/**
 * Build a friendly message for the user when decoding fell back to a
 * lossy encoding or produced replacement characters. Returns `null`
 * when the decode was clean — the caller should NOT surface a
 * warning in that case.
 */
export function describeEncodingWarning(detection: CsvEncodingDetectionResult): string | null {
	if (detection.encoding === "unknown") {
		return "Could not detect the file encoding. Re-export the CSV with UTF-8 encoding (Excel: Save As → CSV UTF-8) and try again.";
	}
	if (detection.encoding === "latin-1") {
		return "The file looks like Latin-1 / Windows-1252 — non-ASCII characters (accents, currency symbols) may be wrong. Re-export with UTF-8 encoding for best results.";
	}
	if (detection.replacementChars > 0) {
		return `Decoded with ${detection.replacementChars} unreadable character${
			detection.replacementChars === 1 ? "" : "s"
		} — some bytes did not map to valid UTF-8. Re-export with UTF-8 encoding for best results.`;
	}
	return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count how many bytes triggered U+FFFD replacement chars when
 * decoded as UTF-8. Cheap proxy for "is this UTF-8?" — a clean UTF-8
 * file produces 0 replacements, a Latin-1 file with diacritics
 * produces one per affected byte.
 */
function countUtf8ReplacementChars(buffer: Uint8Array): number {
	const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
	const decoded = new TextDecoder("utf-8", { fatal: false }).decode(sample);
	let count = 0;
	for (let i = 0; i < decoded.length; i++) {
		if (decoded.charCodeAt(i) === 0xfffd) count += 1;
	}
	return count;
}

/**
 * Decode a buffer as Latin-1 / Windows-1252. The two encodings are
 * 99% compatible for the bytes we care about; for the small set
 * (0x80-0x9F) where Windows-1252 has printable glyphs and Latin-1
 * has C1 controls, we prefer the printable mapping.
 */
function decodeLatin1(buffer: Uint8Array): string {
	// Windows-1252 mappings for the 0x80-0x9F range that differ from
	// Latin-1. Indices are offset by 0x80.
	const win1252 = [
		"\u20AC",
		"",
		"\u201A",
		"\u0192",
		"\u201E",
		"\u2026",
		"\u2020",
		"\u2021",
		"\u02C6",
		"\u2030",
		"\u0160",
		"\u2039",
		"\u0152",
		"",
		"\u017D",
		"",
		"",
		"\u2018",
		"\u2019",
		"\u201C",
		"\u201D",
		"\u2022",
		"\u2013",
		"\u2014",
		"\u02DC",
		"\u2122",
		"\u0161",
		"\u203A",
		"\u0153",
		"",
		"\u017E",
		"\u0178",
	];
	let out = "";
	for (let i = 0; i < buffer.length; i++) {
		const b = buffer[i];
		if (b < 0x80) {
			out += String.fromCharCode(b);
		} else if (b < 0xa0) {
			const replacement = win1252[b - 0x80];
			out += replacement || String.fromCharCode(b);
		} else {
			out += String.fromCharCode(b);
		}
	}
	return out;
}
