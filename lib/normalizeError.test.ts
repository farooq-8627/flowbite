import { describe, expect, it } from "vitest";
import { normalizeError, normalizeErrorDescription } from "./normalizeError";

describe("normalizeError", () => {
	it("returns the fallback for null / undefined", () => {
		expect(normalizeError(null)).toBe("Something went wrong. Please try again.");
		expect(normalizeError(undefined)).toBe("Something went wrong. Please try again.");
	});

	it("uses the custom fallback when provided", () => {
		expect(normalizeError(null, "Couldn't save")).toBe("Couldn't save");
		expect(normalizeError(undefined, "")).toBe("");
	});

	it("returns plain string errors as-is", () => {
		expect(normalizeError("Boom")).toBe("Boom");
	});

	it("strips the [Request ID: ...] wrapper", () => {
		const err = new Error("[Request ID: abc-123] Server Error\nValidation failed");
		expect(normalizeError(err)).toBe("Validation failed");
	});

	it("strips the Server Error prefix", () => {
		const err = new Error("Server Error\nUser not found");
		expect(normalizeError(err)).toBe("User not found");
	});

	it("strips the Uncaught Error / ConvexError prefix", () => {
		const err = new Error("Uncaught Error: Permission denied");
		expect(normalizeError(err)).toBe("Permission denied");

		const err2 = new Error("Uncaught ConvexError: Stage not found");
		expect(normalizeError(err2)).toBe("Stage not found");
	});

	it("strips the trailing stack-trace frames", () => {
		const err = new Error(
			"[Request ID: abc] Server Error\nUncaught Error: Pipeline has no stages\n    at handler (../convex/foo.ts:123:45)\n    at runMutation (../convex/_generated/server.ts:9:1)",
		);
		expect(normalizeError(err)).toBe("Pipeline has no stages");
	});

	it("prefers ConvexError data.message when present", () => {
		const err = Object.assign(new Error("[Request ID: abc] Server Error\n…stack noise…"), {
			data: { code: "INVALID_STAGE", message: "Stage not found in pipeline" },
		});
		expect(normalizeError(err)).toBe("Stage not found in pipeline");
	});

	it("falls back to data when data is a string", () => {
		const err = Object.assign(new Error("ignored"), { data: "Direct payload string" });
		expect(normalizeError(err)).toBe("Direct payload string");
	});

	it("maps known auth codes to friendly copy", () => {
		const err = new Error("[Request ID: x] InvalidSecret blah");
		expect(normalizeError(err)).toBe("Incorrect password. Please try again.");

		const err2 = new Error("Failed to fetch");
		expect(normalizeError(err2)).toBe("Network error. Check your connection and try again.");
	});

	it("returns the fallback when stripping leaves nothing", () => {
		const err = new Error("[Request ID: x] Server Error");
		expect(normalizeError(err, "Couldn't reorder")).toBe("Couldn't reorder");
	});

	it("handles ConvexError-like POJOs without a stack", () => {
		const pojo = { data: { code: "DUPLICATE", message: "Already exists" } };
		expect(normalizeError(pojo)).toBe("Already exists");
	});

	it("never throws on weird inputs", () => {
		expect(() => normalizeError(0)).not.toThrow();
		expect(() => normalizeError(false)).not.toThrow();
		expect(() => normalizeError({})).not.toThrow();
		expect(normalizeError({})).toBe("Something went wrong. Please try again.");
	});
});

describe("normalizeErrorDescription", () => {
	it("returns undefined when the message equals the title", () => {
		const err = new Error("Couldn't save");
		expect(normalizeErrorDescription(err, "Couldn't save")).toBeUndefined();
	});

	it("returns the cleaned message when distinct from the title", () => {
		const err = new Error("[Request ID: x] Server Error\nValidation failed");
		expect(normalizeErrorDescription(err, "Couldn't save")).toBe("Validation failed");
	});

	it("returns undefined when the input has no extractable message", () => {
		expect(normalizeErrorDescription(null)).toBeUndefined();
	});
});
