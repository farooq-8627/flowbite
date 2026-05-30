import { describe, expect, it } from "vitest";
import { maskEmail } from "./format";

describe("maskEmail", () => {
	it("returns empty string for empty/nullish input", () => {
		expect(maskEmail("")).toBe("");
		expect(maskEmail(null)).toBe("");
		expect(maskEmail(undefined)).toBe("");
	});

	it("returns the input verbatim when no '@' is present", () => {
		expect(maskEmail("notanemail")).toBe("notanemail");
	});

	it("returns the input verbatim when '@' is at the start or end", () => {
		expect(maskEmail("@gmail.com")).toBe("@gmail.com");
		expect(maskEmail("user@")).toBe("user@");
	});

	it("masks short local parts (1–2 chars) with first char + ***", () => {
		expect(maskEmail("a@b.io")).toBe("a***@b.io");
		expect(maskEmail("ab@b.io")).toBe("a***@b.io");
	});

	it("masks medium local parts (3–6 chars) with first + *** + last", () => {
		expect(maskEmail("joe@example.com")).toBe("j***e@example.com");
		expect(maskEmail("john@example.com")).toBe("j***n@example.com");
		expect(maskEmail("alicia@x.io")).toBe("a***a@x.io");
	});

	it("masks long local parts (7+ chars) with first 3 + *** + last 3", () => {
		// The example flagged in the bug report — webstor.official@gmail.com.
		expect(maskEmail("webstor.official@gmail.com")).toBe("web***ial@gmail.com");
		expect(maskEmail("LongUserName@example.com")).toBe("Lon***ame@example.com");
	});

	it("preserves the domain verbatim — never mask domains", () => {
		// Users need the domain to know which inbox to check.
		expect(maskEmail("hello@subdomain.example.co.uk")).toBe("h***o@subdomain.example.co.uk");
	});

	it("handles emails with multiple '@' by splitting on the LAST one", () => {
		// Edge case — RFC 5321 allows quoted local parts containing `@`,
		// so we split on the final `@` to keep the domain stable. Local
		// part `"a@b"` (length 5) falls in the "medium" range, so we keep
		// the first + last char with `***` between.
		expect(maskEmail('"a@b"@example.com')).toBe('"***"@example.com');
	});

	it("uses a fixed-width *** mask regardless of local-part length", () => {
		// Mask must NOT leak local-part length — that's an enumeration vector.
		const a = maskEmail("a.very.long.username.that.keeps.going@example.com");
		const b = maskEmail("shorter.username@example.com");
		// Both end with "***" and 3 trailing chars before the @.
		expect(a.split("@")[0]).toMatch(/^.{3}\*\*\*.{3}$/);
		expect(b.split("@")[0]).toMatch(/^.{3}\*\*\*.{3}$/);
	});
});
