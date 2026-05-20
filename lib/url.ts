/**
 * URL helpers for safely rendering user-supplied external links.
 *
 * The recurring bug this fixes:
 *   A user enters a website like `reimaginy.com` (no protocol). When the UI
 *   renders `<a href="reimaginy.com" target="_blank">…</a>`, browsers treat
 *   the value as a RELATIVE URL — so clicking it navigates to
 *   `/en/{org}/reimaginy.com` inside the app instead of opening the external
 *   site. That route doesn't match any entity slug → `notFound()` →
 *   `NEXT_HTTP_ERROR_FALLBACK;404`.
 *
 * Use `normalizeExternalUrl()` whenever you render a free-form URL field
 * (`company.website`, `kind: "url"` cells, `kind: "link"` field values) as a
 * clickable link. If it returns `null`, render plain text instead.
 */

/**
 * Normalize a user-entered URL so it always opens externally.
 *
 * Rules:
 *   1. Trim whitespace.
 *   2. Reject obviously-empty / non-string input.
 *   3. Reject `javascript:`, `data:`, `vbscript:`, `file:`, `about:` schemes.
 *   4. Allow `http://`, `https://`, `mailto:`, `tel:` as-is.
 *   5. Anything else (e.g. `acme.com`, `www.acme.com`, `acme.com/path`) is
 *      assumed to be a missing-scheme web URL → prepend `https://`.
 *   6. Validate the final string with `new URL(...)`. If invalid, return null.
 *
 * Returns the normalized absolute URL, or `null` if the value cannot be safely
 * rendered as an external link (caller should render plain text instead).
 */
export function normalizeExternalUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	if (!raw) return null;

	// Block dangerous schemes outright. We compare the lowercased prefix so we
	// catch variants like "JavaScript:" / "  data:".
	const lower = raw.toLowerCase();
	const banned = ["javascript:", "data:", "vbscript:", "file:", "about:"];
	for (const scheme of banned) {
		if (lower.startsWith(scheme)) return null;
	}

	// Allow communication schemes as-is. They're safe and don't navigate the page.
	if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
		return raw;
	}

	// Already an http(s) URL → validate and return.
	if (lower.startsWith("http://") || lower.startsWith("https://")) {
		try {
			// `new URL` throws for malformed URLs (e.g. "https:// ").
			return new URL(raw).toString();
		} catch {
			return null;
		}
	}

	// Some other unknown scheme like `ftp://…` → reject (we don't support it
	// and we don't want to silently change it).
	if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return null;

	// No scheme → assume the user typed a bare hostname (`acme.com`,
	// `www.acme.com/path`). Prepend `https://` and validate.
	const candidate = `https://${raw}`;
	try {
		const parsed = new URL(candidate);
		// Require at least one dot in the hostname so we don't promote nonsense
		// like "hello world" into a clickable link.
		if (!parsed.hostname.includes(".")) return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

/**
 * Strip the scheme (and optional `www.`) for display purposes.
 * `https://www.acme.com/about` → `acme.com/about`.
 *
 * Pair this with `normalizeExternalUrl()` to render a tidy label while still
 * navigating to the absolute URL.
 */
export function displayUrlLabel(url: string, maxLength = 40): string {
	const stripped = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
	if (stripped.length <= maxLength) return stripped;
	return `${stripped.slice(0, maxLength - 1)}…`;
}
