import { describe, expect, it } from "vitest";
import { displayUrlLabel, normalizeExternalUrl } from "./url";

describe("normalizeExternalUrl", () => {
	// ── returns null for non-string / empty ────────────────────────────────
	it("returns null for null", () => expect(normalizeExternalUrl(null)).toBeNull());
	it("returns null for undefined", () => expect(normalizeExternalUrl(undefined)).toBeNull());
	it("returns null for a number", () => expect(normalizeExternalUrl(42)).toBeNull());
	it("returns null for empty string", () => expect(normalizeExternalUrl("")).toBeNull());
	it("returns null for whitespace-only string", () =>
		expect(normalizeExternalUrl("   ")).toBeNull());

	// ── blocks dangerous schemes ───────────────────────────────────────────
	it("blocks javascript: scheme", () =>
		expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull());
	it("blocks JavaScript: (mixed case)", () =>
		expect(normalizeExternalUrl("JavaScript:alert(1)")).toBeNull());
	it("blocks data: scheme", () =>
		expect(normalizeExternalUrl("data:text/html,<h1>hi</h1>")).toBeNull());
	it("blocks vbscript: scheme", () =>
		expect(normalizeExternalUrl("vbscript:msgbox(1)")).toBeNull());
	it("blocks file: scheme", () => expect(normalizeExternalUrl("file:///etc/passwd")).toBeNull());
	it("blocks about: scheme", () => expect(normalizeExternalUrl("about:blank")).toBeNull());

	// ── allows communication schemes ──────────────────────────────────────
	it("passes mailto: through as-is", () => {
		expect(normalizeExternalUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
	});
	it("passes tel: through as-is", () => {
		expect(normalizeExternalUrl("tel:+15550001234")).toBe("tel:+15550001234");
	});

	// ── normalises https:// URLs ───────────────────────────────────────────
	it("returns https URL unchanged (already normalised)", () => {
		expect(normalizeExternalUrl("https://example.com")).toBe("https://example.com/");
	});
	it("returns https URL with path", () => {
		expect(normalizeExternalUrl("https://example.com/path?q=1")).toBe(
			"https://example.com/path?q=1",
		);
	});
	it("returns null for malformed https URL", () => {
		expect(normalizeExternalUrl("https:// ")).toBeNull();
	});

	// ── normalises http:// URLs ────────────────────────────────────────────
	it("accepts http:// URLs", () => {
		expect(normalizeExternalUrl("http://example.com")).toBe("http://example.com/");
	});

	// ── adds https:// to bare hostnames ───────────────────────────────────
	it("prepends https:// to a bare hostname", () => {
		expect(normalizeExternalUrl("example.com")).toBe("https://example.com/");
	});
	it("prepends https:// to www.example.com", () => {
		expect(normalizeExternalUrl("www.example.com")).toBe("https://www.example.com/");
	});
	it("prepends https:// to hostname with path", () => {
		expect(normalizeExternalUrl("example.com/about")).toBe("https://example.com/about");
	});
	it("trims leading/trailing whitespace before normalising", () => {
		expect(normalizeExternalUrl("  example.com  ")).toBe("https://example.com/");
	});

	// ── rejects hostnames without a dot ───────────────────────────────────
	it("returns null for a single word (no dot)", () => {
		expect(normalizeExternalUrl("localhost")).toBeNull();
	});
	it("returns null for 'hello world'", () => {
		expect(normalizeExternalUrl("hello world")).toBeNull();
	});

	// ── blocks unknown non-http schemes ───────────────────────────────────
	it("returns null for ftp:// URLs", () => {
		expect(normalizeExternalUrl("ftp://files.example.com")).toBeNull();
	});
	it("returns null for custom:// scheme", () => {
		expect(normalizeExternalUrl("myapp://open")).toBeNull();
	});
});

describe("displayUrlLabel", () => {
	it("strips https:// and trailing slash", () => {
		expect(displayUrlLabel("https://example.com/")).toBe("example.com");
	});
	it("strips https://www.", () => {
		expect(displayUrlLabel("https://www.example.com/")).toBe("example.com");
	});
	it("strips http://", () => {
		expect(displayUrlLabel("http://example.com/about")).toBe("example.com/about");
	});
	it("keeps path after stripping scheme", () => {
		expect(displayUrlLabel("https://example.com/blog/post")).toBe("example.com/blog/post");
	});
	it("truncates long URLs with ellipsis", () => {
		const long = `https://example.com/${"a".repeat(50)}`;
		const result = displayUrlLabel(long, 20);
		expect(result.endsWith("…")).toBe(true);
		expect(result.length).toBe(20);
	});
	it("does not truncate URLs at or below maxLength", () => {
		const url = "https://ex.com/";
		const label = displayUrlLabel(url, 40);
		expect(label).toBe("ex.com");
		expect(label.includes("…")).toBe(false);
	});
});
