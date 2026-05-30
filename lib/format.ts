export function formatDate(
	date: Date | string | number | undefined,
	opts: Intl.DateTimeFormatOptions = {},
) {
	if (!date) return "";
	try {
		return new Intl.DateTimeFormat("en-US", {
			month: opts.month ?? "long",
			day: opts.day ?? "numeric",
			year: opts.year ?? "numeric",
			...opts,
		}).format(new Date(date));
	} catch {
		return "";
	}
}

/**
 * Obfuscate an email address for display on OTP / password-reset
 * screens.
 *
 * Why we mask:
 *   The `/verify-email?email=...` and `/reset-password?email=...`
 *   pages render the email straight from the URL's query string.
 *   Anyone who can shoulder-surf the URL bar (or the rendered text)
 *   sees the full address. That's a low-but-real PII leak — the
 *   address is the user's identity on the platform, AND the URL is
 *   often pasted into chat / screenshot / browser history. Masking
 *   the local part keeps just enough context for the user to
 *   confirm "yes, that's the inbox I'm checking" without exposing
 *   the rest.
 *
 * Strategy:
 *   - Empty / malformed input → return as-is (callers fall back to
 *     "your email").
 *   - Local part length 1–2 → `a***`.
 *   - Local part length 3–6 → `a***z` (first + last char, three
 *     stars in between).
 *   - Local part length 7+   → `abc***xyz` (first three + last
 *     three, three stars in between).
 *   - Domain is NEVER masked — users need it to identify the right
 *     inbox (gmail vs. outlook etc.).
 *
 * The star count is a fixed `***` so the mask doesn't reveal the
 * length of the local part — a real-world enumeration vector when
 * paired with a known username pattern (e.g. "FirstName.LastName").
 *
 * Examples:
 *   maskEmail("webstor.official@gmail.com") === "web***ial@gmail.com"
 *   maskEmail("john@example.com")          === "j***n@example.com"
 *   maskEmail("a@b.io")                    === "a***@b.io"
 *
 * Refs:
 *   - OWASP "Information Disclosure - Sensitive Information in URL"
 *     cheat sheet (https://owasp.org/www-community/Information_disclosure_in_URLs).
 */
export function maskEmail(email: string | null | undefined): string {
	if (typeof email !== "string" || email.length === 0) return "";

	const atIdx = email.lastIndexOf("@");
	// No `@`, leading `@`, or trailing `@` → not a valid shape we can
	// safely mask. Return verbatim so the caller can fall back.
	if (atIdx < 1 || atIdx === email.length - 1) return email;

	const local = email.slice(0, atIdx);
	const domain = email.slice(atIdx + 1);

	let masked: string;
	if (local.length <= 2) {
		masked = `${local[0]}***`;
	} else if (local.length <= 6) {
		masked = `${local[0]}***${local[local.length - 1]}`;
	} else {
		masked = `${local.slice(0, 3)}***${local.slice(-3)}`;
	}

	return `${masked}@${domain}`;
}
