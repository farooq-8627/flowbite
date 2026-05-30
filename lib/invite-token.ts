/**
 * Invite-token parsing helpers.
 *
 * The recurring bug this fixes:
 *   A user copies a full invite URL like
 *   `http://localhost:3000/en/join/<token>` and pastes it into the
 *   "Join workspace" form. The form does
 *   `router.push(`/join/${input}`)` and ends up navigating to
 *   `/en/join/http://localhost:3000/en/join/<token>` — Next's path
 *   matcher reads the colon as a separator and the encoded slashes
 *   blow up the route resolver. The user gets a 404 from a perfectly
 *   valid invite link.
 *
 * `extractInviteToken` accepts EVERY common shape an inviter might
 * paste — full URL with locale prefix, full URL without locale,
 * trailing query / hash junk, raw token — and returns just the token
 * segment. Callers then route to `/join/<token>` cleanly.
 *
 * Co-located test: `lib/invite-token.test.ts`.
 */

/**
 * Extract a join token from arbitrary user input.
 *
 * Handled inputs (all return `<token>`):
 *   - `<token>`
 *   - `   <token>   ` (whitespace)
 *   - `https://orbitly.app/join/<token>`
 *   - `https://orbitly.app/en/join/<token>`
 *   - `https://orbitly.app/join/<token>?utm=foo#anchor`
 *   - `/join/<token>`
 *   - `/en/join/<token>`
 *   - `join/<token>` (no leading slash)
 *
 * The locale prefix in the regex is restricted to two-letter ISO
 * codes (`[a-z]{2}`) so a token that happens to start with two
 * letters can't be mis-parsed.
 *
 * Any failure mode falls back to "treat the trimmed input as the
 * token" — the server then validates it and produces a clear
 * "invitation not found" error if it really wasn't a token.
 */
export function extractInviteToken(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";

	// Strip any leading scheme + host so we can run a path-only match.
	// `URL` parsing handles edge cases (e.g. trailing whitespace inside
	// the URL); fall through to regex if it can't parse the input.
	let pathish = trimmed;
	try {
		const url = new URL(trimmed);
		pathish = `${url.pathname}${url.search}${url.hash}`;
	} catch {
		// not a full URL — leave as-is, regex below handles relative paths.
	}

	// Match the LAST `/join/<token>` (or `join/<token>`) segment.
	// `(?:^|\/)` lets the match anchor at the start of the string OR
	// after a slash so inputs like `join/<token>` (no leading slash) and
	// `/en/join/<token>` (locale prefix) both work.
	// `[^/?#\s]+` stops at the next path separator, query, fragment, or
	// whitespace so trailing `?utm=…#x` is dropped automatically.
	const m = pathish.match(/(?:^|\/)(?:[a-z]{2}\/)?join\/([^/?#\s]+)/i);
	if (m?.[1]) return m[1];

	// No `/join/` segment — assume the entire trimmed input IS the token.
	// The accept page will surface "invitation not found" if it isn't.
	return trimmed;
}
