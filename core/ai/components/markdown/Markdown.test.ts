import { describe, expect, it } from "vitest";
import {
	normalizeAssistantMarkdown,
	normalizeStreamingMarkdown,
} from "@/core/ai/components/markdown/Markdown";

describe("normalizeAssistantMarkdown", () => {
	it("returns input unchanged when there are no tables", () => {
		const md = "# Hello\n\nWorld.\n\n- one\n- two";
		expect(normalizeAssistantMarkdown(md)).toBe(md);
	});

	it("inserts a blank line between a table and following prose", () => {
		const md = [
			"| Field | Type |",
			"| --- | --- |",
			"| job_title | text |",
			"I hope this helps you understand.",
		].join("\n");

		const out = normalizeAssistantMarkdown(md);

		// The prose line is now separated from the last table row by an
		// empty line so the GFM parser closes the table cleanly.
		expect(out.split("\n")).toEqual([
			"| Field | Type |",
			"| --- | --- |",
			"| job_title | text |",
			"",
			"I hope this helps you understand.",
		]);
	});

	it("does not double-insert when a blank line is already present", () => {
		const md = [
			"| Field | Type |",
			"| --- | --- |",
			"| job_title | text |",
			"",
			"Closing prose.",
		].join("\n");

		expect(normalizeAssistantMarkdown(md)).toBe(md);
	});

	it("handles two consecutive tables with a heading between them", () => {
		const md = [
			"| Field |",
			"| --- |",
			"| a |",
			"## Contacts",
			"| Field |",
			"| --- |",
			"| b |",
			"Done.",
		].join("\n");

		const out = normalizeAssistantMarkdown(md);
		const lines = out.split("\n");

		// Boundary 1: between `| a |` and `## Contacts` — blank inserted.
		// Boundary 2: between `| b |` and `Done.` — blank inserted.
		expect(lines).toEqual([
			"| Field |",
			"| --- |",
			"| a |",
			"",
			"## Contacts",
			"| Field |",
			"| --- |",
			"| b |",
			"",
			"Done.",
		]);
	});

	it("does not touch pipe characters inside fenced code blocks", () => {
		const md = [
			"Some prose.",
			"```",
			"| literal | text |",
			"more lines",
			"```",
			"After fence.",
		].join("\n");

		// The fenced block must survive unchanged.
		expect(normalizeAssistantMarkdown(md)).toBe(md);
	});

	it("returns empty input unchanged", () => {
		expect(normalizeAssistantMarkdown("")).toBe("");
	});
});

describe("normalizeStreamingMarkdown — P1.2 mid-stream polish", () => {
	it("returns empty input unchanged", () => {
		expect(normalizeStreamingMarkdown("")).toBe("");
	});

	it("returns short prose unchanged", () => {
		const md = "Working on it…";
		expect(normalizeStreamingMarkdown(md)).toBe(md);
	});

	it("hides an in-progress trailing heading until the line ends", () => {
		// Heading with no trailing newline = still being typed.
		const md = "Intro paragraph.\n\n# Section heading still typing";
		const out = normalizeStreamingMarkdown(md);
		// The partial heading is replaced with an empty line.
		expect(out.endsWith("Section heading still typing")).toBe(false);
		expect(out.startsWith("Intro paragraph.")).toBe(true);
	});

	it("keeps a finished heading (line ends with \\n)", () => {
		const md = "Intro.\n\n# Section heading\nMore content.";
		// Heading is followed by content — should not be hidden.
		const out = normalizeStreamingMarkdown(md);
		expect(out).toContain("# Section heading");
		expect(out).toContain("More content.");
	});

	it("hides an incomplete trailing table (no separator yet)", () => {
		const md = ["Here is the data:", "", "| Name | Email |"].join("\n");
		const out = normalizeStreamingMarkdown(md);
		// The single header row is dropped — would otherwise render as a 1-row table.
		expect(out).not.toContain("| Name | Email |");
		expect(out).toContain("Here is the data:");
	});

	it("keeps a complete trailing table (separator present)", () => {
		const md = [
			"Here is the data:",
			"",
			"| Name | Email |",
			"| --- | --- |",
			"| Bob | x@y.z |",
		].join("\n");
		const out = normalizeStreamingMarkdown(md);
		expect(out).toContain("| Name | Email |");
		expect(out).toContain("| --- | --- |");
		expect(out).toContain("| Bob | x@y.z |");
	});

	it("keeps a partial table that already has a separator (data row in flight)", () => {
		const md = [
			"Here is the data:",
			"",
			"| Name | Email |",
			"| --- | --- |",
			"| Bob | x@", // last row mid-typing
		].join("\n");
		const out = normalizeStreamingMarkdown(md);
		// Separator present → the rest is fine to render even mid-row.
		expect(out).toContain("| --- | --- |");
		expect(out).toContain("| Bob | x@");
	});
});
