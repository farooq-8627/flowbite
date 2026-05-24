/**
 * core/ai/hooks/useChatRouteContext.test.ts
 *
 * Pure-function tests for the route-stripping + mode-deriving helpers.
 * Phase 4 Part 1 P1.13 — `PHASE-3-AI-AUDIT.md §5`.
 */
import { describe, expect, it } from "vitest";
import { __test } from "./useChatRouteContext";

const { stripLocaleAndOrg, deriveMode } = __test;

describe("useChatRouteContext — stripLocaleAndOrg", () => {
	it("strips /en/<orgSlug>/<rest> to /<rest>", () => {
		expect(stripLocaleAndOrg("/en/acme/profile/P-001")).toBe("/profile/P-001");
		expect(stripLocaleAndOrg("/en/acme/dashboard")).toBe("/dashboard");
		expect(stripLocaleAndOrg("/en/acme/settings")).toBe("/settings");
	});

	it("handles locale-with-region (e.g. en-US)", () => {
		expect(stripLocaleAndOrg("/en-US/acme/leads")).toBe("/leads");
	});

	it("strips /en/<segment> as if segment is the orgSlug (heuristic)", () => {
		// In real Next.js routing the chat only mounts under /[locale]/[orgSlug]/<rest>,
		// so the heuristic intentionally collapses /en/login to / (treats login
		// as the orgSlug). Auth pages never host the chat so this is fine.
		expect(stripLocaleAndOrg("/en/login")).toBe("/");
	});

	it("returns the original path when format doesn't match", () => {
		expect(stripLocaleAndOrg("/api/health")).toBe("/api/health");
		expect(stripLocaleAndOrg("/")).toBe("/");
	});

	it("returns / for an empty stripped path", () => {
		expect(stripLocaleAndOrg("/en/acme")).toBe("/");
	});
});

describe("useChatRouteContext — deriveMode", () => {
	it("recognises dashboard", () => {
		expect(deriveMode("/dashboard").mode).toBe("dashboard");
		expect(deriveMode("/dashboard/").mode).toBe("dashboard");
		expect(deriveMode("/").mode).toBe("dashboard");
	});

	it("recognises entity routes", () => {
		expect(deriveMode("/profile/P-001").mode).toBe("entity");
		expect(deriveMode("/deals/D-007").mode).toBe("entity");
		expect(deriveMode("/companies/CO-002").mode).toBe("entity");
	});

	it("recognises list routes", () => {
		expect(deriveMode("/leads")).toEqual({ mode: "list", label: "leads" });
		expect(deriveMode("/contacts")).toEqual({ mode: "list", label: "contacts" });
		expect(deriveMode("/deals")).toEqual({ mode: "list", label: "deals" });
		expect(deriveMode("/companies")).toEqual({ mode: "list", label: "companies" });
	});

	it("recognises calendar / settings / reports", () => {
		expect(deriveMode("/calendar").mode).toBe("calendar");
		expect(deriveMode("/calendar/event/123").mode).toBe("calendar");
		expect(deriveMode("/settings").mode).toBe("settings");
		expect(deriveMode("/settings/members").mode).toBe("settings");
		expect(deriveMode("/reports").mode).toBe("reports");
		expect(deriveMode("/analytics").mode).toBe("reports");
	});

	it("recognises timeline as a list with label", () => {
		expect(deriveMode("/timeline")).toEqual({ mode: "list", label: "timeline" });
	});

	it("falls back to other for unknown paths", () => {
		expect(deriveMode("/foobar").mode).toBe("other");
		expect(deriveMode("/fooled").mode).toBe("other");
	});
});
