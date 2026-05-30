import { describe, expect, it } from "vitest";
import { extractInviteToken } from "./invite-token";

const TOKEN = "b27a6ae0-93d6-4158-9581-6998425e26c6";

describe("extractInviteToken", () => {
	it("returns empty string for empty / whitespace input", () => {
		expect(extractInviteToken("")).toBe("");
		expect(extractInviteToken("   ")).toBe("");
		expect(extractInviteToken("\n\t")).toBe("");
	});

	it("returns the trimmed input when it's a bare token", () => {
		expect(extractInviteToken(TOKEN)).toBe(TOKEN);
		expect(extractInviteToken(`   ${TOKEN}   `)).toBe(TOKEN);
	});

	it("extracts the token from a full URL with no locale prefix", () => {
		expect(extractInviteToken(`http://localhost:3000/join/${TOKEN}`)).toBe(TOKEN);
		expect(extractInviteToken(`https://orbitly.app/join/${TOKEN}`)).toBe(TOKEN);
	});

	it("extracts the token from a URL with a two-letter locale prefix", () => {
		expect(extractInviteToken(`http://localhost:3000/en/join/${TOKEN}`)).toBe(TOKEN);
		expect(extractInviteToken(`https://orbitly.app/ar/join/${TOKEN}`)).toBe(TOKEN);
	});

	it("strips trailing query string and hash", () => {
		expect(extractInviteToken(`https://orbitly.app/join/${TOKEN}?utm=foo`)).toBe(TOKEN);
		expect(extractInviteToken(`https://orbitly.app/join/${TOKEN}#welcome`)).toBe(TOKEN);
		expect(extractInviteToken(`https://orbitly.app/en/join/${TOKEN}?x=1#y`)).toBe(TOKEN);
	});

	it("works for relative paths (no scheme)", () => {
		expect(extractInviteToken(`/join/${TOKEN}`)).toBe(TOKEN);
		expect(extractInviteToken(`/en/join/${TOKEN}`)).toBe(TOKEN);
	});

	it("works for path-only input without a leading slash", () => {
		expect(extractInviteToken(`join/${TOKEN}`)).toBe(TOKEN);
		expect(extractInviteToken(`en/join/${TOKEN}`)).toBe(TOKEN);
	});

	it("does not mistake a token starting with two letters for a locale", () => {
		const trickyToken = "ab123-rest-of-token";
		// The token comes after `/join/`, locale prefix is optional —
		// regex still finds the right segment.
		expect(extractInviteToken(`https://orbitly.app/join/${trickyToken}`)).toBe(trickyToken);
		// And a bare token starting with two letters isn't reshaped.
		expect(extractInviteToken(trickyToken)).toBe(trickyToken);
	});

	it("falls back to the raw input when no /join/ segment is found", () => {
		// Non-URL, non-token-like input — the server will reject it as
		// `INVITATION_NOT_FOUND`, which is the right UX (loud error
		// instead of silent lossy parsing).
		expect(extractInviteToken("garbage-here")).toBe("garbage-here");
		expect(extractInviteToken("https://example.com/something/else")).toBe(
			"https://example.com/something/else",
		);
	});
});
