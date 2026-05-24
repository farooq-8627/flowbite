/**
 * convex/_shared/dedup.ts
 *
 * Fuzzy duplicate detection for CSV bulk imports
 * (`PHASE-3-AI-AUDIT.md §6 Week 4 row 4.5`).
 *
 * Two stage matcher used by `convex/ai/quarantined/csvParser.ts` (to flag
 * each preview row) and by `convex/crm/entities/leads/mutations.ts:
 * bulkInsertFromCsvImpl` (to enforce the user-approved decision):
 *
 *  1. **Email (exact, normalised)** — lowercase + trim + collapse `+suffix`
 *     before comparing. `john+work@x.com` and `JOHN@x.com` collapse to the
 *     same key. Email collisions are the strongest signal — when present,
 *     they short-circuit the fuzzy stage entirely.
 *  2. **Name + company (Levenshtein ≤ 2)** — fall-back when no email is
 *     present. `Driven Properties LLC` and `Driven Properties` collapse;
 *     `Sarah Khan @ Acme` matches `Sara Khan @ Acme Corp` because the
 *     edit distance on each token stays inside the threshold.
 *
 * Per Clay's waterfall doctrine (`PHASE-3-AI-AUDIT.md §2.6`), conservative
 * thresholds win — false-merging two distinct contacts is much more
 * expensive than asking the user about a near-match.
 *
 * **No I/O here.** Callers fetch the candidate set from the DB once
 * (typically `ctx.db.query("leads").withIndex("by_org_and_email", …)`)
 * and pass it in as `candidates`. Keeps the helper pure + unit-testable.
 */

// ─── Public types ────────────────────────────────────────────────────────────

/** Minimum shape needed to dedup an inbound row against an existing record. */
export type DedupCandidate = {
	personCode: string;
	displayName: string;
	email?: string | null;
	phone?: string | null;
	companyName?: string | null;
};

export type DedupInput = {
	displayName: string;
	email?: string | null;
	phone?: string | null;
	companyName?: string | null;
};

export type DedupDecision = "insert" | "merge" | "skip";

export type DedupResult = {
	decision: DedupDecision;
	/** personCode of the matched candidate, when decision !== "insert". */
	matchCode?: string;
	/** Why we chose this decision — surfaced in the preview UI. */
	reason?: string;
};

// ─── Email normalisation ─────────────────────────────────────────────────────

/**
 * Normalise an email for comparison: lowercase, trim, drop the `+suffix`
 * portion (Gmail-style address tags). Returns `null` for falsy / non-string
 * input so callers can chain `?? undefined` safely.
 */
export function normaliseEmail(email: unknown): string | null {
	if (typeof email !== "string") return null;
	const trimmed = email.trim().toLowerCase();
	if (!trimmed.includes("@")) return null;
	const [local, domain] = trimmed.split("@", 2);
	if (!local || !domain) return null;
	const localBase = local.split("+", 1)[0]; // strip +suffix
	return `${localBase}@${domain}`;
}

// ─── Name normalisation ──────────────────────────────────────────────────────

/**
 * Reduce a name to a comparable form. Lowercase, strip leading/trailing
 * whitespace, collapse runs of whitespace, and remove common corporate
 * suffixes that introduce false negatives:
 *   "Driven Properties LLC"      → "driven properties"
 *   "Acme Corporation"           → "acme"
 *   "John D. Smith"              → "john d smith"
 *
 * The suffix list is intentionally short — overly aggressive stripping
 * causes false POSITIVES, which is the worse failure mode here (merging
 * two unrelated companies).
 */
const CORPORATE_SUFFIXES = [
	"llc",
	"l.l.c.",
	"inc",
	"inc.",
	"incorporated",
	"corp",
	"corp.",
	"corporation",
	"company",
	"co",
	"co.",
	"ltd",
	"ltd.",
	"limited",
	"plc",
	"gmbh",
	"ag",
	"sa",
	"pte",
	"llp",
];

