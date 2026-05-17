/**
 * Note color utilities.
 *
 * The legacy `note-color-classes.ts` file mapped 6 fixed color tokens to
 * Tailwind class triples. Categories are now user-defined arbitrary hex
 * values, so we drive the visuals with inline `style={{ backgroundColor }}`
 * instead. This module provides the helpers we need:
 *
 *   - `getReadableTextColor(bgHex)` — picks `#000` or `#fff` based on the
 *     luminance of the bg color. Used when a category doesn't specify
 *     `textColor` explicitly.
 *   - `mixWithSurface(hex, alpha)` — for hover / focus tints.
 *   - `isValidHex(hex)` — boolean guard for #abc / #aabbcc inputs.
 *
 * No imports from React / Convex — pure functions, easy to unit-test, safe
 * for SSR.
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Strict #abc / #aabbcc check (no rgba, no named colors). */
export function isValidHex(value: string): boolean {
	return HEX_RE.test(value);
}

/**
 * Expand a 3-digit hex (`#abc`) to 6-digit (`#aabbcc`). Returns `null` if the
 * input isn't a valid hex.
 */
export function expandHex(hex: string): string | null {
	if (!HEX_RE.test(hex)) return null;
	if (hex.length === 4) {
		const r = hex[1];
		const g = hex[2];
		const b = hex[3];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	return hex.toLowerCase();
}

/** Parse `#rrggbb` to `[r, g, b]` (0-255). Returns `null` if invalid. */
function parseHex(hex: string): [number, number, number] | null {
	const expanded = expandHex(hex);
	if (!expanded) return null;
	const n = Number.parseInt(expanded.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Relative luminance per WCAG 2.0 (linearised RGB, weighted by perception).
 * Returns a 0–1 value where 0 is pure black and 1 is pure white.
 *
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
	const rgb = parseHex(hex);
	if (!rgb) return 0;
	const [r, g, b] = rgb.map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Pick a readable text color (`#000` or `#fff`) for a given background hex.
 *
 * Threshold tuned for sticky-note backgrounds: pastel surfaces (luminance
 * ~0.5–0.9) get black text; darker surfaces (luminance < 0.5) get white.
 */
export function getReadableTextColor(bgHex: string): "#000000" | "#ffffff" {
	const lum = relativeLuminance(bgHex);
	return lum > 0.5 ? "#000000" : "#ffffff";
}

/**
 * Resolve a card's text color — explicit override wins, otherwise derived
 * from luminance. Use this everywhere a card draws text on a category bg.
 */
export function resolveTextColor(bgHex: string, override: string | undefined): string {
	if (override && isValidHex(override)) return override;
	return getReadableTextColor(bgHex);
}