export function normaliseName(name: unknown): string {
	if (typeof name !== "string") return "";
	let n = name.toLowerCase().trim();
	if (!n) return "";

	// Strip punctuation that doesn't carry semantic meaning.
	n = n.replace(/[.,'"]/g, "").replace(/\s+/g, " ");

	// Drop trailing corporate suffix tokens.
	const tokens = n.split(" ");
	while (tokens.length > 1) {
		const last = tokens[tokens.length - 1];
		if (CORPORATE_SUFFIXES.includes(last)) {
			tokens.pop();
			continue;
		}
		break;
	}
	return tokens.join(" ").trim();
}

// ─── Phone normalisation ─────────────────────────────────────────────────────

export function normalisePhone(phone: unknown): string | null {
	if (typeof phone !== "string") return null;
	const digits = phone.replace(/\D/g, "");
	return digits.length >= 7 ? digits : null; // sub-7-digit input is junk; ignore
}

// ─── Levenshtein (capped) ────────────────────────────────────────────────────
//
// Standard DP table approach with an EARLY TERMINATION: as soon as the
// minimum value in the current row exceeds `maxDistance`, we know no
// suffix can produce a smaller distance, so we return Infinity. This
// keeps each comparison O(min(|a|,|b|) × maxDistance) in the worst case
// instead of full O(|a| × |b|).
//
// Caller ALWAYS supplies a small max (≤ 2 for our use). For full Levenshtein,
// pass `Infinity`.

/**
 * Capped Levenshtein distance. Returns `Infinity` when the true distance
 * is provably greater than `maxDistance`.
 */
export function levenshtein(a: string, b: string, maxDistance: number): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > maxDistance) return Infinity;

	// Always have `a` be the shorter of the two — saves memory.
	if (a.length > b.length) [a, b] = [b, a];

	const m = a.length;
	const n = b.length;
	if (m === 0) return n <= maxDistance ? n : Infinity;

	// Single-row DP — current row, previous row.
	let prev: number[] = Array.from({ length: m + 1 }, (_, i) => i);
	let curr: number[] = Array.from({ length: m + 1 }, () => 0);

	for (let j = 1; j <= n; j++) {
		curr[0] = j;
		let rowMin = curr[0];
		for (let i = 1; i <= m; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[i] = Math.min(
				prev[i] + 1, // deletion
				curr[i - 1] + 1, // insertion
				prev[i - 1] + cost, // substitution
			);
			if (curr[i] < rowMin) rowMin = curr[i];
		}
		if (rowMin > maxDistance) return Infinity; // early out
		[prev, curr] = [curr, prev]; // reuse buffers
	}
	return prev[m];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Decide whether `input` is a duplicate of any record in `candidates`.
 *
 * Order of precedence:
 *   1. Email (normalised) exact match → SKIP (we already have the email-keyed
 *      record; merging blindly would let a CSV row overwrite a real lead).
 *      The user can flip the per-row decision to "merge" in the preview UI.
 *   2. Phone (normalised) exact match → MERGE (phone matches a strong signal
 *      but missing fields like email might be enrichable from the CSV row).
 *   3. Name + company within Levenshtein ≤ 2 → MERGE (likely the same record;
 *      the user reviews before commit).
 *   4. Otherwise → INSERT.
 *
 * Defaults are conservative on the side of NOT inserting silent duplicates;
 * the user always sees the per-row decision in the preview and can override.
 */
export function decideDedup(
	input: DedupInput,
	candidates: readonly DedupCandidate[],
	opts: { nameMaxDistance?: number } = {},
): DedupResult {
	const maxNameDistance = opts.nameMaxDistance ?? 2;

	const inputEmail = normaliseEmail(input.email);
	const inputPhone = normalisePhone(input.phone);
	const inputName = normaliseName(input.displayName);
	const inputCompany = normaliseName(input.companyName);

	// 1. Email exact match
	if (inputEmail) {
		for (const c of candidates) {
			if (normaliseEmail(c.email) === inputEmail) {
				return {
					decision: "skip",
					matchCode: c.personCode,
					reason: `Email already exists on ${c.personCode} (${c.displayName}).`,
				};
			}
		}
	}

	// 2. Phone exact match
	if (inputPhone) {
		for (const c of candidates) {
			if (normalisePhone(c.phone) === inputPhone) {
				return {
					decision: "merge",
					matchCode: c.personCode,
					reason: `Phone already on ${c.personCode} (${c.displayName}).`,
				};
			}
		}
	}

	// 3. Name + company near-match
	if (inputName.length >= 3) {
		for (const c of candidates) {
			const candName = normaliseName(c.displayName);
			if (!candName) continue;
			const nameDist = levenshtein(inputName, candName, maxNameDistance);
			if (nameDist === Infinity) continue;

			// If both rows declare a company, the companies must also match
			// (within the same threshold) before we call it a duplicate.
			// This prevents "Sarah Khan @ Acme" from merging with "Sarah
			// Khan @ Globex".
			if (inputCompany && c.companyName) {
				const candCompany = normaliseName(c.companyName);
				if (!candCompany) continue;
				const compDist = levenshtein(inputCompany, candCompany, maxNameDistance);
				if (compDist === Infinity) continue;
			}

			return {
				decision: "merge",
				matchCode: c.personCode,
				reason:
					nameDist === 0
						? `Same name as ${c.personCode} (${c.displayName}).`
						: `Near-match for ${c.personCode} (${c.displayName}).`,
			};
		}
	}

	return { decision: "insert" };
}

/**
 * Stable per-row idempotency key — sha256 of the normalised
 * (email | phone | name+company) tuple. Callers use this to detect
 * "did we already process this row?" on retry.
 *
 * No crypto module dependency — we use a small djb2 + xor hash. Not
 * cryptographically strong, but stable across Node versions and large
 * enough for an N=10K-row import.
 */
export function dedupIdemKey(input: DedupInput): string {
	const parts = [
		normaliseEmail(input.email) ?? "",
		normalisePhone(input.phone) ?? "",
		normaliseName(input.displayName),
		normaliseName(input.companyName),
	];
	const seed = parts.join("|");
	let h = 5381;
	for (let i = 0; i < seed.length; i++) {
		h = ((h << 5) + h) ^ seed.charCodeAt(i);
	}
	// Convert to unsigned 32-bit then base36 for compactness.
	return (h >>> 0).toString(36).padStart(7, "0");
}
